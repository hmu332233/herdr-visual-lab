import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKanbanBoard } from '../src/web/formats/kanban/board.js';
import { createKanbanChrome } from '../src/web/formats/kanban/chrome.js';
import { createKanbanSidebar } from '../src/web/formats/kanban/sidebar.js';
import type { KanbanView } from '../src/web/formats/kanban/view.js';

class FakeClassList {
  readonly values = new Set<string>();
  toggle(name: string, force?: boolean): boolean {
    const next = force ?? !this.values.has(name);
    if (next) this.values.add(name); else this.values.delete(name);
    return next;
  }
}

class FakeElement {
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  parentElement: FakeElement | null = null;
  textContent = '';
  hidden = false;
  type = '';
  className = '';
  id = '';
  childMutations = 0;
  constructor(readonly tagName: string) {}
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement?.removeChild(child);
      child.parentElement = this;
      this.children.push(child);
      this.childMutations += 1;
    }
  }
  insertBefore(child: FakeElement, reference: FakeElement | null): void {
    child.parentElement?.removeChild(child);
    const index = reference === null ? this.children.length : this.children.indexOf(reference);
    child.parentElement = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    this.childMutations += 1;
  }
  prepend(child: FakeElement): void {
    child.parentElement?.removeChild(child);
    child.parentElement = this;
    this.children.unshift(child);
  }
  removeChild(child: FakeElement): void {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentElement = null;
  }
  remove(): void { this.parentElement?.removeChild(this); }
  addEventListener(type: string, handler: () => void): void { this.listeners.set(type, handler); }
  click(): void { this.listeners.get('click')?.(); }
  getBoundingClientRect(): DOMRect { return { left: 0, top: 0, width: 10, height: 10 } as DOMRect; }
  getAnimations(): Animation[] { return []; }
  animate(): Animation { return {} as Animation; }
  querySelectorAll(selector: string): FakeElement[] {
    const result: FakeElement[] = [];
    for (const child of this.children) {
      if (selector === '[data-terminal-id]' && child.dataset.terminalId) result.push(child);
      if (selector.startsWith('.') && child.className.split(' ').includes(selector.slice(1))) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  private readonly listeners = new Map<string, () => void>();
}

class FakeDocument {
  title = '';
  readonly elementsByID = new Map<string, FakeElement>();
  createElement(tagName: string): FakeElement { return new FakeElement(tagName); }
  getElementById(id: string): FakeElement | null { return this.elementsByID.get(id) ?? null; }
  addElement(id: string): FakeElement {
    const element = this.createElement('div');
    element.id = id;
    this.elementsByID.set(id, element);
    return element;
  }
}

function view(
  cards: KanbanView['columns'][number]['cards'],
  status: 'idle'|'working'|'blocked'|'done' = 'working',
  workspaces: KanbanView['workspaces'] = [],
): KanbanView {
  return {
    connection: { kind: 'live' }, totalAgents: cards.length, workspaces,
    columns: (['idle', 'working', 'blocked', 'done'] as const).map(item => ({
      status: item, cards: item === status ? cards : [],
    })),
  };
}

const card = (overrides: Partial<KanbanView['columns'][number]['cards'][number]> = {}) => ({
  id: 'terminal', workspaceLabel: 'Project', tabLabel: 'main', tabID: 'tab-raw',
  agentKind: 'codex', terminalTitle: 'A complete terminal title', status: 'working' as const, isFocused: false,
  ...overrides,
});

let originalDocument: Document | undefined;
afterEach(() => {
  if (originalDocument) Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  else Reflect.deleteProperty(globalThis, 'document');
});

describe('Kanban board', () => {
  it('renders persistent card buttons and focuses the exact terminal', () => {
    originalDocument = globalThis.document;
    const document = new FakeDocument();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    const host = document.createElement('div');
    const canvas = document.createElement('canvas');
    host.append(canvas);
    const onFocus = vi.fn();
    const board = createKanbanBoard(canvas as unknown as HTMLCanvasElement, onFocus);
    board.render(view([card()]));
    const button = host.querySelectorAll('[data-terminal-id]')[0];
    expect(button.tagName).toBe('button');
    expect(button.dataset.terminalId).toBe('terminal');
    expect(button.attributes.get('aria-label')).toContain('WORKING');
    expect(button.textContent).not.toContain('WORKING');
    expect(button.parentElement?.attributes.get('role')).toBe('listitem');
    expect(host.querySelectorAll('.kanban-board')[0].attributes.get('role')).toBe('region');
    expect(host.querySelectorAll('.kanban-column-count')
      .every(item => !item.attributes.has('aria-label'))).toBe(true);
    const list = host.querySelectorAll('.kanban-card-list')[1];
    const mutations = list.childMutations;
    board.render(view([card()]));
    expect(list.childMutations).toBe(mutations);
    button.click();
    expect(onFocus).toHaveBeenCalledWith('terminal');
  });

  it('reuses a card node when moving columns and omits missing titles', () => {
    originalDocument = globalThis.document;
    const document = new FakeDocument();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    const host = document.createElement('div');
    const canvas = document.createElement('canvas');
    host.append(canvas);
    const board = createKanbanBoard(canvas as unknown as HTMLCanvasElement, () => {});
    board.render(view([card({ terminalTitle: null })]));
    const button = host.querySelectorAll('[data-terminal-id]')[0];
    board.render(view([card({ status: 'done', terminalTitle: null })], 'done'));
    expect(host.querySelectorAll('[data-terminal-id]')[0]).toBe(button);
    expect(button.attributes.has('aria-describedby')).toBe(false);
    board.render(view([]));
    expect(host.querySelectorAll('[data-terminal-id]')).toHaveLength(0);
  });

  it('keeps tooltip IDs unique across departures and uses terminal identity for avatar color', () => {
    originalDocument = globalThis.document;
    const document = new FakeDocument();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    const host = document.createElement('div');
    const canvas = document.createElement('canvas');
    host.append(canvas);
    const board = createKanbanBoard(canvas as unknown as HTMLCanvasElement, () => {});

    board.render(view([
      card({ id: 'a', terminalTitle: 'A' }),
      card({ id: 'b', terminalTitle: 'B' }),
    ]));
    const initialTooltips = host.querySelectorAll('.kanban-card-tooltip');
    expect(new Set(initialTooltips.map(item => item.id)).size).toBe(2);
    expect(host.querySelectorAll('.kanban-card-avatar').map(item => item.dataset.slot))
      .toEqual(['1', '2']);

    board.render(view([card({ id: 'b', terminalTitle: 'B' })]));
    board.render(view([
      card({ id: 'b', terminalTitle: 'B' }),
      card({ id: 'c', terminalTitle: 'C' }),
    ]));
    const replacementTooltips = host.querySelectorAll('.kanban-card-tooltip');
    expect(new Set(replacementTooltips.map(item => item.id)).size).toBe(2);
  });
});

describe('Kanban sidebar', () => {
  function mount() {
    originalDocument = globalThis.document;
    const document = new FakeDocument();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    const app = document.createElement('div');
    return { app, sidebar: createKanbanSidebar(app as unknown as HTMLElement) };
  }

  it('lists workspaces with agent counts and reuses rows', () => {
    const { app, sidebar } = mount();
    sidebar.render(view([card()], 'working', [
      { id: 'a', label: 'Alpha', agentCount: 1 },
      { id: 'b', label: 'Beta', agentCount: 0 },
    ]));
    const rows = app.querySelectorAll('.kanban-workspace');
    expect(rows.map(row => row.textContent)).toEqual(['', '']);
    expect(rows.map(row => row.attributes.get('aria-label')))
      .toEqual(['Alpha, 1 agent', 'Beta, 0 agents']);
    expect(app.querySelectorAll('.kanban-workspace-label').map(item => item.textContent))
      .toEqual(['Alpha', 'Beta']);
    expect(app.querySelectorAll('.kanban-side-empty')).toHaveLength(0);

    sidebar.render(view([], 'working', [{ id: 'a', label: 'Alpha Renamed', agentCount: 0 }]));
    expect(app.querySelectorAll('.kanban-workspace')[0]).toBe(rows[0]);
    expect(app.querySelectorAll('.kanban-workspace')).toHaveLength(1);
    expect(app.querySelectorAll('.kanban-workspace-label')[0].textContent).toBe('Alpha Renamed');
  });

  it('mirrors column counts in the status legend and the agent total', () => {
    const { app, sidebar } = mount();
    sidebar.render(view([card(), card({ id: 'other' })], 'blocked'));
    expect(app.querySelectorAll('.kanban-legend-count').map(item => item.textContent))
      .toEqual(['0', '0', '2', '0']);
    expect(app.querySelectorAll('.kanban-side-total')[0].textContent).toBe('2 AGENTS');

    sidebar.render(view([card()], 'idle'));
    expect(app.querySelectorAll('.kanban-legend-count').map(item => item.textContent))
      .toEqual(['1', '0', '0', '0']);
    expect(app.querySelectorAll('.kanban-side-total')[0].textContent).toBe('1 AGENT');
    expect(app.querySelectorAll('.kanban-side-empty')).toHaveLength(0);
  });
});

describe('Kanban chrome', () => {
  it('renders uppercase product chrome without masking the title with invalid labels', () => {
    originalDocument = globalThis.document;
    const document = new FakeDocument();
    for (const id of [
      'phase-text', 'lap-text', 'gp-text', 'connection-text',
      'live-pill', 'overlay', 'standings-empty',
    ]) document.addElement(id);
    document.getElementById('live-pill')!.setAttribute('aria-label', 'stale');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });

    const chrome = createKanbanChrome();
    chrome.render(view([card()]));

    expect(document.title).toBe('Herdr Kanban');
    expect(document.getElementById('phase-text')!.textContent).toBe('HERDR KANBAN');
    expect(document.getElementById('lap-text')!.textContent).toBe('1 AGENT');
    expect(document.getElementById('connection-text')!.textContent).toBe('LIVE');
    expect(document.getElementById('connection-text')!.attributes.get('role')).toBe('status');
    expect(document.getElementById('live-pill')!.attributes.has('aria-label')).toBe(false);
  });
});

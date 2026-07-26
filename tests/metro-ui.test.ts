import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMetroChrome } from '../src/web/formats/metro/chrome.js';
import { createMetroPanel } from '../src/web/formats/metro/panel.js';
import type {
  MetroLineView,
  MetroTrainView,
  MetroView,
} from '../src/web/formats/metro/view.js';

class FakeClassList {
  readonly values = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) this.values.add(token);
  }

  toggle(token: string, force?: boolean): boolean {
    const enabled = force ?? !this.values.has(token);
    if (enabled) this.values.add(token);
    else this.values.delete(token);
    return enabled;
  }
}

class FakeStyle {
  color = '';
  readonly properties = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }
}

class FakeElement {
  className = '';
  readonly classList = new FakeClassList();
  readonly style = new FakeStyle();
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  disabled = false;
  hidden = false;
  textContent: string | null = '';
  type = '';
  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(
    readonly owner: FakeDocument,
    readonly tagName = 'div',
  ) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  click(): void {
    if (this.disabled) return;
    for (const listener of this.listeners.get('click') ?? []) listener();
  }

  focus(): void {
    this.owner.activeElement = this;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = [];
    for (const child of this.children) {
      if (selector === '[data-terminal-id]' &&
          child.dataset.terminalId !== undefined) {
        matches.push(child);
      }
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  readonly elements = new Map<string, FakeElement>();
  readonly panelTitle = new FakeElement(this);

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }

  register(id: string): FakeElement {
    const element = new FakeElement(this);
    this.elements.set(id, element);
    return element;
  }

  getElementById(id: string): FakeElement | null {
    return this.elements.get(id) ?? null;
  }

  querySelector(selector: string): FakeElement | null {
    return selector === '.panel-title' ? this.panelTitle : null;
  }
}

function train(overrides: Partial<MetroTrainView> = {}): MetroTrainView {
  return {
    id: 'train',
    unitNumber: 7,
    lineID: 'line',
    workspaceLabel: 'Line',
    tabLabel: 'agent',
    agentKind: 'codex',
    status: 'working',
    colorToken: { kind: 'palette', slot: 0 },
    officialDistance: 0,
    displayDistance: 0,
    placement: { kind: 'route', progress: 0 },
    displaySpeed: 0,
    isFocused: false,
    isDeparted: false,
    showsNewCrew: false,
    transitionStartedAt: null,
    ...overrides,
  };
}

function line(trains: MetroTrainView[]): MetroLineView {
  const present = trains.filter(item => !item.isDeparted);
  return {
    id: 'line',
    label: 'Line',
    sourceOrder: 0,
    stableOrder: 0,
    routeTemplate: 0,
    colorToken: { kind: 'palette', slot: 0 },
    workingCount: present.filter(item => item.status === 'working').length,
    totalTrains: present.length,
    hasBlocked: present.some(item => item.status === 'blocked'),
    trains,
  };
}

function view(overrides: Partial<MetroView> = {}): MetroView {
  return {
    phase: 'live',
    serviceNight: 1,
    activeServiceTime: 0,
    serviceTimeRemaining: 75,
    dawnElapsed: 0,
    isLastTrain: false,
    lines: [],
    focusedTrainID: null,
    connection: { kind: 'live' },
    overlay: { kind: 'none' },
    ...overrides,
  };
}

let fakeDocument: FakeDocument;

beforeEach(() => {
  fakeDocument = new FakeDocument();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: fakeDocument,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document');
});

describe('Metro panel', () => {
  it('disables departed train rows and does not request focus for them', () => {
    const container = new FakeElement(fakeDocument);
    const onFocus = vi.fn();
    const departed = train({
      isDeparted: true,
      placement: { kind: 'departing', progress: 0.25 },
    });
    const panel = createMetroPanel(
      container as unknown as HTMLElement,
      onFocus,
    );

    panel.render(view({ lines: [line([departed])] }));

    const [row] = container.querySelectorAll('[data-terminal-id]');
    expect(row.disabled).toBe(true);
    expect(row.textContent).not.toBeNull();
    row.click();
    expect(onFocus).not.toHaveBeenCalled();
  });
});

describe('Metro chrome accessibility', () => {
  it('exposes connection and overlay changes as atomic live regions', () => {
    for (const id of [
      'phase-text',
      'lap-text',
      'gp-text',
      'connection-text',
      'car-count',
      'overlay',
      'standings-empty',
      'live-pill',
    ]) {
      fakeDocument.register(id);
    }

    const chrome = createMetroChrome();
    chrome.render(view({
      connection: { kind: 'offline' },
      overlay: { kind: 'frozen' },
    }));

    const connection = fakeDocument.getElementById('connection-text')!;
    const overlay = fakeDocument.getElementById('overlay')!;
    expect(connection.getAttribute('role')).toBe('status');
    expect(connection.getAttribute('aria-live')).toBe('polite');
    expect(connection.getAttribute('aria-atomic')).toBe('true');
    expect(overlay.getAttribute('role')).toBe('status');
    expect(overlay.getAttribute('aria-live')).toBe('polite');
    expect(overlay.getAttribute('aria-atomic')).toBe('true');
    expect(overlay.hidden).toBe(false);
  });
});

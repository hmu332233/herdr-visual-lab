import type { AgentStatus } from '../../../shared/presentation.js';
import type { KanbanCardView, KanbanView } from './view.js';

interface CardController {
  item: HTMLElement;
  button: HTMLButtonElement;
  workspace: HTMLElement;
  tabName: HTMLElement;
  tabID: HTMLElement;
  kind: HTMLElement;
  avatar: HTMLElement;
  mark: HTMLElement;
  title: HTMLElement;
  tooltip: HTMLElement;
  focused: HTMLElement;
  status: AgentStatus;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'IDLE',
  working: 'WORKING',
  blocked: 'BLOCKED',
  done: 'DONE',
};

/** Purely decorative footer glyph; the status is already in the card label. */
const STATUS_MARK: Record<AgentStatus, string> = {
  idle: '',
  working: '',
  blocked: '!',
  done: '✓',
};

let nextBoardID = 0;

export function createKanbanBoard(
  canvas: HTMLCanvasElement,
  onFocus: (terminalID: string) => void,
) {
  const host = canvas.parentElement!;
  const boardID = ++nextBoardID;
  const board = document.createElement('div');
  board.className = 'kanban-board';
  board.setAttribute('role', 'region');
  board.setAttribute('aria-label', 'Herdr Kanban board');

  const lists = new Map<AgentStatus, HTMLElement>();
  const counts = new Map<AgentStatus, HTMLElement>();
  for (const status of ['idle', 'working', 'blocked', 'done'] as const) {
    const column = document.createElement('section');
    column.className = `kanban-column is-${status}`;
    column.setAttribute('aria-labelledby', `kanban-${boardID}-${status}-label`);

    const header = document.createElement('header');
    header.className = 'kanban-column-header';
    const label = document.createElement('h2');
    label.id = `kanban-${boardID}-${status}-label`;
    label.textContent = STATUS_LABEL[status];
    const count = document.createElement('span');
    count.className = 'kanban-column-count mono';
    count.textContent = '0';
    header.append(label, count);

    const list = document.createElement('div');
    list.className = 'kanban-card-list';
    list.setAttribute('role', 'list');
    column.append(header, list);
    board.append(column);
    lists.set(status, list);
    counts.set(status, count);
  }
  host.append(board);

  const cards = new Map<string, CardController>();
  let nextTooltipID = 0;

  function render(view: KanbanView): void {
    const before = new Map<string, DOMRect>();
    for (const [id, controller] of cards) {
      const rect = controller.button.getBoundingClientRect?.();
      if (rect) before.set(id, rect);
    }

    const present = new Set<string>();
    const moved = new Set<string>();
    for (const column of view.columns) {
      const list = lists.get(column.status)!;
      const count = counts.get(column.status)!;
      count.textContent = String(column.cards.length);
      column.cards.forEach((card, index) => {
        present.add(card.id);
        const controller = cards.get(card.id) ?? createCard(
          card,
          onFocus,
          `kanban-${boardID}-tooltip-${++nextTooltipID}`,
        );
        const previousStatus = controller.status;
        updateCard(controller, card);
        cards.set(card.id, controller);
        placeCard(list, controller.item, index);
        if (previousStatus !== card.status && before.has(card.id)) {
          moved.add(card.id);
        }
      });
    }
    for (const [id, controller] of cards) {
      if (!present.has(id)) {
        controller.item.remove();
        cards.delete(id);
      }
    }
    // Measure only after every list has reached its final order. Measuring while
    // appending would animate toward an intermediate position when several cards
    // move or reorder in the same update.
    for (const id of moved) {
      const controller = cards.get(id);
      const previousRect = before.get(id);
      if (controller && previousRect) animateMove(controller.button, previousRect);
    }
  }

  return { render };
}

/** Keeps hover and keyboard focus intact on no-op syncs by avoiding a DOM move
 * when the card is already at the requested position. */
function placeCard(list: HTMLElement, item: HTMLElement, index: number): void {
  const current = list.children[index];
  if (current !== item) list.insertBefore(item, current ?? null);
}

function createCard(
  card: KanbanCardView,
  onFocus: (terminalID: string) => void,
  tooltipID: string,
): CardController {
  const item = document.createElement('div');
  item.className = 'kanban-card-item';
  item.setAttribute('role', 'listitem');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'kanban-card';
  button.dataset.terminalId = card.id;
  button.addEventListener('click', () => onFocus(card.id));

  const avatar = document.createElement('span');
  avatar.className = 'kanban-card-avatar';
  avatar.setAttribute('aria-hidden', 'true');

  // Two-line list row: identity on top, muted qualifiers underneath.
  const main = document.createElement('span');
  main.className = 'kanban-card-main';
  const head = document.createElement('span');
  head.className = 'kanban-card-head';
  const workspace = document.createElement('span');
  workspace.className = 'kanban-card-workspace';
  const tabName = document.createElement('span');
  tabName.className = 'kanban-card-tab-label';
  const focused = document.createElement('span');
  focused.className = 'kanban-card-focused';
  focused.textContent = 'FOCUSED';
  head.append(workspace, tabName, focused);

  const sub = document.createElement('span');
  sub.className = 'kanban-card-sub';
  const kind = document.createElement('span');
  kind.className = 'kanban-card-kind';
  const tabID = document.createElement('span');
  tabID.className = 'kanban-card-tab-id mono';
  const title = document.createElement('span');
  title.className = 'kanban-card-title';
  sub.append(kind, tabID, title);
  main.append(head, sub);

  const mark = document.createElement('span');
  mark.className = 'kanban-card-mark';
  mark.setAttribute('aria-hidden', 'true');
  const tooltip = document.createElement('span');
  tooltip.className = 'kanban-card-tooltip';
  tooltip.id = tooltipID;
  tooltip.setAttribute('role', 'tooltip');
  button.append(avatar, main, mark, tooltip);
  item.append(button);

  return {
    item, button, workspace, tabName, tabID, kind, avatar, mark, title, tooltip, focused,
    status: card.status,
  };
}

function updateCard(controller: CardController, card: KanbanCardView): void {
  controller.item.dataset.motionSlot = String(slotOf(card.id) % 5);
  controller.item.classList.toggle('is-working', card.status === 'working');
  controller.item.classList.toggle('is-blocked', card.status === 'blocked');
  controller.button.classList.toggle('is-focused', card.isFocused);
  controller.button.classList.toggle('is-idle', card.status === 'idle');
  controller.button.classList.toggle('is-working', card.status === 'working');
  controller.button.classList.toggle('is-blocked', card.status === 'blocked');
  controller.button.classList.toggle('is-done', card.status === 'done');
  controller.focused.hidden = !card.isFocused;
  controller.button.dataset.terminalId = card.id;
  controller.workspace.textContent = card.workspaceLabel;
  controller.tabName.textContent = card.tabLabel;
  controller.tabID.textContent = card.tabID;
  controller.kind.textContent = card.agentKind;
  controller.avatar.textContent = initialsOf(card.agentKind || card.workspaceLabel);
  controller.avatar.dataset.slot = String(slotOf(card.id));
  controller.mark.textContent = STATUS_MARK[card.status];
  controller.mark.dataset.status = card.status;
  controller.button.setAttribute(
    'aria-label',
    `${card.workspaceLabel}, ${card.tabLabel}, ${card.tabID}, ${card.agentKind}, ${STATUS_LABEL[card.status]}${card.isFocused ? ', FOCUSED' : ''}`,
  );

  const hasTitle = card.terminalTitle !== null;
  controller.title.hidden = !hasTitle;
  controller.tooltip.hidden = !hasTitle;
  controller.title.textContent = card.terminalTitle ?? '';
  controller.tooltip.textContent = card.terminalTitle ?? '';
  if (hasTitle) controller.button.setAttribute('aria-describedby', controller.tooltip.id);
  else controller.button.removeAttribute('aria-describedby');
  controller.status = card.status;
}

function initialsOf(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : '?';
}

/** Stable per-agent accent slot so the same agent keeps the same avatar color. */
function slotOf(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 997;
  }
  return hash % 6;
}

function animateMove(button: HTMLButtonElement, before: DOMRect): void {
  if (reducedMotion()) return;
  const after = button.getBoundingClientRect();
  const x = before.left - after.left;
  const y = before.top - after.top;
  if (Math.abs(x) < 1 && Math.abs(y) < 1) return;
  button.getAnimations().forEach(animation => animation.cancel());
  button.animate(
    [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }],
    { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

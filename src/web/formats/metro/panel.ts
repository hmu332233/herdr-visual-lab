import { contrastText, teamColor } from '../../palette.js';
import type { MetroTrainView, MetroView } from './view.js';
import { METRO_STATUS_CLASS, METRO_STATUS_LABEL } from './vocabulary.js';

export function createMetroPanel(
  container: HTMLElement,
  onFocus: (terminalID: string) => void,
) {
  container.classList.add('metro-control');
  container.setAttribute('aria-label', 'Network control');

  function render(view: MetroView): void {
    const active = document.activeElement as HTMLElement | null;
    const focusedTerminal = active?.dataset.terminalId ?? null;
    const cards = view.lines.map(line => {
      const color = teamColor(line.colorToken);
      const card = document.createElement('article');
      card.className = 'metro-line-card';
      card.classList.toggle('has-hold', line.hasBlocked);
      card.style.setProperty('--line-color', color);
      card.setAttribute('role', 'listitem');

      const header = document.createElement('div');
      header.className = 'metro-line-header';

      const symbol = document.createElement('span');
      symbol.className = 'metro-line-symbol';
      symbol.textContent = `L${String(line.routeTemplate + 1).padStart(2, '0')}`;
      symbol.setAttribute('aria-hidden', 'true');

      const copy = document.createElement('div');
      copy.className = 'metro-line-copy';
      const name = document.createElement('strong');
      name.textContent = line.label;
      const detail = document.createElement('span');
      detail.textContent = `${line.workingCount}/${line.totalTrains} IN SERVICE · ROUTE ${String(line.routeTemplate + 1).padStart(2, '0')}`;
      copy.append(name, detail);

      const health = document.createElement('span');
      health.className = 'metro-line-health';
      health.classList.toggle('has-hold', line.hasBlocked);
      health.textContent = line.hasBlocked ? 'SIGNAL HOLD' : 'LINE CLEAR';
      header.append(symbol, copy, health);

      const trains = document.createElement('div');
      trains.className = 'metro-train-list';
      trains.setAttribute('role', 'list');
      for (const train of line.trains) {
        trains.append(createTrainRow(train, color, onFocus));
      }
      card.append(header, trains);
      return card;
    });

    container.replaceChildren(...cards);
    if (focusedTerminal) {
      const restored = [...container.querySelectorAll<HTMLElement>('[data-terminal-id]')]
        .find(element => element.dataset.terminalId === focusedTerminal);
      restored?.focus({ preventScroll: true });
    }
  }

  return { render };
}

function createTrainRow(
  train: MetroTrainView,
  color: string,
  onFocus: (terminalID: string) => void,
): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'metro-train-row';
  row.classList.toggle('is-focused', train.isFocused);
  row.classList.toggle('is-blocked', train.status === 'blocked');
  row.style.setProperty('--line-color', color);
  row.style.setProperty('--train-ink', contrastText(color));
  row.dataset.terminalId = train.id;
  row.disabled = train.isDeparted;

  const status = train.isDeparted
    ? 'RETURNING'
    : train.placement.kind === 'maintenance'
      ? 'MAINTENANCE'
      : METRO_STATUS_LABEL[train.status];
  row.setAttribute(
    'aria-label',
    `Train ${train.unitNumber}, ${train.tabLabel}, ${train.agentKind}, ${status}${train.isFocused ? ', tracking' : ''}`,
  );
  if (!train.isDeparted) {
    row.addEventListener('click', () => onFocus(train.id));
  }

  const token = document.createElement('span');
  token.className = 'metro-train-token';
  token.textContent = String(train.unitNumber).padStart(2, '0');
  token.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('span');
  copy.className = 'metro-train-copy';
  const tab = document.createElement('strong');
  tab.textContent = train.tabLabel;
  const kind = document.createElement('span');
  kind.textContent = `${train.agentKind}${train.showsNewCrew ? ' · NEW CREW' : ''}${train.isFocused ? ' · TRACKING' : ''}`;
  copy.append(tab, kind);

  const state = document.createElement('span');
  state.className = 'metro-train-state';
  state.classList.add(train.isDeparted ? 'is-depot' : METRO_STATUS_CLASS[train.status]);
  state.textContent = status;
  row.append(token, copy, state);
  return row;
}

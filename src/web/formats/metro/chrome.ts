import type { GameOverlay } from '../../presentation.js';
import type { MetroView } from './view.js';
import { servicePhaseLabel } from './vocabulary.js';

export function createMetroChrome() {
  const phase = document.getElementById('phase-text')!;
  const night = document.getElementById('lap-text')!;
  const activity = document.getElementById('gp-text')!;
  const connection = document.getElementById('connection-text')!;
  const count = document.getElementById('car-count')!;
  const overlay = document.getElementById('overlay')!;
  const empty = document.getElementById('standings-empty')!;
  const title = document.querySelector('.panel-title');
  if (title) title.textContent = 'NETWORK CONTROL';
  connection.setAttribute('role', 'status');
  connection.setAttribute('aria-live', 'polite');
  connection.setAttribute('aria-atomic', 'true');
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-atomic', 'true');

  function render(view: MetroView): void {
    const phaseKey = view.isLastTrain && view.phase === 'live'
      ? 'lastTrain'
      : view.phase;
    const trains = view.lines.reduce((total, line) => total + line.totalTrains, 0);
    const working = view.lines.reduce((total, line) => total + line.workingCount, 0);

    phase.textContent = servicePhaseLabel(phaseKey);
    night.textContent = `SERVICE NIGHT ${String(view.serviceNight).padStart(2, '0')}`;
    activity.textContent = `${view.lines.length} LINES · ${trains} TRAINS`;
    count.textContent = `${working}/${trains} IN SERVICE`;

    const live = view.connection.kind === 'live';
    const nextConnectionLabel = live ? 'SIGNAL LIVE' : connectionLabel(view);
    if (connection.textContent !== nextConnectionLabel) {
      connection.textContent = nextConnectionLabel;
    }
    connection.style.color = live ? '#63d69b' : '#ff6574';

    const pill = document.getElementById('live-pill');
    if (pill) {
      pill.style.color = view.phase === 'dawn'
        ? '#e1b8e8'
        : view.isLastTrain
          ? '#f0c9ff'
          : live
            ? '#9ee8c4'
            : '#ff8a95';
    }

    empty.hidden = view.lines.length > 0;
    empty.textContent = view.connection.kind === 'waiting'
      ? 'AWAITING CONTROL SIGNAL'
      : 'NO LINES REGISTERED';
    renderOverlay(overlay, view.overlay);
  }

  return { render };
}

function connectionLabel(view: MetroView): string {
  switch (view.connection.kind) {
    case 'waiting': return 'SIGNAL WAIT';
    case 'offline': return 'SIGNAL LOST';
    case 'protocolError': return 'CONTROL ERROR';
    case 'live': return 'SIGNAL LIVE';
  }
}

function renderOverlay(container: HTMLElement, overlay: GameOverlay): void {
  const key = overlay.kind === 'suspended'
    ? `${overlay.kind}:${overlay.detail}`
    : overlay.kind;
  if (container.dataset.overlayKey === key) return;
  container.dataset.overlayKey = key;

  if (overlay.kind === 'none') {
    container.hidden = true;
    container.replaceChildren();
    return;
  }

  const card = document.createElement('div');
  card.className = 'overlay-card dim';
  const primary = document.createElement('div');
  primary.className = 'overlay-primary';
  const secondary = document.createElement('div');
  secondary.className = 'overlay-secondary';

  switch (overlay.kind) {
    case 'connecting':
      primary.textContent = 'AWAITING CONTROL SIGNAL';
      secondary.textContent = 'CONNECTING TO CENTRAL CONTROL';
      break;
    case 'noUnits':
      primary.textContent = 'NO LINES REGISTERED';
      secondary.textContent = 'THE NIGHT NETWORK IS STANDING BY';
      break;
    case 'frozen':
      primary.textContent = 'CONTROL SIGNAL LOST';
      secondary.textContent = 'LAST CONFIRMED NETWORK FRAME';
      break;
    case 'suspended':
      primary.textContent = 'CONTROL PROTOCOL ERROR';
      secondary.textContent = overlay.detail.toUpperCase();
      break;
  }

  card.append(primary, secondary);
  container.hidden = false;
  container.replaceChildren(card);
}

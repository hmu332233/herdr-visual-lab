import type { ConnectionState } from '../../../shared/presentation.js';
import type { KanbanView } from './view.js';

export function createKanbanChrome() {
  const phase = document.getElementById('phase-text')!;
  const total = document.getElementById('lap-text')!;
  const detail = document.getElementById('gp-text')!;
  const connection = document.getElementById('connection-text')!;
  const pill = document.getElementById('live-pill')!;
  const overlay = document.getElementById('overlay')!;
  const empty = document.getElementById('standings-empty')!;

  connection.setAttribute('role', 'status');
  connection.setAttribute('aria-live', 'polite');
  connection.setAttribute('aria-atomic', 'true');
  overlay.hidden = true;
  empty.hidden = true;
  detail.textContent = '';
  document.title = 'Herdr Kanban';

  function render(view: KanbanView): void {
    phase.textContent = 'HERDR KANBAN';
    total.textContent = `${view.totalAgents} AGENT${view.totalAgents === 1 ? '' : 'S'}`;
    const label = connectionLabel(view.connection);
    connection.textContent = label;
    connection.dataset.connection = view.connection.kind;
    connection.classList.toggle('is-offline', view.connection.kind === 'offline');
    connection.classList.toggle('is-error', view.connection.kind === 'protocolError');
    pill.dataset.connection = view.connection.kind;
    pill.removeAttribute('aria-label');
  }

  return { render };
}

function connectionLabel(connection: ConnectionState): string {
  switch (connection.kind) {
    case 'waiting': return 'CONNECTING';
    case 'live': return 'LIVE';
    case 'offline': return 'OFFLINE';
    case 'protocolError': return 'PROTOCOL ERROR';
  }
}

import type { AgentStatus } from '../../../shared/presentation.js';
import type { GalaxyView } from './view.js';
import { STATUS_LABEL, STATUS_ORDER, TITLE } from './vocabulary.js';

const STATUS_CSS: Record<AgentStatus, string> = {
  working: '#9fd8ff', idle: '#4a566e', blocked: '#ff4d4d', done: '#ffc94d',
};

/** In-canvas HUD overlay: corner frame, title block, connection readout,
 *  and a status legend card. The default page header stays hidden via CSS. */
export function createGalaxyChrome() {
  const wrap = document.getElementById('track-wrap')!;
  const hud = document.createElement('div');
  hud.className = 'galaxy-hud';
  hud.innerHTML = `
    <div class="galaxy-vignette"></div>
    <div class="galaxy-corner tl"></div><div class="galaxy-corner tr"></div>
    <div class="galaxy-corner bl"></div><div class="galaxy-corner br"></div>
    <div class="galaxy-title">
      <h1>${TITLE}</h1>
      <p>LIVE AGENT TOPOLOGY</p>
    </div>
    <div class="galaxy-session">
      <span class="galaxy-topology"></span>
      <span class="galaxy-connection" role="status" aria-live="polite" aria-atomic="true"></span>
    </div>
    <div class="galaxy-legend">
      ${STATUS_ORDER.map(status => `
        <div class="galaxy-legend-row" data-status="${status}">
          <span class="galaxy-legend-mark" style="--mark:${STATUS_CSS[status]}"></span>
          <span class="galaxy-legend-name">${STATUS_LABEL[status]}</span>
          <span class="galaxy-legend-count">00</span>
        </div>`).join('')}
    </div>`;
  wrap.appendChild(hud);
  const topology = hud.querySelector('.galaxy-topology')!;
  const connection = hud.querySelector('.galaxy-connection') as HTMLElement;
  const counts = new Map<AgentStatus, Element>();
  for (const status of STATUS_ORDER) {
    counts.set(status, hud.querySelector(`[data-status="${status}"] .galaxy-legend-count`)!);
  }

  function render(view: GalaxyView): void {
    const agents = Object.values(view.counts).reduce((total, count) => total + count, 0);
    const tabs = view.teams.reduce((total, team) => total + team.tabs.length, 0);
    topology.textContent = `${view.teams.length} PLANETS · ${tabs} MOONS · ${agents} AGENTS`;
    const live = view.connection.kind === 'live';
    const label = live ? 'LIVE'
      : view.connection.kind === 'waiting' ? 'AWAITING SIGNAL'
      : view.connection.kind === 'protocolError' ? 'PROTOCOL ERROR'
      : 'OFFLINE';
    if (connection.textContent !== label) connection.textContent = label;
    connection.dataset.live = String(live);
    for (const status of STATUS_ORDER) {
      counts.get(status)!.textContent = String(view.counts[status]).padStart(2, '0');
    }
  }

  return { render };
}

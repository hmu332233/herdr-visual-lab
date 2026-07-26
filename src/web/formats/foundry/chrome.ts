import type { FoundryView } from './index.js';
import { palette } from '../../palette.js';

export function createChrome() {
  const phase = document.getElementById('phase-text')!;
  const score = document.getElementById('lap-text')!;
  const orders = document.getElementById('gp-text')!;
  const connection = document.getElementById('connection-text')!;
  const count = document.getElementById('car-count')!;
  const overlay = document.getElementById('overlay')!;
  const empty = document.getElementById('standings-empty')!;
  const title = document.querySelector('.panel-title');
  if (title) title.textContent = 'STARPORT CREW';

  function render(view: FoundryView): void {
    const { spaceport } = view;
    phase.textContent = `MISSION ${String(spaceport.missionNumber).padStart(2, '0')}`;
    score.textContent = `${spaceport.score.toLocaleString()} PTS`;
    orders.textContent = `${spaceport.successfulLaunches} LAUNCHES · ${spaceport.streak}× STREAK`;
    const live = view.connection.kind === 'live';
    connection.textContent = live ? spaceport.phase : 'SIGNAL LOST';
    connection.style.color = live ? spaceport.mission.color : palette.statusBlocked;
    count.textContent = `${spaceport.activeWorkers}/${spaceport.residents} COURIERS`;

    empty.hidden = view.teams.length > 0;
    if (view.teams.length === 0) {
      empty.textContent = 'STARPORT QUIET · AWAITING FIRST CREW';
    }

    if (view.connection.kind === 'protocolError') {
      const card = document.createElement('div');
      card.className = 'overlay-card dim';
      const primary = document.createElement('div');
      primary.className = 'overlay-primary';
      primary.textContent = 'STARPORT SIGNAL LOST';
      const secondary = document.createElement('div');
      secondary.className = 'overlay-secondary';
      secondary.textContent = view.connection.detail.toUpperCase();
      card.append(primary, secondary);
      overlay.hidden = false;
      overlay.replaceChildren(card);
    } else {
      overlay.hidden = true;
      overlay.replaceChildren();
    }
  }

  return { render };
}

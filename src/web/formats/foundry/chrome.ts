import type { SyncMessage } from '../../../shared/protocol.js';
import { palette } from '../../palette.js';
import { projectFoundry, type FoundryState } from './fold.js';

export function createChrome(getState: () => FoundryState) {
  const phase = document.getElementById('phase-text')!;
  const resources = document.getElementById('lap-text')!;
  const modules = document.getElementById('gp-text')!;
  const connection = document.getElementById('connection-text')!;
  const count = document.getElementById('car-count')!;
  const overlay = document.getElementById('overlay')!;
  const empty = document.getElementById('standings-empty')!;
  const title = document.querySelector('.panel-title');
  if (title) title.textContent = 'ORBITAL FOUNDRIES';
  overlay.hidden = true;

  function render(sync: SyncMessage): void {
    const teams = projectFoundry(getState(), sync.serverTime);
    const resourceTotal = teams.reduce((sum, team) => sum + team.resources, 0);
    const moduleTotal = teams.reduce((sum, team) => sum + team.modules, 0);
    phase.textContent = 'FOUNDRY LIVE';
    resources.textContent = `${resourceTotal} ALLOY`;
    modules.textContent = `${moduleTotal} MODULES`;
    const live = sync.connection.kind === 'live';
    connection.textContent = live ? 'ORBITAL LINK' : 'LINK OFFLINE';
    connection.style.color = live ? palette.statusWorking : palette.liveRed;
    count.textContent = `${teams.length} STATION${teams.length === 1 ? '' : 'S'}`;
    empty.hidden = teams.length > 0;
    if (teams.length === 0) empty.textContent = 'NO STATIONS';
  }
  return { render };
}

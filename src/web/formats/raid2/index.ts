import type { GameFormat } from '../../format.js';
import { createRaidStateOwner } from '../raid/index.js';
import { createChrome } from '../raid/chrome.js';
import { stageLabel } from '../raid/vocabulary.js';
import { createPartyPanel } from './party.js';
import { createRaid2Scene } from './scene.js';

/** Raid 2: identical rules, fold, chrome, and standings to Raid — but a
 *  completely different stage: a horizontal side-view battlefield with sky
 *  above, ground below, and full-body game-style heroes facing the boss. */
export function createRaid2Format(): GameFormat {
  const owner = createRaidStateOwner();
  return {
    onEvents: owner.onEvents,
    onTimeline: owner.onTimeline,
    createChrome() {
      const chrome = createChrome();
      const phase = document.getElementById('phase-text')!;
      const hp = document.getElementById('lap-text')!;
      const stage = document.getElementById('gp-text')!;
      const connection = document.getElementById('connection-text')!;
      const count = document.getElementById('car-count')!;
      const panelTitle = document.querySelector('.panel-title');
      if (panelTitle) panelTitle.textContent = 'PARTY';
      return {
        render: () => {
          const view = owner.view();
          chrome.render(view);
          phase.textContent = view.phase === 'results' ? 'CLEAR' : 'BATTLE';
          hp.textContent = '';
          stage.textContent = stageLabel(view.stage);
          connection.textContent = '';
          count.textContent = String(
            view.teams.reduce((total, team) => total + team.entries.length, 0),
          );
          if (panelTitle) panelTitle.textContent = 'PARTY';
        },
      };
    },
    createStandings(el, onFocus) {
      const party = createPartyPanel(el, onFocus);
      return { render: () => party.render(owner.view()) };
    },
    createScene(canvas, onFocus) {
      const scene = createRaid2Scene(canvas, onFocus);
      return { commit: at => scene.setSync(owner.view(), at), frame: scene.frame, resize: scene.resize };
    },
  };
}

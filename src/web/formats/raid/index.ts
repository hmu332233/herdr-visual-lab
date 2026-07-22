import type { GameFormat } from '../../format.js';
import { createChrome } from './chrome.js';
import { createStandingsPanel } from './standings.js';
import { createRaidScene } from './scene.js';

/** Raid boss: the same neutral session, reinterpreted. Cumulative progress is
 *  damage, the leader's progress is the boss health bar, the round is the
 *  stage. Nothing on the server or protocol knows any of this. */
export const raidFormat: GameFormat = {
  createChrome: () => createChrome(),
  createStandings: (el, onFocus) => createStandingsPanel(el, onFocus),
  createScene: (canvas, onFocus) => createRaidScene(canvas, onFocus),
};

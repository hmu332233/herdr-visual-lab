import type { GameFormat } from '../../format.js';
import type { GameEvent } from '../../../shared/events.js';
import { createChrome } from './chrome.js';
import { createStandingsPanel } from './standings.js';
import { createFoundryScene } from './scene.js';
import { foldFoundry, initialFoundry, type FoundryState } from './fold.js';

let state: FoundryState = initialFoundry();
export const foundryFormat: GameFormat = {
  createChrome: () => createChrome(() => state),
  createStandings: (el, onFocus) => createStandingsPanel(el, onFocus, () => state),
  createScene: (canvas, onFocus) => createFoundryScene(canvas, onFocus, () => state),
  onEvents: (events: GameEvent[], reset: boolean) => {
    if (reset) state = initialFoundry();
    for (const event of events) state = foldFoundry(state, event);
  },
};

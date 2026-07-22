import type { GameFormat } from '../../format.js';
import { createChrome } from './chrome.js';
import { createStandingsPanel } from './standings.js';
import { createTrackRenderer } from './track.js';

/** The original F1 broadcast: a circuit scene, a CONSTRUCTORS panel, and the
 *  LAP / GRAND PRIX header. All F1 vocabulary is derived client-side here. */
export const f1Format: GameFormat = {
  createChrome: () => createChrome(),
  createStandings: (el, onFocus) => createStandingsPanel(el, onFocus),
  createScene: (canvas, onFocus) => createTrackRenderer(canvas, onFocus),
};

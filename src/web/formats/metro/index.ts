import type { GameEvent } from '../../../shared/events.js';
import type { TimelineCursor } from '../../../shared/protocol.js';
import type { GameFormat } from '../../format.js';
import { createMetroChrome } from './chrome.js';
import { foldMetro, initialMetroState, setMetroCursor } from './fold.js';
import { createMetroPanel } from './panel.js';
import { createMetroScene } from './scene.js';
import { projectMetro } from './view.js';

export function createMetroStateOwner() {
  let state = initialMetroState();
  return {
    onEvents(events: readonly GameEvent[], reset: boolean): void {
      if (reset) state = initialMetroState();
      for (const event of events) foldMetro(state, event);
    },
    onTimeline(cursor: TimelineCursor): void {
      setMetroCursor(state, cursor);
    },
    view: () => projectMetro(state),
  };
}

export function createMetroFormat(): GameFormat {
  const owner = createMetroStateOwner();
  return {
    onEvents: owner.onEvents,
    onTimeline: owner.onTimeline,
    createChrome() {
      const chrome = createMetroChrome();
      return { render: () => chrome.render(owner.view()) };
    },
    createStandings(element, onFocus) {
      const panel = createMetroPanel(element, onFocus);
      return { render: () => panel.render(owner.view()) };
    },
    createScene(canvas, onFocus) {
      const scene = createMetroScene(canvas, onFocus);
      return {
        commit: receivedAtMs => scene.commit(owner.view(), receivedAtMs),
        frame: scene.frame,
        resize: scene.resize,
      };
    },
  };
}

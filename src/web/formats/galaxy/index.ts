import type { GameEvent } from '../../../shared/events.js';
import type { TimelineCursor } from '../../../shared/protocol.js';
import type { GameFormat } from '../../format.js';
import { createGalaxyChrome } from './chrome.js';
import { foldGalaxy, initialGalaxyState, takeEffects } from './fold.js';
import { createGalaxyRoster } from './roster.js';
import { createGalaxyScene } from './scene.js';
import { projectGalaxy } from './view.js';

export function createGalaxyStateOwner() {
  let state = initialGalaxyState();
  return {
    onEvents(events: readonly GameEvent[], reset: boolean): void {
      if (reset) state = initialGalaxyState();
      for (const event of events) foldGalaxy(state, event);
    },
    onTimeline(_cursor: TimelineCursor): void {},
    view: () => projectGalaxy(state),
    takeEffects: () => takeEffects(state),
  };
}

export function createGalaxyFormat(): GameFormat {
  const owner = createGalaxyStateOwner();
  return {
    onEvents: owner.onEvents,
    onTimeline: owner.onTimeline,
    createChrome() {
      const chrome = createGalaxyChrome();
      return { render: () => chrome.render(owner.view()) };
    },
    createStandings(el, onFocus) {
      const roster = createGalaxyRoster(el, onFocus);
      return { render: () => roster.render(owner.view()) };
    },
    createScene(canvas, onFocus) {
      return createGalaxyScene(canvas, onFocus, owner.view, owner.takeEffects);
    },
  };
}

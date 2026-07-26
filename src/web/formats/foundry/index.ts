import type { GameEvent } from '../../../shared/events.js';
import type { TimelineCursor } from '../../../shared/protocol.js';
import type { GameFormat } from '../../format.js';
import { createChrome } from './chrome.js';
import { createStandingsPanel } from './standings.js';
import { createFoundryScene } from './scene.js';
import {
  foldFoundry,
  initialFoundry,
  projectFoundry,
  projectSpaceport,
  type FoundryState,
} from './fold.js';

export interface FoundryView {
  connection: FoundryState['connection'];
  timelineTime: number;
  timelineRate: number;
  teams: ReturnType<typeof projectFoundry>;
  spaceport: ReturnType<typeof projectSpaceport>;
}

export function createFoundryStateOwner() {
  let state = initialFoundry();
  let cursor: TimelineCursor = { timelineTime: 0, timelineRate: 1 };
  return {
    onEvents(events: readonly GameEvent[], reset: boolean): void {
      if (reset) state = initialFoundry();
      for (const event of events) foldFoundry(state, event);
    },
    onTimeline(next: TimelineCursor): void {
      cursor = next;
    },
    view(): FoundryView {
      const teams = projectFoundry(state, cursor.timelineTime);
      const spaceport = projectSpaceport(state, teams, cursor.timelineTime);
      return {
        connection: state.connection,
        timelineTime: cursor.timelineTime,
        timelineRate: cursor.timelineRate,
        teams,
        spaceport,
      };
    },
  };
}

export function createFoundryFormat(): GameFormat {
  const owner = createFoundryStateOwner();
  return {
    onEvents: owner.onEvents,
    onTimeline: owner.onTimeline,
    createChrome() {
      const chrome = createChrome();
      return { render: () => chrome.render(owner.view()) };
    },
    createStandings(element, onFocus) {
      const panel = createStandingsPanel(element, onFocus);
      return { render: () => panel.render(owner.view()) };
    },
    createScene(canvas, onFocus) {
      const scene = createFoundryScene(canvas, onFocus);
      return {
        commit: receivedAtMs => scene.commit(owner.view(), receivedAtMs),
        frame: scene.frame,
        resize: scene.resize,
      };
    },
  };
}

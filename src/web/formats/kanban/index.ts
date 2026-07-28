import type { GameEvent } from '../../../shared/events.js';
import type { TimelineCursor } from '../../../shared/protocol.js';
import type { GameFormat } from '../../format.js';
import { createKanbanBoard } from './board.js';
import { createKanbanChrome } from './chrome.js';
import { foldKanban, initialKanbanState } from './fold.js';
import { createKanbanSidebar } from './sidebar.js';
import { projectKanban } from './view.js';

export function createKanbanStateOwner() {
  let state = initialKanbanState();
  return {
    onEvents(events: readonly GameEvent[], reset: boolean): void {
      if (reset) state = initialKanbanState();
      for (const event of events) foldKanban(state, event);
    },
    onTimeline(_cursor: TimelineCursor): void {},
    view: () => projectKanban(state),
  };
}

export function createKanbanFormat(): GameFormat {
  const owner = createKanbanStateOwner();
  return {
    onEvents: owner.onEvents,
    onTimeline: owner.onTimeline,
    createChrome() {
      const chrome = createKanbanChrome();
      return { render: () => chrome.render(owner.view()) };
    },
    createStandings() {
      return { render() {} };
    },
    createScene(canvas, onFocus) {
      const board = createKanbanBoard(canvas, onFocus);
      const sidebar = createKanbanSidebar(document.getElementById('app')!);
      return {
        commit: () => {
          const view = owner.view();
          sidebar.render(view);
          board.render(view);
        },
        frame: () => {},
        resize: () => {},
      };
    },
  };
}


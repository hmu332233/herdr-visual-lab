import type { GamePresentation } from './presentation.js';
import type { GameEvent } from './events.js';

/** Server → browser: the complete authoritative game state at serverTime
 *  (monotonic seconds). Browsers extrapolate marker positions from each
 *  entry's placement.progress + displaySpeed until the next sync. */
export type SyncMessage = { type: 'sync'; serverTime: number; events: GameEvent[] } & GamePresentation;

export interface HistoryMessage {
  type: 'history';
  serverTime: number;
  droppedBefore: number;
  events: GameEvent[];
}

export type ServerMessage = SyncMessage | HistoryMessage;

/** Browser → server. Focusing is the only action the dashboard can take. */
export type ClientMessage = { type: 'focus'; terminalID: string };

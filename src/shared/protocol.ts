import type { GameEvent } from './events.js';

export interface TimelineCursor {
  timelineTime: number;
  timelineRate: number;
}

export interface HistoryMessage extends TimelineCursor {
  type: 'history';
  serverTime: number;
  events: GameEvent[];
}

export interface SyncMessage extends TimelineCursor {
  type: 'sync';
  serverTime: number;
  events: GameEvent[];
}

export type ServerMessage = HistoryMessage | SyncMessage;
export type ClientMessage = { type: 'focus'; terminalID: string };

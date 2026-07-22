import { describe, expect, it } from 'vitest';
import { createEventSource } from '../src/web/event-source.js';
import type { GameEvent } from '../src/shared/events.js';
import type { GamePresentation } from '../src/shared/presentation.js';
import type { HistoryMessage, SyncMessage } from '../src/shared/protocol.js';

const ev = (seq: number): GameEvent => ({ seq, at: seq, kind: 'stint-started', unitID: 'u1' });
const presentation: GamePresentation = {
  phase: 'live', round: 1, leaderProgress: 0, teams: [], results: null,
  connection: { kind: 'live' }, overlay: { kind: 'none' },
};
const history = (events: GameEvent[]): HistoryMessage => ({ type: 'history', serverTime: 0, droppedBefore: 1, events });
const sync = (events: GameEvent[]): SyncMessage => ({ type: 'sync', serverTime: 0, events, ...presentation });

describe('EventSource', () => {
  it('resets from history and deduplicates overlapping sync deltas', () => {
    const batches: Array<{ events: GameEvent[]; reset: boolean }> = [];
    const source = createEventSource((events, reset) => batches.push({ events, reset }));
    source.ingest(history([ev(1), ev(2)]));
    source.ingest(sync([ev(1), ev(2), ev(3)]));
    expect(batches).toEqual([
      { events: [ev(1), ev(2)], reset: true },
      { events: [ev(3)], reset: false },
    ]);
    source.ingest(history([]));
    expect(batches.at(-1)).toEqual({ events: [], reset: true });
  });
});

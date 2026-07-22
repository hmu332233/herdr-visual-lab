import type { RaceSession } from './race-session.js';
import type { EventLog } from './event-log.js';
import type { GameEvent } from '../shared/events.js';
import type { HistoryMessage, SyncMessage } from '../shared/protocol.js';

/**
 * Owns the server-side tick: advances the race session on a fixed cadence and
 * fans full sync messages out to connected browsers.
 */
export function createRaceBroadcaster(
  session: RaceSession,
  clock: () => number,
  log: EventLog,
  tickMs = 250,
) {
  let timer: ReturnType<typeof setInterval> | null = null;
  const clients = new Set<(json: string) => void>();
  let broadcastSeq = 0;

  function start(): void {
    if (timer) return;
    timer = setInterval(tick, tickMs);
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function addClient(send: (json: string) => void): void {
    clients.add(send);
    const now = clock();
    session.advance(now);
    send(JSON.stringify(buildHistory()));
    send(JSON.stringify(buildSync([])));
  }

  function removeClient(send: (json: string) => void): void {
    clients.delete(send);
  }

  /** One cadence step. Public so tests can drive it with a manual clock. */
  function tick(): void {
    const now = clock();
    session.advance(now);
    if (clients.size === 0) return; // race continues; nothing to fan out
    const events = log.eventsSince(broadcastSeq);
    broadcastSeq = log.lastSeq();
    const json = JSON.stringify(buildSync(events));
    for (const send of clients) send(json);
  }

  function buildHistory(): HistoryMessage {
    return {
      type: 'history',
      serverTime: clock(),
      droppedBefore: log.droppedBefore(),
      events: log.history(),
    };
  }

  function buildSync(events: GameEvent[] = []): SyncMessage {
    return { type: 'sync', serverTime: clock(), events, ...session.presentation() };
  }

  return { start, stop, addClient, removeClient, tick, buildSync, buildHistory };
}

export type RaceBroadcaster = ReturnType<typeof createRaceBroadcaster>;

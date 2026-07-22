import type { ConnectionState } from '../shared/presentation.js';
import type { HerdrUpdate, SourceSnapshot } from './herdr/types.js';
import type { EventLog } from './event-log.js';
import type { RaceSession } from './race-session.js';

export function createSessionHub(session: RaceSession, log: EventLog) {
  function apply(update: HerdrUpdate, now: number): void {
    if (update.kind === 'snapshot') log.applySnapshot(update.snapshot, now);
    session.apply(update, now);
  }

  function applySnapshot(snapshot: SourceSnapshot, now: number): void {
    log.applySnapshot(snapshot, now);
    session.applySnapshot(snapshot, now);
  }

  function applyConnection(state: ConnectionState, now: number): void {
    session.applyConnection(state, now);
  }

  return {
    apply,
    applySnapshot,
    applyConnection,
    advance: session.advance,
    presentation: session.presentation,
    setTimeScale: session.setTimeScale,
  };
}

export type SessionHub = ReturnType<typeof createSessionHub>;

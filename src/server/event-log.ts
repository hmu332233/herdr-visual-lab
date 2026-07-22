import type { GameEvent, GameEventBody } from '../shared/events.js';

export function createEventLog() {
  const events: GameEvent[] = [];
  let nextSeq = 1;

  function append(at: number, bodies: readonly GameEventBody[]): GameEvent[] {
    const appended = bodies.map(body => ({ seq: nextSeq++, at, ...body } as GameEvent));
    events.push(...appended);
    return structuredClone(appended);
  }

  const history = (): GameEvent[] => structuredClone(events);
  const eventsSince = (seq: number): GameEvent[] =>
    structuredClone(events.filter(event => event.seq > seq));
  const lastSeq = (): number => nextSeq - 1;
  return { append, history, eventsSince, lastSeq };
}

export type EventLog = ReturnType<typeof createEventLog>;

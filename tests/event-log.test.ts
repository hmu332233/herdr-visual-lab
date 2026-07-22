import { describe, expect, it } from 'vitest';
import { createEventLog } from '../src/server/event-log.js';
import { agent, snap, team } from './helpers/session.js';

describe('EventLog', () => {
  it('diffs joins, status changes, departures, and returns', () => {
    const log = createEventLog();
    const first = log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'working')])), 5);
    expect(first.map(event => event.kind)).toEqual(['team-joined', 'unit-joined']);
    expect(log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'blocked')])), 6)).toEqual([
      { seq: 3, at: 6, kind: 'status-changed', unitID: 't1', from: 'working', to: 'blocked' },
    ]);
    expect(log.applySnapshot(snap(team('ws-1', 'alpha', [])), 7)).toEqual([
      { seq: 4, at: 7, kind: 'unit-departed', unitID: 't1' },
    ]);
    expect(log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'idle')])), 8)[0]).toMatchObject({
      seq: 5, kind: 'unit-joined', unit: { id: 't1', status: 'idle' },
    });
  });

  it('does not emit for repeated snapshots and detects replaced session references', () => {
    const log = createEventLog();
    const snapshot = (reference: string | null) => snap(team('ws-1', 'alpha', [
      agent('t1', 'working', { agentSessionReference: reference }),
    ]));
    log.applySnapshot(snapshot(null), 0);
    expect(log.applySnapshot(snapshot(null), 1)).toEqual([]);
    expect(log.applySnapshot(snapshot('s1'), 2)).toEqual([]);
    expect(log.applySnapshot(snapshot('s2'), 3)).toEqual([
      { seq: 3, at: 3, kind: 'stint-started', unitID: 't1' },
    ]);
  });

  it('serves bounded history and seq deltas', () => {
    const log = createEventLog(3);
    log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'working')])), 0);
    log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'blocked')])), 1);
    log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'working')])), 2);
    expect(log.history().map(event => event.seq)).toEqual([2, 3, 4]);
    expect(log.eventsSince(2).map(event => event.seq)).toEqual([3, 4]);
    expect(log.lastSeq()).toBe(4);
    expect(log.droppedBefore()).toBe(2);
  });
});

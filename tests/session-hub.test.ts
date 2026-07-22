import { describe, expect, it } from 'vitest';
import { createRaceSession } from '../src/server/race-session.js';
import { createEventLog } from '../src/server/event-log.js';
import { createSessionHub } from '../src/server/session-hub.js';
import { loadFixture } from '../src/server/fixtures.js';
import { agent, snap, team } from './helpers/session.js';

describe('SessionHub', () => {
  it('feeds snapshot and live update paths into the event log', () => {
    const session = createRaceSession(() => 1);
    const log = createEventLog();
    const hub = createSessionHub(session, log);
    hub.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'working')])), 0);
    hub.apply({ kind: 'snapshot', snapshot: snap(team('ws-1', 'alpha', [agent('t1', 'blocked')])) }, 1);
    hub.apply({ kind: 'connection', state: { kind: 'live' } }, 1);
    expect(log.history().map(event => event.kind)).toEqual(['team-joined', 'unit-joined', 'status-changed']);
    expect(hub.presentation().connection.kind).toBe('live');
  });

  it('is accepted by fixtures', () => {
    const session = createRaceSession(() => 1);
    const log = createEventLog();
    loadFixture('grid', createSessionHub(session, log));
    expect(log.history().filter(event => event.kind === 'team-joined')).toHaveLength(4);
  });
});

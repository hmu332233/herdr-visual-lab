import { describe, expect, it } from 'vitest';
import { createRaceBroadcaster } from '../src/server/broadcaster.js';
import { createRaceSession } from '../src/server/race-session.js';
import { createEventLog } from '../src/server/event-log.js';
import { createSessionHub } from '../src/server/session-hub.js';
import type { HistoryMessage, ServerMessage, SyncMessage } from '../src/shared/protocol.js';
import { agent, goLive, snap, team } from './helpers/session.js';

function makeRig(status: 'working' | 'idle' = 'working') {
  const session = createRaceSession(() => 1);
  const log = createEventLog();
  const hub = createSessionHub(session, log);
  goLive(hub, snap(team('ws-1', 'alpha', [agent('t1', status)])));
  let now = 0;
  const clock = () => now;
  const setNow = (value: number) => { now = value; };
  const broadcaster = createRaceBroadcaster(session, clock, log);
  const sent: ServerMessage[] = [];
  broadcaster.addClient(json => sent.push(JSON.parse(json)));
  return { broadcaster, sent, setNow, hub };
}

describe('RaceBroadcaster', () => {
  it('sends history then a full sync when a client connects', () => {
    const { sent } = makeRig();
    expect(sent.map(message => message.type)).toEqual(['history', 'sync']);
    expect((sent[0] as HistoryMessage).events.map(event => event.kind)).toEqual(['team-joined', 'unit-joined']);
    const sync = sent[1] as SyncMessage;
    expect(sync.events).toEqual([]);
    expect(sync.teams[0].entries[0].id).toBe('t1');
  });

  it('broadcasts fresh event deltas once', () => {
    const rig = makeRig();
    rig.hub.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'blocked')])), 0.2);
    rig.setNow(0.25);
    rig.broadcaster.tick();
    expect((rig.sent.at(-1) as SyncMessage).events.some(event => event.kind === 'status-changed')).toBe(true);
    rig.setNow(0.5);
    rig.broadcaster.tick();
    expect((rig.sent.at(-1) as SyncMessage).events).toEqual([]);
  });

  it('keeps serving remaining clients after one is removed', () => {
    const rig = makeRig('idle');
    const extra: ServerMessage[] = [];
    const send = (json: string) => extra.push(JSON.parse(json));
    rig.broadcaster.addClient(send);
    expect(extra.map(message => message.type)).toEqual(['history', 'sync']);
    rig.broadcaster.removeClient(send);
    rig.setNow(0.25);
    rig.broadcaster.tick();
    expect(extra).toHaveLength(2);
    expect(rig.sent).toHaveLength(3);
  });
});

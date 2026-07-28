import { describe, expect, it } from 'vitest';
import { createEventSession } from '../src/server/event-session.js';
import type { SourceSnapshot } from '../src/server/herdr/types.js';

function snapshot(overrides: Partial<{
  focused: boolean;
  tabID: string;
  terminalTitle: string | null;
}> = {}): SourceSnapshot {
  return {
    teams: [{
      id: 'ws', label: 'alpha',
      tabs: [{ id: overrides.tabID ?? 'tab-t1', label: 'tab' }],
      agents: [{
        terminalID: 't1', paneID: 'p', workspaceID: 'ws', tabLabel: 'tab',
        tabID: overrides.tabID ?? 'tab-t1',
        terminalTitle: overrides.terminalTitle ?? null,
        agentKind: 'codex', agentSessionReference: 'a',
        isFocused: overrides.focused ?? false, status: 'working',
      }],
    }],
  };
}

describe('event session', () => {
  it('records neutral facts and advances no tick records', () => {
    const session = createEventSession(undefined, 5);
    session.applySnapshot(snapshot(), 0);
    session.applyConnection({ kind: 'live' }, 0);
    session.advance(0);
    const sequence = session.log.lastSeq();
    session.advance(100);
    expect(session.timelineTime()).toBe(5);
    expect(session.log.lastSeq()).toBe(sequence);
    session.applySnapshot(snapshot({ focused: true }), 100);
    expect(session.log.history()).toContainEqual(
      expect.objectContaining({ kind: 'unit-profile-changed', unitID: 't1' }),
    );
  });

  it('emits one profile fact for metadata changes and none for unchanged metadata', () => {
    const session = createEventSession();
    session.applySnapshot(snapshot(), 0);
    const initialCount = session.log.history().filter(event => event.kind === 'unit-profile-changed').length;
    session.applySnapshot(snapshot({ tabID: 'tab-next', terminalTitle: 'Terminal title' }), 1);
    const changed = session.log.history().filter(event => event.kind === 'unit-profile-changed');
    expect(changed).toHaveLength(initialCount + 1);
    expect(changed.at(-1)).toMatchObject({
      unitID: 't1', profile: { tabID: 'tab-next', terminalTitle: 'Terminal title' },
    });
    session.applySnapshot(snapshot({ tabID: 'tab-next', terminalTitle: 'Terminal title' }), 2);
    expect(session.log.history().filter(event => event.kind === 'unit-profile-changed')).toHaveLength(1);
  });

  it('emits topology for every workspace and tab but keeps team/unit events agent-only', () => {
    const session = createEventSession();
    const source: SourceSnapshot = {
      teams: [
        ...snapshot().teams,
        { id: 'ws-empty', label: 'quiet', tabs: [{ id: 'tab-idle', label: 'scratch' }], agents: [] },
      ],
    };
    session.applySnapshot(source, 0);
    const history = session.log.history();
    expect(history).toContainEqual(expect.objectContaining({
      kind: 'topology-changed',
      teams: [
        { id: 'ws', label: 'alpha', tabs: [{ id: 'tab-t1', label: 'tab' }] },
        { id: 'ws-empty', label: 'quiet', tabs: [{ id: 'tab-idle', label: 'scratch' }] },
      ],
    }));
    const joinedTeams = history.filter(event => event.kind === 'team-joined');
    expect(joinedTeams.map(event => event.team.id)).toEqual(['ws']);
    // An identical snapshot must not repeat the topology fact.
    session.applySnapshot(source, 1);
    expect(session.log.history().filter(event => event.kind === 'topology-changed')).toHaveLength(1);
    // A new empty tab is a topology change.
    const withNewTab = structuredClone(source);
    withNewTab.teams[1].tabs.push({ id: 'tab-new', label: 'fresh' });
    session.applySnapshot(withNewTab, 2);
    expect(session.log.history().filter(event => event.kind === 'topology-changed')).toHaveLength(2);
  });

  it('freezes while offline', () => {
    const session = createEventSession();
    session.applyConnection({ kind: 'live' }, 0);
    session.advance(0);
    session.advance(1);
    session.applyConnection({ kind: 'offline' }, 1);
    session.advance(10);
    expect(session.timelineTime()).toBe(1);
  });
});

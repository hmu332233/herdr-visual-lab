import { describe, expect, it } from 'vitest';
import type { GameEventBody } from '../src/shared/events.js';
import { foldKanban, initialKanbanState, replayKanban } from '../src/web/formats/kanban/fold.js';
import { createKanbanStateOwner } from '../src/web/formats/kanban/index.js';
import { projectKanban } from '../src/web/formats/kanban/view.js';
import { connectionChanged, eventHistory, snapshotApplied, teamJoined, unitJoined } from './helpers/events.js';

function replay(...bodies: GameEventBody[]) {
  return replayKanban(eventHistory(...bodies.map(body => [0, body] as const)));
}

describe('Kanban fold and projection', () => {
  it('always projects the four columns in contract order', () => {
    expect(projectKanban(initialKanbanState()).columns.map(column => column.status))
      .toEqual(['idle', 'working', 'blocked', 'done']);
    expect(projectKanban(initialKanbanState()).columns.every(column => column.cards.length === 0)).toBe(true);
  });

  it('places units, moves status, and updates counts', () => {
    const state = replay(
      teamJoined('a', 'Alpha'),
      unitJoined('idle', 'a', 'idle'),
      unitJoined('working', 'a', 'working'),
      unitJoined('blocked', 'a', 'blocked'),
      unitJoined('done', 'a', 'done'),
      { kind: 'status-changed', unitID: 'working', from: 'working', to: 'done' },
    );
    const view = projectKanban(state);
    expect(view.totalAgents).toBe(4);
    expect(view.columns.map(column => column.cards.map(card => card.id)))
      .toEqual([['idle'], [], ['blocked'], ['done', 'working']]);
  });

  it('updates card metadata without changing status and removes departed units', () => {
    const state = replay(
      teamJoined('a', 'Alpha'),
      unitJoined('unit', 'a', 'working'),
      {
        kind: 'unit-profile-changed',
        unitID: 'unit',
        profile: {
          teamID: 'b', tabLabel: 'renamed', tabID: 'raw-tab', terminalTitle: 'Build terminal',
          agentKind: 'claude', isFocused: true,
        },
      },
      teamJoined('b', 'Beta'),
      { kind: 'team-updated', teamID: 'b', label: 'Beta Project' },
    );
    expect(projectKanban(state).columns[1].cards[0]).toEqual({
      id: 'unit', workspaceLabel: 'Beta Project', tabLabel: 'renamed', tabID: 'raw-tab',
      terminalTitle: 'Build terminal', agentKind: 'claude', status: 'working', isFocused: true,
    });
    foldKanban(state, { seq: 99, at: 0, kind: 'unit-departed', unitID: 'unit' });
    expect(projectKanban(state).totalAgents).toBe(0);
  });

  it('preserves cards through connection changes and sorts by source order', () => {
    const state = replay(
      teamJoined('late', 'Late', 1, 0),
      teamJoined('early', 'Early', 0, 0),
      unitJoined('z', 'late', 'working', 1, 0),
      unitJoined('a', 'early', 'working', 0, 0),
      snapshotApplied(),
      connectionChanged({ kind: 'offline' }),
    );
    const view = projectKanban(state);
    expect(view.connection).toEqual({ kind: 'offline' });
    expect(view.columns[1].cards.map(card => card.id)).toEqual(['a', 'z']);
  });

  it('replays deterministically into an equivalent view', () => {
    const events = eventHistory(
      [0, teamJoined()],
      [0, unitJoined('a')],
      [1, { kind: 'status-changed', unitID: 'a', from: 'working', to: 'blocked' }],
      [2, connectionChanged({ kind: 'live' })],
    );
    expect(projectKanban(replayKanban(events))).toEqual(projectKanban(replayKanban(events)));
  });

  it('does not mutate replayable event payloads while folding later changes', () => {
    const events = eventHistory(
      [0, teamJoined('ws', 'Before')],
      [0, unitJoined('unit', 'ws', 'working')],
      [1, { kind: 'team-updated', teamID: 'ws', label: 'After' }],
      [1, { kind: 'status-changed', unitID: 'unit', from: 'working', to: 'done' }],
      [1, {
        kind: 'unit-profile-changed',
        unitID: 'unit',
        profile: {
          teamID: 'ws', tabLabel: 'changed', tabID: 'changed-tab',
          terminalTitle: 'Changed title', agentKind: 'claude', isFocused: true,
        },
      }],
    );
    const untouched = structuredClone(events);
    replayKanban(events);
    expect(events).toEqual(untouched);
  });

  it('drops stale cards when a state owner resets to replacement history', () => {
    const owner = createKanbanStateOwner();
    owner.onEvents(eventHistory([0, teamJoined()], [0, unitJoined('old')]), true);
    expect(owner.view().totalAgents).toBe(1);

    owner.onEvents(eventHistory([0, teamJoined('new', 'New')]), true);
    expect(owner.view().totalAgents).toBe(0);
    expect(owner.view().workspaces.map(workspace => workspace.id)).toEqual(['new']);
  });
});

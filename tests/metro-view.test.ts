import { describe, expect, it } from 'vitest';
import type { GameEventBody } from '../src/shared/events.js';
import type { AgentStatus } from '../src/shared/presentation.js';
import {
  advanceMetroTo,
  initialMetroState,
  replayMetro,
} from '../src/web/formats/metro/fold.js';
import { METRO_ROUTE_TEMPLATES } from '../src/web/formats/metro/routes.js';
import { seededMetroUnitPhase } from '../src/web/formats/metro/rules.js';
import { projectMetro } from '../src/web/formats/metro/view.js';
import {
  connectionChanged,
  eventHistory,
  snapshotApplied,
  teamJoined,
  unitJoined,
} from './helpers/events.js';

function unit(
  id: string,
  teamID: string,
  status: AgentStatus,
  stableOrder: number,
  isFocused = false,
): GameEventBody {
  return {
    kind: 'unit-joined',
    unit: {
      id,
      teamID,
      tabLabel: id,
      tabID: `tab-${id}`,
      terminalTitle: null,
      agentKind: 'codex',
      status,
      isFocused,
      sourceOrder: stableOrder,
      stableOrder,
    },
  };
}

function statusChanged(
  unitID: string,
  from: AgentStatus,
  to: AgentStatus,
): GameEventBody {
  return { kind: 'status-changed', unitID, from, to };
}

function replay(...bodies: GameEventBody[]) {
  return replayMetro(eventHistory(
    ...bodies.map(body => [0, body] as const),
  ));
}

describe('Metro view', () => {
  it('preserves route progress for a working signal hold and uses maintenance for an idle hold', () => {
    const working = replayMetro(eventHistory(
      [0, teamJoined()],
      [0, unitJoined('train')],
      [0, snapshotApplied()],
      [0, connectionChanged({ kind: 'live' })],
    ));
    advanceMetroTo(working, 9);
    const runningPlacement = projectMetro(working).lines[0].trains[0].placement;

    const blockedWorking = replayMetro(eventHistory(
      [0, teamJoined()],
      [0, unitJoined('train')],
      [0, snapshotApplied()],
      [0, connectionChanged({ kind: 'live' })],
      [9, statusChanged('train', 'working', 'blocked')],
    ));
    const blockedPlacement =
      projectMetro(blockedWorking).lines[0].trains[0].placement;

    expect(runningPlacement.kind).toBe('route');
    expect(blockedPlacement.kind).toBe('blocked-route');
    if (runningPlacement.kind === 'route' &&
        blockedPlacement.kind === 'blocked-route') {
      expect(blockedPlacement.progress).toBe(runningPlacement.progress);
    }

    const idleBlocked = replay(
      teamJoined(),
      unit('idle-train', 'ws', 'idle', 3),
      snapshotApplied(),
      connectionChanged({ kind: 'live' }),
      statusChanged('idle-train', 'idle', 'blocked'),
    );
    expect(projectMetro(idleBlocked).lines[0].trains[0].placement).toEqual({
      kind: 'maintenance',
      slot: 3,
    });
  });

  it('places done trains at the nearest station by actual route distance', () => {
    const state = replay(
      teamJoined(),
      unit('done-train', 'ws', 'done', 0),
      snapshotApplied(),
      connectionChanged({ kind: 'live' }),
    );
    const route = METRO_ROUTE_TEMPLATES[0];
    const station = route.points.length - 2;
    let stationDistance = 0;
    for (let index = 1; index <= station; index += 1) {
      const previous = route.points[index - 1];
      const current = route.points[index];
      stationDistance += Math.hypot(current.x - previous.x, current.y - previous.y);
    }
    const train = state.trains.get('done-train')!;
    train.displayDistance =
      stationDistance / route.length - seededMetroUnitPhase(train.id);

    expect(projectMetro(state).lines[0].trains[0].placement).toEqual({
      kind: 'terminus',
      station,
    });
  });

  it('keeps a done train at a terminus when it becomes blocked', () => {
    const state = replay(
      teamJoined(),
      unit('done-train', 'ws', 'done', 0),
      snapshotApplied(),
      connectionChanged({ kind: 'live' }),
      statusChanged('done-train', 'done', 'blocked'),
    );

    expect(projectMetro(state).lines[0].trains[0].placement.kind)
      .toBe('terminus');
  });

  it('keeps lines stable and orders focused, blocked, working, done, then idle trains', () => {
    const state = replay(
      teamJoined('late', 'Late Line', 0, 8),
      teamJoined('early', 'Early Line', 1, 2),
      unit('idle-focused', 'late', 'idle', 0, true),
      unit('idle', 'late', 'idle', 1),
      unit('done', 'late', 'done', 2),
      unit('working', 'late', 'working', 3),
      unit('blocked', 'late', 'blocked', 4),
      snapshotApplied(),
      connectionChanged({ kind: 'live' }),
    );

    const view = projectMetro(state);

    expect(view.lines.map(line => line.id)).toEqual(['early', 'late']);
    expect(view.lines[1].trains.map(train => train.id)).toEqual([
      'idle-focused',
      'blocked',
      'working',
      'done',
      'idle',
    ]);
    expect(view.focusedTrainID).toBe('idle-focused');
    expect(view.lines[1]).toMatchObject({
      workingCount: 1,
      totalTrains: 5,
      hasBlocked: true,
    });
  });

  it('projects connecting, frozen, suspended, no-unit, and clear overlays', () => {
    expect(projectMetro(initialMetroState()).overlay).toEqual({
      kind: 'connecting',
    });
    expect(projectMetro(replay(snapshotApplied())).overlay).toEqual({
      kind: 'frozen',
    });
    expect(projectMetro(replay(
      snapshotApplied(),
      connectionChanged({ kind: 'protocolError', detail: 'bad frame' }),
    )).overlay).toEqual({
      kind: 'suspended',
      detail: 'bad frame',
    });
    expect(projectMetro(replay(
      snapshotApplied(),
      connectionChanged({ kind: 'live' }),
    )).overlay).toEqual({
      kind: 'noUnits',
    });
    expect(projectMetro(replay(
      teamJoined(),
      snapshotApplied(),
      connectionChanged({ kind: 'live' }),
    )).overlay).toEqual({
      kind: 'none',
    });
    expect(projectMetro(replay(
      teamJoined(),
      unit('idle', 'ws', 'idle', 0),
      snapshotApplied(),
      connectionChanged({ kind: 'live' }),
    )).overlay).toEqual({
      kind: 'none',
    });
  });
});

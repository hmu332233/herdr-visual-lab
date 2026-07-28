import { describe, expect, it } from 'vitest';
import {
  foldFoundry,
  initialFoundry,
  projectFoundry,
  projectSpaceport,
  workerProductiveBetween,
} from '../src/web/formats/foundry/fold.js';
import type { GameEvent, GameEventBody } from '../src/shared/events.js';

function fold(...items: Array<{ at: number; body: GameEventBody }>) {
  return items.map((item, index): GameEvent => ({ seq: index + 1, at: item.at, ...item.body }))
    .reduce(foldFoundry, initialFoundry());
}

const team: GameEventBody = {
  kind: 'team-joined',
  team: { id: 'a', label: 'alpha', sourceOrder: 0, stableOrder: 0 },
};
const unit: GameEventBody = {
  kind: 'unit-joined',
  unit: {
    id: 'u',
    teamID: 'a',
    tabLabel: 'core',
    tabID: 'tab-u',
    terminalTitle: null,
    agentKind: 'codex',
    status: 'working',
    isFocused: false,
    sourceOrder: 0,
    stableOrder: 0,
  },
};

describe('Tiny Spaceport event fold', () => {
  it('moves live workers through a delivery route without new events', () => {
    const state = fold({ at: 0, body: team }, { at: 0, body: unit });
    expect(projectFoundry(state, 5)[0]).toMatchObject({
      missionOutput: 5,
      deliveries: 0,
      cargoProgress: 5 / 6,
    });
    expect(projectFoundry(state, 10)[0]).toMatchObject({
      missionOutput: 10,
      deliveries: 1,
      cargoProgress: 4 / 6,
    });
  });

  it('turns repair and completion events into visible cargo contributions', () => {
    const state = fold(
      { at: 0, body: team },
      { at: 0, body: unit },
      {
        at: 5,
        body: { kind: 'status-changed', unitID: 'u', from: 'working', to: 'blocked' },
      },
      {
        at: 9,
        body: { kind: 'status-changed', unitID: 'u', from: 'blocked', to: 'working' },
      },
    );
    expect(projectFoundry(state, 9)[0]).toMatchObject({
      repairs: 1,
      missionOutput: 11,
      deliveries: 1,
    });
    expect(projectFoundry(state, 14)[0]).toMatchObject({
      missionOutput: 16,
      deliveries: 2,
    });
  });

  it('loads for sixty seconds, then launches before the next mission', () => {
    const state = fold({ at: 0, body: team }, { at: 0, body: unit });
    const launch = projectSpaceport(state, projectFoundry(state, 65), 65);
    expect(launch).toMatchObject({
      missionNumber: 1,
      phase: 'LAUNCHING',
      timeLeft: 0,
      output: 60,
      quota: 36,
      launchReady: true,
    });
    expect(launch.launchProgress).toBeCloseTo(1 / 3);

    const next = projectSpaceport(state, projectFoundry(state, 90), 90);
    expect(next).toMatchObject({
      missionNumber: 2,
      phase: 'LOADING',
      output: 15,
      successfulLaunches: 1,
      streak: 1,
    });
    expect(next.mission.destination).toBe('MOSS GARDEN');
  });

  it('counts only productive time inside each mission loading window', () => {
    const state = fold(
      { at: 0, body: team },
      { at: 0, body: unit },
      {
        at: 20,
        body: { kind: 'status-changed', unitID: 'u', from: 'working', to: 'idle' },
      },
      {
        at: 70,
        body: { kind: 'status-changed', unitID: 'u', from: 'idle', to: 'working' },
      },
    );
    const worker = state.workers.get('u')!;
    expect(workerProductiveBetween(worker, 0, 60)).toBe(20);
    expect(workerProductiveBetween(worker, 75, 80)).toBe(5);
    expect(projectSpaceport(state, projectFoundry(state, 80), 80)).toMatchObject({
      missionNumber: 2,
      output: 5,
      successfulLaunches: 0,
      streak: 0,
    });
  });

  it('turns blocked couriers into a visible dock jam', () => {
    const state = fold(
      { at: 0, body: team },
      { at: 0, body: unit },
      {
        at: 8,
        body: { kind: 'status-changed', unitID: 'u', from: 'working', to: 'blocked' },
      },
    );
    expect(projectSpaceport(state, projectFoundry(state, 10), 10)).toMatchObject({
      hazards: 1,
      phase: 'JAMMED',
      output: 8,
    });
  });

  it('projects courier identity, focus, cargo, and route state', () => {
    const state = fold(
      { at: 0, body: team },
      { at: 0, body: unit },
      {
        at: 3,
        body: {
          kind: 'unit-profile-changed',
          unitID: 'u',
          profile: {
            teamID: 'a',
            tabLabel: 'spaceport-ui',
            tabID: 'tab-u',
            terminalTitle: null,
            agentKind: 'codex',
            isFocused: true,
          },
        },
      },
    );
    expect(projectFoundry(state, 5)[0].workers[0]).toMatchObject({
      id: 'u',
      label: 'spaceport-ui',
      status: 'working',
      isFocused: true,
      missionContribution: 5,
      routeProgress: 5 / 6,
    });
  });
});

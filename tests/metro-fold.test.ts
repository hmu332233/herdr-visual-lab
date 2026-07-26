import { describe, expect, it } from 'vitest';
import type { GameEvent, GameEventBody } from '../src/shared/events.js';
import type { AgentStatus } from '../src/shared/presentation.js';
import {
  advanceMetroTo,
  foldMetro,
  replayMetro,
  type MetroState,
} from '../src/web/formats/metro/fold.js';
import {
  MetroRules,
  seededMetroSpeed,
} from '../src/web/formats/metro/rules.js';
import {
  METRO_DEPOTS,
  METRO_ROUTE_TEMPLATES,
  METRO_STATION_BY_ID,
  sampleRoute,
} from '../src/web/formats/metro/routes.js';
import { projectMetro } from '../src/web/formats/metro/view.js';
import {
  connectionChanged,
  eventHistory,
  snapshotApplied,
  teamJoined,
  unitJoined,
} from './helpers/events.js';

function statusChanged(
  unitID: string,
  from: AgentStatus,
  to: AgentStatus,
): GameEventBody {
  return { kind: 'status-changed', unitID, from, to };
}

function foldAt(state: MetroState, at: number, body: GameEventBody): MetroState {
  return foldMetro(state, { seq: 10_000, at, ...body } as GameEvent);
}

function liveService(unitID = 'working'): MetroState {
  return replayMetro(eventHistory(
    [0, teamJoined()],
    [0, unitJoined(unitID)],
    [0, snapshotApplied()],
    [0, connectionChanged({ kind: 'live' })],
  ));
}

describe('Metro fold', () => {
  it('advances official distance for working trains only', () => {
    const state = replayMetro(eventHistory(
      [0, teamJoined()],
      [0, unitJoined('working', 'ws', 'working', 0, 0)],
      [0, unitJoined('idle', 'ws', 'idle', 1, 1)],
      [0, unitJoined('done', 'ws', 'done', 2, 2)],
      [0, snapshotApplied()],
      [0, connectionChanged({ kind: 'live' })],
    ));

    advanceMetroTo(state, 18);

    expect(state.trains.get('working')?.officialDistance).toBeCloseTo(
      seededMetroSpeed(1, 'working'),
      12,
    );
    expect(state.trains.get('idle')?.officialDistance).toBe(0);
    expect(state.trains.get('done')?.officialDistance).toBe(0);
  });

  it('freezes the exact route distance when working becomes blocked', () => {
    const state = liveService();
    advanceMetroTo(state, 12.5);
    const train = state.trains.get('working')!;
    const stoppedAt = train.officialDistance;
    const displayStoppedAt = train.displayDistance;

    foldAt(state, 12.5, statusChanged('working', 'working', 'blocked'));
    advanceMetroTo(state, 60);

    expect(train.previousStatus).toBe('working');
    expect(train.blockedAtDepot).toBe(false);
    expect(train.officialDistance).toBe(stoppedAt);
    expect(train.displayDistance).toBe(displayStoppedAt);
  });

  it('dispatches new and returning service trains beside their depot entry station', () => {
    const state = liveService();
    const line = state.lines.get('ws')!;
    const route = METRO_ROUTE_TEMPLATES[line.routeTemplate];
    const depot = METRO_DEPOTS.find(candidate => candidate.id === route.depotID)!;
    const entry = METRO_STATION_BY_ID.get(depot.entryStationID)!;
    const distanceFromEntry = () => {
      const placement = projectMetro(state).lines[0].trains[0].placement;
      expect(placement.kind).toBe('route');
      if (placement.kind !== 'route') return Number.POSITIVE_INFINITY;
      const point = sampleRoute(route, placement.progress);
      return Math.hypot(point.x - entry.x, point.y - entry.y);
    };

    expect(distanceFromEntry()).toBeLessThan(35);

    advanceMetroTo(state, 5);
    foldAt(state, 5, statusChanged('working', 'working', 'idle'));
    foldAt(state, 25, statusChanged('working', 'idle', 'working'));

    expect(distanceFromEntry()).toBeLessThan(35);
  });

  it('freezes offline and resumes the same service night after reconnecting', () => {
    const state = liveService();
    advanceMetroTo(state, 10);
    foldAt(state, 10, connectionChanged({ kind: 'offline' }));
    const train = state.trains.get('working')!;
    const beforeOffline = train.officialDistance;

    advanceMetroTo(state, 50);

    expect(state.serviceNight).toBe(1);
    expect(state.activeServiceTime).toBe(10);
    expect(train.officialDistance).toBe(beforeOffline);

    foldAt(state, 50, connectionChanged({ kind: 'live' }));
    advanceMetroTo(state, 55);

    expect(state.serviceNight).toBe(1);
    expect(state.activeServiceTime).toBe(15);
    expect(train.officialDistance - beforeOffline).toBeCloseTo(
      5 * MetroRules.baseServiceSpeed * seededMetroSpeed(1, 'working'),
      12,
    );
  });

  it('pauses the active-service clock throughout quiet hours', () => {
    const state = liveService();
    advanceMetroTo(state, 10);
    foldAt(state, 10, statusChanged('working', 'working', 'idle'));

    advanceMetroTo(state, 100);

    expect(state.phase).toBe('quiet');
    expect(state.activeServiceTime).toBe(10);
    expect(state.serviceNight).toBe(1);

    foldAt(state, 100, statusChanged('working', 'idle', 'working'));
    advanceMetroTo(state, 105);

    expect(state.phase).toBe('service');
    expect(state.activeServiceTime).toBe(15);
  });

  it('retains a departing train until its two-second display transition completes', () => {
    const state = replayMetro(eventHistory(
      [0, teamJoined()],
      [0, unitJoined('departing')],
      [0, unitJoined('survivor', 'ws', 'working', 1, 1)],
      [0, snapshotApplied()],
      [0, connectionChanged({ kind: 'live' })],
    ));
    advanceMetroTo(state, 10);
    foldAt(state, 10, { kind: 'unit-departed', unitID: 'departing' });

    advanceMetroTo(state, 10 + MetroRules.departureDisplayDuration - 0.001);

    expect(state.trains.has('departing')).toBe(true);
    expect(projectMetro(state).lines[0].trains
      .find(train => train.id === 'departing')?.placement.kind).toBe('departing');

    advanceMetroTo(state, 10 + MetroRules.departureDisplayDuration);

    expect(state.trains.has('departing')).toBe(false);
  });

  it('expires a departing train after two seconds during quiet hours', () => {
    const state = liveService('departing');
    advanceMetroTo(state, 10);
    foldAt(state, 10, { kind: 'unit-departed', unitID: 'departing' });

    expect(state.phase).toBe('quiet');
    advanceMetroTo(state, 10 + MetroRules.departureDisplayDuration - 0.001);
    expect(state.trains.has('departing')).toBe(true);

    advanceMetroTo(state, 10 + MetroRules.departureDisplayDuration);
    expect(state.phase).toBe('quiet');
    expect(state.trains.has('departing')).toBe(false);
    expect(projectMetro(state).lines).toHaveLength(1);
    expect(projectMetro(state).lines[0].trains).toEqual([]);
  });

  it.each([100, 105, 110])(
    'allocates unique train numbers for %i agents without throwing',
    count => {
      const joins: Array<readonly [number, GameEventBody]> = Array.from(
        { length: count },
        (_, index) => [
          0,
          unitJoined(`train-${index}`, 'ws', 'working', index, index),
        ],
      );
      const state = replayMetro(eventHistory(
        [0, teamJoined()],
        ...joins,
        [0, snapshotApplied()],
        [0, connectionChanged({ kind: 'live' })],
      ));
      const numbers = [...state.trains.values()].map(train => train.number);

      expect(numbers).toHaveLength(count);
      expect(new Set(numbers).size).toBe(count);
      expect(numbers.some(number =>
        number > MetroRules.preferredTrainNumberCount)).toBe(true);
      expect(Math.max(...numbers)).toBeLessThanOrEqual(
        MetroRules.maximumTrainNumber,
      );
    },
  );

  it('is partition independent across service, dawn, and next-night boundaries', () => {
    const direct = liveService();
    const partitioned = liveService();
    const target = MetroRules.serviceDuration + MetroRules.dawnDuration + 12;

    advanceMetroTo(direct, target);
    for (let at = 0.37; at < target; at += 0.37) {
      advanceMetroTo(partitioned, at);
    }
    advanceMetroTo(partitioned, target);

    expect(direct.serviceNight).toBe(2);
    expect(direct.phase).toBe('service');
    expect(direct.activeServiceTime).toBe(12);
    expect(projectMetro(partitioned)).toEqual(projectMetro(direct));
  });
});

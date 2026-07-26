import { describe, expect, it } from 'vitest';
import {
  METRO_CITY_HEIGHT,
  METRO_CITY_WIDTH,
  METRO_DEPOTS,
  METRO_EDGES,
  METRO_ROUTE_TEMPLATES,
  METRO_STATIONS,
  lineStyleForStableOrder,
  routeProgressAtStation,
  routeForStableOrder,
  sampleRoute,
} from '../src/web/formats/metro/routes.js';

describe('metro city graph', () => {
  it('defines the fixed 960 × 540 network with the promised landmarks', () => {
    expect([METRO_CITY_WIDTH, METRO_CITY_HEIGHT]).toEqual([960, 540]);
    expect(METRO_STATIONS).toHaveLength(16);
    expect(METRO_EDGES).toHaveLength(24);
    expect(METRO_DEPOTS).toHaveLength(4);

    const interchanges = METRO_STATIONS.filter(station => station.kind === 'interchange');
    expect(interchanges).toHaveLength(4);
    expect(interchanges.filter(station => station.interchange === 'central')).toHaveLength(1);
    expect(interchanges.filter(station => station.interchange === 'secondary')).toHaveLength(3);
    expect(new Set(METRO_DEPOTS.map(depot => depot.edge))).toEqual(
      new Set(['north', 'east', 'south', 'west']),
    );
  });

  it('provides twelve open templates made only from graph edges', () => {
    expect(METRO_ROUTE_TEMPLATES).toHaveLength(12);
    const edges = new Set(
      METRO_EDGES.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]),
    );

    for (const route of METRO_ROUTE_TEMPLATES) {
      expect(route.stationIDs.length).toBeGreaterThanOrEqual(3);
      expect(route.points).toHaveLength(route.stationIDs.length);
      expect(route.length).toBeGreaterThan(0);
      const depot = METRO_DEPOTS.find(candidate => candidate.id === route.depotID)!;
      expect(route.stationIDs).toContain(depot.entryStationID);
      const entry = METRO_STATIONS.find(
        station => station.id === depot.entryStationID,
      )!;
      expect(Math.hypot(entry.x - depot.x, entry.y - depot.y))
        .toBeLessThan(110);
      for (let index = 0; index < route.stationIDs.length - 1; index += 1) {
        const from = route.stationIDs[index];
        const to = route.stationIDs[index + 1];
        expect(edges.has(`${from}|${to}`), `${route.id}: ${from} → ${to}`).toBe(true);
      }

      const start = sampleRoute(route, 0);
      const farTerminus = sampleRoute(route, .5);
      const returned = sampleRoute(route, 1);
      expect(farTerminus.x).toBeCloseTo(route.points.at(-1)!.x, 10);
      expect(farTerminus.y).toBeCloseTo(route.points.at(-1)!.y, 10);
      expect(returned.x).toBeCloseTo(start.x, 10);
      expect(returned.y).toBeCloseTo(start.y, 10);
    }
  });
});

describe('metro route sampling', () => {
  it('returns finite positions and tangents for wrapped and invalid progress', () => {
    const progressValues = [
      -3.75, -1, -0.001, 0, 0.25, 0.999, 1, 8.5,
      Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
    ];
    for (const route of METRO_ROUTE_TEMPLATES) {
      for (const progress of progressValues) {
        const sample = sampleRoute(route, progress);
        expect(Number.isFinite(sample.x)).toBe(true);
        expect(Number.isFinite(sample.y)).toBe(true);
        expect(Number.isFinite(sample.angle)).toBe(true);
      }
    }
  });

  it('wraps equivalent progress to the same arc-length position', () => {
    const route = METRO_ROUTE_TEMPLATES[7];
    const direct = sampleRoute(route, 0.237);
    for (const progress of [1.237, 8.237, -0.763]) {
      const wrapped = sampleRoute(route, progress);
      expect(wrapped.x).toBeCloseTo(direct.x, 9);
      expect(wrapped.y).toBeCloseTo(direct.y, 9);
      expect(wrapped.angle).toBeCloseTo(direct.angle, 9);
    }
  });

  it('returns along the same track without teleporting between termini', () => {
    const route = METRO_ROUTE_TEMPLATES[0];
    const outbound = sampleRoute(route, .2);
    const inbound = sampleRoute(route, .8);
    expect(inbound.x).toBeCloseTo(outbound.x, 9);
    expect(inbound.y).toBeCloseTo(outbound.y, 9);
    expect(Math.abs(Math.atan2(
      Math.sin(inbound.angle - outbound.angle),
      Math.cos(inbound.angle - outbound.angle),
    ))).toBeCloseTo(Math.PI, 9);
  });

  it('maps each depot entry station to the same point in both directions', () => {
    for (const route of METRO_ROUTE_TEMPLATES) {
      const depot = METRO_DEPOTS.find(candidate => candidate.id === route.depotID)!;
      const station = METRO_STATIONS.find(
        candidate => candidate.id === depot.entryStationID,
      )!;
      for (const returning of [false, true]) {
        const sample = sampleRoute(
          route,
          routeProgressAtStation(route, station.id, returning),
        );
        expect(sample.x).toBeCloseTo(station.x, 9);
        expect(sample.y).toBeCloseTo(station.y, 9);
      }
    }
  });

  it('moves proportionally to arc length within a segment', () => {
    const route = METRO_ROUTE_TEMPLATES[0];
    const start = sampleRoute(route, 0);
    const next = sampleRoute(route, 1e-5);
    expect(Math.hypot(next.x - start.x, next.y - start.y)).toBeCloseTo(route.length * 1e-5, 7);
  });
});

describe('metro stable-order mapping', () => {
  it('maps stable order directly and deterministically across template cycles', () => {
    expect(METRO_ROUTE_TEMPLATES.map((_, order) => routeForStableOrder(order).index))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (let order = 0; order < 12; order += 1) {
      expect(routeForStableOrder(order + 12)).toBe(routeForStableOrder(order));
      expect(routeForStableOrder(order + 120)).toBe(routeForStableOrder(order));
    }
    expect(routeForStableOrder(-1)).toBe(METRO_ROUTE_TEMPLATES[11]);
    expect(routeForStableOrder(Number.NaN)).toBe(METRO_ROUTE_TEMPLATES[0]);
  });

  it('adds line patterns after the first twelve color slots', () => {
    expect(lineStyleForStableOrder(0)).toMatchObject({ colorSlot: 0, pattern: 'solid' });
    expect(lineStyleForStableOrder(12)).toMatchObject({ colorSlot: 0, pattern: 'double' });
    expect(lineStyleForStableOrder(24)).toMatchObject({ colorSlot: 0, pattern: 'dashed' });
  });
});

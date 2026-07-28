import { describe, expect, it } from 'vitest';
import type { GameEventBody, TopologyTeam } from '../src/shared/events.js';
import { foldGalaxy, initialGalaxyState, takeEffects, type GalaxyState } from '../src/web/formats/galaxy/fold.js';
import { projectGalaxy, type GalaxyTeamView } from '../src/web/formats/galaxy/view.js';
import {
  advanceOrbits, assignPlanetOrbits, createMotion, focusTarget,
  GEOMETRY, MOON_SPEED, moonStatus, placeGalaxy, ringExtents, slotAngle,
} from '../src/web/formats/galaxy/layout.js';
import { eventHistory, unitJoined } from './helpers/events.js';

const topologyChanged = (teams: TopologyTeam[]): GameEventBody => ({ kind: 'topology-changed', teams });

function foldAll(state: GalaxyState, bodies: GameEventBody[]): void {
  for (const event of eventHistory(...bodies.map(body => [0, body] as const))) foldGalaxy(state, event);
}

function populated(): GalaxyState {
  const state = initialGalaxyState();
  foldAll(state, [
    topologyChanged([
      { id: 'ws', label: 'alpha', tabs: [{ id: 'tab-t1', label: 'core' }, { id: 'tab-empty', label: 'scratch' }] },
      { id: 'ws-quiet', label: 'quiet', tabs: [] },
    ]),
    unitJoined('t1', 'ws', 'working'),
  ]);
  return state;
}

const syntheticTeam = (tabs: Array<{ id: string; statuses: string[] }>): GalaxyTeamView => ({
  id: 'ws', label: 'alpha', heat: 1,
  tabs: tabs.map(tab => ({
    id: tab.id, label: tab.id,
    agents: tab.statuses.map(status => ({ status })),
  })),
}) as unknown as GalaxyTeamView;

describe('galaxy fold', () => {
  it('keeps agent-less workspaces and tabs from the topology', () => {
    const view = projectGalaxy(populated());
    expect(view.teams.map(team => team.id)).toEqual(['ws', 'ws-quiet']);
    expect(view.teams[0].tabs.map(tab => tab.agents.length)).toEqual([1, 0]);
    expect(view.teams[1].tabs).toEqual([]);
    expect(view.counts).toEqual({ working: 1, idle: 0, blocked: 0, done: 0 });
  });

  it('emits one-shot effects for birth, done, blocked, and departure', () => {
    const state = populated();
    takeEffects(state);
    foldAll(state, [
      { kind: 'status-changed', unitID: 't1', from: 'working', to: 'done' },
      { kind: 'status-changed', unitID: 't1', from: 'done', to: 'blocked' },
      { kind: 'status-changed', unitID: 't1', from: 'blocked', to: 'idle' },
      { kind: 'unit-departed', unitID: 't1' },
    ]);
    expect(takeEffects(state).map(effect => effect.kind)).toEqual([
      'done-burst', 'blocked-shockwave', 'unit-departed',
    ]);
    expect(takeEffects(state)).toEqual([]);
  });

  it('synthesizes a node for an agent whose tab is unknown to the topology', () => {
    const state = populated();
    foldAll(state, [unitJoined('t9', 'ws-unknown', 'idle', 1, 1)]);
    const view = projectGalaxy(state);
    const synthetic = view.teams.find(team => team.id === 'ws-unknown')!;
    expect(synthetic.tabs[0].agents.map(agent => agent.id)).toEqual(['t9']);
  });
});

describe('galaxy heat', () => {
  it('scales team heat from lifeless to fully working', () => {
    const state = populated();
    const view = projectGalaxy(state);
    expect(view.teams[0].heat).toBeCloseTo(1); // its only agent is working
    expect(view.teams[1].heat).toBe(0); // no agents at all
    foldAll(state, [{ kind: 'status-changed', unitID: 't1', from: 'working', to: 'idle' }]);
    expect(projectGalaxy(state).teams[0].heat).toBeCloseTo(0.3);
  });
});

describe('moon status', () => {
  it('wears the most urgent agent status and empty when uninhabited', () => {
    expect(moonStatus({ agents: [] } as never)).toBe('empty');
    const tab = syntheticTeam([{ id: 't', statuses: ['idle', 'blocked', 'working'] }]).tabs[0];
    expect(moonStatus(tab)).toBe('blocked');
    expect(focusTarget(tab)?.status).toBe('blocked');
    const calm = syntheticTeam([{ id: 't', statuses: ['done', 'idle'] }]).tabs[0];
    expect(moonStatus(calm)).toBe('done');
  });
});

describe('activity gravity', () => {
  it('pulls working planets inward and pushes empty ones out', () => {
    const view = projectGalaxy(populated());
    // ws has the working agent, ws-quiet is empty → ws gets orbit 0.
    const planets = assignPlanetOrbits(view);
    expect(planets.get('ws')).toBe(0);
    expect(planets.get('ws-quiet')).toBe(1);
  });

  it('puts all of a planet\'s moons on one shared orbit', () => {
    const view = projectGalaxy(populated());
    const motion = createMotion();
    advanceOrbits(motion, view, 0);
    const layout = placeGalaxy(view, motion, 800, 600);
    const [moonA, moonB] = layout.moons;
    expect(moonA.orbit.rx).toBeCloseTo(moonB.orbit.rx, 6);
    expect(moonA.orbit.cx).toBeCloseTo(moonB.orbit.cx, 6);
    // ...spread apart by their slot angles rather than by radius.
    expect(moonA.orbit.angle).not.toBeCloseTo(moonB.orbit.angle, 3);
  });
});

describe('solar orbits', () => {
  it('freezes blocked moons and races working ones', () => {
    const seconds = 10;
    const angleAfter = (status: 'working' | 'idle' | 'blocked' | 'done'): number => {
      const state = initialGalaxyState();
      foldAll(state, [
        topologyChanged([{ id: 'ws', label: 'alpha', tabs: [{ id: 'tab-t1', label: 'core' }] }]),
        unitJoined('t1', 'ws', status),
      ]);
      const view = projectGalaxy(state);
      const motion = createMotion();
      advanceOrbits(motion, view, 0);
      const start = motion.get('tab:tab-t1')!;
      advanceOrbits(motion, view, seconds);
      return motion.get('tab:tab-t1')! - start;
    };
    expect(angleAfter('blocked')).toBe(0);
    expect(angleAfter('working')).toBeCloseTo(MOON_SPEED.working * seconds);
    expect(angleAfter('working')).toBeGreaterThan(angleAfter('idle'));
    expect(angleAfter('idle')).toBeGreaterThan(angleAfter('done'));
  });

  it('seeds siblings at deterministic slots and prunes departed nodes', () => {
    const state = populated();
    const motion = createMotion();
    advanceOrbits(motion, projectGalaxy(state), 0);
    expect(motion.get('tab:tab-t1')).toBe(slotAngle(0, 2));
    expect(motion.get('tab:tab-empty')).toBe(slotAngle(1, 2));
    expect(motion.has('team:ws')).toBe(true);
    foldAll(state, [topologyChanged([{ id: 'ws', label: 'alpha', tabs: [{ id: 'tab-t1', label: 'core' }] }])]);
    advanceOrbits(motion, projectGalaxy(state), 0);
    expect(motion.has('tab:tab-empty')).toBe(false);
  });

  it('gives every planet its own orbital plane around the sun', () => {
    const view = projectGalaxy(populated());
    const motion = createMotion();
    advanceOrbits(motion, view, 0);
    const layout = placeGalaxy(view, motion, 800, 600);
    expect(layout.sun.label).toBe('HERDR');
    expect(layout.planets).toHaveLength(2);
    expect(layout.moons).toHaveLength(2);
    const planetRings = layout.rings.filter(ring => ring.x === layout.sun.x && ring.y === layout.sun.y);
    expect(planetRings).toHaveLength(2);
    const [ringA, ringB] = planetRings;
    expect(ringA.rx).not.toBeCloseTo(ringB.rx, 3); // distinct orbit radii
    expect(ringA.rotation).not.toBeCloseTo(ringB.rotation, 3); // distinct planes
    for (const ring of layout.rings) {
      const squash = ring.ry / ring.rx;
      expect(squash).toBeGreaterThanOrEqual(GEOMETRY.tilt * 0.7 - 1e-9);
      expect(squash).toBeLessThanOrEqual(GEOMETRY.tilt * 1.3 + 1e-9);
    }
  });

  it('marks agent-carrying planet orbits primary and empty ones faint', () => {
    const view = projectGalaxy(populated());
    const motion = createMotion();
    advanceOrbits(motion, view, 0);
    const layout = placeGalaxy(view, motion, 800, 600);
    const sunRings = layout.rings.filter(ring => ring.x === layout.sun.x && ring.y === layout.sun.y);
    const byTeam = new Map(sunRings.map(ring => [ring.teamID, ring.emphasis]));
    expect(byTeam.get('ws')).toBe('primary');
    expect(byTeam.get('ws-quiet')).toBe('faint');
  });

  it('scales bodies with orbital depth', () => {
    const view = projectGalaxy(populated());
    const motion = createMotion();
    motion.set('team:ws', Math.PI / 2);
    const near = placeGalaxy(view, motion, 800, 600).planets.find(planet => planet.teamID === 'ws')!;
    motion.set('team:ws', -Math.PI / 2);
    const far = placeGalaxy(view, motion, 800, 600).planets.find(planet => planet.teamID === 'ws')!;
    expect(near.depth).toBeCloseTo(1, 6);
    expect(far.depth).toBeCloseTo(-1, 6);
    expect(near.radius).toBeGreaterThan(far.radius);
  });

  it('rides moons on their rotated tilted orbit and centers the content box', () => {
    const view = projectGalaxy(populated());
    const motion = createMotion();
    advanceOrbits(motion, view, 0);
    const layout = placeGalaxy(view, motion, 800, 600);
    const moon = layout.moons[0];
    const { cx, cy, rx, ry, rotation, angle } = moon.orbit;
    const lx = Math.cos(angle) * rx;
    const ly = Math.sin(angle) * ry;
    expect(moon.x).toBeCloseTo(cx + lx * Math.cos(rotation) - ly * Math.sin(rotation), 6);
    expect(moon.y).toBeCloseTo(cy + lx * Math.sin(rotation) + ly * Math.cos(rotation), 6);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const cover = (x: number, y: number, ex: number, ey: number): void => {
      minX = Math.min(minX, x - ex); maxX = Math.max(maxX, x + ex);
      minY = Math.min(minY, y - ey); maxY = Math.max(maxY, y + ey);
    };
    cover(layout.sun.x, layout.sun.y, layout.sun.radius, layout.sun.radius);
    for (const node of [...layout.planets, ...layout.moons]) cover(node.x, node.y, node.radius, node.radius);
    for (const ring of layout.rings) {
      const { ex, ey } = ringExtents(ring);
      cover(ring.x, ring.y, ex, ey);
    }
    expect((minX + maxX) / 2).toBeCloseTo(400, 6);
    expect((minY + maxY) / 2).toBeCloseTo(300, 6);
    for (const node of [...layout.planets, ...layout.moons]) {
      expect(node.x).toBeGreaterThan(0);
      expect(node.x).toBeLessThan(800);
      expect(node.y).toBeGreaterThan(0);
      expect(node.y).toBeLessThan(600);
    }
  });
});

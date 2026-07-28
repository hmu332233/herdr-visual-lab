import type { AgentStatus } from '../../../shared/presentation.js';
import type { EventUnit } from '../../../shared/events.js';
import { stableHash } from '../../../shared/deterministic.js';
import type { GalaxyTabView, GalaxyTeamView, GalaxyView } from './view.js';

const TAU = Math.PI * 2;

/**
 * Solar model: the Herdr session is the sun, every workspace is a planet on
 * its own orbit, and every tab is a moon around its planet. A moon wears the
 * status of the agents inside its tab.
 */
export type MoonStatus = AgentStatus | 'empty';

/** The tab's visible status: the most urgent agent wins; no agents → empty. */
export function moonStatus(tab: Pick<GalaxyTabView, 'agents'>): MoonStatus {
  const order: readonly AgentStatus[] = ['blocked', 'working', 'done', 'idle'];
  for (const status of order) {
    if (tab.agents.some(agent => agent.status === status)) return status;
  }
  return 'empty';
}

/** The agent a click on this moon should focus: the one setting its status. */
export function focusTarget(tab: Pick<GalaxyTabView, 'agents'>): EventUnit | null {
  const status = moonStatus(tab);
  return tab.agents.find(agent => agent.status === status) ?? null;
}

/** Angular velocities in radians per second. Motion encodes status alongside
 *  color: blocked moons stand still, working ones race. */
export const PLANET_SPEED = TAU / 420;
export const MOON_SPEED: Record<MoonStatus, number> = {
  working: TAU / 18,
  idle: TAU / 110,
  done: TAU / 200,
  blocked: 0,
  empty: TAU / 150,
};

/** Abstract (pre-scale) orbit radii and node sizes. */
export const GEOMETRY = {
  /** Innermost planet orbit, and the gap added per further orbit. */
  planetOrbitBase: 130,
  planetOrbitStep: 60,
  /** All of a planet's moons share this one orbit. */
  moonOrbit: 34,
  sunRadius: 20,
  planetRadius: 7,
  moonRadius: 3.5,
  margin: 48,
  /** Orbits stay close to true circles — just enough squash to feel alive. */
  tilt: 0.94,
  /** How strongly depth (front/back of the orbit) scales a body. */
  depthScale: 0.08,
  /** Never blow tiny sessions up into cartoon scale. */
  maximumScale: 1.7,
} as const;

/** Deterministic slot angle for the `index`-th of `total` siblings. */
export function slotAngle(index: number, total: number): number {
  return TAU * index / Math.max(1, total) - Math.PI / 2;
}

/** Orbit angles keyed by node key (`team:<id>` or `tab:<id>`). */
export type OrbitMotion = Map<string, number>;

export const createMotion = (): OrbitMotion => new Map();

const planetKey = (id: string): string => `team:${id}`;
const moonKey = (id: string): string => `tab:${id}`;

/**
 * Activity gravity: siblings are ranked into orbits so hot work sits close
 * to its parent. Working first, then inhabited, then empty; ties keep
 * authoritative order.
 */
function rankByActivity<T>(items: T[], classOf: (item: T) => number): Map<T, number> {
  const ranked = items.map((item, index) => ({ item, index, class: classOf(item) }))
    .sort((a, b) => a.class - b.class || a.index - b.index);
  return new Map(ranked.map((entry, orbit) => [entry.item, orbit]));
}

export function assignPlanetOrbits(view: GalaxyView): Map<string, number> {
  const ranked = rankByActivity(view.teams, team => {
    const agents = team.tabs.flatMap(tab => tab.agents);
    if (agents.some(agent => agent.status === 'working')) return 0;
    return agents.length > 0 ? 1 : 2;
  });
  return new Map([...ranked].map(([team, orbit]) => [team.id, orbit]));
}

/** Inner orbits run faster, Kepler-style. */
function planetSpeed(orbitIndex: number): number {
  const g = GEOMETRY;
  const radius = g.planetOrbitBase + g.planetOrbitStep * orbitIndex;
  return PLANET_SPEED * Math.sqrt(g.planetOrbitBase / radius);
}

/** Advances every orbit by `dt` seconds. New nodes are seeded at their
 *  deterministic slot angle; departed nodes are pruned. */
export function advanceOrbits(motion: OrbitMotion, view: GalaxyView, dt: number): void {
  const alive = new Set<string>();
  const step = (key: string, index: number, total: number, speed: number): void => {
    alive.add(key);
    const angle = motion.get(key) ?? slotAngle(index, total);
    motion.set(key, angle + speed * dt);
  };
  const planetOrbits = assignPlanetOrbits(view);
  view.teams.forEach((team, teamIndex) => {
    step(planetKey(team.id), teamIndex, view.teams.length, planetSpeed(planetOrbits.get(team.id) ?? teamIndex));
    team.tabs.forEach((tab, tabIndex) => {
      step(moonKey(tab.id), tabIndex, team.tabs.length, MOON_SPEED[moonStatus(tab)]);
    });
  });
  for (const key of [...motion.keys()]) if (!alive.has(key)) motion.delete(key);
}

/** A tilted orbit ellipse (rotated in-plane) in final viewport coordinates. */
export interface OrbitRing {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** In-plane rotation of the ellipse's major axis. */
  rotation: number;
  /** 'primary' rings carry agents; 'faint' rings are empty or decorative. */
  emphasis: 'primary' | 'faint';
  /** The team this ring belongs to (hue tinting); null for none. */
  teamID: string | null;
}

/** Axis-aligned half-extents of a rotated ellipse. */
export function ringExtents(ring: { rx: number; ry: number; rotation: number }): { ex: number; ey: number } {
  const cos = Math.cos(ring.rotation);
  const sin = Math.sin(ring.rotation);
  return {
    ex: Math.hypot(ring.rx * cos, ring.ry * sin),
    ey: Math.hypot(ring.rx * sin, ring.ry * cos),
  };
}

export interface SunNode {
  x: number;
  y: number;
  radius: number;
  label: string;
  /** Overall session activity (0..1): share of working agents. */
  heat: number;
}

export interface PlanetNode {
  key: string;
  teamID: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  /** The team's activity heat (0..1). */
  heat: number;
  /** Painter's order: negative is behind the sun, positive in front. */
  depth: number;
}

export interface MoonNode {
  key: string;
  teamID: string;
  tabID: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  status: MoonStatus;
  agents: EventUnit[];
  depth: number;
  /** The moon's own orbit, for trails and flow paths. */
  orbit: { cx: number; cy: number; rx: number; ry: number; rotation: number; angle: number };
}

export interface GalaxyLayout {
  sun: SunNode;
  planets: PlanetNode[];
  moons: MoonNode[];
  rings: OrbitRing[];
  scale: number;
}

/** Point on a rotated tilted ellipse. */
function onOrbit(
  cx: number, cy: number, rx: number, ry: number, rotation: number, angle: number,
): { x: number; y: number } {
  const lx = Math.cos(angle) * rx;
  const ly = Math.sin(angle) * ry;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos };
}

/** Per-workspace orbital plane, stable by id: near-circular squash with a
 *  slight in-plane rotation so orbits don't read as perfectly identical. */
function orbitPlane(id: string): { tilt: number; rotation: number } {
  const hash = stableHash(id);
  const tilt = Math.min(1, GEOMETRY.tilt * (0.96 + Number(hash % 100n) / 100 * 0.1)); // ~0.90..1
  const rotation = (Number((hash >> 8n) % 180n) / 180 - 0.5) * (Math.PI / 6);
  return { tilt, rotation };
}

/**
 * Places every node for the current angles. The sun sits at the center;
 * every workspace-planet has its own orbit (hot work innermost), with its
 * own tilt and in-plane rotation; tab-moons ride staggered orbits in their
 * planet's plane and scale/dim with orbital depth. The whole system is then
 * uniformly scaled and translated to fill and center the viewport.
 */
export function placeGalaxy(
  view: GalaxyView, motion: OrbitMotion, width: number, height: number,
): GalaxyLayout {
  const g = GEOMETRY;
  const at = (key: string): number => motion.get(key) ?? 0;
  const totalAgents = Object.values(view.counts).reduce((total, count) => total + count, 0);
  const layout: GalaxyLayout = {
    sun: {
      x: 0, y: 0, radius: g.sunRadius, label: 'HERDR',
      heat: totalAgents === 0 ? 0 : view.counts.working / totalAgents,
    },
    planets: [], moons: [], rings: [], scale: 1,
  };
  const planetOrbits = assignPlanetOrbits(view);
  for (const team of view.teams) {
    const orbitIndex = planetOrbits.get(team.id)!;
    const orbitRadius = g.planetOrbitBase + g.planetOrbitStep * orbitIndex;
    const { tilt, rotation } = orbitPlane(team.id);
    layout.rings.push({
      x: 0, y: 0, rx: orbitRadius, ry: orbitRadius * tilt, rotation,
      emphasis: team.tabs.some(tab => tab.agents.length > 0) ? 'primary' : 'faint',
      teamID: team.id,
    });
    const planetAngle = at(planetKey(team.id));
    const position = onOrbit(0, 0, orbitRadius, orbitRadius * tilt, rotation, planetAngle);
    // Depth: sin>0 is the near side of the plane — bigger and in front.
    const depth = Math.sin(planetAngle);
    const planetSize = g.planetRadius * (0.85 + 0.5 * team.heat) * (1 + g.depthScale * depth);
    layout.planets.push({
      key: planetKey(team.id), teamID: team.id,
      x: position.x, y: position.y, radius: planetSize,
      label: team.label, heat: team.heat, depth,
    });
    // All of the planet's moons share one orbit; slot angles space them out.
    if (team.tabs.length > 0) {
      layout.rings.push({
        x: position.x, y: position.y, rx: g.moonOrbit, ry: g.moonOrbit * tilt, rotation,
        emphasis: 'faint', teamID: team.id,
      });
    }
    for (const tab of team.tabs) {
      const moonOrbitRadius = g.moonOrbit;
      const moonAngle = at(moonKey(tab.id));
      const moon = onOrbit(position.x, position.y, moonOrbitRadius, moonOrbitRadius * tilt, rotation, moonAngle);
      const status = moonStatus(tab);
      layout.moons.push({
        key: moonKey(tab.id), teamID: team.id, tabID: tab.id,
        x: moon.x, y: moon.y,
        radius: g.moonRadius * (1 + Math.min(0.4, 0.15 * Math.max(0, tab.agents.length - 1))) * (1 + g.depthScale * depth * 0.6),
        label: tab.label, status, agents: tab.agents,
        depth: depth + Math.sin(moonAngle) * 0.05 + 0.01,
        orbit: {
          cx: position.x, cy: position.y,
          rx: moonOrbitRadius, ry: moonOrbitRadius * tilt,
          rotation, angle: moonAngle,
        },
      });
    }
  }
  fitToViewport(layout, width, height);
  return layout;
}

function fitToViewport(layout: GalaxyLayout, width: number, height: number): void {
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
  const g = GEOMETRY;
  const boxWidth = Math.max(1, maxX - minX);
  const boxHeight = Math.max(1, maxY - minY);
  const scale = Math.max(0.2, Math.min(
    g.maximumScale,
    (width - g.margin * 2) / boxWidth,
    (height - g.margin * 2) / boxHeight,
  ));
  const shiftX = width / 2 - ((minX + maxX) / 2) * scale;
  const shiftY = height / 2 - ((minY + maxY) / 2) * scale;
  const move = (node: { x: number; y: number; radius: number }): void => {
    node.x = node.x * scale + shiftX;
    node.y = node.y * scale + shiftY;
    node.radius *= scale;
  };
  move(layout.sun);
  for (const node of [...layout.planets, ...layout.moons]) move(node);
  for (const moon of layout.moons) {
    moon.orbit = {
      ...moon.orbit,
      cx: moon.orbit.cx * scale + shiftX,
      cy: moon.orbit.cy * scale + shiftY,
      rx: moon.orbit.rx * scale,
      ry: moon.orbit.ry * scale,
    };
  }
  layout.rings = layout.rings.map(ring => ({
    ...ring, x: ring.x * scale + shiftX, y: ring.y * scale + shiftY, rx: ring.rx * scale, ry: ring.ry * scale,
  }));
  layout.scale = scale;
}

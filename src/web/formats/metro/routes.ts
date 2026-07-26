export const METRO_CITY_WIDTH = 960;
export const METRO_CITY_HEIGHT = 540;

export interface MetroPoint {
  readonly x: number;
  readonly y: number;
}

export type MetroStationKind = 'local' | 'interchange';
export type MetroInterchangeLevel = 'central' | 'secondary';
export type MetroStationShape = 'circle' | 'triangle' | 'square' | 'diamond';

export interface MetroStation extends MetroPoint {
  readonly id: string;
  readonly label: string;
  readonly kind: MetroStationKind;
  readonly interchange: MetroInterchangeLevel | null;
  readonly shape: MetroStationShape;
}

export type MetroEdge = readonly [from: string, to: string];
export type MetroMapEdge = 'north' | 'east' | 'south' | 'west';

export interface MetroDepot extends MetroPoint {
  readonly id: string;
  readonly edge: MetroMapEdge;
  /** Station where a train leaving this depot enters the public network. */
  readonly entryStationID: string;
  /** Direction a train faces while rolling out toward the network. */
  readonly angle: number;
}

export interface MetroRouteTemplate {
  readonly id: string;
  readonly index: number;
  /** Ordered stations on an open point-to-point line. */
  readonly stationIDs: readonly string[];
  readonly points: readonly MetroPoint[];
  readonly depotID: string;
  /** Full out-and-back service distance in logical scene pixels. */
  readonly length: number;
}

export interface MetroRouteSample extends MetroPoint {
  readonly angle: number;
}

export type MetroLinePattern = 'solid' | 'double' | 'dashed';

export interface MetroLineStyle {
  readonly colorSlot: number;
  readonly pattern: MetroLinePattern;
  readonly width: number;
  readonly dash: readonly number[];
  /** Offset between strokes for the double-line treatment; otherwise zero. */
  readonly parallelOffset: number;
}

/**
 * Fixed 960 × 540 schematic city. Coordinates deliberately favor 45-degree
 * diagonals and short straight runs so the network reads like Mini Metro,
 * rather than a literal geographic rail map.
 */
export const METRO_STATIONS: readonly MetroStation[] = [
  { id: 'pine-end', label: 'PINE END', x: 96, y: 112, kind: 'local', interchange: null, shape: 'circle' },
  { id: 'north-market', label: 'NORTH MARKET', x: 270, y: 72, kind: 'local', interchange: null, shape: 'triangle' },
  { id: 'crown', label: 'CROWN', x: 445, y: 112, kind: 'interchange', interchange: 'secondary', shape: 'square' },
  { id: 'observatory', label: 'OBSERVATORY', x: 650, y: 72, kind: 'local', interchange: null, shape: 'diamond' },
  { id: 'east-wharf', label: 'EAST WHARF', x: 848, y: 120, kind: 'local', interchange: null, shape: 'circle' },
  { id: 'old-town', label: 'OLD TOWN', x: 92, y: 260, kind: 'local', interchange: null, shape: 'square' },
  { id: 'lantern-square', label: 'LANTERN SQUARE', x: 285, y: 220, kind: 'interchange', interchange: 'secondary', shape: 'triangle' },
  { id: 'central', label: 'CENTRAL', x: 478, y: 270, kind: 'interchange', interchange: 'central', shape: 'circle' },
  { id: 'canal-gate', label: 'CANAL GATE', x: 670, y: 215, kind: 'interchange', interchange: 'secondary', shape: 'diamond' },
  { id: 'riverside', label: 'RIVERSIDE', x: 866, y: 270, kind: 'local', interchange: null, shape: 'triangle' },
  { id: 'garden-end', label: 'GARDEN END', x: 110, y: 424, kind: 'local', interchange: null, shape: 'circle' },
  { id: 'museum', label: 'MUSEUM', x: 300, y: 385, kind: 'local', interchange: null, shape: 'diamond' },
  { id: 'south-market', label: 'SOUTH MARKET', x: 475, y: 420, kind: 'local', interchange: null, shape: 'triangle' },
  { id: 'foundry', label: 'FOUNDRY', x: 660, y: 380, kind: 'local', interchange: null, shape: 'square' },
  { id: 'hill-end', label: 'HILL END', x: 845, y: 430, kind: 'local', interchange: null, shape: 'circle' },
  { id: 'dawn-gate', label: 'DAWN GATE', x: 500, y: 495, kind: 'local', interchange: null, shape: 'square' },
];

/** Twenty-four undirected public-network segments. */
export const METRO_EDGES: readonly MetroEdge[] = [
  ['pine-end', 'north-market'],
  ['north-market', 'crown'],
  ['crown', 'observatory'],
  ['observatory', 'east-wharf'],
  ['east-wharf', 'riverside'],
  ['riverside', 'hill-end'],
  ['hill-end', 'dawn-gate'],
  ['dawn-gate', 'garden-end'],
  ['garden-end', 'old-town'],
  ['old-town', 'pine-end'],
  ['old-town', 'lantern-square'],
  ['lantern-square', 'central'],
  ['central', 'canal-gate'],
  ['canal-gate', 'riverside'],
  ['north-market', 'lantern-square'],
  ['crown', 'central'],
  ['observatory', 'canal-gate'],
  ['lantern-square', 'museum'],
  ['museum', 'south-market'],
  ['south-market', 'foundry'],
  ['foundry', 'canal-gate'],
  ['museum', 'garden-end'],
  ['south-market', 'dawn-gate'],
  ['foundry', 'hill-end'],
];

export const METRO_DEPOTS: readonly MetroDepot[] = [
  { id: 'west-depot', edge: 'west', x: 24, y: 260, entryStationID: 'old-town', angle: 0 },
  { id: 'north-depot', edge: 'north', x: 445, y: 20, entryStationID: 'crown', angle: Math.PI / 2 },
  { id: 'east-depot', edge: 'east', x: 936, y: 270, entryStationID: 'riverside', angle: Math.PI },
  { id: 'south-depot', edge: 'south', x: 500, y: 520, entryStationID: 'dawn-gate', angle: -Math.PI / 2 },
];

export const METRO_STATION_BY_ID: ReadonlyMap<string, MetroStation> = new Map(
  METRO_STATIONS.map(station => [station.id, station]),
);

interface RouteSeed {
  readonly id: string;
  readonly depotID: string;
  readonly stationIDs: readonly string[];
}

interface RouteMetrics {
  readonly cumulative: readonly number[];
  readonly total: number;
}

const ROUTE_METRICS = new WeakMap<MetroRouteTemplate, RouteMetrics>();

const ROUTE_SEEDS: readonly RouteSeed[] = [
  {
    id: 'northern',
    depotID: 'north-depot',
    stationIDs: ['pine-end', 'north-market', 'crown', 'observatory', 'east-wharf', 'riverside'],
  },
  {
    id: 'central',
    depotID: 'west-depot',
    stationIDs: ['old-town', 'lantern-square', 'central', 'canal-gate', 'riverside'],
  },
  {
    id: 'southern',
    depotID: 'south-depot',
    stationIDs: ['garden-end', 'museum', 'south-market', 'dawn-gate', 'hill-end'],
  },
  {
    id: 'west-meridian',
    depotID: 'north-depot',
    stationIDs: ['crown', 'north-market', 'lantern-square', 'museum', 'garden-end'],
  },
  {
    id: 'central-meridian',
    depotID: 'north-depot',
    stationIDs: ['crown', 'central', 'lantern-square', 'museum', 'south-market', 'dawn-gate'],
  },
  {
    id: 'east-meridian',
    depotID: 'north-depot',
    stationIDs: ['crown', 'observatory', 'canal-gate', 'foundry', 'hill-end'],
  },
  {
    id: 'pine-dawn',
    depotID: 'south-depot',
    stationIDs: ['pine-end', 'north-market', 'lantern-square', 'museum', 'south-market', 'dawn-gate'],
  },
  {
    id: 'wharf-crown',
    depotID: 'east-depot',
    stationIDs: ['east-wharf', 'riverside', 'canal-gate', 'central', 'crown'],
  },
  {
    id: 'garden-wharf',
    depotID: 'east-depot',
    stationIDs: ['garden-end', 'museum', 'south-market', 'foundry', 'canal-gate', 'riverside', 'east-wharf'],
  },
  {
    id: 'old-town-hill',
    depotID: 'west-depot',
    stationIDs: ['old-town', 'lantern-square', 'central', 'canal-gate', 'foundry', 'hill-end'],
  },
  {
    id: 'pine-south',
    depotID: 'west-depot',
    stationIDs: ['pine-end', 'old-town', 'garden-end', 'dawn-gate', 'south-market'],
  },
  {
    id: 'observatory-garden',
    depotID: 'north-depot',
    stationIDs: ['observatory', 'crown', 'central', 'lantern-square', 'museum', 'garden-end'],
  },
];

export const METRO_ROUTE_TEMPLATES: readonly MetroRouteTemplate[] = ROUTE_SEEDS.map(
  (seed, index) => createRouteTemplate(seed, index),
);

export const METRO_CITY = {
  width: METRO_CITY_WIDTH,
  height: METRO_CITY_HEIGHT,
  stations: METRO_STATIONS,
  edges: METRO_EDGES,
  depots: METRO_DEPOTS,
} as const;

/** Stable workspace ordinal → one of the twelve fixed point-to-point routes. */
export function routeForStableOrder(stableOrder: number): MetroRouteTemplate {
  return METRO_ROUTE_TEMPLATES[positiveModulo(safeInteger(stableOrder), METRO_ROUTE_TEMPLATES.length)];
}

/**
 * The first twelve lines are solid and color-distinct. Further lines reuse
 * the same colors with double and short-dashed treatments.
 */
export function lineStyleForStableOrder(stableOrder: number): MetroLineStyle {
  const order = safeInteger(stableOrder);
  const colorSlot = positiveModulo(order, 12);
  const patternBand = positiveModulo(Math.floor(order / 12), 3);
  if (patternBand === 1) {
    return { colorSlot, pattern: 'double', width: 2.5, dash: [], parallelOffset: 3 };
  }
  if (patternBand === 2) {
    return { colorSlot, pattern: 'dashed', width: 5, dash: [7, 5], parallelOffset: 0 };
  }
  return { colorSlot, pattern: 'solid', width: 5, dash: [], parallelOffset: 0 };
}

/**
 * Samples an open route as an out-and-back service. Progress 0→0.5 travels
 * toward the far terminus and 0.5→1 returns, so wrapping never teleports a
 * train between opposite ends of the map.
 */
export function sampleRoute(route: MetroRouteTemplate, progress: number): MetroRouteSample {
  const points = route.points;
  if (points.length === 0) return { x: 0, y: 0, angle: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y, angle: 0 };

  const metrics = ROUTE_METRICS.get(route) ?? measureOpenRoute(points);
  if (!(metrics.total > 0) || !Number.isFinite(metrics.total)) {
    return { x: points[0].x, y: points[0].y, angle: 0 };
  }

  const normalized = Number.isFinite(progress) ? positiveFraction(progress) : 0;
  const returning = normalized > .5;
  const target = (returning ? 1 - normalized : normalized) * route.length;
  const segmentIndex = segmentAtDistance(metrics.cumulative, target);
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1];
  const segmentStart = metrics.cumulative[segmentIndex];
  const segmentLength = Math.max(Number.EPSILON, metrics.cumulative[segmentIndex + 1] - segmentStart);
  const amount = Math.max(0, Math.min(1, (target - segmentStart) / segmentLength));
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  return {
    x: start.x + dx * amount,
    y: start.y + dy * amount,
    angle: Math.atan2(returning ? -dy : dy, returning ? -dx : dx),
  };
}

/** Normalized service progress at a station in either travel direction. */
export function routeProgressAtStation(
  route: MetroRouteTemplate,
  stationID: string,
  returning = false,
): number {
  const stationIndex = route.stationIDs.indexOf(stationID);
  if (stationIndex < 0) return 0;
  const metrics = ROUTE_METRICS.get(route) ?? measureOpenRoute(route.points);
  if (!(route.length > 0)) return 0;
  const outbound = metrics.cumulative[stationIndex] / route.length;
  return returning ? 1 - outbound : outbound;
}

function createRouteTemplate(seed: RouteSeed, index: number): MetroRouteTemplate {
  const points = seed.stationIDs.map(stationID => {
    const station = METRO_STATION_BY_ID.get(stationID);
    if (!station) throw new Error(`Unknown metro station: ${stationID}`);
    return { x: station.x, y: station.y };
  });
  if (points.length < 3) throw new Error(`Metro route ${seed.id} must contain at least three stations`);

  const metrics = measureOpenRoute(points);
  const route: MetroRouteTemplate = Object.freeze({
    id: seed.id,
    index,
    stationIDs: Object.freeze([...seed.stationIDs]),
    points: Object.freeze(points),
    depotID: seed.depotID,
    length: metrics.total * 2,
  });
  ROUTE_METRICS.set(route, metrics);
  return route;
}

function measureOpenRoute(points: readonly MetroPoint[]): RouteMetrics {
  const cumulative: number[] = [0];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    cumulative.push(cumulative[index] + Math.hypot(end.x - start.x, end.y - start.y));
  }
  return { cumulative, total: cumulative[cumulative.length - 1] };
}

function segmentAtDistance(cumulative: readonly number[], target: number): number {
  let low = 0;
  let high = cumulative.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulative[middle] <= target) low = middle;
    else high = middle;
  }
  return Math.min(low, cumulative.length - 2);
}

function safeInteger(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function positiveFraction(value: number): number {
  return positiveModulo(value, 1);
}

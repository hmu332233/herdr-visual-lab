import { stableHash } from '../../../shared/deterministic.js';

export const MetroRules = {
  serviceDuration: 75,
  lastTrainDuration: 10,
  dawnDuration: 8,
  baseServiceSpeed: 1 / 18,
  speedMin: 0.92,
  speedMax: 1.08,
  newCrewDuration: 4,
  departureDisplayDuration: 2,
  routeTemplateCount: 12,
  paletteSize: 12,
  preferredTrainNumberCount: 99,
  maximumTrainNumber: 999,
} as const;

const SPEED_BUCKETS = 1_000_000n;
const PHASE_BUCKETS = 1_000_000n;

/** Stable per-night train speed in the inclusive 0.92–1.08 range. */
export function seededMetroSpeed(serviceNight: number, unitID: string): number {
  const hash = stableHash(`metro-speed|${Math.trunc(serviceNight)}|${unitID}`);
  const unit = Number(hash % (SPEED_BUCKETS + 1n)) / Number(SPEED_BUCKETS);
  return MetroRules.speedMin + unit * (MetroRules.speedMax - MetroRules.speedMin);
}

/** Stable normalized spacing offset for a train on its line. */
export function seededMetroUnitPhase(unitID: string): number {
  const hash = stableHash(`metro-phase|${unitID}`);
  return Number(hash % PHASE_BUCKETS) / Number(PHASE_BUCKETS);
}

/** Euclidean stable-order mapping onto the fixed route catalogue. */
export function metroRouteTemplate(stableOrder: number): number {
  const order = Number.isFinite(stableOrder) ? Math.trunc(stableOrder) : 0;
  return ((order % MetroRules.routeTemplateCount) + MetroRules.routeTemplateCount)
    % MetroRules.routeTemplateCount;
}

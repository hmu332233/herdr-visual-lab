import { raiderClassOf, type RaiderClass } from './roles.js';

export { raiderClassOf } from './roles.js';
export type { RaiderClass } from './roles.js';

export interface RaidActionPose {
  kind: RaiderClass;
  style: 'flourish' | 'basic';
  cycle: number;
  periodMs: number;
  phase: number;
  radialOffset: number;
  tangentialOffset: number;
  bob: number;
  attackAnimation: number;
  canStrike: boolean;
}

export interface RaidFormationPosition {
  angle: number;
  radius: number;
}

const PERIODS: Record<RaiderClass, number> = {
  warrior: 2600,
  mage: 3200,
  archer: 1900,
};

const STRIKE_PHASE: Record<RaiderClass, number> = {
  warrior: 0.46,
  mage: 0.62,
  archer: 0.48,
};

const BASIC_PERIOD_MS = 2600;
const BASIC_STRIKE_PHASE = 0.48;

const FORMATION_RADIUS: Record<RaiderClass, number> = {
  warrior: 108,
  mage: 150,
  archer: 178,
};

const FORMATION_ROTATION: Record<RaiderClass, number> = {
  warrior: -Math.PI / 2,
  mage: -Math.PI / 2 + 0.22,
  archer: -Math.PI / 2 - 0.22,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

function pulse(from: number, peak: number, to: number, value: number): number {
  return value < peak
    ? smoothstep(from, peak, value)
    : 1 - smoothstep(peak, to, value);
}

export function raidFormationPosition(
  unitNumber: number,
  deployedUnitNumbers: readonly number[],
): RaidFormationPosition {
  const kind = raiderClassOf(unitNumber);
  const peers = [...new Set([...deployedUnitNumbers, unitNumber])]
    .filter(number => raiderClassOf(number) === kind)
    .sort((a, b) => a - b);
  const slot = peers.indexOf(unitNumber);
  return {
    angle: FORMATION_ROTATION[kind] + (slot / peers.length) * Math.PI * 2,
    radius: FORMATION_RADIUS[kind],
  };
}

export function raidActionPose(unitNumber: number, nowMs: number): RaidActionPose {
  const kind = raiderClassOf(unitNumber);
  const periodMs = PERIODS[kind];
  const clock = Math.max(0, nowMs) + unitNumber * 173;
  const cycle = Math.floor(clock / periodMs);
  const phase = clock / periodMs - cycle;
  const strike = STRIKE_PHASE[kind];

  if (kind === 'warrior') {
    const dash = smoothstep(0.18, 0.42, phase) * (1 - smoothstep(0.62, 0.92, phase));
    return {
      kind,
      style: 'flourish',
      cycle,
      periodMs,
      phase,
      radialOffset: -52 * dash,
      tangentialOffset: 0,
      bob: 0,
      attackAnimation: pulse(0.38, strike, 0.58, phase),
      canStrike: phase >= strike && phase < strike + 0.14,
    };
  }

  if (kind === 'mage') {
    return {
      kind,
      style: 'flourish',
      cycle,
      periodMs,
      phase,
      radialOffset: -6 * Math.sin(phase * Math.PI) ** 2,
      tangentialOffset: Math.sin(phase * Math.PI * 2) * 10,
      bob: -5 * Math.sin(phase * Math.PI * 2),
      attackAnimation: pulse(0.12, strike, 0.76, phase),
      canStrike: phase >= strike && phase < strike + 0.14,
    };
  }

  const backstep = smoothstep(0.08, 0.38, phase) * (1 - smoothstep(0.56, 0.84, phase));
  return {
    kind,
    style: 'flourish',
    cycle,
    periodMs,
    phase,
    radialOffset: 22 * backstep,
    tangentialOffset: Math.sin(phase * Math.PI * 2) * 14,
    bob: 0,
    attackAnimation: phase < strike
      ? smoothstep(0.08, strike, phase)
      : 1 - smoothstep(strike, 0.58, phase),
    canStrike: phase >= strike && phase < strike + 0.14,
  };
}

/**
 * A restrained attack used by done raiders. Every class keeps its own weapon,
 * but shares one stationary cadence without the working-state choreography.
 */
export function raidBasicAttackPose(unitNumber: number, nowMs: number): RaidActionPose {
  const clock = Math.max(0, nowMs) + unitNumber * 173;
  const cycle = Math.floor(clock / BASIC_PERIOD_MS);
  const phase = clock / BASIC_PERIOD_MS - cycle;
  return {
    kind: raiderClassOf(unitNumber),
    style: 'basic',
    cycle,
    periodMs: BASIC_PERIOD_MS,
    phase,
    radialOffset: 0,
    tangentialOffset: 0,
    bob: 0,
    attackAnimation: pulse(0.32, BASIC_STRIKE_PHASE, 0.62, phase),
    canStrike: phase >= BASIC_STRIKE_PHASE && phase < BASIC_STRIKE_PHASE + 0.14,
  };
}

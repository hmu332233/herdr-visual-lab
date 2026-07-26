import type { RaidActionPose } from '../raid/choreography.js';

/**
 * Side-view offsets layered over Raid's shared action timing.
 *
 * Positions are relative to the hero's formation spot. Shadow alpha is the
 * final Pixi alpha (the grounded value is 0.38), while scale values are
 * multipliers. Keeping this projection pure makes every frame reproducible
 * from the authoritative Raid pose.
 */
export interface Raid2HeroMotion {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shadowScale: number;
  shadowAlpha: number;
  aerial: boolean;
  charge: number;
}

const GROUNDED_SHADOW_ALPHA = 0.38;

const NEUTRAL_MOTION: Raid2HeroMotion = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  shadowScale: 1,
  shadowAlpha: GROUNDED_SHADOW_ALPHA,
  aerial: false,
  charge: 0,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

function pulse(from: number, peak: number, to: number, value: number): number {
  return value < peak
    ? smoothStep(from, peak, value)
    : 1 - smoothStep(peak, to, value);
}

function basicMotion(pose: RaidActionPose): Raid2HeroMotion {
  const attack = clamp01(pose.attackAnimation);
  const xDirection = pose.kind === 'archer' ? -1 : 1;
  return {
    x: xDirection * attack * (pose.kind === 'warrior' ? 4 : 2),
    y: -attack * (pose.kind === 'mage' ? 2 : 1),
    rotation: xDirection * attack * 0.018,
    scaleX: 1 + attack * 0.018,
    scaleY: 1 - attack * 0.012,
    shadowScale: 1,
    shadowAlpha: GROUNDED_SHADOW_ALPHA,
    aerial: false,
    charge: pose.kind === 'mage' ? attack * 0.55 : attack * 0.2,
  };
}

function warriorMotion(pose: RaidActionPose): Raid2HeroMotion {
  const phase = clamp01(pose.phase);
  const anticipation = pulse(0.03, 0.13, 0.25, phase);
  const advance = smoothStep(0.16, 0.41, phase);
  const returnHome = 1 - smoothStep(0.64, 0.94, phase);
  const dash = advance * returnHome;
  const strike = pulse(0.36, 0.46, 0.59, phase);
  const recoil = pulse(0.47, 0.56, 0.69, phase);

  return {
    x: dash * 90 - anticipation * 8 - recoil * 7,
    y: -strike * 4,
    rotation: anticipation * -0.065 + strike * 0.055 - recoil * 0.075,
    scaleX: 1 + strike * 0.08 - recoil * 0.025,
    scaleY: 1 - strike * 0.055 + recoil * 0.018,
    shadowScale: 1 + dash * 0.08,
    shadowAlpha: GROUNDED_SHADOW_ALPHA,
    aerial: false,
    charge: Math.max(anticipation * 0.55, strike),
  };
}

function mageMotion(pose: RaidActionPose): Raid2HeroMotion {
  const phase = clamp01(pose.phase);
  const rise = smoothStep(0.12, 0.48, phase);
  const descend = 1 - smoothStep(0.73, 0.96, phase);
  const lift = rise * descend;
  const hover = Math.sin((phase - 0.48) * Math.PI * 5) * 2 * lift;
  const charge = smoothStep(0.18, 0.58, phase)
    * (1 - smoothStep(0.69, 0.88, phase));

  return {
    x: Math.sin(phase * Math.PI * 2) * 5 * lift,
    y: -68 * lift + hover,
    rotation: Math.sin(phase * Math.PI * 2) * 0.025 * lift,
    scaleX: 1 + lift * 0.035 + charge * 0.018,
    scaleY: 1 + lift * 0.035 - charge * 0.012,
    shadowScale: 1 - lift * 0.55,
    shadowAlpha: GROUNDED_SHADOW_ALPHA * (1 - lift * 0.66),
    aerial: lift > 0.05,
    charge: clamp01(charge),
  };
}

function archerMotion(pose: RaidActionPose): Raid2HeroMotion {
  const phase = clamp01(pose.phase);
  const stepBack = smoothStep(0.08, 0.35, phase)
    * (1 - smoothStep(0.6, 0.9, phase));
  const recoil = pulse(0.44, 0.52, 0.66, phase);
  const draw = smoothStep(0.1, 0.43, phase)
    * (1 - smoothStep(0.5, 0.7, phase));

  return {
    x: -stepBack * 26 - recoil * 3,
    y: -recoil * 1.5,
    rotation: recoil * -0.045,
    scaleX: 1 - recoil * 0.025,
    scaleY: 1 + recoil * 0.018,
    shadowScale: 1 - recoil * 0.04,
    shadowAlpha: GROUNDED_SHADOW_ALPHA,
    aerial: false,
    charge: clamp01(draw),
  };
}

/** Resolve Raid's shared pose into expressive Raid 2 side-view motion. */
export function raid2HeroMotion(pose: RaidActionPose | null): Raid2HeroMotion {
  if (!pose) return { ...NEUTRAL_MOTION };
  if (pose.style === 'basic') return basicMotion(pose);
  if (pose.kind === 'warrior') return warriorMotion(pose);
  if (pose.kind === 'mage') return mageMotion(pose);
  return archerMotion(pose);
}

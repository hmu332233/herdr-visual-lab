import { stableHash } from '../../../shared/deterministic.js';

export const F1Rules = {
  totalLaps: 58, baseLapDuration: 18, baseSpeed: 1 / 18,
  paceMin: 0.75, paceMax: 1.25, doneCooldownFactor: 0.25,
  podiumDuration: 8, newEntrantDeficit: 0.15, newStintDuration: 4,
  paletteSize: 12, maximumGridNumber: 99,
} as const;

const MASK_64 = 0xffffffffffffffffn;
export function seededF1Pace(round: number, unitID: string, lap: number): number {
  const hash = stableHash(`${round}|${unitID}|${lap}`) ^ 0x5deece66n;
  const mixed = ((hash ^ (hash >> 33n)) * 0xff51afd7ed558ccdn) & MASK_64;
  const unit = Number(mixed % 100000n) / 99999;
  return F1Rules.paceMin + unit * (F1Rules.paceMax - F1Rules.paceMin);
}

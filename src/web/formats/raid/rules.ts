import { stableHash } from '../../../shared/deterministic.js';
export const RaidRules = { bossHealth: 58, baseDamageDuration: 18, baseDamageRate: 1/18,
  attackRateMin: .75, attackRateMax: 1.25, victoryOrbitFactor: .25,
  bossDownDuration: 8, newcomerDeficit: .15, respawnDuration: 4,
  paletteSize: 12, maximumRaiderNumber: 99 } as const;
const MASK = 0xffffffffffffffffn;
export function seededRaidAttackRate(stage: number, unitID: string, damageBand: number): number {
  const hash = stableHash(`${stage}|${unitID}|${damageBand}`) ^ 0x5deece66n;
  const mixed = ((hash ^ (hash >> 33n)) * 0xff51afd7ed558ccdn) & MASK;
  return RaidRules.attackRateMin + Number(mixed % 100000n) / 99999 * (RaidRules.attackRateMax - RaidRules.attackRateMin);
}

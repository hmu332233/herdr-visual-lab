export const RAIDER_CLASSES = ['warrior', 'mage', 'archer'] as const;
export type RaiderClass = (typeof RAIDER_CLASSES)[number];

export interface RaiderClassStats {
  hitDamage: number;
  damageRateMultiplier: number;
}

export const RAIDER_CLASS_STATS: Record<RaiderClass, RaiderClassStats> = {
  warrior: { hitDamage: 4, damageRateMultiplier: 1.05 },
  mage: { hitDamage: 6, damageRateMultiplier: 1.25 },
  archer: { hitDamage: 3, damageRateMultiplier: 0.9 },
};

export function raiderClassOf(unitNumber: number): RaiderClass {
  const index = ((unitNumber % RAIDER_CLASSES.length) + RAIDER_CLASSES.length)
    % RAIDER_CLASSES.length;
  return RAIDER_CLASSES[index];
}

export function raidClassStatsForUnit(unitNumber: number): RaiderClassStats {
  return RAIDER_CLASS_STATS[raiderClassOf(unitNumber)];
}

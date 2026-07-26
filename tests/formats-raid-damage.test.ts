import { describe, expect, it } from 'vitest';
import {
  advanceRaidTo,
  initialRaidState,
  type RaidState,
  type RaiderState,
} from '../src/web/formats/raid/fold.js';
import {
  RAIDER_CLASS_STATS,
  raiderClassOf,
} from '../src/web/formats/raid/roles.js';

function raidState(
  unitNumber: number,
  status: RaiderState['status'] = 'working',
  officialDamage = 0,
): { state: RaidState; raider: RaiderState } {
  const state: RaidState = initialRaidState();
  state.phase = 'battle';
  state.hasSnapshot = true;
  state.connection = { kind: 'live' };
  const raider: RaiderState = {
    id: 'same-unit',
    number: unitNumber,
    guildID: 'guild',
    tabLabel: 'tab',
    agentKind: 'codex',
    status,
    isFocused: false,
    sourceOrder: 0,
    stableOrder: 0,
    officialDamage,
    displayOrbit: officialDamage,
    attackRate: { multiplier: 1, damageBand: -1 },
    felled: false,
    queued: false,
    stunnedAtCamp: false,
    respawnUntil: null,
  };
  state.raiders.set(raider.id, raider);
  return { state, raider };
}

function damageAfterOneSecond(
  unitNumber: number,
  status: RaiderState['status'] = 'working',
): number {
  const { state, raider } = raidState(unitNumber, status);
  advanceRaidTo(state, 1);
  return raider.officialDamage;
}

describe('raid class damage', () => {
  it('uses distinct damage numbers for each class', () => {
    expect(RAIDER_CLASS_STATS.warrior.hitDamage).toBe(4);
    expect(RAIDER_CLASS_STATS.mage.hitDamage).toBe(6);
    expect(RAIDER_CLASS_STATS.archer.hitDamage).toBe(3);
  });

  it('applies class multipliers to official boss damage', () => {
    const warriorDamage = damageAfterOneSecond(3);
    const mageDamage = damageAfterOneSecond(1);
    const archerDamage = damageAfterOneSecond(2);

    expect(raiderClassOf(3)).toBe('warrior');
    expect(mageDamage).toBeGreaterThan(warriorDamage);
    expect(warriorDamage).toBeGreaterThan(archerDamage);
  });

  it('counts done basic attacks as lower, class-neutral official damage', () => {
    const doneDamage = [1, 2, 3].map(unitNumber =>
      damageAfterOneSecond(unitNumber, 'done'));

    expect(doneDamage[0]).toBeGreaterThan(0);
    expect(doneDamage[1]).toBeCloseTo(doneDamage[0], 12);
    expect(doneDamage[2]).toBeCloseTo(doneDamage[0], 12);
    expect(doneDamage[0]).toBeLessThan(damageAfterOneSecond(2, 'working'));
  });

  it('lets a done raider finish the boss', () => {
    const { state, raider } = raidState(1, 'done', 57.99);

    advanceRaidTo(state, 1);

    expect(raider.officialDamage).toBe(58);
    expect(state.phase).toBe('bossDown');
  });
});

import { describe, expect, it } from 'vitest';
import {
  raidActionPose,
  raidBasicAttackPose,
  raidFormationPosition,
  raiderClassOf,
} from '../src/web/formats/raid/choreography.js';

describe('raid class choreography', () => {
  it('assigns a stable three-class rotation', () => {
    expect([1, 2, 3, 4].map(raiderClassOf)).toEqual(['mage', 'archer', 'warrior', 'mage']);
  });

  it('is deterministic and repeats after the class period', () => {
    const pose = raidActionPose(3, 700);
    expect(raidActionPose(3, 700)).toEqual(pose);

    const repeated = raidActionPose(3, 700 + pose.periodMs);
    expect(repeated.phase).toBeCloseTo(pose.phase, 12);
    expect(repeated.radialOffset).toBeCloseTo(pose.radialOffset, 12);
    expect(repeated.tangentialOffset).toBeCloseTo(pose.tangentialOffset, 12);
    expect(repeated.cycle).toBe(pose.cycle + 1);
  });

  it('gives each class a distinct combat position', () => {
    const mage = raidActionPose(1, 700);
    const archer = raidActionPose(2, 225);
    const warrior = raidActionPose(3, 700);

    expect(warrior.radialOffset).toBeLessThan(-45);
    expect(archer.radialOffset).toBeGreaterThan(10);
    expect(Math.abs(mage.bob)).toBeGreaterThan(3);
    expect([mage, archer, warrior].every(pose => pose.style === 'flourish')).toBe(true);
  });

  it('gives done raiders a stationary basic attack shared by every class', () => {
    const poses = [1, 2, 3].map(unitNumber => raidBasicAttackPose(unitNumber, 700));

    expect(poses.map(pose => pose.style)).toEqual(['basic', 'basic', 'basic']);
    expect(new Set(poses.map(pose => pose.periodMs))).toEqual(new Set([2600]));
    for (const pose of poses) {
      expect(pose.radialOffset).toBe(0);
      expect(pose.tangentialOffset).toBe(0);
      expect(pose.bob).toBe(0);
    }
  });

  it('places classes in fixed melee, mid-range, and backline formations', () => {
    const roster = [1, 2, 3, 4, 5, 6];
    const warrior = raidFormationPosition(3, roster);
    const mage = raidFormationPosition(1, roster);
    const archer = raidFormationPosition(2, roster);

    expect(warrior.radius).toBeLessThan(mage.radius);
    expect(mage.radius).toBeLessThan(archer.radius);
    expect(raidFormationPosition(3, roster)).toEqual(warrior);
  });

  it('spreads same-class raiders without advancing their angle over time', () => {
    const roster = [3, 6, 9];
    const positions = roster.map(unitNumber => raidFormationPosition(unitNumber, roster));

    expect(new Set(positions.map(position => position.angle)).size).toBe(3);
    expect(positions[0].radius).toBe(positions[1].radius);
  });

  it('opens a short strike window once per class cycle', () => {
    for (const unitNumber of [1, 2, 3]) {
      const first = Array.from({ length: 500 }, (_, index) => raidActionPose(unitNumber, index * 10))
        .find(pose => pose.cycle === raidActionPose(unitNumber, 0).cycle && pose.canStrike);
      expect(first).toBeDefined();
      expect(first!.attackAnimation).toBeGreaterThan(0);
    }
  });

  it('opens a strike window for the basic done attack', () => {
    const unitNumber = 2;
    const initialCycle = raidBasicAttackPose(unitNumber, 0).cycle;
    const strike = Array.from({ length: 300 }, (_, index) =>
      raidBasicAttackPose(unitNumber, index * 10))
      .find(pose => pose.cycle === initialCycle && pose.canStrike);

    expect(strike).toBeDefined();
    expect(strike!.attackAnimation).toBeGreaterThan(0);
  });
});

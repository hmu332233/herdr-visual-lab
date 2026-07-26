import { describe, expect, it } from 'vitest';
import type { RaidActionPose } from '../src/web/formats/raid/choreography.js';
import {
  raid2HeroMotion,
  type Raid2HeroMotion,
} from '../src/web/formats/raid2/choreography.js';
import type { RaiderClass } from '../src/web/formats/raid/roles.js';

function pose(
  kind: RaiderClass,
  phase: number,
  style: RaidActionPose['style'] = 'flourish',
  attackAnimation = 1,
): RaidActionPose {
  return {
    kind,
    style,
    cycle: 2,
    periodMs: 2600,
    phase,
    radialOffset: 0,
    tangentialOffset: 0,
    bob: 0,
    attackAnimation,
    canStrike: true,
  };
}

function expectRecovered(motion: Raid2HeroMotion): void {
  expect(Math.abs(motion.x)).toBeLessThan(0.5);
  expect(Math.abs(motion.y)).toBeLessThan(0.5);
  expect(Math.abs(motion.rotation)).toBeLessThan(0.01);
  expect(motion.scaleX).toBeCloseTo(1, 2);
  expect(motion.scaleY).toBeCloseTo(1, 2);
  expect(motion.aerial).toBe(false);
}

describe('Raid 2 side-view choreography', () => {
  it('returns neutral grounded motion without an action pose', () => {
    expect(raid2HeroMotion(null)).toEqual({
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      shadowScale: 1,
      shadowAlpha: 0.38,
      aerial: false,
      charge: 0,
    });
  });

  it('makes the warrior anticipate, dash into melee, recoil, and recover', () => {
    const anticipation = raid2HeroMotion(pose('warrior', 0.13));
    const strike = raid2HeroMotion(pose('warrior', 0.46));
    const recoil = raid2HeroMotion(pose('warrior', 0.56));

    expect(anticipation.x).toBeLessThan(0);
    expect(strike.x).toBeGreaterThanOrEqual(80);
    expect(strike.x).toBeLessThanOrEqual(95);
    expect(strike.y).toBeLessThan(0);
    expect(recoil.rotation).toBeLessThan(0);
    expectRecovered(raid2HeroMotion(pose('warrior', 0.99)));
  });

  it('lifts the mage high for the cast and shrinks its ground shadow', () => {
    const cast = raid2HeroMotion(pose('mage', 0.62));

    expect(cast.y).toBeLessThanOrEqual(-60);
    expect(cast.y).toBeGreaterThanOrEqual(-75);
    expect(cast.aerial).toBe(true);
    expect(cast.shadowScale).toBeLessThan(0.55);
    expect(cast.shadowAlpha).toBeLessThan(0.18);
    expect(cast.charge).toBeGreaterThan(0.9);
    expectRecovered(raid2HeroMotion(pose('mage', 0.99)));
  });

  it('gives the archer a readable backstep and small firing recoil', () => {
    const strike = raid2HeroMotion(pose('archer', 0.48));

    expect(strike.x).toBeLessThanOrEqual(-20);
    expect(strike.x).toBeGreaterThanOrEqual(-30);
    expect(strike.rotation).toBeLessThan(0);
    expect(strike.aerial).toBe(false);
    expect(strike.charge).toBeGreaterThan(0.75);
    expectRecovered(raid2HeroMotion(pose('archer', 0.99)));
  });

  it('keeps basic attacks close to formation for every class', () => {
    for (const kind of ['warrior', 'mage', 'archer'] as const) {
      const motion = raid2HeroMotion(pose(kind, 0.48, 'basic', 1));
      expect(Math.abs(motion.x)).toBeLessThanOrEqual(4);
      expect(Math.abs(motion.y)).toBeLessThanOrEqual(2);
      expect(motion.aerial).toBe(false);
    }
  });

  it('is deterministic for identical poses', () => {
    const action = pose('mage', 0.62);
    expect(raid2HeroMotion(action)).toEqual(raid2HeroMotion(action));
  });
});

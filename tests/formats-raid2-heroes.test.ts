import { describe, expect, it } from 'vitest';
import {
  COMBAT_ANIMATION_ROWS,
  HERO_HALF_WIDTH,
  HERO_HEIGHT,
  HERO_SHEET_URLS,
  HERO_SIZE,
  HERO_URLS,
  SPRITE_SHEET_COLUMNS,
  SPRITE_SHEET_ROWS,
} from '../src/web/formats/raid2/heroes.js';
import { RAIDER_CLASSES } from '../src/web/formats/raid/roles.js';

describe('raid2 Pixi hero assets', () => {
  it('provides one shared texture URL for every raider class', () => {
    expect(Object.keys(HERO_URLS).sort()).toEqual([...RAIDER_CLASSES].sort());
    expect(new Set(Object.values(HERO_URLS)).size).toBe(RAIDER_CLASSES.length);
    for (const url of Object.values(HERO_URLS)) expect(url).toMatch(/\.png$/);
  });

  it('provides one versioned 4×4 animation sheet for every class', () => {
    expect(Object.keys(HERO_SHEET_URLS).sort()).toEqual([...RAIDER_CLASSES].sort());
    expect(new Set(Object.values(HERO_SHEET_URLS)).size).toBe(RAIDER_CLASSES.length);
    for (const url of Object.values(HERO_SHEET_URLS)) {
      expect(url).toMatch(/-sheet-v1\.png$/);
    }
    expect([SPRITE_SHEET_COLUMNS, SPRITE_SHEET_ROWS]).toEqual([4, 4]);
    expect(COMBAT_ANIMATION_ROWS).toEqual({ idle: 0, attack: 1, hit: 2 });
  });

  it('keeps a stable feet-anchored scene footprint', () => {
    expect(HERO_SIZE).toBeGreaterThanOrEqual(HERO_HEIGHT);
    expect(HERO_HALF_WIDTH * 2).toBeLessThanOrEqual(HERO_SIZE);
  });
});

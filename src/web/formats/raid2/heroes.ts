import type { RaiderClass } from '../raid/roles.js';

/** Native scene footprint; source textures are shared by every matching hero. */
export const HERO_SIZE = 88;
export const HERO_HEIGHT = 78;
export const HERO_HALF_WIDTH = 42;
export const SPRITE_SHEET_COLUMNS = 4;
export const SPRITE_SHEET_ROWS = 4;
export const COMBAT_ANIMATION_ROWS = {
  idle: 0,
  attack: 1,
  hit: 2,
} as const;

/** Static portraits stay lightweight in the party panel. */
export const HERO_URLS: Readonly<Record<RaiderClass, string>> = {
  warrior: new URL('../../assets/raid2/warrior.png', import.meta.url).href,
  mage: new URL('../../assets/raid2/mage.png', import.meta.url).href,
  archer: new URL('../../assets/raid2/archer.png', import.meta.url).href,
};

/** 4×4 sheets: idle, attack, hit, then one reserved row. */
export const HERO_SHEET_URLS: Readonly<Record<RaiderClass, string>> = {
  warrior: new URL('../../assets/raid2/warrior-sheet-v1.png', import.meta.url).href,
  mage: new URL('../../assets/raid2/mage-sheet-v1.png', import.meta.url).href,
  archer: new URL('../../assets/raid2/archer-sheet-v1.png', import.meta.url).href,
};

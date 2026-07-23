import type { GameFormat } from '../../format.js';
import { createRaidFormat } from '../raid/index.js';
import { HERO_RAIDER_STYLE } from './heroes.js';

/** Raid 2: identical rules, fold, chrome, and standings to Raid — only the
 *  character art is upgraded to full-body hero sprites. */
export function createRaid2Format(): GameFormat {
  return createRaidFormat(HERO_RAIDER_STYLE);
}

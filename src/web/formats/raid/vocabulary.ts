import type { EntryPresentation } from '../../../shared/presentation.js';
import { progressTarget } from '../../../shared/rules.js';

/** Raid-boss vocabulary: pure reinterpretations of the game-neutral data.
 *  Cumulative progress is damage; the leader's progress toward the target is
 *  the boss's health bar; the round number is the stage. */

/** Boss health as a [0, 1] fraction. The leader reaching progressTarget (the
 *  same instant the F1 leader finishes 58 laps) drops it to 0 → BOSS DOWN. */
export function bossHpFraction(leaderProgress: number): number {
  return Math.max(0, Math.min(1, 1 - leaderProgress / progressTarget));
}

/** `STAGE n` — one boss felled advances to the next. */
export function stageLabel(round: number): string {
  return `STAGE ${round}`;
}

/** Whole-number damage dealt (1 progress unit = 1 damage stack). */
export function damageOf(progress: number): number {
  return Math.round(progress);
}

/** `x DMG` for a raider or a guild's cumulative damage. */
export function damageText(progress: number): string {
  return `${damageOf(progress).toLocaleString('en-US')} DMG`;
}

/** Guild gap behind the top DPS: `—` for the leader (caller decides), else
 *  `-x DMG`. */
export function dpsGapText(gap: number): string {
  return `-${damageOf(gap).toLocaleString('en-US')} DMG`;
}

/** Combat state label for a raider row. */
export function statusLabel(entry: EntryPresentation): string {
  if (entry.isQueued) return 'NEXT WAVE';
  if (entry.isDeparted) return 'FELLED';
  switch (entry.status) {
    case 'working': return 'ATTACKING';
    case 'idle': return 'CAMP';
    case 'done': return 'VICTORY';
    case 'blocked': return 'STUNNED';
  }
}

/** Full-screen overlay copy for each connection/game condition. */
export function overlayLabel(kind: 'connecting' | 'noUnits' | 'frozen' | 'suspended'): string {
  switch (kind) {
    case 'connecting': return 'SUMMONING';
    case 'noUnits': return 'NO RAIDERS';
    case 'frozen': return 'TIME FREEZE';
    case 'suspended': return 'RAID SUSPENDED';
  }
}

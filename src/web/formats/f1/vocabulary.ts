import type { EntryPresentation } from '../../../shared/presentation.js';
import { baseProgressDuration, progressTarget } from '../../../shared/rules.js';

/** F1 vocabulary: the pure text/derivation logic that used to live in the
 *  server's present()/rankedTeams(). Moved here verbatim so the F1 screen
 *  reads identically while the server stays game-neutral. */

/** One-based lap from official progress, capped at 58. */
export function lapOf(progress: number): number {
  return Math.min(progressTarget, Math.floor(progress) + 1);
}

/** Leader lap for the `LAP n / 58` header, capped at 58. */
export function headerLap(leaderProgress: number): number {
  return Math.min(progressTarget, Math.floor(leaderProgress) + 1);
}

/** `LAP n`, `PIT`, `DONE · LAP n`, `INCIDENT · LAP n`, `RETIRED · LAP n`, `NEXT GRID`. */
export function statusText(entry: EntryPresentation): string {
  const lap = lapOf(entry.officialProgress);
  if (entry.isQueued) return 'NEXT GRID';
  if (entry.isDeparted) return `RETIRED · LAP ${lap}`;
  switch (entry.status) {
    case 'working': return `LAP ${lap}`;
    case 'idle': return 'PIT';
    case 'done': return `DONE · LAP ${lap}`;
    case 'blocked': return `INCIDENT · LAP ${lap}`;
  }
}

/** Preformatted `x.x LAPS`. */
export function distanceText(progress: number): string {
  return `${progress.toFixed(1)} LAPS`;
}

/** Gap behind the leader: `+x.xs` under one lap, `+x.x LAPS` otherwise. The
 *  leader row itself is rendered as `—` by the caller. */
export function gapText(gap: number): string {
  if (gap < 1) return `+${(gap * baseProgressDuration).toFixed(1)}s`;
  return `+${gap.toFixed(1)} LAPS`;
}

import { describe, expect, it } from 'vitest';
import { extrapolateProgress } from '../src/web/state.js';

describe('extrapolateProgress', () => {
  it('advances active progress by displaySpeed and wraps at 1', () => {
    expect(extrapolateProgress({ kind: 'active', progress: 0.9 }, 1 / 18, 3.6)).toBeCloseTo(0.1, 9);
  });

  it('coolingDown markers keep circulating', () => {
    expect(extrapolateProgress({ kind: 'coolingDown', progress: 0.5 }, 1 / 72, 7.2)).toBeCloseTo(0.6, 9);
  });

  it('blocked-active markers hold position (speed 0)', () => {
    expect(extrapolateProgress({ kind: 'blockedActive', progress: 0.4 }, 0, 60)).toBeCloseTo(0.4, 9);
  });

  it('non-circuit placements have no progress', () => {
    expect(extrapolateProgress({ kind: 'resting' }, 0, 1)).toBeNull();
    expect(extrapolateProgress({ kind: 'queued' }, 0, 1)).toBeNull();
    expect(extrapolateProgress({ kind: 'departed' }, 0, 1)).toBeNull();
    expect(extrapolateProgress({ kind: 'blockedResting' }, 0, 1)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { SyncMessage } from '../src/shared/protocol.js';
import { applyGameSpeed, DEFAULT_GAME_SPEEDS } from '../src/web/game-speed.js';

const message: SyncMessage = {
  type: 'sync',
  serverTime: 10,
  timelineTime: 2,
  timelineRate: 1,
  events: [{ seq: 1, at: 1.5, kind: 'snapshot-applied' }],
};

describe('game speed', () => {
  it('runs Kanban in real time', () => {
    expect(DEFAULT_GAME_SPEEDS.kanban).toBe(1);
    expect(applyGameSpeed(message, 'kanban')).toBe(message);
  });
  it('uses real time for F1', () => {
    expect(DEFAULT_GAME_SPEEDS.f1).toBe(1);
    expect(applyGameSpeed(message, 'f1')).toBe(message);
  });

  it('runs Raid at 5x by default', () => {
    expect(DEFAULT_GAME_SPEEDS.raid).toBe(5);
    expect(applyGameSpeed(message, 'raid')).toEqual({
      ...message,
      timelineTime: 10,
      timelineRate: 5,
      events: [{ seq: 1, at: 7.5, kind: 'snapshot-applied' }],
    });
  });

  it('falls back to the F1 speed for unknown games', () => {
    expect(applyGameSpeed(message, 'unknown')).toBe(message);
  });

  it('runs Raid 2 at the same 5x tempo as Raid', () => {
    expect(DEFAULT_GAME_SPEEDS.raid2).toBe(5);
    expect(applyGameSpeed(message, 'raid2')).toEqual(applyGameSpeed(message, 'raid'));
  });

  it('runs Tiny Spaceport in real time and preserves the Foundry alias', () => {
    expect(DEFAULT_GAME_SPEEDS.spaceport).toBe(1);
    expect(DEFAULT_GAME_SPEEDS.foundry).toBe(1);
    expect(applyGameSpeed(message, 'spaceport')).toBe(message);
    expect(applyGameSpeed(message, 'foundry')).toBe(message);
  });

  it('runs Metro on the neutral real-time journal', () => {
    expect(DEFAULT_GAME_SPEEDS.metro).toBe(1);
    expect(applyGameSpeed(message, 'metro')).toBe(message);
  });
});

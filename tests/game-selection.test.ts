import { describe, expect, it } from 'vitest';
import { resolveGameName } from '../src/web/game-selection.js';

describe('game selection', () => {
  it('selects Metro directly', () => {
    expect(resolveGameName('?game=metro')).toBe('metro');
  });

  it('keeps all existing public and compatibility formats', () => {
    expect(resolveGameName('')).toBe('f1');
    expect(resolveGameName('?game=raid2')).toBe('raid2');
    expect(resolveGameName('?game=spaceport')).toBe('spaceport');
    expect(resolveGameName('?game=foundry')).toBe('foundry');
  });

  it('falls back to F1 for unknown formats', () => {
    expect(resolveGameName('?game=defense')).toBe('f1');
  });
});

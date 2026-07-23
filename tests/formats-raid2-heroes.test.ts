import { describe, expect, it } from 'vitest';
import { HERO_RAIDER_STYLE } from '../src/web/formats/raid2/heroes.js';
import { RAIDER_CLASSES } from '../src/web/formats/raid/roles.js';
import type { RaiderSprite } from '../src/web/formats/raid/scene.js';
import { fakeCanvasContext } from './helpers/fake-canvas.js';

function sprite(overrides: Partial<RaiderSprite> = {}): RaiderSprite {
  return {
    kind: 'warrior',
    color: '#E10600',
    aim: Math.PI / 4,
    attack: 0.6,
    nowMs: 700,
    fighting: true,
    crowned: false,
    unitNumber: 7,
    patternSlot: null,
    ...overrides,
  };
}

describe('hero raider style', () => {
  it('draws every class and state with balanced canvas save/restore', () => {
    for (const kind of RAIDER_CLASSES)
      for (const fighting of [true, false])
        for (const crowned of [false, true])
          for (const patternSlot of [null, 1]) {
            const ctx = fakeCanvasContext();
            HERO_RAIDER_STYLE.drawCharacter(ctx, sprite({ kind, fighting, crowned, patternSlot }));
            const saves = ctx.calls.filter(call => call.name === 'save').length;
            const restores = ctx.calls.filter(call => call.name === 'restore').length;
            expect(saves).toBe(restores);
            expect(ctx.calls.length).toBeGreaterThan(0);
          }
  });

  it('renders deterministically for identical sprites', () => {
    const first = fakeCanvasContext();
    const second = fakeCanvasContext();
    HERO_RAIDER_STYLE.drawCharacter(first, sprite());
    HERO_RAIDER_STYLE.drawCharacter(second, sprite());
    expect(first.calls).toEqual(second.calls);
  });

  it('gives each class a visibly distinct body', () => {
    const logs = RAIDER_CLASSES.map(kind => {
      const ctx = fakeCanvasContext();
      HERO_RAIDER_STYLE.drawCharacter(ctx, sprite({ kind }));
      return JSON.stringify(ctx.calls);
    });
    expect(new Set(logs).size).toBe(RAIDER_CLASSES.length);
  });

  it('animates the weapon with the attack envelope', () => {
    const relaxed = fakeCanvasContext();
    const striking = fakeCanvasContext();
    HERO_RAIDER_STYLE.drawCharacter(relaxed, sprite({ attack: 0 }));
    HERO_RAIDER_STYLE.drawCharacter(striking, sprite({ attack: 1 }));
    expect(relaxed.calls).not.toEqual(striking.calls);
  });

  it('swaps class headgear for a crown when crowned', () => {
    const plain = fakeCanvasContext();
    const crowned = fakeCanvasContext();
    HERO_RAIDER_STYLE.drawCharacter(plain, sprite({ crowned: false }));
    HERO_RAIDER_STYLE.drawCharacter(crowned, sprite({ crowned: true }));
    expect(plain.calls).not.toEqual(crowned.calls);
  });
});

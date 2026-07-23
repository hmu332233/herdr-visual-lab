import { describe, expect, it } from 'vitest';
import { CLASSIC_RAIDER_STYLE, type RaiderSprite } from '../src/web/formats/raid/scene.js';
import { RAIDER_CLASSES } from '../src/web/formats/raid/roles.js';
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

describe('classic raider style', () => {
  it('draws every class and state with balanced canvas save/restore', () => {
    for (const kind of RAIDER_CLASSES)
      for (const fighting of [true, false])
        for (const crowned of [false, true])
          for (const patternSlot of [null, 1]) {
            const ctx = fakeCanvasContext();
            CLASSIC_RAIDER_STYLE.drawCharacter(ctx, sprite({ kind, fighting, crowned, patternSlot }));
            const saves = ctx.calls.filter(call => call.name === 'save').length;
            const restores = ctx.calls.filter(call => call.name === 'restore').length;
            expect(saves).toBe(restores);
            expect(ctx.calls.length).toBeGreaterThan(0);
          }
  });

  it('renders deterministically for identical sprites', () => {
    const first = fakeCanvasContext();
    const second = fakeCanvasContext();
    CLASSIC_RAIDER_STYLE.drawCharacter(first, sprite());
    CLASSIC_RAIDER_STYLE.drawCharacter(second, sprite());
    expect(first.calls).toEqual(second.calls);
  });
});

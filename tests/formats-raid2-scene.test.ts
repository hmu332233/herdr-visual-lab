import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRaid2Format } from '../src/web/formats/raid2/index.js';
import {
  combatAnimationsFromSheet,
  raid2BossAttackPlan,
} from '../src/web/formats/raid2/scene.js';
import { Texture } from 'pixi.js';
import {
  connectionChanged,
  eventHistory,
  snapshotApplied,
  teamJoined,
  unitJoined,
} from './helpers/events.js';

function fakeCanvasElement() {
  return {
    width: 0,
    height: 0,
    parentElement: { clientWidth: 960, clientHeight: 420 },
  } as unknown as HTMLCanvasElement;
}

describe('raid2 Pixi scene', () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 3 };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('supports the format lifecycle in a headless test environment', () => {
    const format = createRaid2Format();
    format.onEvents(
      eventHistory(
        [0, teamJoined()],
        [0, unitJoined('t1', 'ws', 'working')],
        [0, unitJoined('t2', 'ws', 'done')],
        [0, snapshotApplied()],
        [0, connectionChanged({ kind: 'live' })],
      ),
      true,
    );
    format.onTimeline({ timelineTime: 30, timelineRate: 1 });

    const canvas = fakeCanvasElement();
    const scene = format.createScene(canvas, () => {});
    scene.commit(0);
    scene.frame(3800);
    scene.resize();

    // DPR is deliberately capped for predictable memory and fill-rate.
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(840);
  });

  it('slices idle, attack, and hit into distinct four-frame rows', () => {
    const sheet = Texture.EMPTY;
    Object.defineProperties(sheet, {
      width: { configurable: true, value: 1252 },
      height: { configurable: true, value: 1252 },
    });
    const animations = combatAnimationsFromSheet(sheet);

    expect(animations.idle).toHaveLength(4);
    expect(animations.attack).toHaveLength(4);
    expect(animations.hit).toHaveLength(4);
    expect(animations.idle.map(frame => frame.frame.y)).toEqual([0, 0, 0, 0]);
    expect(animations.attack.map(frame => frame.frame.y)).toEqual([313, 313, 313, 313]);
    expect(animations.hit.map(frame => frame.frame.y)).toEqual([626, 626, 626, 626]);
    expect(animations.attack.map(frame => frame.frame.x)).toEqual([0, 313, 626, 939]);
  });

  it('can crop a shared right-edge overhang without changing sheet cell origins', () => {
    const sheet = Texture.EMPTY;
    Object.defineProperties(sheet, {
      width: { configurable: true, value: 1252 },
      height: { configurable: true, value: 1252 },
    });
    const animations = combatAnimationsFromSheet(sheet, { right: 36 });

    expect(animations.idle.map(frame => frame.frame.width)).toEqual([277, 277, 277, 277]);
    expect(animations.idle.map(frame => frame.frame.x)).toEqual([0, 313, 626, 939]);
  });

  it('telegraphs, strikes, and alternates boss attack types deterministically', () => {
    const warning = raid2BossAttackPlan(3500, 0, 0.8, 3);
    const impact = raid2BossAttackPlan(3786, 0, 0.8, 3);
    const next = raid2BossAttackPlan(3500 + 4200, 0, 0.8, 3);

    expect(warning?.kind).toBe('claw');
    expect(warning?.warning).toBeGreaterThan(0);
    expect(impact?.impactAgeMs).toBeCloseTo(0, 0);
    expect(next?.kind).toBe('fire');
    expect(next?.targetIndex).not.toBe(warning?.targetIndex);
  });

  it('uses the faster cadence when the boss is enraged', () => {
    const normal = raid2BossAttackPlan(4450, 0, 0.8, 2);
    const enraged = raid2BossAttackPlan(4450, 0, 0.1, 2);
    expect(normal?.cycle).toBe(0);
    expect(enraged?.cycle).toBe(1);
  });
});

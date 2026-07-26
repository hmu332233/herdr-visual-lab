# Raid Class Choreography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raid scene's uniform orbit-and-shoot motion with fixed class formations and deterministic warrior, mage, and archer combat behaviors.

**Architecture:** Keep the event fold, score projection, and server protocol unchanged. Add a pure choreography module that maps stable raider numbers to fixed formations and render time to class-specific poses, then let the canvas scene translate those poses into movement, attacks, and impact effects.

**Tech Stack:** TypeScript, Canvas 2D, Vitest, Vite

## Global Constraints

- Combat choreography is cosmetic and must not change official damage, boss health, rankings, or event folding.
- Class assignment and animation timing must be deterministic for a given unit number and render timestamp.
- Official damage progress must not alter a raider's battlefield angle or create orbital motion.
- Preserve the existing click-to-focus behavior at the raider's rendered position.
- Do not add runtime dependencies.

---

## File Structure

- Create `src/web/formats/raid/choreography.ts`: pure formation and time-to-pose calculations.
- Create `src/web/formats/raid/roles.ts`: class identity, hit damage, and official damage-rate multipliers.
- Create `tests/formats-raid-choreography.test.ts`: deterministic unit tests for class identity and class-specific movement windows.
- Create `tests/formats-raid-damage.test.ts`: class hit values and official engine damage tests.
- Modify `src/web/formats/raid/scene.ts`: apply choreography poses, schedule one attack per action cycle, and render distinct attack/impact effects.
- Modify `src/web/formats/raid/fold.ts`: apply class multipliers to official accumulated damage.
- Modify `src/web/formats/raid/view.ts`: project display speed using the same class multiplier.

### Task 1: Pure class choreography

**Files:**
- Create: `src/web/formats/raid/choreography.ts`
- Test: `tests/formats-raid-choreography.test.ts`

**Interfaces:**
- Consumes: `unitNumber: number`, `nowMs: number`
- Produces: `raiderClassOf(unitNumber): RaiderClass` and `raidActionPose(unitNumber, nowMs): RaidActionPose`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { raidActionPose, raiderClassOf } from '../src/web/formats/raid/choreography.js';

describe('raid class choreography', () => {
  it('assigns a stable three-class rotation', () => {
    expect([1, 2, 3, 4].map(raiderClassOf)).toEqual(['mage', 'archer', 'warrior', 'mage']);
  });

  it('is deterministic and repeats after the class period', () => {
    const pose = raidActionPose(3, 700);
    expect(raidActionPose(3, 700)).toEqual(pose);
    const repeated = raidActionPose(3, 700 + pose.periodMs);
    expect(repeated.phase).toBeCloseTo(pose.phase, 12);
    expect(repeated.cycle).toBe(pose.cycle + 1);
  });

  it('gives each class a distinct combat position', () => {
    const mage = raidActionPose(1, 700);
    const archer = raidActionPose(2, 225);
    const warrior = raidActionPose(3, 700);
    expect(warrior.radialOffset).toBeLessThan(-80);
    expect(archer.radialOffset).toBeGreaterThan(10);
    expect(Math.abs(mage.bob)).toBeGreaterThan(3);
  });
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run tests/formats-raid-choreography.test.ts`

Expected: FAIL because `src/web/formats/raid/choreography.ts` does not exist.

- [x] **Step 3: Implement the pure choreography module**

```ts
export const RAIDER_CLASSES = ['warrior', 'mage', 'archer'] as const;
export type RaiderClass = (typeof RAIDER_CLASSES)[number];

export interface RaidActionPose {
  kind: RaiderClass;
  cycle: number;
  periodMs: number;
  phase: number;
  radialOffset: number;
  tangentialOffset: number;
  bob: number;
  attackAnimation: number;
  canStrike: boolean;
}

const PERIODS: Record<RaiderClass, number> = { warrior: 2600, mage: 3200, archer: 1900 };
const STRIKE_PHASE: Record<RaiderClass, number> = { warrior: 0.46, mage: 0.62, archer: 0.48 };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const pulse = (from: number, peak: number, to: number, value: number) =>
  value < peak ? smoothstep(from, peak, value) : 1 - smoothstep(peak, to, value);

export function raiderClassOf(unitNumber: number): RaiderClass {
  return RAIDER_CLASSES[((unitNumber % RAIDER_CLASSES.length) + RAIDER_CLASSES.length) % RAIDER_CLASSES.length];
}

export function raidActionPose(unitNumber: number, nowMs: number): RaidActionPose {
  const kind = raiderClassOf(unitNumber);
  const periodMs = PERIODS[kind];
  const clock = Math.max(0, nowMs) + unitNumber * 173;
  const cycle = Math.floor(clock / periodMs);
  const phase = clock / periodMs - cycle;
  const strike = STRIKE_PHASE[kind];
  if (kind === 'warrior') {
    const dash = smoothstep(0.18, 0.42, phase) * (1 - smoothstep(0.62, 0.92, phase));
    return { kind, cycle, periodMs, phase, radialOffset: -52 * dash, tangentialOffset: 0,
      bob: 0, attackAnimation: pulse(0.38, strike, 0.58, phase), canStrike: phase >= strike && phase < strike + 0.14 };
  }
  if (kind === 'mage') {
    return { kind, cycle, periodMs, phase, radialOffset: -6 * Math.sin(phase * Math.PI) ** 2,
      tangentialOffset: Math.sin(phase * Math.PI * 2) * 10, bob: -5 * Math.sin(phase * Math.PI * 2),
      attackAnimation: pulse(0.12, strike, 0.76, phase), canStrike: phase >= strike && phase < strike + 0.14 };
  }
  const backstep = smoothstep(0.08, 0.38, phase) * (1 - smoothstep(0.56, 0.84, phase));
  return { kind, cycle, periodMs, phase, radialOffset: 22 * backstep,
    tangentialOffset: Math.sin(phase * Math.PI * 2) * 14, bob: 0,
    attackAnimation: phase < strike ? smoothstep(0.08, strike, phase) : 1 - smoothstep(strike, 0.58, phase),
    canStrike: phase >= strike && phase < strike + 0.14 };
}
```

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run tests/formats-raid-choreography.test.ts`

Expected: PASS with 6 tests.

### Task 2: Render class-specific actions

**Files:**
- Modify: `src/web/formats/raid/scene.ts`

**Interfaces:**
- Consumes: `raiderClassOf()` and `raidActionPose()` from Task 1
- Produces: warrior charge/slash, mage channel/orb, archer backstep/arrow, each issuing at most one visual strike per choreography cycle

- [x] **Step 1: Replace uniform orbit positions with fixed class formations and choreography offsets**

Import the choreography helpers, use `raidFormationPosition()` for each deployed raider, call `raidActionPose(entry.unitNumber, nowMs)` for active working raiders, and apply `radialOffset`, `tangentialOffset`, and `bob` around the fixed formation anchor before storing click markers.

- [x] **Step 2: Replace the shared fire interval with one strike per action cycle**

Track `lastAttackCycle: Map<string, number>`. When `pose.canStrike` is true and the stored cycle differs, update the map and dispatch by class: warrior creates an immediate rim impact and slash, mage launches a 620 ms orb, and archer launches a 280 ms arrow.

- [x] **Step 3: Render distinct anticipation and impact language**

Use `pose.attackAnimation` to drive the warrior sword swing, mage staff flare plus channel rings, and archer bow draw. Add short-lived impact bursts: a crescent for warrior, expanding arcane circles for mage, and sharp hit ticks for archer.

- [x] **Step 4: Run static and regression verification**

Run: `npm run typecheck`

Expected: exit code 0.

Run: `npm test`

Expected: all Vitest suites pass.

- [x] **Step 5: Build and inspect the raid fixture**

Run: `npm run build`

Expected: Vite and server TypeScript builds finish without errors.

Open `http://127.0.0.1:4158/?game=raid` against the `grid` fixture and confirm that warriors enter melee range, mages visibly channel before slow orbs, archers backstep before fast arrows, click focus still follows rendered markers, and camp/blocked/done states do not attack.

### Task 3: Class-specific damage

**Files:**
- Create: `src/web/formats/raid/roles.ts`
- Create: `tests/formats-raid-damage.test.ts`
- Modify: `src/web/formats/raid/fold.ts`
- Modify: `src/web/formats/raid/view.ts`
- Modify: `src/web/formats/raid/scene.ts`

**Interfaces:**
- Produces: `RAIDER_CLASS_STATS`, `raiderClassOf()`, and `raidClassStatsForUnit()`
- Applies: warrior `4` hit / `1.05×` rate, mage `6` hit / `1.25×` rate, archer `3` hit / `0.90×` rate

- [x] **Step 1: Add failing class-damage tests**

Create three otherwise identical raid states with unit numbers `3`, `1`, and `2`, advance each by one second, and assert mage damage is greater than warrior damage and warrior damage is greater than archer damage.

- [x] **Step 2: Define class statistics**

```ts
export const RAIDER_CLASS_STATS = {
  warrior: { hitDamage: 4, damageRateMultiplier: 1.05 },
  mage: { hitDamage: 6, damageRateMultiplier: 1.25 },
  archer: { hitDamage: 3, damageRateMultiplier: 0.9 },
};
```

- [x] **Step 3: Apply the multipliers to engine and presentation**

Multiply both live fold speed and finish-time simulation by `damageRateMultiplier`, then project the same factor into `displaySpeed` so deterministic replay and browser extrapolation agree.

- [x] **Step 4: Render matching hit numbers**

Use `RAIDER_CLASS_STATS[p.kind].hitDamage` when registering canvas damage numbers.

- [x] **Step 5: Verify**

Run `npm run typecheck`, `npm test`, and `npm run build`.

Expected: typecheck and build exit `0`; all 79 Vitest tests pass.

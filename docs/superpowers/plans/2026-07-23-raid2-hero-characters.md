# Raid 2 Hero Characters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a new game format named `raid2` — identical to Raid in rules, scoring, and layout, but with upgraded full-body hero character art (warrior, mage, archer) instead of the flat circle markers.

**Architecture:** The raid scene (`src/web/formats/raid/scene.ts`) already separates game logic from drawing. We extract the per-raider character drawing (weapon + body + pattern ring + headgear/crown) behind a small `RaiderStyle` interface, keep the current look as `CLASSIC_RAIDER_STYLE`, and give `raid2` a new `HERO_RAIDER_STYLE` that draws chibi full-body characters. `createRaidFormat` gains an optional style parameter; `createRaid2Format` is a one-liner that passes the hero style. Everything else — event fold, view projection, chrome, standings, boss, particles, projectiles — is shared, unchanged.

**Tech Stack:** TypeScript, Canvas 2D, Vitest, Vite. No new dependencies.

## Global Constraints

- The new format's name is exactly `raid2`, selected with the URL parameter `?game=raid2`.
- `raid2` is cosmetic only: it reuses Raid's fold, view, rules, chrome, and standings verbatim. Official damage, boss HP, rankings, and event folding must be byte-identical to Raid.
- The classic Raid (`?game=raid`) must render pixel-identically after the refactor.
- `raid2` runs at the same default tempo as Raid: `DEFAULT_GAME_SPEEDS.raid2 === 5`.
- Character rendering must be deterministic: a `RaiderStyle` may read only the fields of the `RaiderSprite` it receives (including `nowMs`). No `Math.random()`, no `Date.now()`.
- Hero characters must fit the classic marker footprint (±`RAIDER_RADIUS` = 12.5 logical px, hats up to y≈−22) so the scene's shared status rings, focus brackets, and CAMP/NEXT WAVE/RESPAWN labels still align.
- The area around the origin (roughly x ∈ [−7, 7], y ∈ [−4, 5]) must be a flat fill of the raider's team color, because the scene draws the unit number there in `contrastText(color)`.
- Style drawing code must use plain canvas calls only (no `Path2D`) so the fake-canvas test helper can exercise it.
- Do not add runtime dependencies.

---

## File Structure

- Create `tests/helpers/fake-canvas.ts`: recording stand-in for `CanvasRenderingContext2D` (methods record calls; gradients accept color stops).
- Modify `src/web/formats/raid/scene.ts`: export `RAIDER_RADIUS`, `RaiderSprite`, `RaiderStyle`, and `CLASSIC_RAIDER_STYLE`; `createRaidScene` accepts an optional style (default classic). The character-drawing block inside `drawRaider` becomes a single `style.drawCharacter(...)` call.
- Create `tests/formats-raid-style.test.ts`: smoke + determinism tests for the extracted classic style.
- Create `src/web/formats/raid2/heroes.ts`: `HERO_RAIDER_STYLE` — full-body warrior/mage/archer characters with aim-oriented, attack-animated weapons.
- Create `tests/formats-raid2-heroes.test.ts`: smoke, determinism, class-distinctness, and attack-animation tests for the hero style.
- Modify `src/web/formats/raid/index.ts`: `createRaidFormat(style?)` threads the style into `createRaidScene`.
- Create `src/web/formats/raid2/index.ts`: `createRaid2Format()` = raid format + hero style.
- Modify `src/web/main.ts`: register `raid2` in the format factory map.
- Modify `src/web/game-speed.ts`: `raid2: 5`.
- Modify `tests/game-speed.test.ts`: raid2 tempo test.
- Create `tests/formats-raid2.test.ts`: raid2 format surface / DOM-free fold smoke test.
- Modify `README.md`: document the new format and URL.

No CSS changes: `style.css` only special-cases `body[data-game='foundry']`, so `raid2` inherits the same default layout Raid uses.

---

### Task 1: Pluggable raider style in the raid scene (extract classic)

Extract the character drawing out of `drawRaider`'s closure into an exported, self-contained `CLASSIC_RAIDER_STYLE`, and let `createRaidScene` accept a style. Zero visual change for `?game=raid`.

**Files:**
- Modify: `src/web/formats/raid/scene.ts`
- Create: `tests/helpers/fake-canvas.ts`
- Test: `tests/formats-raid-style.test.ts`

**Interfaces:**
- Consumes: existing module-level constants in `scene.ts` (`RADIUS`, `STEEL`, `LEATHER`, `ARCANE`, `GOLD`, `palette`, `hexAlpha`) and `RaiderClass` from `./roles.js`.
- Produces (later tasks rely on these exact names and types, all exported from `src/web/formats/raid/scene.ts`):
  - `export const RAIDER_RADIUS = 12.5`
  - `export interface RaiderSprite { kind: RaiderClass; color: string; aim: number; attack: number; nowMs: number; fighting: boolean; crowned: boolean; unitNumber: number; patternSlot: number | null }`
  - `export interface RaiderStyle { drawCharacter(ctx: CanvasRenderingContext2D, sprite: RaiderSprite): void }`
  - `export const CLASSIC_RAIDER_STYLE: RaiderStyle`
  - `export function createRaidScene(canvas: HTMLCanvasElement, onFocus: (terminalID: string) => void, style: RaiderStyle = CLASSIC_RAIDER_STYLE)`

- [x] **Step 1: Write the fake-canvas helper and the failing test**

Create `tests/helpers/fake-canvas.ts`:

```ts
export interface RecordedCall {
  name: string;
  args: readonly unknown[];
}

/** Minimal recording stand-in for CanvasRenderingContext2D. Every method call
 *  and property assignment is appended to `calls`, so tests can assert that
 *  drawing code runs, balances save/restore, and is deterministic — without a
 *  real canvas. Gradient factories return an object accepting color stops. */
export function fakeCanvasContext(): CanvasRenderingContext2D & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const gradient = { addColorStop: () => {} };
  const target: Record<string | symbol, unknown> = {};
  return new Proxy(target, {
    get(object, property) {
      if (property === 'calls') return calls;
      if (!(property in object)) {
        object[property] = (...args: unknown[]) => {
          calls.push({ name: String(property), args });
          return property === 'createRadialGradient' || property === 'createLinearGradient'
            ? gradient
            : undefined;
        };
      }
      return object[property];
    },
    set(object, property, value) {
      calls.push({ name: `set ${String(property)}`, args: [value] });
      object[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D & { calls: RecordedCall[] };
}
```

Create `tests/formats-raid-style.test.ts`:

```ts
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
```

- [x] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/formats-raid-style.test.ts`

Expected: FAIL — `scene.ts` does not export `CLASSIC_RAIDER_STYLE` (SyntaxError: The requested module ... does not provide an export named 'CLASSIC_RAIDER_STYLE').

- [x] **Step 3: Refactor `src/web/formats/raid/scene.ts`**

3a. Replace the `RADIUS` constant (line ~21) with an exported name plus a local alias, and add the style types right below the constants block (after the `GOLD` constant):

```ts
export const RAIDER_RADIUS = 12.5;
const RADIUS = RAIDER_RADIUS;
```

```ts
/** Everything a character renderer needs; the scene derives it per frame. */
export interface RaiderSprite {
  kind: RaiderClass;
  /** Resolved team color (already mapped from the entry's color token). */
  color: string;
  /** Radians from the raider toward the boss. */
  aim: number;
  /** 0..1 attack animation envelope from the current pose (0 when idle). */
  attack: number;
  nowMs: number;
  /** True when deployed on the battlefield (weapons out). */
  fighting: boolean;
  /** Victors trade class headgear for a crown. */
  crowned: boolean;
  unitNumber: number;
  /** Dash-pattern slot for color-blind identity, or null for plain colors. */
  patternSlot: number | null;
}

export interface RaiderStyle {
  /** Draw one character origin-centered. The scene has already translated to
   *  the raider's position and applied lunge/recoil offsets. Characters must
   *  fit the ±RAIDER_RADIUS footprint so shared rings and labels align, and
   *  keep the origin area flat team color for the unit number overlay. */
  drawCharacter(ctx: CanvasRenderingContext2D, sprite: RaiderSprite): void;
}
```

3b. Change the `createRaidScene` signature:

```ts
export function createRaidScene(
  canvas: HTMLCanvasElement,
  onFocus: (terminalID: string) => void,
  style: RaiderStyle = CLASSIC_RAIDER_STYLE,
) {
```

3c. Inside `drawRaider`, replace this block (currently lines ~882–902):

```ts
    // Weapon first so its grip tucks behind the body.
    if (fighting) drawWeapon(kind, aim, attack);

    ctx.beginPath();
    ctx.arc(0, 0, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.canvas;
    ctx.stroke();

    if (entry.colorToken.kind === 'pattern') {
      const dashes = [[3, 3], [7, 3], []][entry.colorToken.slot % 3];
      ctx.setLineDash(dashes);
      ring(RADIUS + 1, '#FFFFFF', 1.2);
      ctx.setLineDash([]);
    }

    // Headgear names the class at a glance; victors trade it for a crown.
    if (!entry.isQueued && entry.status === 'done') drawCrown();
    else drawHeadgear(kind);
```

with:

```ts
    style.drawCharacter(ctx, {
      kind,
      color,
      aim,
      attack,
      nowMs,
      fighting,
      crowned: !entry.isQueued && entry.status === 'done',
      unitNumber: entry.unitNumber,
      patternSlot: entry.colorToken.kind === 'pattern' ? entry.colorToken.slot : null,
    });
```

3d. Delete the closure functions `drawWeapon`, `drawHeadgear`, and `drawCrown` from inside `createRaidScene`, and add the classic style at module level (place it after `createRaidScene`, before `hpColor`). The three helpers are the same code with `ctx` passed in:

```ts
export const CLASSIC_RAIDER_STYLE: RaiderStyle = {
  drawCharacter(ctx, sprite) {
    // Weapon first so its grip tucks behind the body.
    if (sprite.fighting) drawClassicWeapon(ctx, sprite.kind, sprite.aim, sprite.attack);

    ctx.beginPath();
    ctx.arc(0, 0, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = sprite.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.canvas;
    ctx.stroke();

    if (sprite.patternSlot !== null) {
      const dashes = [[3, 3], [7, 3], []][sprite.patternSlot % 3];
      ctx.setLineDash(dashes);
      ctx.beginPath();
      ctx.arc(0, 0, RADIUS + 1, 0, Math.PI * 2);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Headgear names the class at a glance; victors trade it for a crown.
    if (sprite.crowned) drawClassicCrown(ctx);
    else drawClassicHeadgear(ctx, sprite.kind);
  },
};

function drawClassicWeapon(
  ctx: CanvasRenderingContext2D,
  kind: RaiderClass,
  aim: number,
  attack: number,
): void {
  ctx.save();
  switch (kind) {
    case 'warrior': {
      // Sword rests raised beside the shoulder and slashes through the aim
      // line on each attack.
      ctx.rotate(aim + 0.55 - attack * 0.9);
      ctx.fillStyle = STEEL;
      ctx.beginPath();
      ctx.roundRect(RADIUS - 1, -1.4, 12, 2.8, 1.2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(RADIUS + 11, -1.4);
      ctx.lineTo(RADIUS + 14, 0);
      ctx.lineTo(RADIUS + 11, 1.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = LEATHER;
      ctx.fillRect(RADIUS + 0.5, -3.5, 2, 7);
      break;
    }
    case 'mage': {
      // Staff aimed at the boss; the tip orb flares on each cast.
      ctx.rotate(aim);
      ctx.strokeStyle = LEATHER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(RADIUS - 2, 0); ctx.lineTo(RADIUS + 9, 0);
      ctx.stroke();
      const orbR = 2.6 + attack * 1.6;
      ctx.fillStyle = hexAlpha(ARCANE, 0.35);
      ctx.beginPath();
      ctx.arc(RADIUS + 11, 0, orbR + 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ARCANE;
      ctx.beginPath();
      ctx.arc(RADIUS + 11, 0, orbR, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'archer': {
      // Bow held toward the boss; the string snaps taut on release.
      ctx.rotate(aim);
      const bowX = RADIUS + 5;
      ctx.strokeStyle = LEATHER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bowX - 2, 0, 7, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.stroke();
      const tipY = Math.sin(Math.PI * 0.42) * 7;
      const pull = 4 * attack;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(bowX - 2 + Math.cos(Math.PI * 0.42) * 7, -tipY);
      ctx.lineTo(bowX - 2 - pull, 0);
      ctx.lineTo(bowX - 2 + Math.cos(Math.PI * 0.42) * 7, tipY);
      ctx.stroke();
      if (attack > 0.4) {
        ctx.strokeStyle = STEEL;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bowX - 3, 0); ctx.lineTo(bowX + 6, 0);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

function drawClassicHeadgear(ctx: CanvasRenderingContext2D, kind: RaiderClass): void {
  switch (kind) {
    case 'warrior':
      ctx.strokeStyle = STEEL;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, RADIUS + 1, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();
      break;
    case 'mage':
      ctx.fillStyle = ARCANE;
      ctx.strokeStyle = palette.canvas;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-8, -RADIUS + 3);
      ctx.lineTo(8, -RADIUS + 3);
      ctx.lineTo(1.5, -RADIUS - 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'archer':
      ctx.strokeStyle = LEATHER;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, RADIUS + 1, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();
      ctx.strokeStyle = '#7ED957';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(6, -RADIUS - 2);
      ctx.lineTo(10, -RADIUS - 7);
      ctx.stroke();
      break;
  }
}

function drawClassicCrown(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = GOLD;
  ctx.strokeStyle = palette.canvas;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-7, -RADIUS - 1);
  ctx.lineTo(-7, -RADIUS - 8);
  ctx.lineTo(-3.5, -RADIUS - 4);
  ctx.lineTo(0, -RADIUS - 9);
  ctx.lineTo(3.5, -RADIUS - 4);
  ctx.lineTo(7, -RADIUS - 8);
  ctx.lineTo(7, -RADIUS - 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
```

Notes for the implementer:
- The pattern ring in the extracted style draws the dashed circle inline instead of calling the scene-closure `ring()` helper — same arc, same color, same width, so output is identical. Keep the `ring()` closure in `createRaidScene`; the status rings still use it.
- `RaiderClass` is already imported in `scene.ts` (`import { RAIDER_CLASS_STATS, raiderClassOf, type RaiderClass } from './roles.js'`). The constants `STEEL`, `LEATHER`, `ARCANE`, `GOLD`, `RADIUS`, `palette`, and `hexAlpha` are already at module scope.
- `drawRaider` keeps everything else: focus brackets, queued alpha, `drawMageChannel`, status rings, unit number text, CAMP/NEXT WAVE/RESPAWN labels, stun stars, and sleep z's.

- [x] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/formats-raid-style.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Run the full suite and typecheck to prove no regression**

Run: `npx vitest run && npm run typecheck`
Expected: all existing tests PASS, `tsc --noEmit` clean.

- [x] **Step 6: Commit**

```bash
git add src/web/formats/raid/scene.ts tests/helpers/fake-canvas.ts tests/formats-raid-style.test.ts
git commit -m "refactor: extract pluggable raider character style from raid scene"
```

---

### Task 2: Hero character style

Full-body chibi characters: an armored warrior with sword, shield, and plumed helmet; a robed mage with wizard hat and glowing staff crystal; a hooded archer with quiver and drawn bow. All origin-centered, aim-oriented, animated by the pose's `attack` envelope, deterministic.

**Files:**
- Create: `src/web/formats/raid2/heroes.ts`
- Test: `tests/formats-raid2-heroes.test.ts`

**Interfaces:**
- Consumes (from Task 1, all exported by `src/web/formats/raid/scene.ts`): `RAIDER_RADIUS: number`, `RaiderSprite`, `RaiderStyle`. Also `hexAlpha(hex: string, alpha: number): string` and `palette` from `src/web/palette.ts`, and `RAIDER_CLASSES` from `src/web/formats/raid/roles.ts` (test only).
- Produces: `export const HERO_RAIDER_STYLE: RaiderStyle` from `src/web/formats/raid2/heroes.ts` (Task 3 imports exactly this name).

- [x] **Step 1: Write the failing test**

Create `tests/formats-raid2-heroes.test.ts`:

```ts
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
```

- [x] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/formats-raid2-heroes.test.ts`
Expected: FAIL — cannot find module `../src/web/formats/raid2/heroes.js`.

- [x] **Step 3: Implement `src/web/formats/raid2/heroes.ts`**

Complete file content:

```ts
import { hexAlpha, palette } from '../../palette.js';
import { RAIDER_RADIUS, type RaiderSprite, type RaiderStyle } from '../raid/scene.js';

// Heroes keep the classic marker footprint so the scene's status rings, focus
// brackets, and labels drawn around ±RAIDER_RADIUS still fit.
const R = RAIDER_RADIUS;

const SKIN = '#F1C27D';
const STEEL_LIGHT = '#E6ECF5';
const STEEL = '#AAB4C4';
const STEEL_DARK = '#5F6B7E';
const LEATHER = '#8A6B4A';
const LEATHER_DARK = '#5B4227';
const HOOD_GREEN = '#4E7A3C';
const FEATHER = '#7ED957';
const ARCANE = '#8F86FF';
const ARCANE_DEEP = '#4C3E9E';
const GOLD = '#FFD500';
const PLUME = '#E3413E';

/** Full-body chibi heroes for Raid 2. The chest stays a flat team-color block
 *  around the origin so the scene's unit number overlay remains legible. */
export const HERO_RAIDER_STYLE: RaiderStyle = {
  drawCharacter(ctx, sprite) {
    ctx.save();
    drawShadow(ctx);
    // Subtle idle bob keeps fighters alive; campers stand still.
    if (sprite.fighting) {
      ctx.translate(0, Math.sin(sprite.nowMs / 320 + sprite.unitNumber * 1.3) * 0.8);
    }
    switch (sprite.kind) {
      case 'warrior': drawWarrior(ctx, sprite); break;
      case 'mage': drawMage(ctx, sprite); break;
      case 'archer': drawArcher(ctx, sprite); break;
    }
    if (sprite.patternSlot !== null) drawPatternBelt(ctx, sprite.patternSlot);
    if (sprite.crowned) drawCrown(ctx);
    ctx.restore();
  },
};

function outline(ctx: CanvasRenderingContext2D): void {
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = palette.canvas;
  ctx.stroke();
}

function drawShadow(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, R * 0.95, R * 0.95, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Boots, torso, belt, and head shared by warrior and archer. The torso is a
 *  flat team-color block over the origin for the unit number. */
function drawBase(ctx: CanvasRenderingContext2D, sprite: RaiderSprite): void {
  ctx.fillStyle = LEATHER_DARK;
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.roundRect(side * 4 - 2.6, 8.2, 5.2, 4, 2);
    ctx.fill();
  }
  ctx.fillStyle = sprite.color;
  ctx.beginPath();
  ctx.roundRect(-8.5, -5.5, 17, 16, 5);
  ctx.fill();
  outline(ctx);
  // Waist belt with a buckle grounds the silhouette.
  ctx.fillStyle = LEATHER_DARK;
  ctx.fillRect(-8.5, 6.2, 17, 2.2);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-1.4, 6, 2.8, 2.6);
  drawHead(ctx, sprite);
}

function drawHead(ctx: CanvasRenderingContext2D, sprite: RaiderSprite): void {
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(0, -10.5, 4.6, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx);
  // Eyes glance toward the boss.
  const look = Math.cos(sprite.aim) * 1.1;
  ctx.fillStyle = palette.canvas;
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.arc(side * 1.9 + look, -11, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

// MARK: - Warrior

function drawWarrior(ctx: CanvasRenderingContext2D, sprite: RaiderSprite): void {
  if (sprite.fighting) drawShield(ctx, sprite.aim);
  drawBase(ctx, sprite);
  // Steel pauldrons over the shoulders.
  ctx.fillStyle = STEEL;
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.arc(side * 7.5, -3.5, 3.4, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx);
  }
  if (!sprite.crowned) drawHelmet(ctx);
  if (sprite.fighting) drawSword(ctx, sprite.aim, sprite.attack);
}

function drawShield(ctx: CanvasRenderingContext2D, aim: number): void {
  ctx.save();
  // Kite shield tucked behind the off-hand shoulder.
  ctx.rotate(aim + Math.PI * 0.72);
  ctx.translate(9.5, 0);
  ctx.fillStyle = STEEL_DARK;
  ctx.beginPath();
  ctx.moveTo(0, -5.5);
  ctx.quadraticCurveTo(4.6, -3, 0, 6.5);
  ctx.quadraticCurveTo(-4.6, -3, 0, -5.5);
  ctx.closePath();
  ctx.fill();
  outline(ctx);
  ctx.strokeStyle = STEEL_LIGHT;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -3.5);
  ctx.lineTo(0, 4);
  ctx.stroke();
  ctx.restore();
}

function drawHelmet(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = STEEL;
  ctx.beginPath();
  ctx.arc(0, -10.5, 5.4, Math.PI * 0.98, Math.PI * 2.02);
  ctx.quadraticCurveTo(0, -8.4, -5.4, -10.3);
  ctx.closePath();
  ctx.fill();
  outline(ctx);
  // Nose guard and crest plume.
  ctx.fillStyle = STEEL;
  ctx.fillRect(-0.9, -11, 1.8, 4.6);
  ctx.strokeStyle = PLUME;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.quadraticCurveTo(-3.5, -19.5, -7, -17.5);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawSword(ctx: CanvasRenderingContext2D, aim: number, attack: number): void {
  ctx.save();
  // Raised beside the shoulder, slashing through the aim line on each strike.
  ctx.rotate(aim + 0.6 - attack * 1.2);
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(7.5, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = LEATHER;
  ctx.fillRect(8.2, -1.1, 3.2, 2.2);
  ctx.fillStyle = GOLD;
  ctx.fillRect(11.2, -3, 1.6, 6);
  ctx.fillStyle = STEEL_LIGHT;
  ctx.beginPath();
  ctx.moveTo(12.8, -1.7);
  ctx.lineTo(21.5, -1.7);
  ctx.lineTo(24.5, 0);
  ctx.lineTo(21.5, 1.7);
  ctx.lineTo(12.8, 1.7);
  ctx.closePath();
  ctx.fill();
  outline(ctx);
  // Fuller line down the blade.
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(13.2, 0);
  ctx.lineTo(22.8, 0);
  ctx.stroke();
  ctx.restore();
}

// MARK: - Mage

function drawMage(ctx: CanvasRenderingContext2D, sprite: RaiderSprite): void {
  drawRobe(ctx, sprite);
  drawHead(ctx, sprite);
  if (!sprite.crowned) drawWizardHat(ctx, sprite.color);
  if (sprite.fighting) drawStaff(ctx, sprite);
}

function drawRobe(ctx: CanvasRenderingContext2D, sprite: RaiderSprite): void {
  ctx.fillStyle = sprite.color;
  ctx.beginPath();
  ctx.moveTo(-4.5, -6.5);
  ctx.quadraticCurveTo(-9.5, 2, -9, 10.5);
  ctx.lineTo(9, 10.5);
  ctx.quadraticCurveTo(9.5, 2, 4.5, -6.5);
  ctx.closePath();
  ctx.fill();
  outline(ctx);
  // Hem trim: the mage reads as robed even at marker size.
  ctx.strokeStyle = ARCANE_DEEP;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8.6, 9.2);
  ctx.lineTo(8.6, 9.2);
  ctx.stroke();
}

function drawWizardHat(ctx: CanvasRenderingContext2D, band: string): void {
  ctx.fillStyle = ARCANE_DEEP;
  ctx.beginPath();
  ctx.ellipse(0, -13.4, 7.6, 2.3, 0, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx);
  // Bent cone with a team-color band and a gold star.
  ctx.fillStyle = ARCANE_DEEP;
  ctx.beginPath();
  ctx.moveTo(-4.4, -14);
  ctx.quadraticCurveTo(-1.5, -21.5, 2.6, -22.5);
  ctx.quadraticCurveTo(1.8, -18.5, 4.2, -14);
  ctx.closePath();
  ctx.fill();
  outline(ctx);
  ctx.fillStyle = band;
  ctx.fillRect(-4.2, -15.6, 8.4, 1.9);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(1.8, -19.5, 1.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawStaff(ctx: CanvasRenderingContext2D, sprite: RaiderSprite): void {
  ctx.save();
  ctx.rotate(sprite.aim);
  ctx.strokeStyle = LEATHER;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(3, 0);
  ctx.lineTo(15.5, 0);
  ctx.stroke();
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(6.5, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  // Crystal flares with the cast and trails two orbiting motes.
  const power = sprite.attack;
  ctx.fillStyle = hexAlpha(ARCANE, 0.3);
  ctx.beginPath();
  ctx.arc(17.5, 0, 3.4 + power * 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ARCANE;
  ctx.beginPath();
  ctx.moveTo(17.5, -3 - power * 1.6);
  ctx.lineTo(20 + power * 1.6, 0);
  ctx.lineTo(17.5, 3 + power * 1.6);
  ctx.lineTo(15 - power * 1.6, 0);
  ctx.closePath();
  ctx.fill();
  outline(ctx);
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(17.5, 0, 1 + power * 0.6, 0, Math.PI * 2);
  ctx.fill();
  for (let mote = 0; mote < 2; mote += 1) {
    const angle = sprite.nowMs / 260 + mote * Math.PI;
    ctx.fillStyle = hexAlpha('#FFFFFF', 0.35 + power * 0.5);
    ctx.beginPath();
    ctx.arc(17.5 + Math.cos(angle) * 5.2, Math.sin(angle) * 5.2, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// MARK: - Archer

function drawArcher(ctx: CanvasRenderingContext2D, sprite: RaiderSprite): void {
  drawQuiver(ctx);
  drawBase(ctx, sprite);
  // Leather chest strap for the quiver.
  ctx.strokeStyle = LEATHER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6.5, -4.5);
  ctx.lineTo(7, 4);
  ctx.stroke();
  if (!sprite.crowned) drawHood(ctx);
  if (sprite.fighting) drawBow(ctx, sprite.aim, sprite.attack);
}

function drawQuiver(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(8, -6);
  ctx.rotate(0.5);
  ctx.fillStyle = LEATHER_DARK;
  ctx.beginPath();
  ctx.roundRect(-2.2, -3, 4.4, 9, 2);
  ctx.fill();
  outline(ctx);
  // Fletchings peeking over the shoulder.
  ctx.strokeStyle = FEATHER;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const dx of [-1.2, 0.6] as const) {
    ctx.moveTo(dx, -3.5);
    ctx.lineTo(dx + 1, -6.5);
  }
  ctx.stroke();
  ctx.restore();
}

function drawHood(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = HOOD_GREEN;
  ctx.beginPath();
  ctx.moveTo(-5.4, -9.2);
  ctx.quadraticCurveTo(-6.2, -16.4, 0, -16.2);
  ctx.quadraticCurveTo(7.8, -16, 5.4, -9.2);
  ctx.quadraticCurveTo(4.6, -11.8, 0, -12);
  ctx.quadraticCurveTo(-4.6, -11.8, -5.4, -9.2);
  ctx.closePath();
  ctx.fill();
  outline(ctx);
  ctx.strokeStyle = FEATHER;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(4.6, -14.5);
  ctx.lineTo(8.4, -19);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawBow(ctx: CanvasRenderingContext2D, aim: number, attack: number): void {
  ctx.save();
  ctx.rotate(aim);
  const grip = 13;
  ctx.strokeStyle = LEATHER;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(grip - 2, 0, 8.5, -Math.PI * 0.44, Math.PI * 0.44);
  ctx.stroke();
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(grip + 5.5, 0, 1.9, 0, Math.PI * 2);
  ctx.fill();
  // String pulled back with the draw, nocked arrow past mid-draw.
  const tipX = grip - 2 + Math.cos(Math.PI * 0.44) * 8.5;
  const tipY = Math.sin(Math.PI * 0.44) * 8.5;
  const pull = 5.5 * attack;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tipX, -tipY);
  ctx.lineTo(grip - 2 - pull, 0);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  if (attack > 0.25) {
    ctx.strokeStyle = STEEL_LIGHT;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(grip - 2 - pull, 0);
    ctx.lineTo(grip + 6.5, 0);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(grip + 8.5, 0);
    ctx.lineTo(grip + 5.5, -1.7);
    ctx.lineTo(grip + 5.5, 1.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// MARK: - Shared identity extras

/** Pattern color tokens keep their dash identity as a white stripe on the
 *  belt line — same dash table as the classic ring. */
function drawPatternBelt(ctx: CanvasRenderingContext2D, slot: number): void {
  const dashes = [[3, 3], [7, 3], []][slot % 3];
  ctx.save();
  ctx.setLineDash(dashes);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-8.5, 7.3);
  ctx.lineTo(8.5, 7.3);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawCrown(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = GOLD;
  ctx.strokeStyle = palette.canvas;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-5.5, -14);
  ctx.lineTo(-5.5, -20);
  ctx.lineTo(-2.7, -16.5);
  ctx.lineTo(0, -21);
  ctx.lineTo(2.7, -16.5);
  ctx.lineTo(5.5, -20);
  ctx.lineTo(5.5, -14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
```

- [x] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/formats-raid2-heroes.test.ts && npm run typecheck`
Expected: PASS (5 tests), typecheck clean.

- [x] **Step 5: Commit**

```bash
git add src/web/formats/raid2/heroes.ts tests/formats-raid2-heroes.test.ts
git commit -m "feat: add raid2 hero character style"
```

---

### Task 3: Wire up the raid2 format

Thread the style through `createRaidFormat`, add `createRaid2Format`, register `raid2` in the browser factory map and the game-speed table.

**Files:**
- Modify: `src/web/formats/raid/index.ts`
- Create: `src/web/formats/raid2/index.ts`
- Modify: `src/web/main.ts:3-9`
- Modify: `src/web/game-speed.ts:3-7`
- Test: `tests/game-speed.test.ts`, create `tests/formats-raid2.test.ts`

**Interfaces:**
- Consumes: `HERO_RAIDER_STYLE` (Task 2), `CLASSIC_RAIDER_STYLE`, `RaiderStyle`, `createRaidScene(canvas, onFocus, style)` (Task 1), `GameFormat` from `src/web/format.ts`, event helpers `eventHistory/teamJoined/unitJoined/snapshotApplied/connectionChanged` from `tests/helpers/events.ts`.
- Produces: `export function createRaid2Format(): GameFormat` from `src/web/formats/raid2/index.ts`; `createRaidFormat(style: RaiderStyle = CLASSIC_RAIDER_STYLE): GameFormat` (existing callers stay valid); `DEFAULT_GAME_SPEEDS.raid2 === 5`.

- [x] **Step 1: Write the failing tests**

Append to `tests/game-speed.test.ts` inside `describe('game speed', ...)`:

```ts
  it('runs Raid 2 at the same 5x tempo as Raid', () => {
    expect(DEFAULT_GAME_SPEEDS.raid2).toBe(5);
    expect(applyGameSpeed(message, 'raid2')).toEqual(applyGameSpeed(message, 'raid'));
  });
```

Create `tests/formats-raid2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRaid2Format } from '../src/web/formats/raid2/index.js';
import {
  connectionChanged,
  eventHistory,
  snapshotApplied,
  teamJoined,
  unitJoined,
} from './helpers/events.js';

describe('raid2 format', () => {
  it('exposes the GameFormat surface and folds events without a DOM', () => {
    const format = createRaid2Format();
    format.onEvents(
      eventHistory(
        [0, teamJoined()],
        [0, unitJoined()],
        [0, snapshotApplied()],
        [0, connectionChanged({ kind: 'live' })],
      ),
      true,
    );
    format.onTimeline({ timelineTime: 10, timelineRate: 1 });
    expect(typeof format.createChrome).toBe('function');
    expect(typeof format.createStandings).toBe('function');
    expect(typeof format.createScene).toBe('function');
  });
});
```

- [x] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/game-speed.test.ts tests/formats-raid2.test.ts`
Expected: FAIL — `DEFAULT_GAME_SPEEDS.raid2` is `undefined`, and `../src/web/formats/raid2/index.js` does not exist.

- [x] **Step 3: Implement the wiring**

3a. `src/web/game-speed.ts` — add one entry (Raid 2 shares Raid's tempo):

```ts
export const DEFAULT_GAME_SPEEDS: Readonly<Record<string, number>> = {
  f1: 1,
  raid: 5,
  raid2: 5,
  foundry: 1,
};
```

3b. `src/web/formats/raid/index.ts` — full new file content (keeps the file's existing compact style; only the scene import and `createRaidFormat` signature change):

```ts
import type { GameEvent } from '../../../shared/events.js';import type { TimelineCursor } from '../../../shared/protocol.js';import type { GameFormat } from '../../format.js';import { createChrome } from './chrome.js';import { createStandingsPanel } from './standings.js';import { CLASSIC_RAIDER_STYLE,createRaidScene,type RaiderStyle } from './scene.js';import { foldRaid,initialRaidState,setRaidCursor } from './fold.js';import { projectRaid } from './view.js';
export function createRaidStateOwner(){let state=initialRaidState();return{onEvents(events:readonly GameEvent[],reset:boolean){if(reset)state=initialRaidState();for(const event of events)foldRaid(state,event);},onTimeline(cursor:TimelineCursor){setRaidCursor(state,cursor);},view:()=>projectRaid(state)};}
export function createRaidFormat(style:RaiderStyle=CLASSIC_RAIDER_STYLE):GameFormat{const owner=createRaidStateOwner();return{onEvents:owner.onEvents,onTimeline:owner.onTimeline,createChrome(){const c=createChrome();return{render:()=>c.render(owner.view())};},createStandings(el,onFocus){const c=createStandingsPanel(el,onFocus);return{render:()=>c.render(owner.view())};},createScene(canvas,onFocus){const c=createRaidScene(canvas,onFocus,style);return{commit:(at)=>c.setSync(owner.view(),at),frame:c.frame,resize:c.resize};}};}
```

3c. Create `src/web/formats/raid2/index.ts`:

```ts
import type { GameFormat } from '../../format.js';
import { createRaidFormat } from '../raid/index.js';
import { HERO_RAIDER_STYLE } from './heroes.js';

/** Raid 2: identical rules, fold, chrome, and standings to Raid — only the
 *  character art is upgraded to full-body hero sprites. */
export function createRaid2Format(): GameFormat {
  return createRaidFormat(HERO_RAIDER_STYLE);
}
```

3d. `src/web/main.ts` — add the import after line 4 and the factory entry on line 9:

```ts
import { createRaid2Format } from './formats/raid2/index.js';
```

```ts
const factories:Record<string,()=>GameFormat>={f1:createF1Format,raid:createRaidFormat,raid2:createRaid2Format,foundry:createFoundryFormat};
```

Note: `factories.raid` stores `createRaidFormat` directly; the factory map calls it with zero arguments, so the new optional parameter defaults to `CLASSIC_RAIDER_STYLE` and classic Raid is unchanged. `main.ts` also sets `document.body.dataset.game='raid2'`; `style.css` has no `raid`-specific selectors, so `raid2` inherits the same default layout.

- [x] **Step 4: Run the tests and verify they pass, then the full suite**

Run: `npx vitest run tests/game-speed.test.ts tests/formats-raid2.test.ts`
Expected: PASS.

Run: `npx vitest run && npm run typecheck`
Expected: all tests PASS, typecheck clean.

- [x] **Step 5: Commit**

```bash
git add src/web/formats/raid/index.ts src/web/formats/raid2/index.ts src/web/main.ts src/web/game-speed.ts tests/game-speed.test.ts tests/formats-raid2.test.ts
git commit -m "feat: register raid2 format with hero character art"
```

---

### Task 4: Documentation and visual verification

**Files:**
- Modify: `README.md:102-122` (게임 포맷 선택 section)

**Interfaces:**
- Consumes: the running `raid2` format from Task 3.
- Produces: user-facing docs; a manually verified scene.

- [x] **Step 1: Update the README game table and URL examples**

In the table under `## 게임 포맷 선택 (?game=)` (README.md:112-114), add a row after the Raid row:

```markdown
| Raid 2 | `?game=raid2` | Raid과 규칙·점수 동일, 캐릭터를 전신 히어로 스프라이트(전사·마법사·궁수)로 업그레이드한 비주얼 버전 |
```

In the URL example block (README.md:120-122), add after the Raid line:

```
http://localhost:4158/?game=raid2   # Raid 2 (hero characters)
```

In the `--speed` help note (README.md:87), change:

```
                  F1 기본 속도는 1, Raid 기본 속도는 5
```

to:

```
                  F1 기본 속도는 1, Raid/Raid 2 기본 속도는 5
```

- [x] **Step 2: Visually verify the hero scene against a fixture**

Terminal 1: `npm run dev:server -- --fixture grid`
Terminal 2: `npm run dev:web`

Open `http://localhost:5173/?game=raid2` and check:
- Warriors (helmet + sword + shield), mages (hat + robe + staff), archers (hood + bow + quiver) are visually distinct and face the boss.
- Unit numbers are legible on each chest; clicking a hero still focuses it.
- Attack animations fire (sword slash, staff flare, bow draw) and damage numbers/impacts land as before.
- Open `http://localhost:5173/?game=raid` and confirm classic Raid looks unchanged.
- Try the `podium` fixture (`npm run dev:server -- --fixture podium`) to see crowned (done) heroes and the BOSS DOWN panel.

Expected: both games render correctly; no console errors.

- [x] **Step 3: Commit**

```bash
git add README.md docs/superpowers/plans/2026-07-23-raid2-hero-characters.md
git commit -m "docs: document the raid2 hero-character format"
```

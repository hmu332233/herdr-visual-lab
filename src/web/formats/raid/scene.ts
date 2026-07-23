import type { RaidView as SyncMessage } from './view.js';
import type { EntryPresentation } from '../../presentation.js';
import { contrastText, hexAlpha, palette, teamColor } from '../../palette.js';
import { bossHpFraction } from './vocabulary.js';
import { RaidRules } from './rules.js';
import {
  raidActionPose,
  raidBasicAttackPose,
  raidFormationPosition,
  type RaidActionPose,
} from './choreography.js';
import {
  RAIDER_CLASS_STATS,
  raiderClassOf,
  type RaiderClass,
} from './roles.js';

// Fixed logical scene, aspect-fitted into the canvas (mirrors the F1 scene).
const SCENE_W = 620;
const SCENE_H = 540;
export const RAIDER_RADIUS = 12.5;
const RADIUS = RAIDER_RADIUS;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

// Boss anchor and the fixed class formations around it.
const BOSS = { x: SCENE_W / 2, y: SCENE_H * 0.44 };
const BOSS_R = 46;
// Bottom band: camp (resting) on the left, NEXT WAVE bench on the right.
const CAMP_Y = SCENE_H * 0.88;
const CAMP_X = SCENE_W * 0.30;
const BENCH_X = SCENE_W * 0.72;

const MAX_PROJECTILES = 120;
// Low ceiling on concurrent damage numbers: past this, extra hits still spark
// but stop stacking "-1"s into an unreadable wall around the boss.
const MAX_HITS = 26;
const MAX_SPARKS = 90;
const MAX_EMBERS = 40;
const MAX_IMPACTS = 40;
const HIT_FLASH_MS = 130;
const ENRAGE_HP = 0.2;

const STEEL = '#C6CEDA';
const LEATHER = '#8A6B4A';
const ARCANE = '#8F86FF';
const BONE = '#D9D2C5';
const GOLD = '#FFD500';

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

interface AttackImpact {
  x: number; y: number; ex: number; ey: number;
  bornAt: number; color: string; kind: RaiderClass; style: RaidActionPose['style'];
}
interface Projectile extends AttackImpact { life: number; curve: number }
interface DamageNumber { x: number; y: number; angle: number; bornAt: number; amount: number }
interface Spark { x: number; y: number; angle: number; speed: number; bornAt: number; life: number; color: string }
interface Ember { x: number; y: number; bornAt: number; life: number; seed: number }
interface ImpactBurst {
  x: number; y: number; angle: number; bornAt: number; life: number;
  color: string; kind: RaiderClass; style: RaidActionPose['style'];
}
interface RaiderMarker { id: string; x: number; y: number; pose: RaidActionPose | null }

/** Deterministic [0, 1) hash so ambient effects need no RNG state. */
function rand01(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function createRaidScene(
  canvas: HTMLCanvasElement,
  onFocus: (terminalID: string) => void,
  style: RaiderStyle = CLASSIC_RAIDER_STYLE,
) {
  const ctx = canvas.getContext('2d')!;
  let sync: SyncMessage | null = null;

  let dpr = 1;
  let sceneScale = 1;
  let offsetX = 0;
  let offsetY = 0;

  const projectiles: Projectile[] = [];
  const damageNumbers: DamageNumber[] = [];
  const sparks: Spark[] = [];
  const embers: Ember[] = [];
  const impactBursts: ImpactBurst[] = [];
  const lastAttackToken = new Map<string, string>();
  let bossHitAt = -Infinity;
  let lastEmberAt = 0;
  let markers: RaiderMarker[] = [];

  resize();
  canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - offsetX) / sceneScale;
    const y = (event.clientY - rect.top - offsetY) / sceneScale;
    let best: { id: string; d: number } | null = null;
    for (const marker of markers) {
      const d = Math.hypot(marker.x - x, marker.y - y);
      if (d <= RADIUS + 4 && (best === null || d < best.d)) best = { id: marker.id, d };
    }
    if (best) onFocus(best.id);
  });

  function setSync(nextSync: SyncMessage, _receivedAtMs: number): void {
    sync = nextSync;
  }

  function resize(): void {
    const parent = canvas.parentElement!;
    const cssWidth = Math.max(1, parent.clientWidth);
    const cssHeight = Math.max(1, parent.clientHeight);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    sceneScale = Math.min(cssWidth / SCENE_W, cssHeight / SCENE_H);
    offsetX = (cssWidth - SCENE_W * sceneScale) / 2;
    offsetY = (cssHeight - SCENE_H * sceneScale) / 2;
  }

  function frame(nowMs: number): void {
    const currentSync = sync;
    if (!currentSync) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * sceneScale, 0, 0, dpr * sceneScale, dpr * offsetX, dpr * offsetY);

    drawBackdrop();
    const hp = bossHpFraction(currentSync.leaderProgress);
    drawBoss(nowMs, hp);
    updateAndDrawEmbers(nowMs, hp);
    drawCampAndBench(nowMs);

    const entries = currentSync.teams.flatMap(team => team.entries);
    const deployed = entries.filter(entry => onBattlefield(entry));
    const deployedUnitNumbers = deployed.map(entry => entry.unitNumber);

    markers = [];
    entries.forEach(entry => {
      if (entry.placement.kind === 'departed') return;
      const marker = positionOf(entry, deployedUnitNumbers, nowMs);
      maybeAttack(entry, marker, nowMs);
      markers.push({ id: entry.id, ...marker });
    });

    updateAndDrawProjectiles(nowMs);
    updateAndDrawImpacts(nowMs);
    updateAndDrawSparks(nowMs);
    updateAndDrawDamageNumbers(nowMs);

    // Markers drawn last so they sit above projectiles.
    for (const entry of entries) {
      if (entry.placement.kind === 'departed') continue;
      const marker = markers.find(m => m.id === entry.id)!;
      drawRaider(entry, marker.x, marker.y, marker.pose, nowMs);
    }
  }

  // MARK: - Positioning

  function onBattlefield(entry: EntryPresentation): boolean {
    const kind = entry.placement.kind;
    return kind === 'active' || kind === 'coolingDown' || kind === 'blockedActive';
  }

  function positionOf(
    entry: EntryPresentation,
    deployedUnitNumbers: readonly number[],
    nowMs: number,
  ): Omit<RaiderMarker, 'id'> {
    if (onBattlefield(entry)) {
      // Raiders hold a deterministic class formation. Only their attack pose
      // moves them, so official damage progress never turns into circular motion.
      const formation = raidFormationPosition(entry.unitNumber, deployedUnitNumbers);
      const pose = entry.displaySpeed <= 0
        ? null
        : entry.status === 'working'
          ? raidActionPose(entry.unitNumber, nowMs)
          : entry.status === 'done'
            ? raidBasicAttackPose(entry.unitNumber, nowMs)
            : null;
      const radial = formation.radius + (pose?.radialOffset ?? 0);
      const tangent = pose?.tangentialOffset ?? 0;
      return {
        x: BOSS.x + Math.cos(formation.angle) * radial - Math.sin(formation.angle) * tangent,
        y: BOSS.y + Math.sin(formation.angle) * radial
          + Math.cos(formation.angle) * tangent + (pose?.bob ?? 0),
        pose,
      };
    }
    // Resting → camp; queued → bench. Cascade in a small grid per anchor.
    const anchorX = entry.isQueued ? BENCH_X : CAMP_X;
    const slot = entry.unitNumber % 6;
    return {
      x: anchorX + ((slot % 3) - 1) * 26,
      y: CAMP_Y + Math.floor(slot / 3) * 22 - 11,
      pose: null,
    };
  }

  // MARK: - Boss

  function drawBackdrop(): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= SCENE_W; x += 24) { ctx.moveTo(x, -offsetY / sceneScale); ctx.lineTo(x, SCENE_H + offsetY / sceneScale); }
    for (let y = 0; y <= SCENE_H; y += 24) { ctx.moveTo(-offsetX / sceneScale, y); ctx.lineTo(SCENE_W + offsetX / sceneScale, y); }
    ctx.stroke();

  }

  function drawBoss(nowMs: number, hp: number): void {
    drawBossHpBar(nowMs, hp);

    const defeated = hp <= 0;
    const enraged = !defeated && hp <= ENRAGE_HP;
    const bodyColor = defeated ? '#4A4F58' : hpColor(hp);

    // Ground shadow keeps the boss anchored in the arena.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(BOSS.x, BOSS.y + BOSS_R * 0.95, BOSS_R * 1.25, BOSS_R * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Breathing aura behind the body; red and hotter when enraged.
    if (!defeated) {
      const breath = 0.5 + 0.5 * Math.sin((Math.PI * nowMs) / (enraged ? 260 : 900));
      const auraR = BOSS_R * (1.6 + 0.25 * breath);
      const aura = ctx.createRadialGradient(BOSS.x, BOSS.y, BOSS_R * 0.4, BOSS.x, BOSS.y, auraR);
      aura.addColorStop(0, hexAlpha(enraged ? palette.liveRed : bodyColor, enraged ? 0.34 : 0.2));
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(BOSS.x, BOSS.y, auraR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    // Hit recoil and enrage tremor read as tiny whole-body shakes.
    const flash = Math.max(0, 1 - (nowMs - bossHitAt) / HIT_FLASH_MS);
    const tremor = (enraged ? 1.4 : 0) + flash * 2.2;
    const shakeSeed = Math.floor(nowMs / 30);
    ctx.translate(
      BOSS.x + (rand01(shakeSeed) * 2 - 1) * tremor,
      BOSS.y + (rand01(shakeSeed + 7) * 2 - 1) * tremor,
    );
    const pulse = 1 + 0.04 * Math.sin((Math.PI * nowMs) / (enraged ? 350 : 700));
    if (defeated) ctx.scale(1.05, 0.82); else ctx.scale(pulse, pulse);

    drawBossHorns();
    const body = bossBodyPath(defeated ? 0 : nowMs);
    ctx.fillStyle = bodyColor;
    ctx.fill(body);
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.canvas;
    ctx.stroke(body);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.45 * flash})`;
      ctx.fill(body);
    }

    drawBossFace(nowMs, hp, defeated, enraged);
    ctx.restore();

    if (enraged) {
      const blink = 0.45 + 0.55 * Math.abs(Math.sin((Math.PI * nowMs) / 400));
      ctx.globalAlpha = blink;
      ctx.fillStyle = palette.liveRed;
      ctx.font = `800 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('⚠ ENRAGED', SCENE_W / 2, 46);
      ctx.globalAlpha = 1;
    }
  }

  function drawBossHpBar(nowMs: number, hp: number): void {
    const barX = SCENE_W * 0.12;
    const barW = SCENE_W * 0.76;
    const barY = 26;
    const barH = 14;
    const nearDeath = hp > 0 && hp <= 0.1;
    ctx.fillStyle = hexAlpha(palette.canvas, 0.85);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 3);
    ctx.fill();
    ctx.stroke();
    const flash = nearDeath ? 0.4 + 0.6 * Math.abs(Math.sin((Math.PI * nowMs) / 300)) : 1;
    ctx.globalAlpha = flash;
    ctx.fillStyle = hpColor(hp);
    ctx.beginPath();
    ctx.roundRect(barX + 1, barY + 1, Math.max(0, (barW - 2) * hp), barH - 2, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 10% segment ticks give the bar a raid-frame feel.
    ctx.strokeStyle = hexAlpha(palette.canvas, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 10; i += 1) {
      const tx = barX + (barW * i) / 10;
      ctx.moveTo(tx, barY + 1.5);
      ctx.lineTo(tx, barY + barH - 1.5);
    }
    ctx.stroke();
    ctx.fillStyle = palette.textSoft;
    ctx.font = `700 9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`BOSS · ${Math.round(hp * 100)}% HP`, SCENE_W / 2, barY - 3);
  }

  /** Jagged organic blob: alternating radii softened into curves, with a slow
   *  per-vertex undulation so the body looks alive. Origin-centered. */
  function bossBodyPath(nowMs: number): Path2D {
    const path = new Path2D();
    const count = 12;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i += 1) {
      const wobble = nowMs === 0 ? 1 : 1 + 0.05 * Math.sin(nowMs / 260 + i * 1.7);
      const r = BOSS_R * (i % 2 === 0 ? 1 : 0.84) * wobble;
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const start = mid(pts[count - 1], pts[0]);
    path.moveTo(start.x, start.y);
    for (let i = 0; i < count; i += 1) {
      const p = pts[i];
      const next = mid(p, pts[(i + 1) % count]);
      path.quadraticCurveTo(p.x, p.y, next.x, next.y);
    }
    path.closePath();
    return path;
  }

  function drawBossHorns(): void {
    ctx.fillStyle = BONE;
    ctx.strokeStyle = palette.canvas;
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(side * BOSS_R * 0.42, -BOSS_R * 0.5);
      ctx.quadraticCurveTo(side * BOSS_R * 0.95, -BOSS_R * 0.85, side * BOSS_R * 0.8, -BOSS_R * 1.28);
      ctx.quadraticCurveTo(side * BOSS_R * 0.52, -BOSS_R * 0.95, side * BOSS_R * 0.14, -BOSS_R * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawBossFace(nowMs: number, hp: number, defeated: boolean, enraged: boolean): void {
    if (defeated) {
      // X-ed out eyes and a flat mouth: the classic knocked-out face.
      ctx.strokeStyle = palette.canvas;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (const side of [-1, 1] as const) {
        const cx = side * 14;
        ctx.beginPath();
        ctx.moveTo(cx - 5, -10); ctx.lineTo(cx + 5, 0);
        ctx.moveTo(cx + 5, -10); ctx.lineTo(cx - 5, 0);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-12, 14); ctx.lineTo(12, 14);
      ctx.stroke();
      ctx.lineCap = 'butt';
      return;
    }

    // Angry slanted eye slits with a glowing pupil that reddens as HP drops.
    ctx.fillStyle = palette.canvas;
    for (const side of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(side * 24, -13);
      ctx.lineTo(side * 8, -5);
      ctx.lineTo(side * 9, 0);
      ctx.lineTo(side * 23, -5);
      ctx.closePath();
      ctx.fill();
    }
    const heat = 1 - hp;
    const glow = `rgb(255, ${Math.round(235 - 165 * heat)}, ${Math.round(215 - 175 * heat)})`;
    for (const side of [-1, 1] as const) {
      ctx.fillStyle = hexAlphaSafe(glow, 0.35);
      ctx.beginPath();
      ctx.arc(side * 15, -6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(side * 15, -6, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth opens wider as the fight gets desperate; teeth stay bone-white.
    const roar = enraged ? 2 + 1.6 * Math.abs(Math.sin((Math.PI * nowMs) / 300)) : 0;
    const open = 7 + 9 * heat + roar;
    ctx.fillStyle = palette.canvas;
    ctx.beginPath();
    ctx.roundRect(-18, 8, 36, open, 4);
    ctx.fill();
    ctx.fillStyle = BONE;
    for (let i = 0; i < 4; i += 1) {
      const tx = -13 + i * 8.5;
      ctx.beginPath();
      ctx.moveTo(tx, 8.5);
      ctx.lineTo(tx + 5, 8.5);
      ctx.lineTo(tx + 2.5, 8.5 + Math.min(6, open * 0.55));
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 3; i += 1) {
      const tx = -9 + i * 8.5;
      ctx.beginPath();
      ctx.moveTo(tx, 8 + open - 0.5);
      ctx.lineTo(tx + 4.5, 8 + open - 0.5);
      ctx.lineTo(tx + 2.25, 8 + open - 0.5 - Math.min(4.5, open * 0.4));
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Rising sparks while the boss is enraged. */
  function updateAndDrawEmbers(nowMs: number, hp: number): void {
    const enraged = hp > 0 && hp <= ENRAGE_HP;
    if (enraged && nowMs - lastEmberAt > 90 && embers.length < MAX_EMBERS) {
      lastEmberAt = nowMs;
      embers.push({
        x: BOSS.x + (rand01(nowMs) * 2 - 1) * BOSS_R * 0.9,
        y: BOSS.y + rand01(nowMs + 3) * BOSS_R * 0.5,
        bornAt: nowMs,
        life: 900 + rand01(nowMs + 5) * 500,
        seed: rand01(nowMs + 9) * 10,
      });
    }
    for (let i = embers.length - 1; i >= 0; i -= 1) {
      const e = embers[i];
      const t = (nowMs - e.bornAt) / e.life;
      if (t >= 1) { embers.splice(i, 1); continue; }
      const x = e.x + Math.sin(nowMs / 200 + e.seed) * 4;
      const y = e.y - t * 46;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.fillStyle = t < 0.5 ? GOLD : palette.statusBlocked;
      ctx.beginPath();
      ctx.arc(x, y, 1.6 * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // MARK: - Camp & bench

  function drawCampAndBench(nowMs: number): void {
    label('CAMP', CAMP_X, CAMP_Y - 34);
    label('NEXT WAVE', BENCH_X, CAMP_Y - 34);
    drawCampfire(CAMP_X - 48, CAMP_Y + 4, nowMs);
    drawBanner(BENCH_X + 48, CAMP_Y + 12, nowMs);
  }

  function drawCampfire(x: number, y: number, nowMs: number): void {
    const flick = Math.sin(nowMs / 90) + 0.5 * Math.sin(nowMs / 53);
    const glow = ctx.createRadialGradient(x, y - 4, 1, x, y - 4, 18);
    glow.addColorStop(0, hexAlpha(palette.statusBlocked, 0.3 + 0.06 * flick));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y - 4, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#6B4A2E';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 3); ctx.lineTo(x + 7, y);
    ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y + 3);
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.fillStyle = palette.statusBlocked;
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.quadraticCurveTo(x - 1, y - 5, x, y - 11 - flick * 2);
    ctx.quadraticCurveTo(x + 1, y - 5, x + 5, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(x - 2.5, y);
    ctx.quadraticCurveTo(x - 0.5, y - 3, x, y - 6 + flick);
    ctx.quadraticCurveTo(x + 0.5, y - 3, x + 2.5, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawBanner(x: number, y: number, nowMs: number): void {
    ctx.strokeStyle = LEATHER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x, y - 28);
    ctx.stroke();
    const wave = Math.sin(nowMs / 300) * 2;
    ctx.fillStyle = palette.statusPit;
    ctx.beginPath();
    ctx.moveTo(x, y - 28);
    ctx.quadraticCurveTo(x + 8, y - 26 + wave, x + 15, y - 23 + wave);
    ctx.lineTo(x, y - 17);
    ctx.closePath();
    ctx.fill();
  }

  function label(text: string, x: number, y: number): void {
    ctx.fillStyle = palette.textMuted;
    ctx.font = `700 8px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, x, y);
  }

  // MARK: - Attacks

  function maybeAttack(
    entry: EntryPresentation,
    from: { x: number; y: number; pose: RaidActionPose | null },
    nowMs: number,
  ): void {
    const pose = from.pose;
    if (!pose?.canStrike) return;
    const attackToken = `${pose.style}:${pose.cycle}`;
    if (lastAttackToken.get(entry.id) === attackToken) return;
    lastAttackToken.set(entry.id, attackToken);

    // Stop at the boss rim, not its center, so impacts land on the body.
    const dx = BOSS.x - from.x;
    const dy = BOSS.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const rim = (dist - BOSS_R * 0.82) / dist;
    const impact: AttackImpact = {
      x: from.x,
      y: from.y,
      ex: from.x + dx * rim,
      ey: from.y + dy * rim,
      bornAt: nowMs,
      color: teamColor(entry.colorToken),
      kind: pose.kind,
      style: pose.style,
    };

    // Warriors are already at the rim when their strike lands. Mages and
    // archers visibly cover the remaining distance at different speeds.
    if (pose.style === 'flourish' && pose.kind === 'warrior') {
      registerImpact(impact, nowMs);
      return;
    }
    if (projectiles.length >= MAX_PROJECTILES) return;
    projectiles.push({
      ...impact,
      life: pose.style === 'basic' ? 420 : pose.kind === 'mage' ? 620 : 280,
      curve: pose.style === 'flourish' && pose.kind === 'mage'
        ? (entry.unitNumber % 2 === 0 ? 24 : -24)
        : 0,
    });
  }

  function updateAndDrawProjectiles(nowMs: number): void {
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const p = projectiles[i];
      const t = (nowMs - p.bornAt) / p.life;
      if (t >= 1) {
        projectiles.splice(i, 1);
        registerImpact(p, nowMs);
        continue;
      }
      const dx = p.ex - p.x;
      const dy = p.ey - p.y;
      const distance = Math.hypot(dx, dy) || 1;
      const curve = Math.sin(t * Math.PI) * p.curve;
      const x = p.x + dx * t - (dy / distance) * curve;
      const y = p.y + dy * t + (dx / distance) * curve;
      const angle = Math.atan2(p.ey - p.y, p.ex - p.x);
      drawProjectile(p, x, y, angle, t);
    }
    ctx.globalAlpha = 1;
  }

  function drawProjectile(p: Projectile, x: number, y: number, angle: number, t: number): void {
    ctx.save();
    ctx.translate(x, y);
    if (p.style === 'basic') {
      // Done raiders use one quiet, straight attack shared by every class.
      ctx.rotate(angle);
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(4, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    switch (p.kind) {
      case 'mage': {
        // Glowing orb with a fading trail.
        for (let k = 1; k <= 3; k += 1) {
          const bt = Math.max(0, t - k * 0.055);
          const bx = p.x + (p.ex - p.x) * bt - x;
          const by = p.y + (p.ey - p.y) * bt - y;
          ctx.globalAlpha = 0.3 - k * 0.08;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(bx, by, 2.6 - k * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, 1.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'archer': {
        // Fletched arrow oriented along the flight path.
        ctx.rotate(angle);
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-6, 0); ctx.lineTo(4, 0);
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(7, 0); ctx.lineTo(3, -2.4); ctx.lineTo(3, 2.4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-6, 0); ctx.lineTo(-8.5, -2);
        ctx.moveTo(-6, 0); ctx.lineTo(-8.5, 2);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  function registerImpact(p: AttackImpact, nowMs: number): void {
    bossHitAt = nowMs;
    const outward = Math.atan2(p.ey - BOSS.y, p.ex - BOSS.x);
    if (impactBursts.length < MAX_IMPACTS) {
      impactBursts.push({
        x: p.ex,
        y: p.ey,
        angle: outward,
        bornAt: nowMs,
        life: p.style === 'basic'
          ? 180
          : p.kind === 'mage'
            ? 520
            : p.kind === 'warrior'
              ? 320
              : 240,
        color: p.color,
        kind: p.kind,
        style: p.style,
      });
    }
    if (damageNumbers.length < MAX_HITS) {
      // Numbers fan out along the impact normal so a hail of hits stays
      // readable instead of piling up over the boss's face.
      damageNumbers.push({
        x: p.ex + Math.cos(outward) * 8,
        y: p.ey + Math.sin(outward) * 8,
        angle: outward,
        bornAt: nowMs,
        amount: p.style === 'basic'
          ? RaidRules.basicHitDamage
          : RAIDER_CLASS_STATS[p.kind].hitDamage,
      });
    }
    const sparkCount = p.style === 'flourish' ? 5 : 2;
    for (let i = 0; i < sparkCount && sparks.length < MAX_SPARKS; i += 1) {
      sparks.push({
        x: p.ex, y: p.ey,
        angle: outward + (i - 2) * 0.5 + (rand01(p.bornAt + i) - 0.5) * 0.4,
        speed: 40 + rand01(p.bornAt + i + 11) * 50,
        bornAt: nowMs, life: 260,
        color: i % 2 === 0 ? '#FFE9A8' : p.color,
      });
    }
  }

  function updateAndDrawImpacts(nowMs: number): void {
    for (let i = impactBursts.length - 1; i >= 0; i -= 1) {
      const impact = impactBursts[i];
      const t = (nowMs - impact.bornAt) / impact.life;
      if (t >= 1) { impactBursts.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(impact.x, impact.y);
      ctx.rotate(impact.angle);
      ctx.globalAlpha = 1 - t;
      if (impact.style === 'basic') {
        ctx.strokeStyle = impact.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 3 + t * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      switch (impact.kind) {
        case 'warrior': {
          // A broad crescent makes the melee hit read without a projectile.
          ctx.strokeStyle = STEEL;
          ctx.lineWidth = 3 * (1 - t) + 0.5;
          ctx.beginPath();
          ctx.arc(0, 0, 9 + t * 13, -1.05, 1.05);
          ctx.stroke();
          ctx.strokeStyle = impact.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, 5 + t * 9, -0.85, 0.85);
          ctx.stroke();
          break;
        }
        case 'mage': {
          // Expanding rune rings linger longer than the other hit effects.
          ctx.strokeStyle = impact.color;
          ctx.lineWidth = 2 * (1 - t) + 0.5;
          for (const scale of [0.7, 1] as const) {
            ctx.beginPath();
            ctx.arc(0, 0, (5 + t * 22) * scale, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.rotate(t * Math.PI);
          ctx.beginPath();
          for (let arm = 0; arm < 4; arm += 1) {
            ctx.moveTo(9, 0); ctx.lineTo(15 + t * 5, 0);
            ctx.rotate(Math.PI / 2);
          }
          ctx.stroke();
          break;
        }
        case 'archer': {
          // Three sharp ticks emphasize the arrow's precise impact.
          ctx.strokeStyle = impact.color;
          ctx.lineWidth = 1.8;
          for (const offset of [-0.38, 0, 0.38]) {
            ctx.save();
            ctx.rotate(offset);
            ctx.beginPath();
            ctx.moveTo(3 + t * 5, 0); ctx.lineTo(14 + t * 10, 0);
            ctx.stroke();
            ctx.restore();
          }
          break;
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function updateAndDrawSparks(nowMs: number): void {
    ctx.lineCap = 'round';
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const s = sparks[i];
      const t = (nowMs - s.bornAt) / s.life;
      if (t >= 1) { sparks.splice(i, 1); continue; }
      const d = s.speed * t * (s.life / 1000);
      const x = s.x + Math.cos(s.angle) * d;
      const y = s.y + Math.sin(s.angle) * d;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - Math.cos(s.angle) * 3, y - Math.sin(s.angle) * 3);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  function updateAndDrawDamageNumbers(nowMs: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = damageNumbers.length - 1; i >= 0; i -= 1) {
      const d = damageNumbers[i];
      const age = (nowMs - d.bornAt) / 800;
      if (age >= 1) { damageNumbers.splice(i, 1); continue; }
      // Pop in slightly oversized, then drift outward while fading.
      const pop = 1 + 0.35 * Math.max(0, 1 - age * 4);
      ctx.font = `800 ${(9 * pop).toFixed(1)}px ${FONT}`;
      ctx.globalAlpha = Math.max(0, 1 - age);
      const x = d.x + Math.cos(d.angle) * age * 22;
      const y = d.y + Math.sin(d.angle) * age * 22 - age * 8;
      ctx.strokeStyle = palette.canvas;
      ctx.lineWidth = 2.5;
      ctx.strokeText(`-${d.amount}`, x, y);
      ctx.fillStyle = GOLD;
      ctx.fillText(`-${d.amount}`, x, y);
      ctx.globalAlpha = 1;
    }
  }

  // MARK: - Raider markers

  function drawRaider(
    entry: EntryPresentation,
    x: number,
    y: number,
    pose: RaidActionPose | null,
    nowMs: number,
  ): void {
    const color = teamColor(entry.colorToken);
    const fighting = onBattlefield(entry);
    const kind = raiderClassOf(entry.unitNumber);
    const aim = Math.atan2(BOSS.y - y, BOSS.x - x);
    const attack = pose?.attackAnimation ?? 0;

    ctx.save();
    ctx.translate(x, y);
    // The warrior follows through into the boss; the archer recoils away.
    if (pose?.style === 'flourish' && pose.kind === 'warrior') {
      ctx.translate(Math.cos(aim) * attack * 4, Math.sin(aim) * attack * 4);
    } else if (pose?.style === 'flourish' && pose.kind === 'archer' && pose.canStrike) {
      ctx.translate(-Math.cos(aim) * 2, -Math.sin(aim) * 2);
    }

    if (entry.isFocused) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      const r = RADIUS + 7;
      const arm = 5;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
        ctx.moveTo(sx * r - sx * arm, sy * r);
        ctx.lineTo(sx * r, sy * r);
        ctx.lineTo(sx * r, sy * r - sy * arm);
      }
      ctx.stroke();
    }

    if (entry.isQueued) ctx.globalAlpha = 0.75;

    if (pose?.style === 'flourish' && pose.kind === 'mage') drawMageChannel(attack, nowMs);

    if (entry.isQueued) {
      ring(RADIUS + 3.5, palette.textMuted, 1);
    } else {
      switch (entry.status) {
        case 'working': ring(RADIUS + 3.5, 'rgba(255,255,255,0.85)', 1.5); break;
        case 'idle': ring(RADIUS + 3.5, palette.statusPit, 1.5); break;
        case 'done':
          ring(RADIUS + 3.5, 'rgba(51,51,51,1)', 3);
          ctx.setLineDash([4, 4]);
          ring(RADIUS + 3.5, '#FFFFFF', 3);
          ctx.setLineDash([]);
          break;
        case 'blocked': {
          const alpha = 0.25 + 0.75 * Math.abs(Math.sin((Math.PI * nowMs) / 800));
          ctx.globalAlpha = alpha;
          ring(RADIUS + 3.5, palette.liveRed, 2);
          ctx.globalAlpha = entry.isQueued ? 0.75 : 1;
          break;
        }
      }
    }

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

    ctx.fillStyle = contrastText(color);
    ctx.font = `800 ${entry.unitNumber > 99 ? 8 : 10}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(entry.unitNumber), 0, 0.5);

    ctx.font = `800 7px ${FONT}`;
    ctx.textBaseline = 'top';
    if (entry.isQueued) {
      ctx.fillStyle = palette.textMuted;
      ctx.fillText('NEXT WAVE', 0, RADIUS + 6);
    } else if (entry.status === 'idle') {
      ctx.fillStyle = palette.statusPit;
      ctx.fillText('CAMP', 0, RADIUS + 6);
      drawSleep(entry, nowMs);
    }
    if (entry.showsNewStint) {
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'bottom';
      ctx.fillText('RESPAWN', 0, -RADIUS - 13);
    }

    if (!entry.isQueued && entry.status === 'blocked') drawStunStars(nowMs);

    ctx.restore();
  }

  function drawMageChannel(power: number, nowMs: number): void {
    if (power <= 0.02) return;
    ctx.save();
    ctx.globalAlpha *= 0.25 + power * 0.55;
    ctx.strokeStyle = ARCANE;
    ctx.lineWidth = 1 + power;
    ctx.rotate(nowMs / 900);
    for (const radius of [RADIUS + 7, RADIUS + 11] as const) {
      ctx.beginPath();
      ctx.arc(0, 0, radius + power * 2, 0, Math.PI * 1.35);
      ctx.stroke();
      ctx.rotate(Math.PI);
    }
    for (let arm = 0; arm < 3; arm += 1) {
      ctx.fillStyle = arm === 1 ? '#FFFFFF' : ARCANE;
      ctx.beginPath();
      ctx.arc(RADIUS + 10, 0, 1.2 + power, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate((Math.PI * 2) / 3);
    }
    ctx.restore();
  }

  /** Three little stars circling overhead: the universal "stunned". */
  function drawStunStars(nowMs: number): void {
    ctx.fillStyle = palette.statusBlocked;
    ctx.font = `800 8px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i += 1) {
      const a = nowMs / 300 + (i * Math.PI * 2) / 3;
      ctx.fillText('✦', Math.cos(a) * 9, -RADIUS - 8 + Math.sin(a) * 2.5);
    }
  }

  /** Drifting "z" over campers. */
  function drawSleep(entry: EntryPresentation, nowMs: number): void {
    ctx.fillStyle = palette.textMuted;
    ctx.textAlign = 'center';
    for (let i = 0; i < 2; i += 1) {
      const cycle = ((nowMs / 1000 + entry.unitNumber * 0.7 + i * 0.8) % 1.6) / 1.6;
      ctx.globalAlpha = Math.max(0, 1 - cycle) * 0.9;
      ctx.font = `700 ${6 + cycle * 3}px ${FONT}`;
      ctx.textBaseline = 'bottom';
      ctx.fillText('z', 8 + cycle * 5, -RADIUS - 2 - cycle * 10);
    }
    ctx.globalAlpha = 1;
  }

  function ring(radius: number, color: string, width: number): void {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  return { setSync, resize, frame };
}

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

function hpColor(hp: number): string {
  if (hp <= 0) return '#4A4F58';
  if (hp > 0.5) return palette.statusWorking;
  if (hp > 0.2) return palette.statusBlocked;
  return palette.liveRed;
}

/** hexAlpha for values that may arrive as rgb() strings. */
function hexAlphaSafe(color: string, alpha: number): string {
  if (color.startsWith('#')) return hexAlpha(color, alpha);
  return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
}

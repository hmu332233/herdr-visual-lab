import {
  AnimatedSprite,
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type { EntryPresentation } from '../../presentation.js';
import { contrastText, palette, teamColor } from '../../palette.js';
import type { RaidView as SyncMessage } from '../raid/view.js';
import { RaidRules } from '../raid/rules.js';
import {
  raidActionPose,
  raidBasicAttackPose,
  type RaidActionPose,
} from '../raid/choreography.js';
import {
  RAIDER_CLASS_STATS,
  raiderClassOf,
  type RaiderClass,
} from '../raid/roles.js';
import {
  COMBAT_ANIMATION_ROWS,
  HERO_HALF_WIDTH,
  HERO_HEIGHT,
  HERO_SHEET_URLS,
  HERO_SIZE,
  SPRITE_SHEET_COLUMNS,
  SPRITE_SHEET_ROWS,
} from './heroes.js';
import {
  raid2HeroMotion,
  type Raid2HeroMotion,
} from './choreography.js';

const SCENE_W = 960;
const SCENE_H = 420;
const FLOOR_Y = 307;
const BOSS_X = 815;
const BOSS_Y = FLOOR_Y;
const BOSS_MOUTH_X = BOSS_X - 133;
// The attack-row artwork sits 26 source pixels higher than the idle row.
// At the displayed sprite scale this keeps its feet on the same baseline.
const BOSS_ATTACK_FRAME_Y_OFFSET = 24;
const OFFSCREEN_X = -56;
const WALK_IN_MS = 980;
const WALK_OUT_MS = 720;
const WALK_STAGGER_MS = 85;
const ENRAGE_HP = 0.2;
const BOSS_ATTACK_START_MS = 1350;
const BOSS_ATTACK_PERIOD_MS = 4200;
const BOSS_ENRAGED_ATTACK_PERIOD_MS = 3100;
const BOSS_WARNING_PHASE = 0.3;
const BOSS_IMPACT_PHASE = 0.58;
const COMBO_LINGER_MS = 1450;
const MAX_SHOTS = 72;
const MAX_BURSTS = 48;
const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const BACKGROUND_URL = new URL(
  '../../assets/raid2/forest-ruins-background.png',
  import.meta.url,
).href;
const BOSS_SHEET_URL = new URL(
  '../../assets/raid2/forest-dragon-sheet-clean-v2.png',
  import.meta.url,
).href;

type CombatAnimation = 'idle' | 'attack' | 'hit';
type CombatAnimations = Record<CombatAnimation, Texture[]>;

interface HeroMotion {
  kind: 'entering' | 'exiting';
  entry: EntryPresentation;
  startedAt: number;
  delay: number;
  fromX: number;
}

interface HeroNode {
  root: Container;
  shadow: Graphics;
  teamHalo: Graphics;
  sprite: AnimatedSprite;
  animations: CombatAnimations;
  channel: Graphics;
  status: Graphics;
  badge: Graphics;
  crown: Graphics;
  focus: Graphics;
  defense: Graphics;
  numberPlate: Graphics;
  numberLabel: Text;
  reactionLabel: Text;
  entry: EntryPresentation;
  lastAttackToken: string;
}

interface DrawnHero {
  node: HeroNode;
  entry: EntryPresentation;
  x: number;
  y: number;
  groundY: number;
  pose: RaidActionPose | null;
  combatMotion: Raid2HeroMotion;
  walking: boolean;
  facing: 1 | -1;
}

interface Shot {
  view: Graphics;
  x: number;
  y: number;
  ex: number;
  ey: number;
  bornAt: number;
  life: number;
  arc: number;
  color: number;
  kind: RaiderClass;
  style: RaidActionPose['style'];
  impact: boolean;
}

interface Burst {
  view: Container;
  bornAt: number;
  life: number;
  drift: number;
  originX: number;
  originY: number;
}

export interface Raid2BossAttackPlan {
  kind: 'claw' | 'fire';
  cycle: number;
  phase: number;
  warning: number;
  strike: number;
  impactAgeMs: number;
  targetIndex: number;
}

interface BossAttackState extends Raid2BossAttackPlan {
  targetID: string;
  targetX: number;
  targetY: number;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function smoothStep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function phasePulse(from: number, peak: number, to: number, value: number): number {
  return value < peak
    ? smoothStep((value - from) / (peak - from))
    : 1 - smoothStep((value - peak) / (to - peak));
}

function rand01(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function colorNumber(color: string): number {
  return Number.parseInt(color.replace('#', ''), 16);
}

function walkBob(unitNumber: number, nowMs: number): number {
  const step = Math.floor((nowMs + unitNumber * 31) / 110) % 4;
  return step === 1 ? -2 : step === 3 ? -1 : 0;
}

function onBattlefield(entry: EntryPresentation): boolean {
  const kind = entry.placement.kind;
  return kind === 'active' || kind === 'coolingDown' || kind === 'blockedActive';
}

/** Pure timing model: renderer and tests consume the same boss choreography. */
export function raid2BossAttackPlan(
  nowMs: number,
  stageStartedAt: number,
  hp: number,
  targetCount: number,
): Raid2BossAttackPlan | null {
  if (hp <= 0 || targetCount <= 0) return null;
  const elapsed = nowMs - stageStartedAt - BOSS_ATTACK_START_MS;
  if (elapsed < 0) return null;
  const period = hp <= ENRAGE_HP
    ? BOSS_ENRAGED_ATTACK_PERIOD_MS
    : BOSS_ATTACK_PERIOD_MS;
  const cycle = Math.floor(elapsed / period);
  const phase = elapsed / period - cycle;
  return {
    kind: cycle % 2 === 0 ? 'claw' : 'fire',
    cycle,
    phase,
    warning: phase < BOSS_IMPACT_PHASE
      ? smoothStep((phase - BOSS_WARNING_PHASE) / (BOSS_IMPACT_PHASE - BOSS_WARNING_PHASE))
      : Math.max(0, 1 - (phase - BOSS_IMPACT_PHASE) / 0.08),
    strike: phasePulse(0.48, BOSS_IMPACT_PHASE, 0.72, phase),
    impactAgeMs: (phase - BOSS_IMPACT_PHASE) * period,
    targetIndex: cycle % targetCount,
  };
}

export function createRaid2Scene(
  canvas: HTMLCanvasElement,
  onFocus: (terminalID: string) => void,
) {
  if (!isBrowserCanvas(canvas)) return createHeadlessScene(canvas);

  const app = new Application();
  const root = new Container();
  const camera = new Container();
  const atmosphereLayer = new Graphics();
  const bossLayer = new Container();
  const telegraphLayer = new Container();
  const projectileLayer = new Container();
  const heroLayer = new Container();
  const effectLayer = new Container();
  const hudLayer = new Container();
  const rageOverlay = new Graphics();
  const screenFlash = new Graphics();
  const bossTelegraph = new Graphics();
  const bossTelegraphLabel = text('DANGER', 8, 0xffd3bd);
  const bossStrike = new Graphics();
  const bossRoot = new Container();
  const bossSprite = new AnimatedSprite([Texture.EMPTY], false);
  const hpBar = new Graphics();
  const stageLabel = text('', 10, 0xd9e3e8);
  const bossLabel = text('FOREST DRAGON', 9, 0xd9e3e8);
  const hpLabel = text('', 9, 0xd9e3e8);
  const enrageLabel = text('', 8, 0xff745c);
  const comboLabel = text('', 16, 0xffdf72);
  const comboSubLabel = text('CHAIN', 7, 0xd9e3e8);
  const victoryLabel = text('STAGE CLEAR', 25, 0xfff1a8);
  const victorySubLabel = text('FOREST DRAGON DEFEATED', 8, 0xd9e3e8);

  const heroNodes = new Map<string, HeroNode>();
  const motions = new Map<string, HeroMotion>();
  const heroAnimations = new Map<RaiderClass, CombatAnimations>();
  const shots: Shot[] = [];
  const bursts: Burst[] = [];

  let sync: SyncMessage | null = null;
  let initialized = false;
  let stageStartedAt = 0;
  let lastStage: number | null = null;
  let bossHitAt = -Infinity;
  let heroImpactAt = -Infinity;
  let heroImpactStrength = 0;
  let heroImpactColor = 0xffffff;
  let hitStopUntil = -Infinity;
  let comboCount = 0;
  let comboExpiresAt = -Infinity;
  let bossDefeatedAt = -Infinity;
  let defeatDustSpawned = false;
  let previousBossHp = 1;
  let bossAnimations: CombatAnimations | null = null;

  const ready = initialize().catch(error => {
    console.error('Raid 2 Pixi renderer failed to initialize', error);
  });

  async function initialize(): Promise<void> {
    const size = parentSize();
    await app.init({
      canvas,
      width: size.width,
      height: size.height,
      resolution: cappedDpr(),
      autoDensity: true,
      antialias: false,
      autoStart: false,
      preference: 'webgl',
      backgroundColor: 0x07152b,
      powerPreference: 'high-performance',
    });

    const [backgroundTexture, bossSheet, warriorSheet, mageSheet, archerSheet] = await Promise.all([
      Assets.load<Texture>(BACKGROUND_URL),
      Assets.load<Texture>(BOSS_SHEET_URL),
      Assets.load<Texture>(HERO_SHEET_URLS.warrior),
      Assets.load<Texture>(HERO_SHEET_URLS.mage),
      Assets.load<Texture>(HERO_SHEET_URLS.archer),
    ]);
    for (const texture of [
      backgroundTexture,
      bossSheet,
      warriorSheet,
      mageSheet,
      archerSheet,
    ]) {
      texture.source.scaleMode = 'nearest';
    }
    bossAnimations = combatAnimationsFromSheet(bossSheet, { right: 36 });
    heroAnimations.set('warrior', combatAnimationsFromSheet(warriorSheet));
    heroAnimations.set('mage', combatAnimationsFromSheet(mageSheet));
    heroAnimations.set('archer', combatAnimationsFromSheet(archerSheet));

    const background = new Sprite(backgroundTexture);
    background.width = SCENE_W;
    background.height = SCENE_H;
    root.addChild(background, rageOverlay, camera, hudLayer, screenFlash);
    camera.pivot.set(SCENE_W / 2, SCENE_H / 2);
    camera.position.set(SCENE_W / 2, SCENE_H / 2);
    camera.addChild(
      atmosphereLayer,
      bossLayer,
      telegraphLayer,
      projectileLayer,
      heroLayer,
      effectLayer,
    );
    bossLayer.addChild(bossRoot);
    bossTelegraphLabel.anchor.set(0.5, 1);
    telegraphLayer.addChild(bossTelegraph, bossTelegraphLabel);
    effectLayer.addChild(bossStrike);

    setCombatFrame(bossSprite, bossAnimations, 'idle', 0);
    // Preserve the original head position while bringing the cropped tail edge
    // safely inside the battlefield instead of stretching it back to full width.
    bossSprite.anchor.set(140 / 248, 1);
    bossSprite.position.y = 48;
    bossSprite.width = 248;
    bossSprite.height = 280;
    bossRoot.addChild(bossSprite);

    stageLabel.anchor.set(0.5);
    stageLabel.position.set(59, 33);
    bossLabel.position.set(570, 24);
    hpLabel.anchor.set(1, 0);
    hpLabel.position.set(914, 24);
    enrageLabel.anchor.set(1, 0);
    enrageLabel.position.set(914, 49);
    comboLabel.anchor.set(1, 0);
    comboLabel.position.set(528, 22);
    comboSubLabel.anchor.set(1, 0);
    comboSubLabel.position.set(528, 41);
    victoryLabel.anchor.set(0.5);
    victoryLabel.position.set(SCENE_W / 2, 112);
    victorySubLabel.anchor.set(0.5);
    victorySubLabel.position.set(SCENE_W / 2, 134);
    comboLabel.visible = false;
    comboSubLabel.visible = false;
    victoryLabel.visible = false;
    victorySubLabel.visible = false;
    hudLayer.addChild(
      stageBadge(),
      stageLabel,
      hpBar,
      bossLabel,
      hpLabel,
      enrageLabel,
      comboLabel,
      comboSubLabel,
      victoryLabel,
      victorySubLabel,
    );

    app.stage.addChild(root);
    initialized = true;
    resize();
  }

  function setSync(nextSync: SyncMessage, receivedAtMs: number): void {
    if (nextSync.stage !== lastStage) {
      lastStage = nextSync.stage;
      stageStartedAt = receivedAtMs;
      bossDefeatedAt = nextSync.bossHpFraction <= 0 ? receivedAtMs : -Infinity;
      defeatDustSpawned = false;
      previousBossHp = nextSync.bossHpFraction <= 0 ? 1 : nextSync.bossHpFraction;
      comboCount = 0;
      comboExpiresAt = -Infinity;
      clearTransientEffects();
    }

    const previous = sync
      ? sync.teams.flatMap(team => team.entries).filter(onBattlefield)
      : [];
    const next = nextSync.teams.flatMap(team => team.entries).filter(onBattlefield);
    const previousByID = new Map(previous.map(entry => [entry.id, entry]));
    const nextByID = new Map(next.map(entry => [entry.id, entry]));
    const previousUnits = previous.map(entry => entry.unitNumber);

    for (const entry of previous) {
      if (nextByID.has(entry.id)) continue;
      const fromX = heroNodes.get(entry.id)?.root.x
        ?? formationSpot(entry.unitNumber, previousUnits).x;
      motions.set(entry.id, {
        kind: 'exiting',
        entry,
        startedAt: receivedAtMs,
        delay: 0,
        fromX,
      });
    }

    const nextUnits = next.map(entry => entry.unitNumber);
    next
      .filter(entry => !previousByID.has(entry.id))
      .sort((a, b) =>
        formationSpot(a.unitNumber, nextUnits).x
        - formationSpot(b.unitNumber, nextUnits).x)
      .forEach((entry, index) => {
        motions.set(entry.id, {
          kind: 'entering',
          entry,
          startedAt: receivedAtMs,
          delay: index * WALK_STAGGER_MS,
          fromX: OFFSCREEN_X,
        });
      });

    for (const entry of next) {
      const motion = motions.get(entry.id);
      if (motion) motion.entry = entry;
      const node = heroNodes.get(entry.id);
      if (node) node.entry = entry;
    }
    sync = nextSync;
  }

  function resize(): void {
    const size = parentSize();
    if (initialized) app.renderer.resize(size.width, size.height, cappedDpr());
    else {
      canvas.width = Math.round(size.width * cappedDpr());
      canvas.height = Math.round(size.height * cappedDpr());
    }
    const scale = Math.min(size.width / SCENE_W, size.height / SCENE_H);
    root.scale.set(scale);
    root.position.set(
      (size.width - SCENE_W * scale) / 2,
      (size.height - SCENE_H * scale) / 2,
    );
  }

  function frame(nowMs: number): void {
    const current = sync;
    if (!initialized || !current) return;

    const hp = current.bossHpFraction;
    if (hp <= 0 && previousBossHp > 0) {
      bossDefeatedAt = nowMs;
      heroImpactAt = nowMs;
      heroImpactStrength = 7;
      heroImpactColor = 0xfff3c4;
      hitStopUntil = nowMs + 90;
    } else if (hp > 0 && previousBossHp <= 0) {
      bossDefeatedAt = -Infinity;
      defeatDustSpawned = false;
    }
    previousBossHp = hp;

    if (nowMs < hitStopUntil) {
      updateBackdrop(hp, nowMs);
      updateHud(current.stage, hp, nowMs);
      app.render();
      return;
    }

    const deployed = current.teams.flatMap(team => team.entries).filter(onBattlefield);
    const units = deployed.map(entry => entry.unitNumber);
    const activeIDs = new Set(deployed.map(entry => entry.id));
    const drawn: DrawnHero[] = [];

    for (const entry of deployed) {
      const node = ensureHero(entry);
      const spot = formationSpot(entry.unitNumber, units);
      const pose = hp <= 0 || entry.displaySpeed <= 0
        ? null
        : entry.status === 'working'
          ? raidActionPose(entry.unitNumber, nowMs)
          : entry.status === 'done'
            ? raidBasicAttackPose(entry.unitNumber, nowMs)
            : null;
      let combatMotion = raid2HeroMotion(pose);
      const targetX = spot.x + combatMotion.x;
      const targetY = spot.y + combatMotion.y;
      const motion = motions.get(entry.id);
      let x = targetX;
      let y = targetY;
      let walking = false;
      if (motion?.kind === 'entering') {
        const progress = motionProgress(motion, nowMs, WALK_IN_MS);
        if (progress >= 1) motions.delete(entry.id);
        else {
          x = lerp(motion.fromX, targetX, smoothStep(progress));
          y = FLOOR_Y + walkBob(entry.unitNumber, nowMs);
          combatMotion = raid2HeroMotion(null);
          walking = true;
        }
      }
      if (!walking && hp > 0) maybeAttack(node, pose, x, y, nowMs);
      drawn.push({
        node,
        entry,
        x,
        y,
        groundY: spot.y,
        pose: walking ? null : pose,
        combatMotion,
        walking,
        facing: 1,
      });
    }

    for (const [id, motion] of motions) {
      if (motion.kind !== 'exiting' || activeIDs.has(id)) continue;
      const progress = motionProgress(motion, nowMs, WALK_OUT_MS);
      if (progress >= 1) {
        motions.delete(id);
        removeHero(id);
        continue;
      }
      const node = ensureHero(motion.entry);
      drawn.push({
        node,
        entry: motion.entry,
        x: lerp(motion.fromX, OFFSCREEN_X, smoothStep(progress)),
        y: FLOOR_Y + walkBob(motion.entry.unitNumber, nowMs),
        groundY: FLOOR_Y,
        pose: null,
        combatMotion: raid2HeroMotion(null),
        walking: true,
        facing: -1,
      });
    }

    const bossAttack = resolveBossAttack(nowMs, hp, drawn);
    updateAtmosphere(nowMs, hp);
    updateCamera(bossAttack, nowMs);
    updateBackdrop(hp, nowMs);
    updateBoss(bossAttack, hp, nowMs);
    updateShots(nowMs);
    updateBursts(nowMs);

    drawn.sort((a, b) =>
      a.groundY - b.groundY
      || a.x - b.x
      || a.entry.unitNumber - b.entry.unitNumber);
    for (const hero of drawn) {
      heroLayer.addChild(hero.node.root);
      updateHero(
        hero,
        bossAttack?.targetID === hero.entry.id ? bossAttack : null,
        nowMs,
        hp <= 0,
      );
    }
    updateBossTelegraph(bossAttack, nowMs);
    updateBossStrike(bossAttack, nowMs);
    updateHud(current.stage, hp, nowMs);
    app.render();
  }

  function ensureHero(entry: EntryPresentation): HeroNode {
    const existing = heroNodes.get(entry.id);
    if (existing) {
      existing.entry = entry;
      return existing;
    }

    const kind = raiderClassOf(entry.unitNumber);
    const animations = heroAnimations.get(kind)!;
    const sprite = new AnimatedSprite(animations.idle, false);
    sprite.anchor.set(0.5, 1);
    const rootNode = new Container();
    const team = colorNumber(teamColor(entry.colorToken));
    const shadow = new Graphics()
      .rect(-24, -2, 48, 4)
      .fill(0x050408);
    const teamHalo = new Graphics()
      .ellipse(0, -1, 27, 5)
      .stroke({ color: team, alpha: 0.72, width: 1.5 })
      .moveTo(-8, 2)
      .lineTo(0, 5)
      .lineTo(8, 2)
      .stroke({ color: team, alpha: 0.9, width: 2 });
    const channel = new Graphics();
    const status = new Graphics();
    const badge = new Graphics();
    const crown = crownGraphic();
    const focus = focusGraphic();
    const defense = new Graphics();
    const numberPlate = new Graphics()
      .rect(-7, -7, 14, 10)
      .fill(team)
      .stroke({ color: 0x07101c, alpha: 0.9, width: 1 });
    numberPlate.position.set(-28, -HERO_HEIGHT + 3);
    const numberLabel = text(
      String(entry.unitNumber),
      entry.unitNumber >= 100 ? 5 : 6,
      colorNumber(contrastText(teamColor(entry.colorToken))),
    );
    numberLabel.anchor.set(0.5);
    numberLabel.position.set(-28, -HERO_HEIGHT + 1);
    const reactionLabel = text('', 8, 0xffffff);
    reactionLabel.anchor.set(0.5, 1);
    reactionLabel.position.set(0, -HERO_HEIGHT - 10);

    rootNode.addChild(
      shadow,
      teamHalo,
      channel,
      sprite,
      status,
      badge,
      crown,
      focus,
      defense,
      numberPlate,
      numberLabel,
      reactionLabel,
    );
    rootNode.eventMode = 'static';
    rootNode.cursor = 'pointer';
    rootNode.hitArea = new Rectangle(
      -HERO_HALF_WIDTH - 4,
      -HERO_HEIGHT - 10,
      HERO_HALF_WIDTH * 2 + 8,
      HERO_HEIGHT + 18,
    );
    rootNode.on('pointertap', () => onFocus(entry.id));
    heroLayer.addChild(rootNode);

    const node: HeroNode = {
      root: rootNode,
      shadow,
      teamHalo,
      sprite,
      animations,
      channel,
      status,
      badge,
      crown,
      focus,
      defense,
      numberPlate,
      numberLabel,
      reactionLabel,
      entry,
      lastAttackToken: '',
    };
    heroNodes.set(entry.id, node);
    return node;
  }

  function updateHero(
    hero: DrawnHero,
    incoming: BossAttackState | null,
    nowMs: number,
    victorious: boolean,
  ): void {
    const { node, entry, pose, combatMotion } = hero;
    const kind = raiderClassOf(entry.unitNumber);
    const hit = heroHitReaction(incoming);
    const hitFrame = heroHitFrame(incoming);
    const attackFrame = pose && hitFrame === null && !hero.walking
      ? actionFrame(pose)
      : null;
    if (victorious) {
      const frame = kind === 'warrior' ? 3 : kind === 'mage' ? 2 : 0;
      setCombatFrame(
        node.sprite,
        node.animations,
        kind === 'archer' ? 'idle' : 'attack',
        frame,
      );
    } else if (hitFrame !== null) {
      setCombatFrame(node.sprite, node.animations, 'hit', hitFrame);
    } else if (attackFrame !== null) {
      setCombatFrame(node.sprite, node.animations, 'attack', attackFrame);
    } else {
      const speed = hero.walking ? 105 : 185;
      const idleFrame = Math.floor((nowMs + entry.unitNumber * 97) / speed) % 4;
      setCombatFrame(node.sprite, node.animations, 'idle', idleFrame);
    }
    const texture = node.sprite.texture;
    const scaleX = HERO_SIZE / texture.width;
    const scaleY = HERO_SIZE / texture.height;
    const hitSeed = Math.floor(nowMs / 28) + entry.unitNumber;
    const knockback = hit > 0
      ? -hit * (kind === 'warrior' ? 9 : kind === 'mage' ? 13 : 22)
        + (rand01(hitSeed) * 2 - 1) * hit * 2
      : 0;
    const hop = hit > 0
      ? -Math.sin((1 - hit) * Math.PI) * (kind === 'warrior' ? 2 : 7)
      : hero.walking
        ? walkBob(entry.unitNumber, nowMs)
        : 0;
    const victoryAge = Math.max(0, nowMs - bossDefeatedAt);
    const victoryBounce = victorious
      ? -Math.abs(Math.sin((victoryAge + entry.unitNumber * 41) / 330))
        * (kind === 'mage' ? 5 : 2.5)
      : 0;
    const rootY = hero.y + hop + victoryBounce;
    const groundOffsetY = hero.groundY - rootY;

    node.root.visible = true;
    node.root.position.set(hero.x + knockback, rootY);
    node.root.alpha = entry.isQueued ? 0.75 : 1;
    node.root.rotation = hit > 0 ? -hit * (kind === 'warrior' ? 0.025 : 0.07) : 0;

    const victoryLean = victorious
      ? kind === 'warrior'
        ? -0.035
        : kind === 'archer'
          ? 0.025
          : Math.sin(victoryAge / 450) * 0.02
      : 0;
    node.sprite.position.set(0, 0);
    node.sprite.rotation = combatMotion.rotation + victoryLean;
    node.sprite.scale.set(
      hero.facing * scaleX * combatMotion.scaleX,
      scaleY * combatMotion.scaleY,
    );
    node.sprite.tint = hit > 0.72 ? 0xffb0a8 : 0xffffff;

    node.shadow.position.set(0, groundOffsetY);
    node.shadow.scale.set(combatMotion.shadowScale, Math.max(0.55, combatMotion.shadowScale));
    node.shadow.alpha = combatMotion.shadowAlpha;
    node.teamHalo.position.set(0, groundOffsetY);
    node.teamHalo.scale.set(
      0.9 + combatMotion.shadowScale * 0.1,
      0.85 + combatMotion.shadowScale * 0.15,
    );
    node.teamHalo.alpha = entry.isFocused ? 1 : 0.62;
    node.status.position.set(0, groundOffsetY);

    drawStatus(node.status, entry, nowMs);
    drawTeamBadge(node.badge, entry);
    drawHeroChannel(
      node.channel,
      kind,
      combatMotion,
      colorNumber(teamColor(entry.colorToken)),
      groundOffsetY,
      nowMs,
    );
    drawDefense(node, kind, incoming, hit, nowMs);
    node.crown.visible = victorious || (!entry.isQueued && entry.status === 'done');
    node.focus.visible = entry.isFocused;
    node.numberPlate.alpha = entry.isQueued ? 0.55 : 1;
    node.numberLabel.alpha = entry.isQueued ? 0.65 : 1;
  }

  function maybeAttack(
    node: HeroNode,
    pose: RaidActionPose | null,
    x: number,
    y: number,
    nowMs: number,
  ): void {
    if (!pose?.canStrike) return;
    const token = `${pose.style}:${pose.cycle}`;
    if (node.lastAttackToken === token) return;
    node.lastAttackToken = token;

    const color = colorNumber(teamColor(node.entry.colorToken));
    const handY = y - (pose.kind === 'mage' ? 42 : pose.kind === 'archer' ? 34 : 28);
    const ey = clamp(handY - 18 + rand01(node.entry.unitNumber * 3.7) * 46, 218, 294);
    const ex = 706 + clamp((ey - 215) / 95, 0, 1) * 18;
    if (pose.style === 'flourish' && pose.kind === 'warrior') {
      spawnMeleeSlash(x + 4, y - 38, ex, ey, color, nowMs);
      spawnImpact(ex, ey, color, pose.kind, pose.style, nowMs);
      return;
    }

    const fan = pose.style === 'flourish' && pose.kind === 'archer'
      ? [-16, 0, 16]
      : [0];
    fan.forEach((offset, index) => {
      while (shots.length >= MAX_SHOTS) {
        shots.shift()?.view.destroy();
      }
      const view = projectileGraphic(pose.kind, pose.style, color);
      projectileLayer.addChild(view);
      shots.push({
        view,
        x: x + (pose.kind === 'mage' ? 22 : 12),
        y: handY + offset * 0.12,
        ex,
        ey: ey + offset,
        bornAt: nowMs + index * 22,
        life: pose.style === 'basic' ? 410 : pose.kind === 'mage' ? 560 : 420,
        arc: pose.style === 'basic' ? 6 : pose.kind === 'archer' ? 38 + Math.abs(offset) : 22,
        color,
        kind: pose.kind,
        style: pose.style,
        impact: offset === 0,
      });
    });
  }

  function updateShots(nowMs: number): void {
    for (let index = shots.length - 1; index >= 0; index -= 1) {
      const shot = shots[index];
      const t = (nowMs - shot.bornAt) / shot.life;
      if (t < 0) {
        shot.view.visible = false;
        continue;
      }
      shot.view.visible = true;
      if (t >= 1) {
        shots.splice(index, 1);
        shot.view.destroy();
        if (shot.impact) {
          spawnImpact(shot.ex, shot.ey, shot.color, shot.kind, shot.style, nowMs);
        } else {
          spawnMinorImpact(shot.ex, shot.ey, shot.color, nowMs);
        }
        continue;
      }
      const x = lerp(shot.x, shot.ex, t);
      const y = lerp(shot.y, shot.ey, t) - Math.sin(t * Math.PI) * shot.arc;
      const nextT = Math.min(1, t + 0.025);
      const nextX = lerp(shot.x, shot.ex, nextT);
      const nextY = lerp(shot.y, shot.ey, nextT) - Math.sin(nextT * Math.PI) * shot.arc;
      shot.view.position.set(x, y);
      shot.view.rotation = Math.atan2(nextY - y, nextX - x);
      shot.view.alpha = 0.75 + Math.sin(t * Math.PI) * 0.25;
      const pulse = shot.kind === 'mage' ? 1 + Math.sin(t * Math.PI * 6) * 0.12 : 1;
      shot.view.scale.set(pulse);
    }
  }

  function spawnImpact(
    x: number,
    y: number,
    color: number,
    kind: RaiderClass,
    style: RaidActionPose['style'],
    nowMs: number,
  ): void {
    bossHitAt = nowMs;
    heroImpactAt = nowMs;
    heroImpactStrength = style === 'basic'
      ? 1.1
      : kind === 'warrior'
        ? 4.6
        : kind === 'mage'
          ? 3.4
          : 2;
    heroImpactColor = kind === 'mage'
      ? 0x7afff1
      : kind === 'warrior'
        ? 0xffe6b2
        : color;
    if (style === 'flourish') {
      comboCount = nowMs <= comboExpiresAt ? comboCount + 1 : 1;
      comboExpiresAt = nowMs + COMBO_LINGER_MS;
      hitStopUntil = Math.max(
        hitStopUntil,
        nowMs + (kind === 'warrior' ? 58 : kind === 'mage' ? 36 : 18),
      );
    }

    const view = new Container();
    const graphic = impactGraphic(kind, style, color);
    const amount = style === 'basic'
      ? RaidRules.basicHitDamage
      : RAIDER_CLASS_STATS[kind].hitDamage;
    const damage = text(`-${amount}`, 9, 0xffd500);
    damage.anchor.set(0.5);
    damage.position.set(-6, -10);
    view.position.set(x, y);
    view.addChild(graphic, damage);
    effectLayer.addChild(view);
    rememberBurst({
      view,
      bornAt: nowMs,
      life: style === 'basic' ? 360 : kind === 'mage' ? 650 : 520,
      drift: -12 - rand01(nowMs) * 12,
      originX: x,
      originY: y,
    });
  }

  function spawnMinorImpact(
    x: number,
    y: number,
    color: number,
    nowMs: number,
  ): void {
    const view = new Container();
    view.position.set(x, y);
    view.addChild(
      new Graphics()
        .circle(0, 0, 3)
        .fill(0xffffff)
        .circle(0, 0, 8)
        .stroke({ color, alpha: 0.9, width: 1.5 }),
    );
    effectLayer.addChild(view);
    rememberBurst({
      view,
      bornAt: nowMs,
      life: 260,
      drift: -5,
      originX: x,
      originY: y,
    });
  }

  function spawnMeleeSlash(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: number,
    nowMs: number,
  ): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const slash = new Graphics()
      .moveTo(0, 7)
      .bezierCurveTo(dx * 0.28, dy - 27, dx * 0.72, dy - 24, dx, dy)
      .stroke({ color: 0x251915, alpha: 0.7, width: 10 })
      .moveTo(0, 6)
      .bezierCurveTo(dx * 0.28, dy - 27, dx * 0.72, dy - 24, dx, dy)
      .stroke({ color: 0xfff7df, alpha: 0.96, width: 4 })
      .moveTo(4, 11)
      .bezierCurveTo(dx * 0.34, dy - 15, dx * 0.72, dy - 15, dx - 3, dy + 4)
      .stroke({ color, alpha: 0.9, width: 2 })
      .circle(dx, dy, 13)
      .stroke({ color: 0xffffff, alpha: 0.75, width: 2 });
    const view = new Container();
    view.position.set(fromX, fromY);
    view.addChild(slash);
    effectLayer.addChild(view);
    rememberBurst({
      view,
      bornAt: nowMs,
      life: 300,
      drift: 0,
      originX: fromX,
      originY: fromY,
    });
  }

  function spawnBossDefeatDust(nowMs: number): void {
    const dust = new Graphics();
    for (let index = 0; index < 13; index += 1) {
      const x = -76 + index * 13 + (rand01(index * 8.4) * 8 - 4);
      const y = -4 - rand01(index * 3.6) * 18;
      const radius = 6 + rand01(index * 5.9) * 10;
      dust
        .circle(x, y, radius)
        .fill({
          color: index % 3 === 0 ? 0xb7c0a4 : 0x6e7669,
          alpha: 0.24 + rand01(index * 2.1) * 0.24,
        });
    }
    const view = new Container();
    view.position.set(BOSS_X - 80, FLOOR_Y);
    view.addChild(dust);
    effectLayer.addChild(view);
    rememberBurst({
      view,
      bornAt: nowMs,
      life: 1050,
      drift: -4,
      originX: BOSS_X - 80,
      originY: FLOOR_Y,
    });
  }

  function rememberBurst(burst: Burst): void {
    while (bursts.length >= MAX_BURSTS) {
      bursts.shift()?.view.destroy({ children: true });
    }
    bursts.push(burst);
  }

  function updateBursts(nowMs: number): void {
    for (let index = bursts.length - 1; index >= 0; index -= 1) {
      const burst = bursts[index];
      const t = (nowMs - burst.bornAt) / burst.life;
      if (t >= 1) {
        bursts.splice(index, 1);
        burst.view.destroy({ children: true });
        continue;
      }
      burst.view.alpha = 1 - t;
      burst.view.scale.set(1 + t * 0.75);
      burst.view.position.set(
        burst.originX + burst.drift * t,
        burst.originY - 18 * t,
      );
    }
  }

  function resolveBossAttack(
    nowMs: number,
    hp: number,
    heroes: readonly DrawnHero[],
  ): BossAttackState | null {
    const candidates = heroes
      .filter(hero => hero.facing === 1 && !hero.walking)
      .sort((a, b) => b.x - a.x || a.entry.unitNumber - b.entry.unitNumber);
    const plan = raid2BossAttackPlan(nowMs, stageStartedAt, hp, candidates.length);
    if (!plan) return null;
    const target = candidates[plan.targetIndex];
    return {
      ...plan,
      targetID: target.entry.id,
      targetX: target.x,
      targetY: target.groundY,
    };
  }

  function updateCamera(attack: BossAttackState | null, nowMs: number): void {
    const bossStrength = attack
      && attack.impactAgeMs >= 0
      && attack.impactAgeMs <= 210
      ? (1 - attack.impactAgeMs / 210) * (attack.kind === 'claw' ? 6 : 4.2)
      : 0;
    const heroAge = nowMs - heroImpactAt;
    const heroStrength = heroAge >= 0 && heroAge <= 180
      ? (1 - heroAge / 180) * heroImpactStrength
      : 0;
    const strength = bossStrength + heroStrength;
    const seed = Math.floor(nowMs / 20) + (attack?.cycle ?? 0) * 17;
    camera.position.set(
      SCENE_W / 2 + (rand01(seed) * 2 - 1) * strength,
      SCENE_H / 2 + (rand01(seed + 5) * 2 - 1) * strength * 0.58,
    );
    const impactZoom = Math.min(0.015, strength * 0.0018);
    const defeatAge = nowMs - bossDefeatedAt;
    const defeatZoom = defeatAge >= 0 && defeatAge < 1200
      ? (1 - smoothStep(defeatAge / 1200)) * 0.025
      : 0;
    camera.scale.set(1 + impactZoom + defeatZoom);
  }

  function updateAtmosphere(nowMs: number, hp: number): void {
    atmosphereLayer.clear();
    for (let index = 0; index < 22; index += 1) {
      const speed = 0.004 + rand01(index * 4.1) * 0.009;
      const x = (rand01(index * 9.7) * SCENE_W + nowMs * speed) % SCENE_W;
      const baseY = 118 + rand01(index * 13.3) * 172;
      const y = baseY + Math.sin(nowMs / 850 + index * 1.83) * (2 + index % 5);
      const warm = index % 4 === 0;
      atmosphereLayer
        .circle(Math.round(x), Math.round(y), warm ? 1.5 : 1)
        .fill({
          color: warm ? 0xffdc79 : 0x73d8ca,
          alpha: (0.16 + rand01(index * 5.2) * 0.24) * (hp <= ENRAGE_HP ? 0.65 : 1),
        });
    }
    for (let index = 0; index < 5; index += 1) {
      const x = ((index * 211 + nowMs * (0.008 + index * 0.001)) % 1120) - 80;
      atmosphereLayer
        .ellipse(x, FLOOR_Y - 14 - index * 2, 72 + index * 13, 5 + index)
        .fill({ color: 0xb5ded4, alpha: 0.018 + index * 0.004 });
    }
  }

  function updateBackdrop(hp: number, nowMs: number): void {
    rageOverlay.clear();
    if (hp > 0 && hp <= ENRAGE_HP) {
      rageOverlay
        .rect(0, 0, SCENE_W, FLOOR_Y)
        .fill({
          color: 0xe12316,
          alpha: 0.06 + Math.abs(Math.sin(nowMs / 260)) * 0.07,
        });
    }

    screenFlash.clear();
    const impactAge = nowMs - heroImpactAt;
    if (impactAge >= 0 && impactAge < 115) {
      const alpha = (1 - impactAge / 115)
        * (heroImpactStrength >= 6 ? 0.34 : 0.08 + heroImpactStrength * 0.018);
      screenFlash
        .rect(0, 0, SCENE_W, SCENE_H)
        .fill({ color: heroImpactColor, alpha });
    }
  }

  function updateBoss(
    attack: BossAttackState | null,
    hp: number,
    nowMs: number,
  ): void {
    const hitAge = nowMs - bossHitAt;
    const hit = Math.max(0, 1 - hitAge / 130);
    const enraged = hp > 0 && hp <= ENRAGE_HP;
    const tremor = (enraged ? 1.5 : 0) + hit * 2;
    const seed = Math.floor(nowMs / 35);
    const warning = attack?.warning ?? 0;
    const strike = attack?.strike ?? 0;
    const lunge = attack?.kind === 'claw' ? strike * 26 : strike * 9;
    const defeatAge = nowMs - bossDefeatedAt;
    const fall = hp <= 0 && defeatAge >= 0
      ? smoothStep(defeatAge / 820)
      : 0;
    if (hp <= 0 && fall > 0.34 && !defeatDustSpawned) {
      defeatDustSpawned = true;
      spawnBossDefeatDust(nowMs);
    }
    bossRoot.position.set(
      BOSS_X + fall * 31 + (rand01(seed) * 2 - 1) * tremor + warning * 6 - lunge,
      BOSS_Y + fall * 16 + (rand01(seed + 9) * 2 - 1) * tremor * 0.35,
    );
    const breathing = hp > 0 ? Math.sin(nowMs / 260) * 0.008 : 0;
    bossRoot.scale.set(
      (hp <= 0 ? 1.05 : 1) * (1 + strike * 0.025),
      (1 - fall * 0.14) * (1 + breathing),
    );
    bossRoot.rotation = hp <= 0 ? -fall * 0.1 : hit * 0.018 - strike * 0.012;
    bossRoot.alpha = hp <= 0 ? 1 - fall * 0.24 : 1;
    bossSprite.tint = hit > 0 ? 0xffa7a0 : hp <= 0 ? 0xaab0a5 : 0xffffff;

    if (!bossAnimations) return;
    const hitFrame = hp <= 0
      ? Math.min(3, 1 + Math.floor(fall * 3))
      : hitAge >= 0 && hitAge < 360
        ? Math.min(3, Math.floor(hitAge / 90))
        : null;
    const attackFrame = bossAttackFrame(attack);
    bossSprite.position.y = 48 + (attackFrame === null ? 0 : BOSS_ATTACK_FRAME_Y_OFFSET);
    // Hero projectiles land constantly. Preserve the dragon's readable
    // wind-up and strike instead of letting a small hit reaction replace it.
    if (attackFrame !== null) {
      setCombatFrame(bossSprite, bossAnimations, 'attack', attackFrame);
    } else if (hitFrame !== null) {
      setCombatFrame(bossSprite, bossAnimations, 'hit', hitFrame);
    } else {
      setCombatFrame(
        bossSprite,
        bossAnimations,
        'idle',
        Math.floor(nowMs / (enraged ? 125 : 190)) % 4,
      );
    }
  }

  function updateBossTelegraph(
    attack: BossAttackState | null,
    nowMs: number,
  ): void {
    bossTelegraph.clear();
    bossTelegraphLabel.visible = false;
    if (!attack || attack.impactAgeMs >= 0 || attack.phase < BOSS_WARNING_PHASE - 0.08) {
      return;
    }

    const reveal = smoothStep(
      (attack.phase - (BOSS_WARNING_PHASE - 0.08))
      / (BOSS_IMPACT_PHASE - (BOSS_WARNING_PHASE - 0.08)),
    );
    const pulse = 0.65 + Math.abs(Math.sin(nowMs / 72)) * 0.35;
    const radius = 25 + reveal * (attack.kind === 'fire' ? 24 : 14);
    const color = attack.kind === 'fire' ? 0xff5b22 : 0xffd2a1;
    bossTelegraph
      .ellipse(attack.targetX, attack.targetY - 2, radius, 8 + reveal * 3)
      .fill({ color: 0x5f0c07, alpha: reveal * 0.18 })
      .stroke({ color, alpha: reveal * pulse * 0.92, width: 2 })
      .circle(attack.targetX, attack.targetY - 2, 7 + reveal * 5)
      .stroke({ color: 0xffffff, alpha: reveal * 0.7, width: 1 });
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4 + nowMs / 560;
      const inner = radius - 8;
      const outer = radius + 5;
      bossTelegraph
        .moveTo(
          attack.targetX + Math.cos(angle) * inner,
          attack.targetY - 2 + Math.sin(angle) * inner * 0.25,
        )
        .lineTo(
          attack.targetX + Math.cos(angle) * outer,
          attack.targetY - 2 + Math.sin(angle) * outer * 0.25,
        )
        .stroke({ color, alpha: reveal * 0.8, width: 1.5 });
    }
    bossTelegraphLabel.visible = reveal > 0.18;
    bossTelegraphLabel.text = attack.kind === 'fire' ? 'FLAME ZONE' : 'CLAW LOCK';
    bossTelegraphLabel.position.set(attack.targetX, attack.targetY - HERO_HEIGHT - 9);
    bossTelegraphLabel.alpha = reveal * pulse;
  }

  function updateBossStrike(attack: BossAttackState | null, nowMs: number): void {
    bossStrike.clear();
    if (!attack || attack.impactAgeMs < -110 || attack.impactAgeMs > 650) return;
    const age = Math.max(0, attack.impactAgeMs);
    const fade = 1 - clamp(age / (attack.kind === 'fire' ? 650 : 330), 0, 1);
    const hitX = attack.targetX + 7;
    const hitY = attack.targetY - 38;

    if (attack.kind === 'claw') {
      for (const offset of [-13, 0, 13]) {
        bossStrike
          .arc(hitX + offset, hitY, 32 + age * 0.035, -1.12, 1.1)
          .stroke({ color: 0x7e1208, alpha: fade * 0.55, width: 9 })
          .arc(hitX + offset, hitY, 32 + age * 0.035, -1.12, 1.1)
          .stroke({ color: 0xfff4d0, alpha: fade, width: 3.5 });
      }
      bossStrike
        .arc(hitX, hitY, 38 + age * 0.04, -1.04, 1.02)
        .stroke({ color: 0xff5a1f, alpha: fade, width: 1.5 })
        .circle(hitX, hitY, 8 + age * 0.06)
        .stroke({ color: 0xffffff, alpha: fade * 0.8, width: 2 });
      for (let index = 0; index < 7; index += 1) {
        const angle = -1.25 + index * 0.42;
        const distance = 18 + age * 0.13 + (index % 3) * 7;
        const px = hitX + Math.cos(angle) * distance;
        const py = hitY + Math.sin(angle) * distance;
        bossStrike
          .moveTo(px, py)
          .lineTo(
            px + Math.cos(angle) * (5 + index % 2 * 4),
            py + Math.sin(angle) * (5 + index % 2 * 4),
          )
          .stroke({
            color: index % 2 ? 0xffc66d : 0xffffff,
            alpha: fade,
            width: 2,
          });
      }
    } else {
      const ignition = smoothStep((attack.impactAgeMs + 110) / 110);
      // Keep the fire source locked to the mouth while the attack-row sprite
      // is baseline-corrected below its otherwise higher-drawn artwork.
      const mouthY = 232 + (bossAttackFrame(attack) === null
        ? 0
        : BOSS_ATTACK_FRAME_Y_OFFSET);
      const flameTipX = lerp(BOSS_MOUTH_X - 2, hitX, ignition);
      const flameTipY = lerp(mouthY, hitY + 3, ignition);
      drawDragonFire(
        bossStrike,
        BOSS_MOUTH_X - 2,
        mouthY,
        flameTipX,
        flameTipY,
        nowMs,
        age,
        fade,
      );
      if (attack.impactAgeMs >= 0) {
        drawFireImpact(bossStrike, hitX, attack.targetY, nowMs, age, fade);
      }
    }
    const burst = 10 + age * 0.075;
    bossStrike
      .rect(attack.targetX - burst - 7, attack.targetY - 5, 7, 3)
      .rect(attack.targetX + burst, attack.targetY - 3, 7, 3)
      .fill({ color: 0xd7e0c0, alpha: fade })
      .moveTo(attack.targetX - 18, attack.targetY + 1)
      .lineTo(attack.targetX - 7, attack.targetY - 4)
      .lineTo(attack.targetX, attack.targetY + 1)
      .lineTo(attack.targetX + 9, attack.targetY - 5)
      .lineTo(attack.targetX + 21, attack.targetY + 1)
      .stroke({ color: 0x392b25, alpha: fade * 0.75, width: 2 });
  }

  function updateHud(stage: number, hp: number, nowMs: number): void {
    stageLabel.text = hp <= 0 ? 'CLEAR' : `STAGE ${stage}`;
    bossLabel.text = 'FOREST DRAGON';
    hpLabel.text = `${Math.round(hp * 100)}%`;
    hpBar
      .clear()
      .rect(560, 36, 354, 12)
      .fill({ color: 0x050e1c, alpha: 0.9 })
      .stroke({
        color: hp > 0 && hp <= ENRAGE_HP ? 0xff745c : 0xffffff,
        alpha: hp > 0 && hp <= ENRAGE_HP ? 0.72 : 0.24,
        width: 1,
      })
      .rect(563, 39, Math.max(0, 348 * hp), 6)
      .fill(hpColor(hp));

    enrageLabel.text = hp > 0 && hp <= ENRAGE_HP
      ? 'ENRAGED  //  ATTACK SPEED UP'
      : '';
    const comboVisible = hp > 0 && comboCount > 1 && nowMs <= comboExpiresAt;
    comboLabel.visible = comboVisible;
    comboSubLabel.visible = comboVisible;
    if (comboVisible) {
      comboLabel.text = `×${comboCount}`;
      const remaining = clamp((comboExpiresAt - nowMs) / COMBO_LINGER_MS, 0, 1);
      comboLabel.alpha = 0.55 + remaining * 0.45;
      comboSubLabel.alpha = comboLabel.alpha;
    }

    const victoryVisible = hp <= 0 && Number.isFinite(bossDefeatedAt);
    victoryLabel.visible = victoryVisible;
    victorySubLabel.visible = victoryVisible;
    if (victoryVisible) {
      const age = nowMs - bossDefeatedAt;
      const reveal = smoothStep(age / 420);
      victoryLabel.alpha = reveal;
      victorySubLabel.alpha = reveal * 0.82;
      const scale = 0.82 + reveal * 0.18;
      victoryLabel.scale.set(scale);
    }
  }

  function clearTransientEffects(): void {
    for (const shot of shots) shot.view.destroy();
    for (const burst of bursts) burst.view.destroy({ children: true });
    shots.length = 0;
    bursts.length = 0;
    bossStrike.clear();
    bossTelegraph.clear();
    bossTelegraphLabel.visible = false;
    hitStopUntil = -Infinity;
  }

  function removeHero(id: string): void {
    const node = heroNodes.get(id);
    if (!node) return;
    heroNodes.delete(id);
    node.root.destroy({ children: true });
  }

  function parentSize(): { width: number; height: number } {
    return {
      width: Math.max(1, canvas.parentElement?.clientWidth ?? SCENE_W),
      height: Math.max(1, canvas.parentElement?.clientHeight ?? SCENE_H),
    };
  }

  return { setSync, resize, frame, ready };
}

function isBrowserCanvas(canvas: HTMLCanvasElement): boolean {
  return typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement;
}

function createHeadlessScene(canvas: HTMLCanvasElement) {
  let committed = false;
  function resize(): void {
    const width = Math.max(1, canvas.parentElement?.clientWidth ?? SCENE_W);
    const height = Math.max(1, canvas.parentElement?.clientHeight ?? SCENE_H);
    canvas.width = Math.round(width * cappedDpr());
    canvas.height = Math.round(height * cappedDpr());
  }
  resize();
  return {
    setSync: () => { committed = true; },
    resize,
    frame: () => { void committed; },
    ready: Promise.resolve(),
  };
}

function cappedDpr(): number {
  return Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
}

function drawDragonFire(
  graphic: Graphics,
  mouthX: number,
  mouthY: number,
  tipX: number,
  tipY: number,
  nowMs: number,
  age: number,
  alpha: number,
): void {
  const pulse = 0.92 + Math.sin(nowMs / 34) * 0.08;

  // A dark, oversized silhouette gives the plume weight against the night sky.
  drawFlamePlume(
    graphic,
    mouthX,
    mouthY,
    tipX,
    tipY,
    nowMs,
    1.28 * pulse,
    0x68120b,
    alpha * 0.48,
    0.4,
  );
  drawFlamePlume(
    graphic,
    mouthX + 1,
    mouthY,
    tipX,
    tipY,
    nowMs,
    pulse,
    0xf0440b,
    alpha * 0.96,
    1.7,
  );
  drawFlamePlume(
    graphic,
    mouthX + 2,
    mouthY,
    lerp(mouthX, tipX, 0.93),
    lerp(mouthY, tipY, 0.93),
    nowMs,
    0.62 * pulse,
    0xffa20d,
    alpha,
    3.1,
  );
  drawFlamePlume(
    graphic,
    mouthX + 3,
    mouthY,
    lerp(mouthX, tipX, 0.76),
    lerp(mouthY, tipY, 0.76),
    nowMs,
    0.27 * pulse,
    0xfff2a3,
    alpha * 0.98,
    4.4,
  );

  // Detached tongues break the single-cone silhouette.
  for (let index = 0; index < 4; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const reach = 0.56 + index * 0.095;
    drawFlamePlume(
      graphic,
      lerp(mouthX, tipX, 0.12),
      lerp(mouthY, tipY, 0.12) + side * (5 + index),
      lerp(mouthX, tipX, reach),
      lerp(mouthY, tipY, reach) + side * (15 + index * 2),
      nowMs,
      0.2 + index * 0.025,
      index % 3 === 0 ? 0xffd32a : 0xff6410,
      alpha * (0.55 - index * 0.05),
      index * 1.23,
    );
  }

  const dx = tipX - mouthX;
  const dy = tipY - mouthY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  for (let index = 0; index < 20; index += 1) {
    const travel = (index * 0.173 + nowMs / 360) % 1;
    const spread = (rand01(index * 7.3) * 2 - 1) * (8 + travel * 31);
    const px = lerp(mouthX - 4, tipX, travel) + nx * spread;
    const py = lerp(mouthY, tipY, travel) + ny * spread - travel * 7;
    const hot = index % 4 === 0;
    const size = hot ? 2.4 : 1.2 + (index % 3) * 0.55;
    graphic
      .circle(Math.round(px), Math.round(py), size)
      .fill({
        color: hot ? 0xfff2a3 : index % 2 ? 0xffb20d : 0xf0440b,
        alpha: alpha * (0.85 - travel * 0.35),
      });
  }

  // The dragon's mouth must feel like the source, not a line endpoint.
  const flare = 9 + Math.sin(nowMs / 42) * 2;
  graphic
    .circle(mouthX, mouthY, flare + 7)
    .fill({ color: 0x8f1808, alpha: alpha * 0.25 })
    .circle(mouthX, mouthY, flare)
    .fill({ color: 0xff6a0b, alpha: alpha * 0.8 })
    .circle(mouthX - 1, mouthY, flare * 0.48)
    .fill({ color: 0xfff2a3, alpha });

  // A few fast horizontal streaks sell the pressure of the breath.
  for (let index = 0; index < 7; index += 1) {
    const travel = (index * 0.149 + age / 190) % 0.82;
    const px = lerp(mouthX, tipX, travel);
    const py = lerp(mouthY, tipY, travel)
      + Math.sin(index * 2.7 + nowMs / 50) * (4 + travel * 11);
    graphic
      .moveTo(px, py)
      .lineTo(px - 12 - index * 2, py + dy / length * 3)
      .stroke({
        color: index % 2 ? 0xfff2a3 : 0xffbd24,
        alpha: alpha * 0.72,
        width: index % 3 === 0 ? 2 : 1,
      });
  }
}

function drawFlamePlume(
  graphic: Graphics,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  nowMs: number,
  widthScale: number,
  color: number,
  alpha: number,
  phase: number,
): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const top: Array<{ x: number; y: number }> = [];
  const bottom: Array<{ x: number; y: number }> = [];
  const segments = 18;

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const envelope = 3 + Math.pow(Math.sin(t * Math.PI), 0.62) * 25;
    const edgeA = Math.sin(index * 2.17 + nowMs / 48 + phase) * (2 + t * 5);
    const edgeB = Math.sin(index * 1.83 - nowMs / 43 + phase * 1.7) * (2 + t * 5);
    const curl = Math.sin(t * 16 - nowMs / 66 + phase) * t * 5;
    const cx = lerp(fromX, toX, t) + nx * curl;
    const cy = lerp(fromY, toY, t) + ny * curl;
    top.push({
      x: Math.round(cx + nx * (envelope + edgeA) * widthScale),
      y: Math.round(cy + ny * (envelope + edgeA) * widthScale),
    });
    bottom.push({
      x: Math.round(cx - nx * (envelope + edgeB) * widthScale),
      y: Math.round(cy - ny * (envelope + edgeB) * widthScale),
    });
  }

  graphic.moveTo(top[0].x, top[0].y);
  for (let index = 1; index < top.length; index += 1) {
    graphic.lineTo(top[index].x, top[index].y);
  }
  for (let index = bottom.length - 1; index >= 0; index -= 1) {
    graphic.lineTo(bottom[index].x, bottom[index].y);
  }
  graphic.closePath().fill({ color, alpha });
}

function drawFireImpact(
  graphic: Graphics,
  x: number,
  groundY: number,
  nowMs: number,
  age: number,
  alpha: number,
): void {
  const burst = smoothStep(clamp(age / 95, 0, 1));
  const settle = 1 - smoothStep(clamp((age - 280) / 330, 0, 1));
  const impactAlpha = alpha * settle;

  graphic
    .ellipse(x, groundY - 1, 48 + burst * 18, 7 + burst * 3)
    .fill({ color: 0x5c1108, alpha: impactAlpha * 0.45 })
    .ellipse(x, groundY - 3, 34 + burst * 11, 4 + burst * 2)
    .fill({ color: 0xff6b0a, alpha: impactAlpha * 0.34 });

  for (let index = 0; index < 7; index += 1) {
    const offset = (index - 3) * 11;
    const flicker = 0.82 + rand01(Math.floor(nowMs / 45) + index * 9) * 0.34;
    const height = (20 + (3 - Math.abs(index - 3)) * 9) * flicker * burst;
    const halfWidth = 5 + (index % 3);
    const lean = Math.sin(nowMs / 70 + index * 1.7) * 8;
    graphic
      .moveTo(x + offset - halfWidth, groundY)
      .bezierCurveTo(
        x + offset - halfWidth - 4,
        groundY - height * 0.44,
        x + offset + lean - 2,
        groundY - height * 0.72,
        x + offset + lean,
        groundY - height,
      )
      .bezierCurveTo(
        x + offset + lean + 5,
        groundY - height * 0.62,
        x + offset + halfWidth + 4,
        groundY - height * 0.3,
        x + offset + halfWidth,
        groundY,
      )
      .closePath()
      .fill({
        color: index % 2 ? 0xff4b09 : 0xff8c0a,
        alpha: impactAlpha * 0.9,
      })
      .moveTo(x + offset - 2, groundY - 2)
      .lineTo(x + offset + lean * 0.55, groundY - height * 0.62)
      .lineTo(x + offset + 3, groundY - 2)
      .closePath()
      .fill({ color: 0xffd72d, alpha: impactAlpha * 0.9 });
  }

  for (let index = 0; index < 14; index += 1) {
    const angle = -2.85 + index * 0.21;
    const distance = 12 + age * (0.075 + rand01(index + 4) * 0.08);
    const px = x + Math.cos(angle) * distance;
    const py = groundY - 9 + Math.sin(angle) * distance * 0.72;
    graphic
      .rect(Math.round(px), Math.round(py), index % 4 === 0 ? 3 : 2, 2)
      .fill({
        color: index % 3 === 0 ? 0xfff1a3 : 0xff7a0a,
        alpha: impactAlpha * (1 - clamp(age / 520, 0, 1)),
      });
  }

  if (age > 120) {
    const smokeAlpha = smoothStep((age - 120) / 150) * alpha * 0.34;
    for (let index = 0; index < 7; index += 1) {
      const drift = Math.sin(index * 2.4 + nowMs / 160) * (8 + index * 2);
      const rise = (age - 120) * (0.045 + index * 0.006);
      graphic
        .circle(
          x + (index - 3) * 8 + drift,
          groundY - 27 - rise - (index % 3) * 8,
          8 + index * 1.4 + age * 0.012,
        )
        .fill({
          color: index % 2 ? 0x302b2c : 0x4b3b35,
          alpha: smokeAlpha * (0.9 - index * 0.07),
        });
    }
  }
}

function motionProgress(motion: HeroMotion, nowMs: number, duration: number): number {
  return clamp((nowMs - motion.startedAt - motion.delay) / duration, 0, 1);
}

function formationSpot(
  unitNumber: number,
  deployedUnitNumbers: readonly number[],
): { x: number; y: number } {
  const kind = raiderClassOf(unitNumber);
  const peers = [...new Set([...deployedUnitNumbers, unitNumber])]
    .filter(number => raiderClassOf(number) === kind)
    .sort((a, b) => a - b);
  const slot = peers.indexOf(unitNumber);
  const row = Math.floor(slot / 4);
  const column = slot % 4;
  const rowCount = Math.min(4, peers.length - row * 4);
  const baseX: Record<RaiderClass, number> = {
    archer: 218,
    mage: 365,
    warrior: 532,
  };
  const gap: Record<RaiderClass, number> = {
    archer: 46,
    mage: 44,
    warrior: 40,
  };
  return {
    x: baseX[kind] + (column - (rowCount - 1) / 2) * gap[kind] - row * 9,
    y: FLOOR_Y - row * 9 - (column % 2) * 2,
  };
}

function text(value: string, size: number, color: number): Text {
  return new Text({
    text: value,
    style: {
      fill: color,
      fontFamily: FONT,
      fontSize: size,
      fontWeight: '800',
    },
  });
}

function stageBadge(): Graphics {
  return new Graphics()
    .rect(22, 22, 74, 22)
    .fill({ color: 0x050e1c, alpha: 0.72 });
}

function crownGraphic(): Graphics {
  return new Graphics()
    .moveTo(-10, -70)
    .lineTo(-10, -82)
    .lineTo(-4, -77)
    .lineTo(0, -85)
    .lineTo(5, -77)
    .lineTo(11, -82)
    .lineTo(11, -70)
    .closePath()
    .fill(0xffd75a)
    .stroke({ color: 0x251b24, width: 2 });
}

function focusGraphic(): Graphics {
  const graphic = new Graphics();
  const left = -HERO_HALF_WIDTH - 4;
  const right = HERO_HALF_WIDTH + 4;
  const top = -HERO_HEIGHT - 18;
  const bottom = 6;
  const arm = 6;
  for (const [x, y, dx, dy] of [
    [left, top, 1, 1],
    [right, top, -1, 1],
    [right, bottom, -1, -1],
    [left, bottom, 1, -1],
  ] as const) {
    graphic
      .moveTo(x + dx * arm, y)
      .lineTo(x, y)
      .lineTo(x, y + dy * arm);
  }
  return graphic.stroke({ color: 0xffffff, width: 1.5 });
}

function drawStatus(graphic: Graphics, entry: EntryPresentation, nowMs: number): void {
  const color = entry.status === 'working'
    ? 0xffffff
    : entry.status === 'idle'
      ? colorNumber(palette.statusPit)
      : entry.status === 'done'
        ? 0xffffff
        : colorNumber(palette.liveRed);
  const alpha = entry.status === 'blocked'
    ? 0.25 + 0.75 * Math.abs(Math.sin(Math.PI * nowMs / 800))
    : 0.85;
  graphic
    .clear()
    .rect(-18, 1, 36, entry.status === 'done' ? 5 : 4)
    .fill(0x0a0c10)
    .rect(-16, 2, 32, entry.status === 'done' ? 3 : 2)
    .fill({ color, alpha });
}

function drawTeamBadge(graphic: Graphics, entry: EntryPresentation): void {
  graphic
    .clear()
    .rect(-5, -16, 10, 6)
    .fill(0x251b24)
    .rect(-4, -15, 8, 4)
    .fill(colorNumber(teamColor(entry.colorToken)));
}

function drawHeroChannel(
  graphic: Graphics,
  kind: RaiderClass,
  motion: Raid2HeroMotion,
  team: number,
  groundOffsetY: number,
  nowMs: number,
): void {
  graphic.clear();
  if (kind === 'warrior') {
    const dash = clamp((motion.x + 8) / 90, 0, 1);
    if (dash <= 0.04) return;
    for (let index = 0; index < 4; index += 1) {
      const flicker = 0.7 + rand01(Math.floor(nowMs / 45) + index * 5) * 0.3;
      graphic
        .circle(
          -22 - index * 8,
          groundOffsetY - 2 - (index % 2) * 3,
          (3 + index) * flicker,
        )
        .fill({ color: 0xb8b6a2, alpha: dash * (0.18 - index * 0.025) })
        .moveTo(-17 - index * 9, -47 + index * 9)
        .lineTo(-35 - index * 11, -47 + index * 9)
        .stroke({ color: team, alpha: dash * 0.34, width: 1.5 });
    }
    return;
  }

  if (kind === 'archer') {
    if (motion.charge <= 0.04) return;
    const reach = 24 + motion.charge * 20;
    graphic
      .moveTo(12, -36)
      .lineTo(reach, -36)
      .stroke({ color: team, alpha: motion.charge * 0.52, width: 1 })
      .circle(reach + 4, -36, 4 + motion.charge * 2)
      .stroke({ color: 0xffffff, alpha: motion.charge * 0.55, width: 1 });
    return;
  }

  const charge = motion.charge;
  if (!motion.aerial && charge <= 0.02) return;
  const runeAlpha = 0.22 + charge * 0.38;
  const runeRadius = 21 + charge * 8;
  graphic
    .ellipse(0, groundOffsetY - 1, runeRadius, 6 + charge * 2)
    .stroke({ color: 0x55f5ef, alpha: runeAlpha, width: 1.5 })
    .ellipse(0, groundOffsetY - 1, runeRadius * 0.58, 3.5 + charge)
    .stroke({ color: team, alpha: runeAlpha * 0.85, width: 1 });
  for (let index = 0; index < 6; index += 1) {
    const angle = nowMs / 430 + index * Math.PI / 3;
    graphic
      .circle(
        Math.cos(angle) * runeRadius,
        groundOffsetY - 1 + Math.sin(angle) * 5.5,
        1.3,
      )
      .fill({ color: index % 2 ? team : 0xbffff7, alpha: runeAlpha + 0.12 });
  }
  const orbX = 25;
  const orbY = -39;
  graphic
    .circle(orbX, orbY, 7 + charge * 7)
    .fill({ color: 0x55f5ef, alpha: charge * 0.16 })
    .circle(orbX, orbY, 3 + charge * 3)
    .fill({ color: team, alpha: 0.3 + charge * 0.55 });
  for (let index = 0; index < 3; index += 1) {
    const angle = -nowMs / 150 + index * Math.PI * 2 / 3;
    const orbit = 11 + charge * 8;
    graphic
      .circle(
        orbX + Math.cos(angle) * orbit,
        orbY + Math.sin(angle) * orbit,
        1.5 + charge,
      )
      .fill({ color: 0xffffff, alpha: charge * 0.9 });
  }
}

function drawDefense(
  node: HeroNode,
  kind: RaiderClass,
  attack: BossAttackState | null,
  hit: number,
  nowMs: number,
): void {
  node.defense.clear();
  node.reactionLabel.visible = false;
  if (!attack) return;
  if (hit <= 0) return;
  const guarded = kind === 'warrior';
  const warded = kind === 'mage';
  const color = guarded ? 0xbde8ff : warded ? 0x76fff4 : 0xffe2a1;
  if (warded) {
    node.defense
      .circle(2, -39, 28 + (1 - hit) * 8)
      .stroke({ color, alpha: hit * 0.78, width: 2.5 })
      .circle(2, -39, 21 + (1 - hit) * 13)
      .stroke({ color: 0xffffff, alpha: hit * 0.4, width: 1 });
  } else {
    node.defense
      .arc(guarded ? 15 : 4, -38, 19 + (1 - hit) * 16, -1.35, 1.35)
      .stroke({ color, alpha: hit, width: guarded ? 3.5 : 2 });
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = nowMs / 80 + index * Math.PI / 2;
    node.defense
      .rect(
        4 + Math.cos(angle) * (17 + (1 - hit) * 12),
        -38 + Math.sin(angle) * (13 + (1 - hit) * 8),
        3,
        2,
      )
      .fill({ color, alpha: hit });
  }
  node.reactionLabel.visible = true;
  node.reactionLabel.text = guarded ? 'GUARD' : warded ? 'BARRIER' : 'EVADE';
  node.reactionLabel.style.fill = color;
  node.reactionLabel.alpha = hit;
  node.reactionLabel.y = -HERO_HEIGHT - 10 - (1 - hit) * 8;
}

function heroHitReaction(attack: BossAttackState | null): number {
  if (!attack || attack.impactAgeMs < 0 || attack.impactAgeMs > 390) return 0;
  if (attack.impactAgeMs < 85) return 1;
  return 1 - smoothStep((attack.impactAgeMs - 85) / 305);
}

function heroHitFrame(attack: BossAttackState | null): number | null {
  if (!attack || attack.impactAgeMs < 0 || attack.impactAgeMs >= 390) return null;
  return Math.min(3, Math.floor(attack.impactAgeMs / 97.5));
}

function actionFrame(pose: RaidActionPose): number | null {
  const window = pose.style === 'basic'
    ? [0.28, 0.68]
    : pose.kind === 'warrior'
      ? [0.3, 0.68]
      : pose.kind === 'mage'
        ? [0.08, 0.8]
        : [0.06, 0.64];
  if (pose.phase < window[0] || pose.phase >= window[1]) return null;
  return Math.min(
    3,
    Math.floor(((pose.phase - window[0]) / (window[1] - window[0])) * 4),
  );
}

function bossAttackFrame(attack: BossAttackState | null): number | null {
  if (!attack || attack.phase < 0.28 || attack.phase >= 0.76) return null;
  return Math.min(3, Math.floor(((attack.phase - 0.28) / 0.48) * 4));
}

export function combatAnimationsFromSheet(
  sheet: Texture,
  inset: { right: number } = { right: 0 },
): CombatAnimations {
  const frameWidth = sheet.width / SPRITE_SHEET_COLUMNS;
  const frameHeight = sheet.height / SPRITE_SHEET_ROWS;
  if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) {
    throw new Error(
      `Raid 2 sprite sheet must be ${SPRITE_SHEET_COLUMNS}x${SPRITE_SHEET_ROWS}; `
      + `received ${sheet.width}x${sheet.height}`,
    );
  }
  const visibleWidth = frameWidth - inset.right;
  if (visibleWidth <= 0) {
    throw new Error(`Raid 2 sprite sheet right inset must be smaller than ${frameWidth}`);
  }
  const row = (rowIndex: number): Texture[] =>
    Array.from({ length: SPRITE_SHEET_COLUMNS }, (_, column) =>
      new Texture({
        source: sheet.source,
        frame: new Rectangle(
          column * frameWidth,
          rowIndex * frameHeight,
          visibleWidth,
          frameHeight,
        ),
      }));
  return {
    idle: row(COMBAT_ANIMATION_ROWS.idle),
    attack: row(COMBAT_ANIMATION_ROWS.attack),
    hit: row(COMBAT_ANIMATION_ROWS.hit),
  };
}

function setCombatFrame(
  sprite: AnimatedSprite,
  animations: CombatAnimations,
  animation: CombatAnimation,
  frame: number,
): void {
  const textures = animations[animation];
  if (sprite.textures !== textures) sprite.textures = textures;
  const nextFrame = Math.max(0, Math.min(textures.length - 1, Math.floor(frame)));
  if (sprite.currentFrame !== nextFrame) sprite.gotoAndStop(nextFrame);
}

function projectileGraphic(
  kind: RaiderClass,
  style: RaidActionPose['style'],
  color: number,
): Graphics {
  const graphic = new Graphics();
  if (style === 'basic') {
    return graphic
      .moveTo(-10, 0)
      .lineTo(5, 0)
      .stroke({ color, alpha: 0.86, width: 1.5 })
      .circle(5, 0, 1.7)
      .fill(0xffffff);
  }
  if (kind === 'mage') {
    graphic
      .moveTo(-30, 0)
      .lineTo(-7, 0)
      .stroke({ color, alpha: 0.26, width: 6 })
      .moveTo(-22, 0)
      .lineTo(-5, 0)
      .stroke({ color: 0xbffff7, alpha: 0.72, width: 2 })
      .circle(0, 0, 11)
      .fill({ color, alpha: 0.18 })
      .circle(0, 0, 6)
      .fill(color)
      .circle(0, 0, 2.2)
      .fill(0xffffff);
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI / 2;
      graphic
        .moveTo(Math.cos(angle) * 9, Math.sin(angle) * 9)
        .lineTo(Math.cos(angle) * 15, Math.sin(angle) * 15)
        .stroke({ color: 0xffffff, alpha: 0.65, width: 1 });
    }
    return graphic;
  }
  return graphic
    .moveTo(-25, 0)
    .lineTo(5, 0)
    .stroke({ color: 0xffffff, alpha: 0.2, width: 4 })
    .moveTo(-18, 0)
    .lineTo(7, 0)
    .stroke({ color, width: 1.8 })
    .moveTo(10, 0)
    .lineTo(5, -3)
    .lineTo(5, 3)
    .closePath()
    .fill(color);
}

function impactGraphic(
  kind: RaiderClass,
  style: RaidActionPose['style'],
  color: number,
): Graphics {
  const graphic = new Graphics();
  if (style === 'basic') {
    return graphic.circle(0, 0, 6).stroke({ color, width: 1.5 });
  }
  if (kind === 'warrior') {
    return graphic
      .arc(0, 0, 21, -1.2, 1.18)
      .stroke({ color: 0x251915, alpha: 0.7, width: 8 })
      .arc(0, 0, 19, -1.15, 1.12)
      .stroke({ color: 0xfff4dc, width: 4 })
      .arc(0, 0, 13, -0.92, 0.9)
      .stroke({ color, width: 2 });
  }
  if (kind === 'mage') {
    return graphic
      .circle(0, 0, 9)
      .fill({ color: 0xffffff, alpha: 0.8 })
      .circle(0, 0, 17)
      .stroke({ color, width: 3 })
      .circle(0, 0, 27)
      .stroke({ color, alpha: 0.65, width: 1.5 })
      .circle(0, 0, 36)
      .stroke({ color: 0xbffff7, alpha: 0.28, width: 1 });
  }
  for (const offset of [-0.38, 0, 0.38]) {
    graphic
      .moveTo(Math.cos(offset) * 3, Math.sin(offset) * 3)
      .lineTo(Math.cos(offset) * 26, Math.sin(offset) * 26);
  }
  return graphic.stroke({ color, width: 2.2 });
}

function hpColor(hp: number): number {
  if (hp <= 0) return 0x4a4f58;
  if (hp > 0.5) return colorNumber(palette.statusWorking);
  if (hp > 0.2) return colorNumber(palette.statusBlocked);
  return colorNumber(palette.liveRed);
}

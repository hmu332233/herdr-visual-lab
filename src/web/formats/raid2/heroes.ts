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

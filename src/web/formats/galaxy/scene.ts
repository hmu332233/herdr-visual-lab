import { Application, Container, Graphics, Text } from 'pixi.js';
import { stableHash } from '../../../shared/deterministic.js';
import type { GalaxyEffect } from './fold.js';
import type { GalaxyView } from './view.js';
import {
  advanceOrbits, createMotion, focusTarget, placeGalaxy,
  type GalaxyLayout, type MoonNode, type MoonStatus, type PlanetNode, type SunNode,
} from './layout.js';
import { HEAT_STOPS, PALETTE, STATUS_COLOR, SYSTEM_HUES, type SystemHue } from './vocabulary.js';

/** Live one-shot animation started when the fold reports a transition. */
interface ActiveEffect extends GalaxyEffect {
  startedAt: number;
  x: number;
  y: number;
}

const EFFECT_DURATION_MS = 900;
const TRAIL_STEPS = 7;
const TAU = Math.PI * 2;

function lerpColor(from: number, to: number, t: number): number {
  const mix = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * Math.min(1, Math.max(0, t))) << shift;
  };
  return mix(16) | mix(8) | mix(0);
}

/** Star temperature for a heat value, interpolated between stops. */
function heatColor(heat: number): number {
  for (let i = 1; i < HEAT_STOPS.length; i += 1) {
    const [prevAt, prevColor] = HEAT_STOPS[i - 1];
    const [at, color] = HEAT_STOPS[i];
    if (heat <= at) return lerpColor(prevColor, color, (heat - prevAt) / (at - prevAt));
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

/** Per-workspace color family, assigned by authoritative team order so
 *  concurrent workspaces never share a hue (until the palette runs out). */
function hueMapOf(view: GalaxyView): Map<string, SystemHue> {
  return new Map(view.teams.map((team, index) => [team.id, SYSTEM_HUES[index % SYSTEM_HUES.length]]));
}

const EMPTY_MOON = 0x5d6880;

function moonColor(status: MoonStatus): number {
  return status === 'empty' ? EMPTY_MOON : STATUS_COLOR[status];
}

/** Deterministic pseudo-random stream for decorative placement. */
function* lcg(seed: number): Generator<number> {
  let state = seed >>> 0;
  while (true) {
    state = (state * 1664525 + 1013904223) >>> 0;
    yield state / 0xffffffff;
  }
}

/**
 * Thin pixi adapter: everything it draws is computed by the pure fold,
 * view, and layout modules. Bodies are deliberately flat Graphics circles;
 * atmosphere is limited to restrained halos, rings, and particle accents.
 * Excluded from unit tests (verified via agent-browser).
 */
export function createGalaxyScene(
  canvas: HTMLCanvasElement,
  onFocus: (terminalID: string) => void,
  currentView: () => GalaxyView,
  drainEffects: () => GalaxyEffect[],
) {
  const wrap = canvas.parentElement!;
  const app = new Application();
  const motion = createMotion();
  const effects: ActiveEffect[] = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let ready = false;
  let lastFrame: number | null = null;
  let layout: GalaxyLayout = {
    sun: { x: 0, y: 0, radius: 0, label: 'HERDR', heat: 0 },
    planets: [], moons: [], rings: [], scale: 1,
  };
  let pointer: { x: number; y: number } | null = null;
  let hues = new Map<string, SystemHue>();
  const hueOf = (teamID: string): SystemHue => hues.get(teamID) ?? SYSTEM_HUES[0];

  const starfield = new Graphics();
  const ambience = new Graphics();
  const linework = new Graphics();
  const bodies = new Graphics();
  const labels = new Container();
  const labelPool = new Map<string, Text>();

  const tooltip = document.createElement('div');
  tooltip.className = 'galaxy-tooltip';
  tooltip.hidden = true;
  wrap.appendChild(tooltip);

  void app.init({
    canvas,
    width: Math.max(1, wrap.clientWidth),
    height: Math.max(1, wrap.clientHeight),
    background: PALETTE.background,
    antialias: true,
    autoStart: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  }).then(() => {
    app.stage.addChild(starfield, ambience, linework, bodies, labels);
    paintStarfield();
    ready = true;
  });

  /** Keeps the renderer matched to the wrap. Resize events can fire while
   *  pixi is still initializing, so this self-heals on every frame too. */
  function syncRendererSize(): void {
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    if (Math.abs(app.screen.width - w) < 1 && Math.abs(app.screen.height - h) < 1) return;
    app.renderer.resize(w, h);
    paintStarfield();
  }

  function paintStarfield(): void {
    const random = lcg(0x9e3779b9);
    starfield.clear();
    const w = app.screen.width;
    const h = app.screen.height;
    const count = Math.round((w * h) / 3400);
    for (let i = 0; i < count; i += 1) {
      const x = random.next().value * w;
      const y = random.next().value * h;
      const size = 0.4 + random.next().value * 1.2;
      starfield.circle(x, y, size).fill({ color: 0xffffff, alpha: 0.1 + random.next().value * 0.28 });
    }
  }

  /** A soft halo: a few concentric low-alpha circles around a flat body. */
  function halo(x: number, y: number, radius: number, color: number, strength: number): void {
    for (let ring = 3; ring >= 1; ring -= 1) {
      bodies.circle(x, y, radius * (1 + ring * 0.45)).fill({ color, alpha: strength * 0.05 * (4 - ring) });
    }
  }

  /** One faint warm zone around the sun; tiny hue zones around planets. */
  function paintAmbience(): void {
    ambience.clear();
    const sun = layout.sun;
    ambience.circle(sun.x, sun.y, sun.radius * 5).fill({ color: 0x40361c, alpha: 0.1 });
    ambience.circle(sun.x, sun.y, sun.radius * 3).fill({ color: 0x40361c, alpha: 0.1 });
    for (const planet of layout.planets) {
      const hue = hueOf(planet.teamID);
      ambience.circle(planet.x, planet.y, planet.radius * 4.5).fill({ color: hue.nebula, alpha: 0.09 });
    }
  }

  /** Dotted tilted ellipses for every orbit. */
  function drawLinework(): void {
    linework.clear();
    for (const ring of layout.rings) {
      const hue = ring.teamID === null ? { ring: PALETTE.ring } : hueOf(ring.teamID);
      const faint = ring.emphasis === 'faint';
      const cos = Math.cos(ring.rotation);
      const sin = Math.sin(ring.rotation);
      const point = (angle: number): [number, number] => {
        const lx = Math.cos(angle) * ring.rx;
        const ly = Math.sin(angle) * ring.ry;
        return [ring.x + lx * cos - ly * sin, ring.y + lx * sin + ly * cos];
      };
      const steps = Math.max(36, Math.round((ring.rx + ring.ry) / 4));
      for (let i = 0; i < steps; i += 2) {
        const [fx, fy] = point((i / steps) * TAU);
        const [tx, ty] = point(((i + 1) / steps) * TAU);
        linework.moveTo(fx, fy).lineTo(tx, ty);
      }
      linework.stroke({ color: hue.ring, width: 1, alpha: faint ? 0.28 : 0.55 });
    }
  }

  /** The sun: flat warm disc whose vigor follows overall session activity. */
  function drawSun(sun: SunNode, nowMs: number): void {
    const tint = lerpColor(0xd8b36a, 0xfff3d0, 0.3 + sun.heat * 0.7);
    halo(sun.x, sun.y, sun.radius * (1.25 + sun.heat * 0.3), tint, 0.55 + sun.heat * 0.35);
    const breath = reducedMotion.matches ? 1 : 1 + (0.02 + 0.03 * sun.heat) * Math.sin(nowMs / (900 - sun.heat * 400));
    bodies.circle(sun.x, sun.y, sun.radius * breath).fill({ color: tint, alpha: 0.97 });
    // Slow corona arcs, livelier when the session is busy.
    const spin = reducedMotion.matches ? 0 : nowMs / (9000 - sun.heat * 3000);
    const arc = (r: number, start: number, sweep: number, width: number, alpha: number): void => {
      bodies.moveTo(sun.x + Math.cos(start) * r, sun.y + Math.sin(start) * r)
        .arc(sun.x, sun.y, r, start, start + sweep)
        .stroke({ color: tint, width, alpha });
    };
    for (let segment = 0; segment < 3; segment += 1) {
      arc(sun.radius * 1.5, spin + segment * (TAU / 3), TAU / 3 - 0.5, 1.4, 0.3);
      arc(sun.radius * 1.85, -spin * 0.6 + segment * (TAU / 3) + 0.4, TAU / 3 - 1.3, 1, 0.18);
    }
  }

  /** A workspace-planet: hue identity, heat glow, crescent shading. */
  function drawPlanet(planet: PlanetNode, nowMs: number): void {
    const hue = hueOf(planet.teamID);
    const tint = lerpColor(hue.star, heatColor(planet.heat), 0.3 + planet.heat * 0.25);
    const dim = 0.72 + 0.28 * (planet.depth + 1) / 2;
    const shimmer = reducedMotion.matches ? 1 : 1 + planet.heat * 0.04 * Math.sin(nowMs / 300 + planet.x);
    if (planet.heat > 0) halo(planet.x, planet.y, planet.radius, tint, (0.3 + planet.heat * 0.5) * dim);
    bodies.circle(planet.x, planet.y, planet.radius * shimmer).fill({ color: tint, alpha: dim });
    // A darker crescent rim suggests shading without a texture.
    bodies.circle(planet.x + planet.radius * 0.24, planet.y + planet.radius * 0.24, planet.radius * 0.9)
      .fill({ color: 0x141a2a, alpha: 0.4 * dim });
  }

  function drawMoon(moon: MoonNode, nowMs: number): void {
    const color = moonColor(moon.status);
    const still = reducedMotion.matches;
    const pulse = still ? 1
      : moon.status === 'working' ? 1 + 0.22 * Math.sin(nowMs / 180)
      : moon.status === 'blocked' ? (Math.sin(nowMs / 260) > 0 ? 1.12 : 0.78)
      : 1;
    const dim = 0.75 + 0.25 * (Math.max(-1, Math.min(1, moon.depth)) + 1) / 2;
    if (moon.status === 'working' || moon.status === 'done' || moon.status === 'blocked') {
      halo(moon.x, moon.y, moon.radius * pulse, color, 0.6 * dim);
    }
    if (moon.status === 'working' && !still) drawTrail(moon, color);
    const alpha = moon.status === 'blocked' && !still ? 0.55 + 0.45 * (pulse > 1 ? 1 : 0.4) : dim;
    bodies.circle(moon.x, moon.y, moon.radius * pulse).fill({ color, alpha });
    if (moon.status === 'empty') {
      bodies.circle(moon.x, moon.y, moon.radius).stroke({ color: 0x8892ac, width: 1, alpha: 0.5 * dim });
    }
    if (moon.status === 'blocked') {
      const phase = still ? 0.4 : (nowMs % 1600) / 1600;
      bodies.circle(moon.x, moon.y, moon.radius * (1.8 + phase * 2.6))
        .stroke({ color, width: 1.5 * (1 - phase), alpha: 0.7 * (1 - phase) });
    }
    // Extra inhabitants show as sparks circling the moon.
    if (moon.agents.length > 1 && !still) {
      for (let spark = 0; spark < moon.agents.length; spark += 1) {
        const a = nowMs / 900 + spark * (TAU / moon.agents.length);
        bodies.circle(moon.x + Math.cos(a) * moon.radius * 1.9, moon.y + Math.sin(a) * moon.radius * 1.9, 1.3)
          .fill({ color, alpha: 0.7 });
      }
    }
    if (moon.agents.some(agent => agent.isFocused)) drawReticle(moon);
  }

  function drawTrail(moon: MoonNode, color: number): void {
    const { cx, cy, rx, ry, rotation, angle } = moon.orbit;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (let step = 1; step <= TRAIL_STEPS; step += 1) {
      const back = angle - step * 0.16;
      const lx = Math.cos(back) * rx;
      const ly = Math.sin(back) * ry;
      bodies.circle(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos,
        moon.radius * 0.5 * (1 - step / (TRAIL_STEPS + 1)))
        .fill({ color, alpha: 0.4 * (1 - step / (TRAIL_STEPS + 1)) });
    }
  }

  function drawReticle(node: { x: number; y: number; radius: number }): void {
    bodies.circle(node.x, node.y, node.radius * 2.4)
      .stroke({ color: PALETTE.focusRing, width: 1.5, alpha: 0.9 });
    for (let tick = 0; tick < 4; tick += 1) {
      const a = tick * (TAU / 4);
      bodies.moveTo(node.x + Math.cos(a) * node.radius * 2.4, node.y + Math.sin(a) * node.radius * 2.4)
        .lineTo(node.x + Math.cos(a) * node.radius * 3.2, node.y + Math.sin(a) * node.radius * 3.2)
        .stroke({ color: PALETTE.focusRing, width: 1.5, alpha: 0.9 });
    }
  }

  /** Light packets flowing moon → planet → sun for working tabs. */
  function drawEnergyFlow(nowMs: number): void {
    if (reducedMotion.matches) return;
    const planetByTeam = new Map(layout.planets.map(node => [node.teamID, node]));
    const leg = (fromX: number, fromY: number, toX: number, toY: number, phase: number, color: number): void => {
      for (let packet = 0; packet < 3; packet += 1) {
        const t = ((nowMs / 2400) + phase + packet / 3) % 1;
        const eased = t * t * (3 - 2 * t);
        bodies.circle(fromX + (toX - fromX) * eased, fromY + (toY - fromY) * eased, 1.7 * (1 - t * 0.5))
          .fill({ color, alpha: 0.55 * (1 - Math.abs(t - 0.5) * 1.2) });
      }
    };
    for (const moon of layout.moons) {
      if (moon.status !== 'working') continue;
      const planet = planetByTeam.get(moon.teamID);
      if (!planet) continue;
      const color = hueOf(moon.teamID).star;
      const phase = Number(stableHash(moon.key) % 97n) / 97;
      leg(moon.x, moon.y, planet.x, planet.y, phase, color);
      leg(planet.x, planet.y, layout.sun.x, layout.sun.y, phase + 0.5, color);
    }
  }

  /** Roughly every 40s a meteor crosses the sky for ~2s, path seeded by epoch. */
  function drawMeteor(nowMs: number, w: number, h: number): void {
    if (reducedMotion.matches) return;
    const epoch = Math.floor(nowMs / 40_000);
    const progress = (nowMs % 40_000) / 2_200;
    if (progress >= 1) return;
    const random = lcg(epoch + 1);
    const fromX = random.next().value * w;
    const fromY = random.next().value * h * 0.4;
    const toX = fromX + (random.next().value - 0.2) * w * 0.5;
    const toY = fromY + (0.3 + random.next().value * 0.5) * h;
    const x = fromX + (toX - fromX) * progress;
    const y = fromY + (toY - fromY) * progress;
    const tail = 0.06;
    bodies.moveTo(fromX + (toX - fromX) * Math.max(0, progress - tail), fromY + (toY - fromY) * Math.max(0, progress - tail))
      .lineTo(x, y)
      .stroke({ color: 0xffffff, width: 1.4, alpha: 0.5 * (1 - progress) });
  }

  function drawEffects(nowMs: number): void {
    for (let i = effects.length - 1; i >= 0; i -= 1) {
      const effect = effects[i];
      const progress = (nowMs - effect.startedAt) / EFFECT_DURATION_MS;
      if (progress >= 1 || reducedMotion.matches) { effects.splice(i, 1); continue; }
      const fade = 1 - progress;
      if (effect.kind === 'blocked-shockwave') {
        bodies.circle(effect.x, effect.y, 6 + progress * 60)
          .stroke({ color: STATUS_COLOR.blocked, width: 2.5 * fade, alpha: 0.8 * fade });
      } else if (effect.kind === 'done-burst') {
        for (let spark = 0; spark < 8; spark += 1) {
          const a = spark * (TAU / 8);
          const distance = 4 + progress * 34;
          bodies.circle(effect.x + Math.cos(a) * distance, effect.y + Math.sin(a) * distance, 1.8 * fade)
            .fill({ color: STATUS_COLOR.done, alpha: 0.9 * fade });
        }
      } else if (effect.kind === 'unit-born') {
        bodies.circle(effect.x, effect.y, 3 + progress * 22)
          .stroke({ color: PALETTE.focusRing, width: 1.5 * fade, alpha: 0.6 * fade });
      } else {
        bodies.circle(effect.x, effect.y, 5 * fade).fill({ color: PALETTE.planet, alpha: 0.5 * fade });
      }
    }
  }

  function syncLabels(): void {
    const seen = new Set<string>();
    const place = (key: string, text: string, x: number, y: number, size: number, alpha: number): void => {
      seen.add(key);
      let label = labelPool.get(key);
      if (!label) {
        label = new Text({ text, style: { fontFamily: 'ui-monospace, monospace', fontSize: size, fill: PALETTE.label, letterSpacing: 2 } });
        label.anchor.set(0.5, 0);
        labelPool.set(key, label);
        labels.addChild(label);
      }
      if (label.text !== text) label.text = text;
      label.style.fontSize = size;
      label.alpha = alpha;
      label.position.set(x, y);
    };
    for (const planet of layout.planets) {
      place(planet.key, planet.label.toUpperCase(), planet.x, planet.y + planet.radius + 8, 12, 0.9);
    }
    place('sun', layout.sun.label, layout.sun.x, layout.sun.y + layout.sun.radius + 10, 11, 0.55);
    for (const [key, label] of labelPool) {
      if (seen.has(key)) continue;
      labels.removeChild(label);
      label.destroy();
      labelPool.delete(key);
    }
  }

  /** Only moons with inhabitants are click/hover targets. */
  function hitMoon(x: number, y: number): MoonNode | null {
    let best: MoonNode | null = null;
    let bestDistance = Infinity;
    for (const moon of layout.moons) {
      if (moon.agents.length === 0) continue;
      const distance = Math.hypot(moon.x - x, moon.y - y);
      if (distance <= Math.max(12, moon.radius * 2.2) && distance < bestDistance) {
        best = moon;
        bestDistance = distance;
      }
    }
    return best;
  }

  function renderTooltip(): void {
    const hit = pointer === null ? null : hitMoon(pointer.x, pointer.y);
    canvas.style.cursor = hit ? 'pointer' : 'default';
    if (!hit) { tooltip.hidden = true; return; }
    const view = currentView();
    const team = view.teams.find(item => item.id === hit.teamID);
    const kinds = [...new Set(hit.agents.map(agent => agent.agentKind))].join('+');
    tooltip.textContent =
      `${team?.label ?? hit.teamID} · ${hit.label} · ${kinds} · ${hit.status.toUpperCase()}`;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.round(hit.x)}px`;
    tooltip.style.top = `${Math.round(hit.y - hit.radius * 3 - 8)}px`;
  }

  function locate(unitID: string): { x: number; y: number } | null {
    const moon = layout.moons.find(item => item.agents.some(agent => agent.id === unitID));
    return moon ? { x: moon.x, y: moon.y } : null;
  }

  canvas.addEventListener('pointermove', event => {
    const box = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
  });
  canvas.addEventListener('pointerleave', () => { pointer = null; tooltip.hidden = true; });
  canvas.addEventListener('click', event => {
    const box = canvas.getBoundingClientRect();
    const hit = hitMoon(event.clientX - box.left, event.clientY - box.top);
    const target = hit === null ? null : focusTarget(hit);
    if (target) onFocus(target.id);
  });

  return {
    commit(receivedAtMs: number): void {
      for (const effect of drainEffects()) {
        const at = locate(effect.unitID) ?? { x: -100, y: -100 };
        effects.push({ ...effect, startedAt: receivedAtMs, ...at });
      }
    },
    frame(nowMs: number): void {
      if (!ready) return;
      syncRendererSize();
      const dt = lastFrame === null || reducedMotion.matches
        ? 0
        : Math.min(0.1, (nowMs - lastFrame) / 1000);
      lastFrame = nowMs;
      const view = currentView();
      hues = hueMapOf(view);
      advanceOrbits(motion, view, dt);
      layout = placeGalaxy(view, motion, app.screen.width, app.screen.height);
      paintAmbience();
      drawLinework();
      bodies.clear();
      // Painter's order: bodies behind their orbit plane first, so planets
      // and moons pass visibly behind the sun and in front of it.
      const drawables: Array<{ depth: number; draw: () => void }> = [
        { depth: 0, draw: () => drawSun(layout.sun, nowMs) },
        ...layout.planets.map(planet => ({ depth: planet.depth, draw: () => drawPlanet(planet, nowMs) })),
        ...layout.moons.map(moon => ({ depth: moon.depth, draw: () => drawMoon(moon, nowMs) })),
      ].sort((a, b) => a.depth - b.depth);
      let flowDrawn = false;
      for (const drawable of drawables) {
        // Energy flow sits just above the backmost bodies, under front ones.
        if (!flowDrawn && drawable.depth >= 0) { drawEnergyFlow(nowMs); flowDrawn = true; }
        drawable.draw();
      }
      if (!flowDrawn) drawEnergyFlow(nowMs);
      drawMeteor(nowMs, app.screen.width, app.screen.height);
      drawEffects(nowMs);
      syncLabels();
      renderTooltip();
      app.render();
    },
    resize(): void {
      if (!ready) return;
      syncRendererSize();
    },
  };
}

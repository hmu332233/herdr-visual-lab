import type { FoundryView } from './index.js';
import type { FoundryTeamProjection, FoundryWorkerProjection } from './fold.js';
import { palette } from '../../palette.js';

const W = 800;
const H = 450;
const FONT = '"Courier New", ui-monospace, monospace';
const CENTER = { x: 400, y: 235 };
const DOCKS = [
  { x: 400, y: 82 },
  { x: 650, y: 230 },
  { x: 400, y: 397 },
  { x: 150, y: 230 },
  { x: 255, y: 135 },
  { x: 545, y: 135 },
  { x: 545, y: 338 },
  { x: 255, y: 338 },
] as const;

interface Point { x: number; y: number }
interface HitTarget extends Point { id: string }
interface Celebration { bornAt: number; color: string }

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function colorOf(team: FoundryTeamProjection): string {
  return palette.teamColors[team.colorSlot % palette.teamColors.length];
}

function dockOf(team: FoundryTeamProjection): Point {
  return DOCKS[team.colorSlot % DOCKS.length];
}

function pixel(value: number): number {
  return Math.round(value);
}

export function createFoundryScene(
  canvas: HTMLCanvasElement,
  onFocus: (terminalID: string) => void,
) {
  const ctx = canvas.getContext('2d')!;
  let view: FoundryView | null = null;
  let dpr = 1;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let hits: HitTarget[] = [];
  let previousLaunches = 0;
  let hasCommitted = false;
  const celebrations: Celebration[] = [];
  const background = new Image();
  background.src = new URL(
    '../../assets/foundry/spaceport-background-v2.png',
    import.meta.url,
  ).href;

  resize();
  canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left - ox) / scale,
      y: (event.clientY - rect.top - oy) / scale,
    };
    const target = hits
      .map(hit => ({ hit, distance: Math.hypot(point.x - hit.x, point.y - hit.y) }))
      .filter(candidate => candidate.distance <= 18)
      .sort((a, b) => a.distance - b.distance)[0];
    if (target) onFocus(target.hit.id);
  });

  function commit(next: FoundryView, receivedAtMs: number): void {
    if (hasCommitted && next.spaceport.successfulLaunches > previousLaunches) {
      celebrations.push({ bornAt: receivedAtMs, color: next.spaceport.mission.color });
    }
    previousLaunches = next.spaceport.successfulLaunches;
    hasCommitted = true;
    view = next;
  }

  function resize(): void {
    const parent = canvas.parentElement!;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    scale = Math.min(width / W, height / H);
    ox = (width - W * scale) / 2;
    oy = (height - H * scale) / 2;
    ctx.imageSmoothingEnabled = false;
  }

  function frame(nowMs: number): void {
    if (!view) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    ctx.imageSmoothingEnabled = false;
    drawBackdrop(nowMs);
    drawStation(nowMs);

    const teams = view.teams
      .slice()
      .sort((a, b) => a.colorSlot - b.colorSlot)
      .slice(0, DOCKS.length);
    drawRoutes(teams, nowMs);
    hits = [];
    for (const team of teams) drawTeam(team, nowMs);
    drawRocket(view, nowMs);
    drawCelebrations(nowMs);
    drawHud(view, nowMs);
    if (view.spaceport.hazards > 0) drawJamAlert(nowMs);
  }

  function drawBackdrop(nowMs: number): void {
    ctx.fillStyle = '#06132f';
    ctx.fillRect(0, 0, W, H);
    if (background.complete && background.naturalWidth > 0) {
      ctx.drawImage(background, 0, 0, W, H);
    }
    const pulse = 0.02 + Math.abs(Math.sin(nowMs / 1500)) * 0.025;
    ctx.fillStyle = `rgba(77,219,255,${pulse})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStation(nowMs: number): void {
    const outer = [
      [250, 80], [550, 80], [680, 165], [680, 300],
      [550, 385], [250, 385], [120, 300], [120, 165],
    ] as const;
    const inner = [
      [260, 94], [540, 94], [662, 174], [662, 291],
      [540, 371], [260, 371], [138, 291], [138, 174],
    ] as const;
    const polygon = (points: ReadonlyArray<readonly [number, number]>) => {
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point[0], point[1]);
        else ctx.lineTo(point[0], point[1]);
      });
      ctx.closePath();
    };

    ctx.fillStyle = '#15254B';
    polygon(outer);
    ctx.fill();
    ctx.fillStyle = '#D8C5A6';
    polygon(inner);
    ctx.fill();
    ctx.strokeStyle = '#7B7180';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.strokeStyle = '#8A7B78';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.ellipse(CENTER.x, CENTER.y, 192, 111, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const dock of DOCKS) {
      const dx = CENTER.x - dock.x;
      const dy = CENTER.y - dock.y;
      const length = Math.hypot(dx, dy);
      const endX = CENTER.x - dx / length * 58;
      const endY = CENTER.y - dy / length * 58;
      ctx.strokeStyle = '#6F6264';
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(dock.x, dock.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.strokeStyle = '#BCA98F';
      ctx.lineWidth = 12;
      ctx.stroke();

      ctx.fillStyle = '#1B2B50';
      ctx.fillRect(pixel(dock.x - 24), pixel(dock.y - 19), 48, 38);
      ctx.fillStyle = '#324568';
      ctx.fillRect(pixel(dock.x - 19), pixel(dock.y - 14), 38, 28);
      ctx.fillStyle = '#F0B44E';
      ctx.fillRect(pixel(dock.x - 19), pixel(dock.y - 14), 7, 3);
      ctx.fillRect(pixel(dock.x + 12), pixel(dock.y - 14), 7, 3);
      ctx.fillRect(pixel(dock.x - 19), pixel(dock.y + 11), 7, 3);
      ctx.fillRect(pixel(dock.x + 12), pixel(dock.y + 11), 7, 3);
    }

    ctx.fillStyle = '#182642';
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, 65, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#F0B44E';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = '#455A71';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, 49, 0, Math.PI * 2);
    ctx.stroke();

    const blink = Math.floor(nowMs / 360) % 2 === 0;
    for (let light = 0; light < 20; light += 1) {
      const angle = light / 20 * Math.PI * 2;
      ctx.fillStyle = blink === (light % 2 === 0) ? '#FFE28A' : '#FF765F';
      ctx.fillRect(
        pixel(CENTER.x + Math.cos(angle) * 204 - 2),
        pixel(CENTER.y + Math.sin(angle) * 119 - 2),
        4,
        4,
      );
    }

    for (const [x, y, color] of [
      [181, 319, '#FF765F'], [194, 319, '#70D7FF'], [606, 319, '#72E6A6'],
      [619, 319, '#FFD166'], [181, 139, '#C9A7FF'], [606, 139, '#70D7FF'],
    ] as const) {
      ctx.fillStyle = '#31415B';
      ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = color;
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }
  }

  function drawRoutes(teams: readonly FoundryTeamProjection[], nowMs: number): void {
    for (const team of teams) {
      const dock = dockOf(team);
      const dx = CENTER.x - dock.x;
      const dy = CENTER.y - dock.y;
      const length = Math.hypot(dx, dy);
      const end = {
        x: CENTER.x - dx / length * 62,
        y: CENTER.y - dy / length * 62,
      };
      ctx.save();
      ctx.setLineDash([4, 7]);
      ctx.lineDashOffset = team.activeWorkers > 0 ? -Math.floor(nowMs / 90) : 0;
      ctx.strokeStyle = team.hazards > 0 ? '#FF5F6D' : colorOf(team);
      ctx.globalAlpha = team.activeWorkers > 0 || team.hazards > 0 ? 0.9 : 0.3;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dock.x, dock.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#09152E';
      ctx.fillRect(pixel(dock.x - 27), pixel(dock.y - 26), 54, 12);
      ctx.fillStyle = colorOf(team);
      ctx.fillRect(pixel(dock.x - 27), pixel(dock.y - 26), 3, 12);
      ctx.fillStyle = '#FFF4D8';
      ctx.font = `700 7px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(team.label.toUpperCase().slice(0, 11), dock.x, dock.y - 18);
    }
  }

  function drawTeam(team: FoundryTeamProjection, nowMs: number): void {
    const dock = dockOf(team);
    const dx = CENTER.x - dock.x;
    const dy = CENTER.y - dock.y;
    const length = Math.hypot(dx, dy);
    const end = {
      x: CENTER.x - dx / length * 66,
      y: CENTER.y - dy / length * 66,
    };
    const tangent = { x: -dy / length, y: dx / length };
    team.workers.slice(0, 5).forEach((worker, index) => {
      const lane = index - (Math.min(5, team.workers.length) - 1) / 2;
      const point = courierPosition(worker, dock, end, tangent, lane, nowMs);
      drawCourier(worker, point, colorOf(team), nowMs);
      hits.push({ id: worker.id, ...point });
    });
  }

  function courierPosition(
    worker: FoundryWorkerProjection,
    dock: Point,
    end: Point,
    tangent: Point,
    lane: number,
    nowMs: number,
  ): Point {
    let travel = 0.08;
    if (worker.status === 'working') {
      travel = worker.carrying
        ? clamp(worker.routeProgress * 2)
        : clamp((1 - worker.routeProgress) * 2);
    } else if (worker.status === 'blocked') {
      travel = 0.48;
    } else if (worker.status === 'done') {
      travel = 0.92;
    }
    const spread = lane * 14;
    const idleWander = worker.status === 'idle'
      ? Math.sin(nowMs / 700 + worker.number) * 8
      : 0;
    const shake = worker.status === 'blocked'
      ? Math.sin(nowMs / 45 + worker.number) * 2
      : 0;
    return {
      x: dock.x + (end.x - dock.x) * travel + tangent.x * (spread + idleWander) + shake,
      y: dock.y + (end.y - dock.y) * travel + tangent.y * (spread + idleWander),
    };
  }

  function drawCourier(
    worker: FoundryWorkerProjection,
    point: Point,
    color: string,
    nowMs: number,
  ): void {
    const x = pixel(point.x);
    const y = pixel(point.y);
    const step = worker.status === 'working' && Math.floor(nowMs / 120 + worker.number) % 2 === 0;
    const bob = worker.status === 'working' ? (step ? -1 : 0) : 0;
    ctx.save();
    ctx.translate(x, y + bob);

    ctx.fillStyle = 'rgba(3,10,28,.42)';
    ctx.fillRect(-10, 12, 20, 4);
    if (worker.status === 'working' && worker.carrying) drawCrate(0, -18, color);

    ctx.fillStyle = '#EAF7F2';
    ctx.fillRect(-8, -8, 16, 12);
    ctx.fillStyle = color;
    ctx.fillRect(-10, -5, 3, 8);
    ctx.fillRect(7, -5, 3, 8);
    ctx.fillRect(-7, 4, 14, 8);
    ctx.fillStyle = '#17304A';
    ctx.fillRect(-6, -5, 12, 6);
    ctx.fillStyle = worker.status === 'blocked' ? '#FF5F6D' : '#6BF0E4';
    ctx.fillRect(-4, -3, 3, 2);
    ctx.fillRect(2, -3, 3, 2);
    ctx.fillStyle = '#FFF4C7';
    ctx.fillRect(-1, -12, 2, 4);
    ctx.fillStyle = color;
    ctx.fillRect(-3, -14, 6, 3);

    ctx.fillStyle = '#C8D9D5';
    ctx.fillRect(-7, 12, 5, step ? 4 : 3);
    ctx.fillRect(2, 12, 5, step ? 3 : 4);

    if (worker.status === 'blocked') {
      ctx.fillStyle = '#FF4055';
      ctx.fillRect(9, -16, 10, 10);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('!', 14, -8);
    } else if (worker.status === 'done') {
      const twinkle = Math.floor(nowMs / 180 + worker.number) % 2;
      ctx.fillStyle = '#FFD166';
      ctx.fillRect(10, -15 - twinkle, 3, 9);
      ctx.fillRect(7, -12 - twinkle, 9, 3);
    } else if (worker.status === 'idle') {
      ctx.fillStyle = '#B8E7FF';
      ctx.font = `900 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('z', 12, -10);
    }

    if (worker.isFocused) {
      ctx.strokeStyle = '#FFF4B8';
      ctx.lineWidth = 2;
      ctx.strokeRect(-14, -18, 28, 35);
      const label = worker.label.toUpperCase().slice(0, 12);
      ctx.font = `900 7px ${FONT}`;
      const width = ctx.measureText(label).width + 8;
      ctx.fillStyle = '#08132D';
      ctx.fillRect(pixel(-width / 2), -29, pixel(width), 10);
      ctx.fillStyle = '#FFF5D9';
      ctx.textAlign = 'center';
      ctx.fillText(label, 0, -21);
    }
    ctx.restore();
  }

  function drawCrate(x: number, y: number, color: string): void {
    ctx.fillStyle = '#4B3154';
    ctx.fillRect(x - 7, y - 6, 14, 11);
    ctx.fillStyle = color;
    ctx.fillRect(x - 5, y - 4, 10, 7);
    ctx.fillStyle = '#FFF2C6';
    ctx.fillRect(x - 1, y - 4, 2, 7);
  }

  function drawRocket(current: FoundryView, nowMs: number): void {
    const { spaceport } = current;
    const launching = spaceport.phase === 'LAUNCHING';
    const delayed = spaceport.phase === 'DELAYED';
    const ease = 1 - Math.pow(1 - spaceport.launchProgress, 3);
    const lift = launching ? ease * 265 : 0;
    const shake = delayed && Math.floor(nowMs / 100) % 2 === 0 ? 2 : 0;
    const x = CENTER.x + shake;
    const y = CENTER.y - 30 - lift;

    if (launching || delayed) {
      const plumeLength = launching ? 20 + ease * 42 : 14;
      for (let flame = 0; flame < 7; flame += 1) {
        const phase = (nowMs / 70 + flame * 3) % plumeLength;
        ctx.fillStyle = flame % 3 === 0 ? '#FFF4A8' : flame % 2 ? '#FF9E4A' : '#72E7FF';
        ctx.fillRect(pixel(x - 5 + (flame % 4) * 3), pixel(y + 25 + phase), 3, 5);
      }
    }

    ctx.save();
    ctx.translate(pixel(x), pixel(y));
    ctx.fillStyle = spaceport.mission.color;
    ctx.fillRect(-13, -8, 26, 28);
    ctx.fillStyle = '#F8F3DA';
    ctx.fillRect(-9, -21, 18, 40);
    ctx.fillStyle = '#FF6B55';
    ctx.fillRect(-6, -27, 12, 7);
    ctx.fillRect(-3, -31, 6, 4);
    ctx.fillStyle = '#17304A';
    ctx.fillRect(-5, -12, 10, 8);
    ctx.fillStyle = '#72E7FF';
    ctx.fillRect(-3, -10, 6, 4);
    ctx.fillStyle = spaceport.mission.color;
    ctx.fillRect(-15, 11, 6, 10);
    ctx.fillRect(9, 11, 6, 10);
    ctx.fillStyle = '#473552';
    ctx.fillRect(-8, 19, 6, 4);
    ctx.fillRect(2, 19, 6, 4);
    ctx.restore();
  }

  function drawCelebrations(nowMs: number): void {
    for (let index = celebrations.length - 1; index >= 0; index -= 1) {
      const celebration = celebrations[index];
      const age = (nowMs - celebration.bornAt) / 1000;
      if (age > 2.2) {
        celebrations.splice(index, 1);
        continue;
      }
      ctx.globalAlpha = 1 - age / 2.2;
      for (let particle = 0; particle < 30; particle += 1) {
        const angle = particle / 30 * Math.PI * 2;
        const distance = age * (36 + (particle % 7) * 8);
        ctx.fillStyle = particle % 4 === 0 ? '#FFFFFF' : celebration.color;
        ctx.fillRect(
          pixel(CENTER.x + Math.cos(angle) * distance),
          pixel(CENTER.y - 70 + Math.sin(angle) * distance + age * age * 20),
          4,
          4,
        );
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawHud(current: FoundryView, nowMs: number): void {
    const { spaceport } = current;
    drawPixelPanel(14, 14, 270, 64, spaceport.mission.color);
    ctx.fillStyle = '#9FD9EB';
    ctx.font = `900 8px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`MISSION ${String(spaceport.missionNumber).padStart(2, '0')} · DESTINATION`, 27, 32);
    ctx.fillStyle = '#FFF5D9';
    ctx.font = `900 17px ${FONT}`;
    ctx.fillText(spaceport.mission.destination, 27, 51);
    ctx.fillStyle = spaceport.mission.color;
    ctx.font = `900 8px ${FONT}`;
    ctx.fillText(`${spaceport.mission.cargo} / ${spaceport.mission.rocket}`, 27, 67);

    const urgent = spaceport.phase === 'FINAL CALL';
    drawPixelPanel(350, 14, 100, 48, urgent ? '#FF5F6D' : spaceport.mission.color);
    ctx.fillStyle = urgent ? '#FF8792' : '#9FD9EB';
    ctx.font = `900 7px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(spaceport.phase, 400, 30);
    ctx.fillStyle = '#FFF5D9';
    ctx.font = `900 18px ${FONT}`;
    const timer = spaceport.timeLeft > 0 ? `${Math.ceil(spaceport.timeLeft)}s` : 'GO!';
    ctx.fillText(timer, 400, 51);

    const barX = 154;
    const barY = H - 38;
    const barW = 492;
    drawPixelPanel(barX - 12, barY - 10, barW + 24, 34, spaceport.mission.color);
    ctx.fillStyle = '#152546';
    ctx.fillRect(barX, barY, barW, 12);
    const progress = Math.min(1, spaceport.progress);
    ctx.fillStyle = spaceport.mission.color;
    ctx.fillRect(barX, barY, Math.max(5, pixel(barW * progress)), 12);
    if (spaceport.launchReady) {
      const sweep = pixel((nowMs / 420) % 1 * barW);
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.fillRect(barX + sweep - 4, barY, 4, 12);
    }
    ctx.fillStyle = '#FFF6DD';
    ctx.font = `900 8px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      `${Math.floor(spaceport.output)} / ${spaceport.quota} CARGO · ${spaceport.rank}-RANK`,
      W / 2,
      barY + 10,
    );
  }

  function drawPixelPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    accent: string,
  ): void {
    ctx.fillStyle = 'rgba(5,15,40,.88)';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, width, 3);
    ctx.fillRect(x, y, 3, height);
    ctx.fillStyle = '#25476A';
    ctx.fillRect(x + width - 3, y + 3, 3, height - 3);
    ctx.fillRect(x + 3, y + height - 3, width - 3, 3);
  }

  function drawJamAlert(nowMs: number): void {
    if (Math.floor(nowMs / 240) % 2 !== 0) return;
    drawPixelPanel(W / 2 - 86, 82, 172, 22, '#FF4055');
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('! CARGO ROUTE JAMMED !', W / 2, 97);
  }

  return { commit, resize, frame };
}

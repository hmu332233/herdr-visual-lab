import type { FoundryView } from './index.js';
import { contrastText, palette } from '../../palette.js';

const W = 620;
const H = 540;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

export function createFoundryScene(
  canvas: HTMLCanvasElement,
  _onFocus: (terminalID: string) => void,
) {
  const ctx = canvas.getContext('2d')!;
  let view: FoundryView | null = null;
  let dpr = 1, scale = 1, ox = 0, oy = 0;
  resize();

  function commit(next: FoundryView): void { view = next; }
  function resize(): void {
    const parent = canvas.parentElement!;
    const width = Math.max(1, parent.clientWidth), height = Math.max(1, parent.clientHeight);
    dpr = window.devicePixelRatio || 1; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    scale = Math.min(width / W, height / H); ox = (width - W * scale) / 2; oy = (height - H * scale) / 2;
  }

  function frame(nowMs: number): void {
    if (!view) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    drawSpace(nowMs);
    const teams = view.teams.slice(0, 8);
    teams.forEach((team, index) => {
      const col = index % 4, row = Math.floor(index / 4);
      const x = 82 + col * 152, y = 155 + row * 230;
      const color = palette.teamColors[team.colorSlot % palette.teamColors.length];
      drawStation(x, y, color, team.modules, team.moduleProgress, team.hazards, nowMs, index);
      ctx.textAlign = 'center'; ctx.fillStyle = palette.textSoft; ctx.font = `700 9px ${FONT}`;
      ctx.fillText(team.label.toUpperCase(), x, y + 70);
      ctx.fillStyle = color; ctx.font = `800 8px ${FONT}`;
      ctx.fillText(`${team.resources} ALLOY · ${Math.round(team.moduleProgress * 100)}%`, x, y + 84);
    });
  }

  function drawSpace(nowMs: number): void {
    ctx.fillStyle = palette.canvas; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    for (let i = 0; i < 42; i += 1) {
      const x = (i * 97) % W, y = (i * 53) % H;
      const pulse = .35 + .65 * Math.abs(Math.sin(nowMs / 1100 + i));
      ctx.globalAlpha = pulse; ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.textMuted; ctx.font = `800 8px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('ORBITAL CONSTRUCTION GRID', W / 2, 28);
  }

  function drawStation(x: number, y: number, color: string, modules: number, progress: number, hazards: number, nowMs: number, seed: number): void {
    const orbit = nowMs / 900 + seed;
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 54, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 43, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
    ctx.fillStyle = palette.asphalt; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 27, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (let i = 0; i < Math.min(6, modules); i += 1) {
      const a = (i / 6) * Math.PI * 2; ctx.fillStyle = color; ctx.fillRect(x + Math.cos(a) * 35 - 5, y + Math.sin(a) * 35 - 4, 10, 8);
    }
    const sx = x + Math.cos(orbit) * 54, sy = y + Math.sin(orbit) * 54;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(orbit + Math.PI / 2); ctx.fillStyle = '#fff'; ctx.fillRect(-4, -2, 8, 4); ctx.fillStyle = color; ctx.fillRect(-2, 2, 4, 5); ctx.restore();
    ctx.fillStyle = contrastText(color); ctx.font = `900 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(String(modules), x, y);
    if (hazards > 0) {
      const blink = .3 + .7 * Math.abs(Math.sin(nowMs / 240)); ctx.globalAlpha = blink; ctx.strokeStyle = palette.liveRed; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 33, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = palette.liveRed; ctx.font = `900 8px ${FONT}`; ctx.fillText('HAZARD', x, y - 38);
    }
  }
  return { commit, resize, frame };
}

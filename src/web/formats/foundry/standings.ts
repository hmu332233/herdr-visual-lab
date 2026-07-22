import type { FoundryView } from './index.js';
import { contrastText, hexAlpha, palette } from '../../palette.js';

export function createStandingsPanel(
  container: HTMLElement,
  _onFocus: (terminalID: string) => void,
) {
  function render(view: FoundryView): void {
    const teams = view.teams;
    container.replaceChildren(...teams.map((team, index) => {
      const color = palette.teamColors[team.colorSlot % palette.teamColors.length];
      const card = document.createElement('div');
      card.className = 'team-card';
      card.style.setProperty('--team-color', color);
      const header = document.createElement('div');
      header.className = 'team-header';
      const rank = document.createElement('span'); rank.className = 'team-rank'; rank.textContent = `#${index + 1}`;
      const name = document.createElement('span'); name.className = 'team-name'; name.textContent = team.label.toUpperCase();
      const stats = document.createElement('span'); stats.className = 'team-stats';
      stats.textContent = `${team.resources} ALLOY · ${team.modules} MOD`;
      const progress = document.createElement('div');
      progress.style.cssText = `height:3px;width:${Math.round(team.moduleProgress * 100)}%;background:${color}`;
      const status = document.createElement('div');
      status.style.cssText = 'padding:8px 12px;font:700 9px ui-monospace;letter-spacing:1px;color:rgba(255,255,255,.7)';
      status.textContent = `${team.activeWorkers} FABRICATING · ${team.hazards} HAZARDS · ${Math.round(team.moduleProgress * 100)}% NEXT MODULE`;
      if (team.hazards > 0) { status.style.color = palette.liveRed; status.style.background = hexAlpha(palette.liveRed, .08); }
      rank.style.cssText = `background:${color};color:${contrastText(color)};padding:2px 5px;border-radius:3px`;
      header.append(rank, name, stats); card.append(header, progress, status); return card;
    }));
  }
  return { render };
}

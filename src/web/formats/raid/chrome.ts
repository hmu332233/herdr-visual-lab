import type { SyncMessage } from '../../../shared/protocol.js';
import type { FinalResult } from '../../../shared/presentation.js';
import { palette, teamColor } from '../../palette.js';
import { bossHpFraction, damageText, overlayLabel, stageLabel } from './vocabulary.js';

/** Header bars, connection badge, connection overlays, and the BOSS DOWN
 *  panel. Fills the same shared DOM containers the F1 chrome uses. */
export function createChrome() {
  const hp = document.getElementById('lap-text')!;
  const phase = document.getElementById('phase-text')!;
  const stage = document.getElementById('gp-text')!;
  const connection = document.getElementById('connection-text')!;
  const raiderCount = document.getElementById('car-count')!;
  const overlay = document.getElementById('overlay')!;
  const standingsEmpty = document.getElementById('standings-empty')!;
  const panelTitle = document.querySelector('.panel-title');
  if (panelTitle) panelTitle.textContent = 'DPS METER';

  function render(sync: SyncMessage): void {
    const hpPercent = Math.round(bossHpFraction(sync.leaderProgress) * 100);
    hp.textContent = `BOSS ${hpPercent}%`;
    phase.textContent =
      sync.phase === 'awaitingUnits' ? 'SUMMONING' : sync.phase === 'live' ? 'RAID LIVE' : 'BOSS DOWN';
    stage.textContent = stageLabel(sync.round);

    const entryCount = sync.teams.reduce((count, team) => count + team.entries.length, 0);
    raiderCount.textContent =
      entryCount === 0 ? '—' : `${entryCount} RAIDER${entryCount === 1 ? '' : 'S'}`;

    const badge = connectionBadge(sync, entryCount);
    connection.textContent = badge.text;
    connection.style.color = badge.color;

    renderOverlay(sync, entryCount);

    standingsEmpty.hidden = sync.teams.length > 0;
    if (sync.teams.length === 0) {
      standingsEmpty.textContent = sync.overlay.kind === 'noUnits' ? 'NO RAIDERS' : 'SUMMONING RAID';
    }
  }

  function renderOverlay(sync: SyncMessage, entryCount: number): void {
    if (sync.phase === 'results' && sync.results) {
      overlay.hidden = false;
      overlay.replaceChildren(bossDownPanel(sync.results));
      return;
    }
    const content = overlayContent(sync);
    if (!content) {
      overlay.hidden = true;
      overlay.replaceChildren();
      return;
    }
    const card = document.createElement('div');
    card.className = 'overlay-card' + (content.dim && entryCount > 0 ? ' dim' : '');
    const primary = document.createElement('div');
    primary.className = 'overlay-primary';
    primary.textContent = content.primary;
    primary.style.color = content.color;
    card.append(primary);
    if (content.secondary !== null) {
      const secondary = document.createElement('div');
      secondary.className = 'overlay-secondary';
      secondary.textContent = content.secondary;
      card.append(secondary);
    }
    overlay.hidden = false;
    overlay.replaceChildren(card);
  }

  return { render };
}

function connectionBadge(sync: SyncMessage, entryCount: number): { text: string; color: string } {
  switch (sync.connection.kind) {
    case 'waiting':
      return { text: entryCount === 0 ? 'AWAITING HERDR' : 'TIME FREEZE', color: palette.textMuted };
    case 'live':
      return { text: 'RAID LIVE', color: palette.statusWorking };
    case 'offline':
      return { text: 'HERDR OFFLINE', color: palette.liveRed };
    case 'protocolError':
      return { text: 'RAID SUSPENDED', color: palette.statusBlocked };
  }
}

function overlayContent(
  sync: SyncMessage,
): { primary: string; secondary: string | null; color: string; dim: boolean } | null {
  switch (sync.overlay.kind) {
    case 'none': return null;
    case 'connecting':
      return { primary: overlayLabel('connecting'), secondary: 'GATHERING RAIDERS', color: palette.textSoft, dim: false };
    case 'noUnits':
      return { primary: overlayLabel('noUnits'), secondary: null, color: palette.textSoft, dim: false };
    case 'frozen':
      return { primary: overlayLabel('frozen'), secondary: 'HERDR OFFLINE', color: palette.liveRed, dim: true };
    case 'suspended':
      return {
        primary: overlayLabel('suspended'),
        secondary: sync.overlay.detail.toUpperCase(),
        color: palette.statusBlocked,
        dim: true,
      };
  }
}

function bossDownPanel(result: FinalResult): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'podium-panel';
  const title = document.createElement('div');
  title.className = 'podium-title';
  title.textContent = 'BOSS DOWN';
  const subtitle = document.createElement('div');
  subtitle.className = 'podium-subtitle';
  subtitle.textContent = `STAGE ${result.round} CLEARED · GUILD MVP`;
  panel.append(title, subtitle);
  for (const team of result.top) {
    const row = document.createElement('div');
    row.className = 'podium-row';
    const rank = document.createElement('span');
    rank.className = 'podium-rank';
    rank.textContent = `#${team.rank}`;
    const chip = document.createElement('span');
    chip.className = 'podium-chip';
    chip.style.background = teamColor(team.colorToken);
    const name = document.createElement('span');
    name.className = 'podium-name';
    name.textContent = team.label.toUpperCase();
    const damage = document.createElement('span');
    damage.className = 'podium-distance';
    damage.textContent = damageText(team.progress);
    row.append(rank, chip, name, damage);
    panel.append(row);
  }
  return panel;
}

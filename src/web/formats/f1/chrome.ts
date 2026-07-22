import type { SyncMessage } from '../../../shared/protocol.js';
import type { FinalResult } from '../../../shared/presentation.js';
import { palette, teamColor } from '../../palette.js';
import { distanceText, headerLap } from './vocabulary.js';

/** Header bars, connection badge, connection overlays, and the podium panel. */
export function createChrome() {
  const lap = document.getElementById('lap-text')!;
  const phase = document.getElementById('phase-text')!;
  const grandPrix = document.getElementById('gp-text')!;
  const connection = document.getElementById('connection-text')!;
  const carCount = document.getElementById('car-count')!;
  const overlay = document.getElementById('overlay')!;
  const standingsEmpty = document.getElementById('standings-empty')!;
  const panelTitle = document.querySelector('.panel-title');
  if (panelTitle) panelTitle.textContent = 'CONSTRUCTORS';

  function render(sync: SyncMessage): void {
    lap.textContent = `LAP ${headerLap(sync.leaderProgress)} / 58`;
    phase.textContent =
      sync.phase === 'awaitingUnits' ? 'FORMATION' : sync.phase === 'live' ? 'RACE LIVE' : 'PODIUM';
    grandPrix.textContent = `GRAND PRIX ${sync.round}`;

    const entryCount = sync.teams.reduce((count, team) => count + team.entries.length, 0);
    carCount.textContent = entryCount === 0 ? '—' : `${entryCount} CAR${entryCount === 1 ? '' : 'S'}`;

    const badge = connectionBadge(sync, entryCount);
    connection.textContent = badge.text;
    connection.style.color = badge.color;

    renderOverlay(sync, entryCount);

    standingsEmpty.hidden = sync.teams.length > 0;
    if (sync.teams.length === 0) {
      standingsEmpty.textContent =
        sync.overlay.kind === 'noUnits' ? 'NO CARS ON GRID' : 'FORMATION LAP · AWAITING GRID';
    }
  }

  function renderOverlay(sync: SyncMessage, entryCount: number): void {
    if (sync.phase === 'results' && sync.results) {
      overlay.hidden = false;
      overlay.replaceChildren(podiumPanel(sync.results));
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
      return { text: entryCount === 0 ? 'AWAITING HERDR' : 'RED FLAG', color: palette.textMuted };
    case 'live':
      return { text: 'TELEMETRY LIVE', color: palette.statusWorking };
    case 'offline':
      return { text: 'HERDR OFFLINE', color: palette.liveRed };
    case 'protocolError':
      return { text: 'SESSION SUSPENDED', color: palette.statusBlocked };
  }
}

function overlayContent(
  sync: SyncMessage,
): { primary: string; secondary: string | null; color: string; dim: boolean } | null {
  switch (sync.overlay.kind) {
    case 'none': return null;
    case 'connecting':
      return { primary: 'FORMATION LAP', secondary: 'AWAITING GRID', color: palette.textSoft, dim: false };
    case 'noUnits':
      return { primary: 'NO CARS ON GRID', secondary: null, color: palette.textSoft, dim: false };
    case 'frozen':
      return { primary: 'RED FLAG', secondary: 'HERDR OFFLINE', color: palette.liveRed, dim: true };
    case 'suspended':
      return {
        primary: 'SESSION SUSPENDED',
        secondary: sync.overlay.detail.toUpperCase(),
        color: palette.statusBlocked,
        dim: true,
      };
  }
}

function podiumPanel(podium: FinalResult): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'podium-panel';
  const title = document.createElement('div');
  title.className = 'podium-title';
  title.textContent = 'TEAM PODIUM';
  const subtitle = document.createElement('div');
  subtitle.className = 'podium-subtitle';
  subtitle.textContent = `GRAND PRIX ${podium.round} · NEXT GRID FORMING`;
  panel.append(title, subtitle);
  for (const team of podium.top) {
    const row = document.createElement('div');
    row.className = 'podium-row';
    const rank = document.createElement('span');
    rank.className = 'podium-rank';
    rank.textContent = `P${team.rank}`;
    const chip = document.createElement('span');
    chip.className = 'podium-chip';
    chip.style.background = teamColor(team.colorToken);
    const name = document.createElement('span');
    name.className = 'podium-name';
    name.textContent = team.label.toUpperCase();
    const distance = document.createElement('span');
    distance.className = 'podium-distance';
    distance.textContent = distanceText(team.progress);
    row.append(rank, chip, name, distance);
    panel.append(row);
  }
  return panel;
}

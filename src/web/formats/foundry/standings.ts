import type { AgentStatus } from '../../../shared/presentation.js';
import type { FoundryView } from './index.js';
import type { FoundryWorkerProjection } from './fold.js';
import { contrastText, hexAlpha, palette } from '../../palette.js';

export function createStandingsPanel(
  container: HTMLElement,
  onFocus: (terminalID: string) => void,
) {
  container.classList.add('spaceport-standings');

  function render(view: FoundryView): void {
    const active = document.activeElement as HTMLElement | null;
    const focusedTerminal = active?.dataset.terminalId ?? null;
    const children: HTMLElement[] = [];
    if (view.teams.length > 0) children.push(createMissionCard(view));
    children.push(...view.teams.map((team, index) => {
      const color = palette.teamColors[team.colorSlot % palette.teamColors.length];
      const contribution = Math.min(1, team.missionOutput / view.spaceport.quota);
      const card = document.createElement('article');
      card.className = 'dock-card';
      card.setAttribute('role', 'listitem');
      card.style.setProperty('--team-color', color);

      const header = document.createElement('div');
      header.className = 'dock-header';
      const badge = document.createElement('span');
      badge.className = 'dock-badge';
      badge.style.background = color;
      badge.style.color = contrastText(color);
      badge.textContent = String(index + 1).padStart(2, '0');
      const title = document.createElement('div');
      title.className = 'dock-title';
      const name = document.createElement('strong');
      name.textContent = team.label;
      const details = document.createElement('span');
      details.textContent = `${team.deliveries} CRATES · ${Math.round(team.missionOutput)} LOAD`;
      title.append(name, details);
      const activity = document.createElement('span');
      activity.className = 'dock-activity';
      activity.textContent = team.hazards > 0
        ? `${team.hazards} JAM`
        : `${team.activeWorkers} MOVING`;
      activity.classList.toggle('has-hazard', team.hazards > 0);
      header.append(badge, title, activity);

      const meter = document.createElement('div');
      meter.className = 'dock-meter';
      const fill = document.createElement('span');
      fill.style.width = `${Math.max(3, contribution * 100)}%`;
      fill.style.background = color;
      meter.append(fill);

      const couriers = document.createElement('div');
      couriers.className = 'courier-list';
      for (const worker of team.workers) {
        couriers.append(createCourier(worker, color, onFocus));
      }
      card.append(header, meter, couriers);
      return card;
    }));
    container.replaceChildren(...children);
    if (focusedTerminal !== null) {
      container
        .querySelector<HTMLElement>(`[data-terminal-id="${CSS.escape(focusedTerminal)}"]`)
        ?.focus();
    }
  }

  return { render };
}

function createMissionCard(view: FoundryView): HTMLElement {
  const { spaceport } = view;
  const card = document.createElement('section');
  card.className = 'mission-card';
  card.style.setProperty('--mission-color', spaceport.mission.color);

  const eyebrow = document.createElement('span');
  eyebrow.className = 'mission-eyebrow';
  eyebrow.textContent = `MISSION ${String(spaceport.missionNumber).padStart(2, '0')} · ${spaceport.phase}`;
  const destination = document.createElement('strong');
  destination.className = 'mission-destination';
  destination.textContent = spaceport.mission.destination;
  const cargo = document.createElement('span');
  cargo.className = 'mission-cargo';
  cargo.textContent = `${spaceport.mission.rocket} · ${spaceport.mission.cargo}`;

  const stats = document.createElement('div');
  stats.className = 'mission-stats';
  stats.append(
    missionStat(spaceport.phase === 'LAUNCHING' || spaceport.phase === 'DELAYED'
      ? 'WINDOW' : 'T-MINUS', spaceport.timeLeft > 0 ? `${Math.ceil(spaceport.timeLeft)}s` : 'NOW'),
    missionStat('STREAK', `${spaceport.streak}×`),
    missionStat('RANK', spaceport.rank),
  );

  const progress = document.createElement('div');
  progress.className = 'mission-progress';
  const copy = document.createElement('div');
  const label = document.createElement('span');
  label.textContent = spaceport.launchReady ? 'ROCKET READY' : 'LOADING CARGO';
  const value = document.createElement('b');
  value.textContent = `${Math.floor(spaceport.output)} / ${spaceport.quota}`;
  copy.append(label, value);
  const track = document.createElement('div');
  const fill = document.createElement('span');
  fill.style.width = `${Math.max(3, Math.min(100, spaceport.progress * 100))}%`;
  track.append(fill);
  progress.append(copy, track);

  card.append(eyebrow, destination, cargo, stats, progress);
  return card;
}

function missionStat(label: string, value: string): HTMLElement {
  const stat = document.createElement('div');
  const number = document.createElement('strong');
  number.textContent = value;
  const copy = document.createElement('span');
  copy.textContent = label;
  stat.append(number, copy);
  return stat;
}

function createCourier(
  worker: FoundryWorkerProjection,
  color: string,
  onFocus: (terminalID: string) => void,
): HTMLElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'courier-row';
  row.dataset.terminalId = worker.id;
  row.addEventListener('click', () => onFocus(worker.id));

  const portrait = document.createElement('span');
  portrait.className = 'courier-portrait';
  portrait.style.setProperty('--courier-color', color);
  portrait.textContent = worker.status === 'blocked' ? '×' : '•ᴗ•';

  const identity = document.createElement('span');
  identity.className = 'courier-identity';
  const name = document.createElement('strong');
  name.textContent = worker.label;
  const kind = document.createElement('span');
  kind.textContent = `${worker.agentKind.toUpperCase()} · ${Math.floor(worker.missionContribution)} LOAD`;
  identity.append(name, kind);

  const state = document.createElement('span');
  state.className = 'courier-state';
  const stateColor = statusColor(worker.status);
  state.style.color = stateColor;
  state.style.background = hexAlpha(stateColor, 0.13);
  state.textContent = statusLabel(worker.status);
  row.classList.toggle('is-targeted', worker.isFocused);
  row.append(portrait, identity, state);
  row.setAttribute('aria-label', `${worker.label}, ${statusLabel(worker.status)}, focus in Herdr`);
  return row;
}

function statusLabel(status: AgentStatus): string {
  switch (status) {
    case 'working': return 'DELIVERING';
    case 'idle': return 'CHARGING';
    case 'done': return 'DELIVERED';
    case 'blocked': return 'JAMMED';
  }
}

function statusColor(status: AgentStatus): string {
  switch (status) {
    case 'working': return '#72E6A6';
    case 'idle': return '#70D7FF';
    case 'done': return '#FFD166';
    case 'blocked': return palette.liveRed;
  }
}

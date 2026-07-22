import type { RaidView as SyncMessage } from './view.js';
import type { EntryPresentation, TeamStanding } from '../../presentation.js';
import { contrastText, hexAlpha, rowStatusColor, teamColor } from '../../palette.js';
import { damageText, statusLabel } from './vocabulary.js';

/** DPS METER: one bar per guild, cumulative damage widths relative to the top
 *  guild. Rebuilds only on structural change (preserving keyboard focus by
 *  terminal ID); otherwise updates in place — same contract as the F1 panel. */
export function createStandingsPanel(
  container: HTMLElement,
  onFocus: (terminalID: string) => void,
) {
  let structure = '';
  const cards = new Map<string, ReturnType<typeof createGuildCard>>();

  function render(sync: SyncMessage): void {
    const topDamage = sync.teams[0]?.progress ?? 0;
    const nextStructure = sync.teams
      .map(team => `${team.id}:${team.entries.map(entry => entry.id).join(',')}`)
      .join('|');
    if (nextStructure !== structure) {
      structure = nextStructure;
      rebuild(sync, topDamage);
      return;
    }
    for (const team of sync.teams) cards.get(team.id)?.update(team, topDamage);
  }

  function rebuild(sync: SyncMessage, topDamage: number): void {
    const active = document.activeElement as HTMLElement | null;
    const focusedTerminal = active?.dataset?.terminalId ?? null;
    cards.clear();
    container.replaceChildren(
      ...sync.teams.map(team => {
        const card = createGuildCard(team, topDamage, onFocus);
        cards.set(team.id, card);
        return card.element;
      }),
    );
    if (focusedTerminal !== null) {
      container
        .querySelector<HTMLElement>(`[data-terminal-id="${CSS.escape(focusedTerminal)}"]`)
        ?.focus();
    }
  }

  return { render };
}

function createGuildCard(
  team: TeamStanding,
  topDamage: number,
  onFocus: (terminalID: string) => void,
) {
  const element = document.createElement('article');
  element.className = 'team-card';
  element.setAttribute('role', 'listitem');

  const accent = document.createElement('span');
  accent.className = 'team-accent';
  accent.style.background = teamColor(team.colorToken);

  const header = document.createElement('div');
  header.className = 'team-header';
  const rank = document.createElement('span');
  rank.className = 'team-rank';
  const name = document.createElement('span');
  name.className = 'team-name';
  const stats = document.createElement('span');
  stats.className = 'team-stats';
  header.append(rank, name, stats);

  // A thin cumulative-damage bar under the header — the DPS meter itself.
  const meter = document.createElement('div');
  meter.className = 'dps-meter';
  meter.style.height = '3px';
  meter.style.margin = '2px 10px 0';
  meter.style.borderRadius = '2px';
  meter.style.background = hexAlpha(teamColor(team.colorToken), 0.9);

  element.append(accent, header, meter);

  const rows = new Map<string, ReturnType<typeof createRaiderRow>>();

  team.entries.forEach((entry, index) => {
    if (index > 0) {
      const divider = document.createElement('div');
      divider.className = 'agent-divider';
      element.append(divider);
    }
    const row = createRaiderRow(entry, teamColor(team.colorToken), onFocus);
    rows.set(entry.id, row);
    element.append(row.element);
  });

  function update(team: TeamStanding, topDamage: number): void {
    rank.textContent = `#${team.rank}`;
    name.textContent = team.label.toUpperCase();
    const damageLabel = damageText(team.progress);
    stats.replaceChildren();
    const damage = document.createElement('span');
    damage.className = 'distance';
    damage.textContent = damageLabel;
    stats.append(
      damage,
      `  ${team.entries.length} RAIDER${team.entries.length === 1 ? '' : 'S'}`,
    );
    const fraction = topDamage > 0 ? team.progress / topDamage : 0;
    meter.style.width = `${Math.max(2, fraction * 100)}%`;
    element.setAttribute(
      'aria-label',
      `Rank ${team.rank}, ${team.label}, ${damageLabel.toLowerCase()}, ${team.entries.length} raiders`,
    );
    for (const entry of team.entries) rows.get(entry.id)?.update(entry);
  }

  update(team, topDamage);
  return { element, update };
}

function createRaiderRow(
  entry: EntryPresentation,
  color: string,
  onFocus: (terminalID: string) => void,
) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'agent-row';
  element.dataset.terminalId = entry.id;
  element.style.setProperty('--team-color', color);
  element.addEventListener('click', () => onFocus(entry.id));

  const chip = document.createElement('span');
  chip.className = 'agent-chip';
  chip.style.background = color;
  chip.style.color = contrastText(color);
  chip.textContent = String(entry.unitNumber);

  const main = document.createElement('span');
  main.className = 'agent-main';

  const onboard = document.createElement('span');
  onboard.className = 'onboard-tag';
  onboard.textContent = 'TARGETED';

  const sub = document.createElement('span');
  sub.className = 'agent-sub';
  const kind = document.createElement('span');
  kind.className = 'agent-kind';
  const status = document.createElement('span');
  status.className = 'agent-status';
  const stint = document.createElement('span');
  stint.className = 'agent-stint';
  sub.append(kind, onboard, status, stint);

  element.append(chip, main, sub);

  function update(entry: EntryPresentation): void {
    const workspace = document.createElement('span');
    workspace.className = 'workspace';
    workspace.textContent = entry.workspaceLabel;
    const separator = document.createElement('span');
    separator.className = 'separator';
    separator.textContent = ' / ';
    const tab = document.createElement('span');
    tab.className = 'tab';
    tab.textContent = entry.tabLabel;
    main.replaceChildren(workspace, separator, tab);

    kind.textContent = entry.agentKind.toUpperCase();
    const statusColor = rowStatusColor(entry);
    const label = statusLabel(entry);
    status.textContent = label;
    status.style.color = statusColor;
    status.style.background = hexAlpha(statusColor, 0.14);
    stint.textContent = entry.showsNewStint ? 'RESPAWN' : '';
    element.classList.toggle('is-onboard', entry.isFocused);
    onboard.hidden = !entry.isFocused;
    element.setAttribute(
      'aria-label',
      `Raider ${entry.unitNumber}, ${entry.workspaceLabel}, ${entry.tabLabel}, ${entry.agentKind}, ` +
        `${label.toLowerCase()}, Focus in Herdr`,
    );
  }

  update(entry);
  return { element, update };
}

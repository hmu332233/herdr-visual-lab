import type { EntryPresentation, TeamStanding } from '../../presentation.js';
import { contrastText, rowStatusColor, teamColor } from '../../palette.js';
import { raiderClassOf, type RaiderClass } from '../raid/roles.js';
import type { RaidView } from '../raid/view.js';
import { damageText, statusLabel } from '../raid/vocabulary.js';
import { HERO_URLS } from './heroes.js';

const CLASS_LABELS: Readonly<Record<RaiderClass, {
  short: string;
  long: string;
}>> = {
  warrior: { short: 'WAR', long: 'Warrior' },
  mage: { short: 'MAG', long: 'Mage' },
  archer: { short: 'ARC', long: 'Archer' },
};

/** Compact game-style party slots. The battlefield carries the action; this
 * panel only answers who is in each party and what state they are in. */
export function createPartyPanel(
  container: HTMLElement,
  onFocus: (terminalID: string) => void,
) {
  let structure = '';
  const parties = new Map<string, ReturnType<typeof createParty>>();

  function render(sync: RaidView): void {
    const nextStructure = sync.teams
      .map(team => `${team.id}:${team.entries.map(entry => entry.id).join(',')}`)
      .join('|');
    if (nextStructure !== structure) {
      structure = nextStructure;
      rebuild(sync);
      return;
    }
    for (const team of sync.teams) parties.get(team.id)?.update(team);
  }

  function rebuild(sync: RaidView): void {
    const focusedTerminal =
      (document.activeElement as HTMLElement | null)?.dataset?.terminalId ?? null;
    parties.clear();
    container.className = 'raid2-party-list';
    container.replaceChildren(
      ...sync.teams.map(team => {
        const party = createParty(team, onFocus);
        parties.set(team.id, party);
        return party.element;
      }),
    );
    if (focusedTerminal) {
      container
        .querySelector<HTMLElement>(`[data-terminal-id="${CSS.escape(focusedTerminal)}"]`)
        ?.focus();
    }
  }

  return { render };
}

function createParty(
  team: TeamStanding,
  onFocus: (terminalID: string) => void,
) {
  const color = teamColor(team.colorToken);
  const element = document.createElement('article');
  element.className = 'raid2-party';
  element.style.setProperty('--party-color', color);
  element.setAttribute('role', 'listitem');

  const header = document.createElement('header');
  header.className = 'raid2-party-header';
  const rank = document.createElement('span');
  rank.className = 'raid2-party-rank';
  const name = document.createElement('strong');
  name.className = 'raid2-party-name';
  const damage = document.createElement('span');
  damage.className = 'raid2-party-damage';
  header.append(rank, name, damage);

  const grid = document.createElement('div');
  grid.className = 'raid2-party-grid';
  const members = new Map<string, ReturnType<typeof createMember>>();
  for (const entry of team.entries) {
    const member = createMember(entry, color, onFocus);
    members.set(entry.id, member);
    grid.append(member.element);
  }
  element.append(header, grid);

  function update(team: TeamStanding): void {
    rank.textContent = String(team.rank);
    name.textContent = team.label;
    damage.textContent = damageText(team.progress);
    element.setAttribute(
      'aria-label',
      `Party ${team.rank}, ${team.label}, ${damage.textContent}`,
    );
    for (const entry of team.entries) members.get(entry.id)?.update(entry);
  }

  update(team);
  return { element, update };
}

function createMember(
  initialEntry: EntryPresentation,
  color: string,
  onFocus: (terminalID: string) => void,
) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'raid2-member';
  element.dataset.terminalId = initialEntry.id;
  element.style.setProperty('--member-color', color);
  element.addEventListener('click', () => onFocus(initialEntry.id));

  const kind = raiderClassOf(initialEntry.unitNumber);
  const classLabel = CLASS_LABELS[kind];
  element.classList.add(`is-${kind}`);

  const portrait = document.createElement('img');
  portrait.className = 'raid2-member-portrait';
  portrait.alt = '';
  portrait.draggable = false;
  portrait.src = HERO_URLS[kind];

  const number = document.createElement('span');
  number.className = 'raid2-member-number';
  number.style.background = color;
  number.style.color = contrastText(color);

  const role = document.createElement('span');
  role.className = 'raid2-member-role';
  role.textContent = classLabel.short;
  role.title = classLabel.long;
  role.setAttribute('aria-hidden', 'true');

  const state = document.createElement('span');
  state.className = 'raid2-member-state';
  state.setAttribute('aria-hidden', 'true');
  const stateDot = document.createElement('span');
  stateDot.className = 'raid2-member-state-dot';
  const stateText = document.createElement('span');
  stateText.className = 'raid2-member-state-label';
  state.append(stateDot, stateText);

  element.append(portrait, number, role, state);

  function update(entry: EntryPresentation): void {
    number.textContent = String(entry.unitNumber);
    element.classList.toggle('is-focused', entry.isFocused);
    element.classList.toggle('is-reserve', entry.isQueued || entry.placement.kind === 'resting');
    element.classList.toggle('is-blocked', entry.status === 'blocked');
    const label = statusLabel(entry);
    state.style.setProperty('--raid2-state-color', rowStatusColor(entry));
    stateText.textContent = compactStatusLabel(label);
    element.title = `${entry.tabLabel} · ${classLabel.long} · ${label}`;
    element.setAttribute(
      'aria-label',
      `Raider ${entry.unitNumber}, ${classLabel.long}, ${entry.workspaceLabel}, `
      + `${entry.tabLabel}, ${label.toLowerCase()}`,
    );
  }

  update(initialEntry);
  return { element, update };
}

function compactStatusLabel(label: string): string {
  switch (label) {
    case 'ATTACKING': return 'WORK';
    case 'CAMP': return 'READY';
    case 'VICTORY': return 'CLEAR';
    case 'STUNNED': return 'STUN';
    case 'NEXT WAVE': return 'WAVE';
    case 'FELLED': return 'DOWN';
    default: return label;
  }
}

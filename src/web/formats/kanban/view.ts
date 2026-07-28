import type { EventUnit } from '../../../shared/events.js';
import type { AgentStatus } from '../../../shared/presentation.js';
import type { KanbanState } from './fold.js';

export const KANBAN_STATUSES: readonly AgentStatus[] = ['idle', 'working', 'blocked', 'done'];

export interface KanbanCardView {
  id: string;
  workspaceLabel: string;
  tabLabel: string;
  tabID: string;
  agentKind: string;
  terminalTitle: string | null;
  status: AgentStatus;
  isFocused: boolean;
}

export interface KanbanColumnView {
  status: AgentStatus;
  cards: KanbanCardView[];
}

/** Sidebar row: one workspace with the number of agents currently on the board. */
export interface KanbanWorkspaceView {
  id: string;
  label: string;
  agentCount: number;
}

export interface KanbanView {
  connection: KanbanState['connection'];
  totalAgents: number;
  workspaces: KanbanWorkspaceView[];
  columns: KanbanColumnView[];
}

export function projectKanban(state: KanbanState): KanbanView {
  const units = [...state.units.values()].sort(compareUnits(state));
  const cards = units.map(unit => cardOf(state, unit));
  return {
    connection: state.connection,
    totalAgents: cards.length,
    workspaces: workspacesOf(state),
    columns: KANBAN_STATUSES.map(status => ({
      status,
      cards: cards.filter(card => card.status === status),
    })),
  };
}

function workspacesOf(state: KanbanState): KanbanWorkspaceView[] {
  const counts = new Map<string, number>();
  for (const unit of state.units.values()) {
    counts.set(unit.teamID, (counts.get(unit.teamID) ?? 0) + 1);
  }
  return [...state.teams.values()]
    .sort((a, b) => compareOrder(a, b) || a.id.localeCompare(b.id))
    .map(team => ({ id: team.id, label: team.label, agentCount: counts.get(team.id) ?? 0 }));
}

function compareUnits(state: KanbanState) {
  return (a: EventUnit, b: EventUnit): number => {
    const teamA = state.teams.get(a.teamID);
    const teamB = state.teams.get(b.teamID);
    return compareOrder(teamA, teamB) || compareOrder(a, b) || a.id.localeCompare(b.id);
  };
}

function compareOrder(
  a: { sourceOrder: number; stableOrder: number } | undefined,
  b: { sourceOrder: number; stableOrder: number } | undefined,
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.sourceOrder - b.sourceOrder || a.stableOrder - b.stableOrder;
}

function cardOf(state: KanbanState, unit: EventUnit): KanbanCardView {
  return {
    id: unit.id,
    workspaceLabel: state.teams.get(unit.teamID)?.label ?? unit.teamID,
    tabLabel: unit.tabLabel,
    tabID: unit.tabID,
    agentKind: unit.agentKind,
    terminalTitle: unit.terminalTitle,
    status: unit.status,
    isFocused: unit.isFocused,
  };
}


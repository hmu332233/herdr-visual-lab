import type { EventUnit } from '../../../shared/events.js';
import type { AgentStatus, ConnectionState } from '../../../shared/presentation.js';
import type { GalaxyState } from './fold.js';

export interface GalaxyTabView {
  id: string;
  label: string;
  agents: EventUnit[];
}

export interface GalaxyTeamView {
  id: string;
  label: string;
  tabs: GalaxyTabView[];
  /** 0 = lifeless (no agents), rising with the share of working agents to 1.
   *  Drives the star's size and temperature. */
  heat: number;
}

export interface GalaxyView {
  connection: ConnectionState;
  teams: GalaxyTeamView[];
  counts: Record<AgentStatus, number>;
}

/** Joins the topology (all workspaces/tabs) with the live agents. An agent
 *  whose tab or workspace is unknown to the topology still gets a node —
 *  Herdr remains the authority, the view never drops a detected agent. */
export function projectGalaxy(state: GalaxyState): GalaxyView {
  const counts: Record<AgentStatus, number> = { idle: 0, working: 0, done: 0, blocked: 0 };
  const agentsByTab = new Map<string, EventUnit[]>();
  const teamOfTab = new Map<string, string>();
  for (const team of state.topology) {
    for (const tab of team.tabs) teamOfTab.set(tab.id, team.id);
  }
  const orphanTabsByTeam = new Map<string, GalaxyTabView[]>();
  const orphanTeams: GalaxyTeamView[] = [];
  for (const unit of [...state.units.values()].sort((a, b) => a.stableOrder - b.stableOrder)) {
    counts[unit.status] += 1;
    const list = agentsByTab.get(unit.tabID);
    if (list) { list.push(unit); continue; }
    agentsByTab.set(unit.tabID, [unit]);
    if (teamOfTab.has(unit.tabID)) continue;
    // Tab missing from topology: synthesize it under its team, or a whole
    // synthetic team when even the workspace is unknown.
    const tab: GalaxyTabView = { id: unit.tabID, label: unit.tabLabel, agents: agentsByTab.get(unit.tabID)! };
    if (state.topology.some(team => team.id === unit.teamID)) {
      const list = orphanTabsByTeam.get(unit.teamID) ?? [];
      list.push(tab);
      orphanTabsByTeam.set(unit.teamID, list);
    } else {
      let team = orphanTeams.find(item => item.id === unit.teamID);
      if (!team) { team = { id: unit.teamID, label: unit.teamID, tabs: [], heat: 0 }; orphanTeams.push(team); }
      team.tabs.push(tab);
    }
  }
  const teams: GalaxyTeamView[] = state.topology.map(team => ({
    id: team.id,
    label: team.label,
    tabs: [
      ...team.tabs.map(tab => ({ id: tab.id, label: tab.label, agents: agentsByTab.get(tab.id) ?? [] })),
      ...(orphanTabsByTeam.get(team.id) ?? []),
    ],
    heat: 0,
  }));
  const all = [...teams, ...orphanTeams];
  for (const team of all) team.heat = teamHeat(team);
  return { connection: state.connection, teams: all, counts };
}

/** No agents → 0 (a cold, lifeless star). Any inhabitants give a 0.3
 *  baseline warmth; the share of working agents drives it up to 1. */
function teamHeat(team: GalaxyTeamView): number {
  const agents = team.tabs.flatMap(tab => tab.agents);
  if (agents.length === 0) return 0;
  const working = agents.filter(agent => agent.status === 'working').length;
  return 0.3 + 0.7 * (working / agents.length);
}

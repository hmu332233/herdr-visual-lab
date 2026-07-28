import type { AgentStatus, ConnectionState } from '../../shared/presentation.js';

/** One detected agent, projected from an authoritative herdr snapshot.
 *  The terminal ID is the durable car identity and the focus target. */
export interface SourceAgent {
  terminalID: string;
  paneID: string;
  workspaceID: string;
  tabLabel: string;
  tabID: string;
  terminalTitle: string | null;
  agentKind: string;
  /** Opaque session identity used only for NEW STINT detection.
   *  Must never appear in visible text. */
  agentSessionReference: string | null;
  isFocused: boolean;
  status: AgentStatus;
}

/** One herdr tab, present even when no agent runs inside it. */
export interface SourceTab {
  id: string;
  label: string;
}

/** One herdr workspace acting as a racing team. A workspace is included
 *  even when it currently hosts no agents; `tabs` lists every tab in
 *  authoritative order, agent-less tabs included. */
export interface SourceTeam {
  id: string;
  label: string;
  tabs: SourceTab[];
  agents: SourceAgent[];
}

/** A complete race-ready projection of one authoritative herdr snapshot,
 *  in authoritative workspace order. */
export interface SourceSnapshot {
  teams: SourceTeam[];
}

export type HerdrUpdate =
  | { kind: 'snapshot'; snapshot: SourceSnapshot }
  | { kind: 'connection'; state: ConnectionState };

export function allAgents(snapshot: SourceSnapshot): SourceAgent[] {
  return snapshot.teams.flatMap(team => team.agents);
}

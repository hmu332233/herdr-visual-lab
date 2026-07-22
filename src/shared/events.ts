import type { AgentStatus, ConnectionState } from './presentation.js';

export interface EventTeam {
  id: string;
  label: string;
  sourceOrder: number;
  stableOrder: number;
}

export interface EventUnitProfile {
  teamID: string;
  tabLabel: string;
  agentKind: string;
  isFocused: boolean;
}

export interface EventUnit extends EventUnitProfile {
  id: string;
  status: AgentStatus;
  sourceOrder: number;
  stableOrder: number;
}

export type GameEventBody =
  | { kind: 'connection-changed'; connection: ConnectionState }
  | { kind: 'team-joined'; team: EventTeam }
  | { kind: 'team-updated'; teamID: string; label: string }
  | { kind: 'unit-joined'; unit: EventUnit }
  | { kind: 'unit-profile-changed'; unitID: string; profile: EventUnitProfile }
  | { kind: 'unit-departed'; unitID: string }
  | { kind: 'status-changed'; unitID: string; from: AgentStatus; to: AgentStatus }
  | { kind: 'unit-session-restarted'; unitID: string }
  | { kind: 'snapshot-applied' };

/** `at` is cumulative accepted logical session time, not civil time. */
export type GameEvent = { seq: number; at: number } & GameEventBody;

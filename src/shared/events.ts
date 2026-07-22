import type { AgentStatus } from './presentation.js';

export type GameEventBody =
  | { kind: 'team-joined'; team: { id: string; label: string } }
  | { kind: 'unit-joined'; unit: EventUnit }
  | { kind: 'unit-departed'; unitID: string }
  | { kind: 'status-changed'; unitID: string; from: AgentStatus; to: AgentStatus }
  | { kind: 'stint-started'; unitID: string };

export type GameEvent = { seq: number; at: number } & GameEventBody;

export interface EventUnit {
  id: string;
  teamID: string;
  tabLabel: string;
  agentKind: string;
  status: AgentStatus;
}

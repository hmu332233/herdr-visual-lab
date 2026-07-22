/** Authoritative herdr agent status. Only these four states become entries. */
export type AgentStatus = 'idle' | 'working' | 'done' | 'blocked';

export type ConnectionState =
  | { kind: 'waiting' }
  | { kind: 'live' }
  | { kind: 'offline' }
  | { kind: 'protocolError'; detail: string };

/** Game-neutral lifecycle phase. Each format names these to taste:
 *  F1 formation/live/podium, raid summoning/live/boss-down, … */
export type GamePhase = 'awaitingUnits' | 'live' | 'results';

/** Stable team visual identity. `pattern` reuses a hue with a distinct
 *  outline treatment once the 12-color palette is exhausted. */
export interface TeamColorToken {
  kind: 'palette' | 'pattern';
  slot: number;
}

/** Where the unit's marker belongs. `progress` is the fractional position in
 *  [0, 1) along the format's motion path at the sync instant. Structure is
 *  1:1 with the old F1 placements; only the names are game-neutral. */
export type EntryPlacement =
  | { kind: 'active'; progress: number }
  | { kind: 'resting' }
  | { kind: 'coolingDown'; progress: number }
  | { kind: 'blockedActive'; progress: number }
  | { kind: 'blockedResting' }
  | { kind: 'departed' }
  | { kind: 'queued' };

/** Full-screen connection/game condition layered over the phase. */
export type GameOverlay =
  | { kind: 'none' }
  | { kind: 'connecting' }
  | { kind: 'noUnits' }
  | { kind: 'frozen' }
  | { kind: 'suspended'; detail: string };

export interface EntryPresentation {
  /** Durable terminal ID: the unit identity and the agent.focus target. */
  id: string;
  unitNumber: number;
  teamID: string;
  workspaceLabel: string;
  tabLabel: string;
  agentKind: string;
  status: AgentStatus;
  colorToken: TeamColorToken;
  /** Official progress in abstract units. Owns rank, labels, gap, and finish.
   *  Formats derive their own text (lap count, damage stacks, …) from it. */
  officialProgress: number;
  placement: EntryPlacement;
  /** Display motion in progress units/second for client-side extrapolation. */
  displaySpeed: number;
  isFocused: boolean;
  isDeparted: boolean;
  isQueued: boolean;
  showsNewStint: boolean;
}

export interface TeamStanding {
  id: string;
  rank: number;
  label: string;
  colorToken: TeamColorToken;
  /** Exact sum of member official progress, including frozen ones. */
  progress: number;
  entries: EntryPresentation[];
}

export interface FinalResultTeam {
  rank: number;
  teamID: string;
  label: string;
  colorToken: TeamColorToken;
  progress: number;
}

export interface FinalResult {
  round: number;
  top: FinalResultTeam[];
}

/** The complete externally observable game state. The browser renders this;
 *  tests assert on it. Game-neutral: no format vocabulary appears here. */
export interface GamePresentation {
  phase: GamePhase;
  /** One-based round number (old grand prix). */
  round: number;
  /** Raw leader official progress; formats derive their own header from it. */
  leaderProgress: number;
  teams: TeamStanding[];
  results: FinalResult | null;
  connection: ConnectionState;
  overlay: GameOverlay;
}

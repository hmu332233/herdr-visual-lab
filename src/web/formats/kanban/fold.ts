import type { GameEvent } from '../../../shared/events.js';
import type { ConnectionState } from '../../../shared/presentation.js';
import type { EventTeam, EventUnit } from '../../../shared/events.js';

export interface KanbanState {
  connection: ConnectionState;
  teams: Map<string, EventTeam>;
  units: Map<string, EventUnit>;
}

export function initialKanbanState(): KanbanState {
  return {
    connection: { kind: 'waiting' },
    teams: new Map(),
    units: new Map(),
  };
}

export function foldKanban(state: KanbanState, event: GameEvent): void {
  switch (event.kind) {
    case 'connection-changed':
      state.connection = { ...event.connection };
      break;
    case 'team-joined':
      state.teams.set(event.team.id, { ...event.team });
      break;
    case 'team-updated': {
      const team = state.teams.get(event.teamID);
      if (team) team.label = event.label;
      break;
    }
    case 'unit-joined':
      state.units.set(event.unit.id, { ...event.unit });
      break;
    case 'unit-profile-changed': {
      const unit = state.units.get(event.unitID);
      if (unit) Object.assign(unit, event.profile);
      break;
    }
    case 'status-changed': {
      const unit = state.units.get(event.unitID);
      if (unit) unit.status = event.to;
      break;
    }
    case 'unit-departed':
      state.units.delete(event.unitID);
      break;
    case 'unit-session-restarted':
    case 'snapshot-applied':
      break;
  }
}

export function replayKanban(events: readonly GameEvent[]): KanbanState {
  const state = initialKanbanState();
  for (const event of events) foldKanban(state, event);
  return state;
}

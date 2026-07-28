import type { GameEvent, EventUnit, TopologyTeam } from '../../../shared/events.js';
import type { AgentStatus, ConnectionState } from '../../../shared/presentation.js';

/** One-shot visual to play when Herdr reports a transition. */
export interface GalaxyEffect {
  kind: 'done-burst' | 'blocked-shockwave' | 'unit-born' | 'unit-departed';
  unitID: string;
}

export interface GalaxyState {
  connection: ConnectionState;
  /** Full hierarchy including agent-less workspaces and tabs. */
  topology: TopologyTeam[];
  units: Map<string, EventUnit>;
  /** Pending one-shot effects; the scene drains them via takeEffects. */
  effects: GalaxyEffect[];
}

export function initialGalaxyState(): GalaxyState {
  return { connection: { kind: 'waiting' }, topology: [], units: new Map(), effects: [] };
}

function transitionEffect(to: AgentStatus, unitID: string): GalaxyEffect | null {
  if (to === 'done') return { kind: 'done-burst', unitID };
  if (to === 'blocked') return { kind: 'blocked-shockwave', unitID };
  return null;
}

export function foldGalaxy(state: GalaxyState, event: GameEvent): void {
  switch (event.kind) {
    case 'connection-changed':
      state.connection = { ...event.connection };
      break;
    case 'topology-changed':
      state.topology = event.teams.map(team => ({
        id: team.id, label: team.label, tabs: team.tabs.map(tab => ({ ...tab })),
      }));
      break;
    case 'unit-joined':
      state.units.set(event.unit.id, { ...event.unit });
      state.effects.push({ kind: 'unit-born', unitID: event.unit.id });
      break;
    case 'unit-profile-changed': {
      const unit = state.units.get(event.unitID);
      if (unit) Object.assign(unit, event.profile);
      break;
    }
    case 'status-changed': {
      const unit = state.units.get(event.unitID);
      if (!unit) break;
      unit.status = event.to;
      const effect = transitionEffect(event.to, event.unitID);
      if (effect) state.effects.push(effect);
      break;
    }
    case 'unit-departed':
      if (state.units.delete(event.unitID)) {
        state.effects.push({ kind: 'unit-departed', unitID: event.unitID });
      }
      break;
    default:
      break;
  }
}

/** Drains pending one-shot effects; the caller owns playback timing. */
export function takeEffects(state: GalaxyState): GalaxyEffect[] {
  return state.effects.splice(0);
}

import type { AgentStatus, ConnectionState } from '../../../shared/presentation.js';
import type { GameEvent } from '../../../shared/events.js';

export interface FoundryWorker {
  id: string;
  teamID: string;
  label: string;
  number: number;
  status: AgentStatus;
  productiveSeconds: number;
  workingSince: number | null;
  repairs: number;
  completions: number;
  departed: boolean;
}

export interface FoundryState {
  teams: Map<string, { label: string; colorSlot: number }>;
  workers: Map<string, FoundryWorker>;
  lastEventAt: number;
  connection: ConnectionState;
}

export interface FoundryTeamProjection {
  id: string;
  label: string;
  colorSlot: number;
  productiveSeconds: number;
  resources: number;
  modules: number;
  moduleProgress: number;
  activeWorkers: number;
  hazards: number;
  repairs: number;
}

export function initialFoundry(): FoundryState {
  return { teams: new Map(), workers: new Map(), lastEventAt: 0, connection: { kind: 'waiting' } };
}

function settle(worker: FoundryWorker, at: number): void {
  if (worker.workingSince !== null) {
    worker.productiveSeconds += Math.max(0, at - worker.workingSince);
    worker.workingSince = null;
  }
}

export function foldFoundry(state: FoundryState, event: GameEvent): FoundryState {
  state.lastEventAt = Math.max(state.lastEventAt, event.at);
  switch (event.kind) {
    case 'team-joined':
      if (!state.teams.has(event.team.id)) {
        state.teams.set(event.team.id, { label: event.team.label, colorSlot: state.teams.size });
      }
      break;
    case 'connection-changed': state.connection = event.connection; break;
    case 'team-updated': { const team = state.teams.get(event.teamID); if (team) team.label = event.label; break; }
    case 'unit-profile-changed': { const worker = state.workers.get(event.unitID); if (worker) { worker.teamID = event.profile.teamID; worker.label = event.profile.tabLabel; } break; }
    case 'snapshot-applied': break;
    case 'unit-joined': {
      const existing = state.workers.get(event.unit.id);
      if (existing) {
        existing.departed = false;
        existing.status = event.unit.status;
        existing.workingSince = event.unit.status === 'working' ? event.at : null;
      } else {
        state.workers.set(event.unit.id, {
          id: event.unit.id, teamID: event.unit.teamID, label: event.unit.tabLabel,
          number: state.workers.size + 1, status: event.unit.status,
          productiveSeconds: 0, workingSince: event.unit.status === 'working' ? event.at : null,
          repairs: 0, completions: event.unit.status === 'done' ? 1 : 0, departed: false,
        });
      }
      break;
    }
    case 'status-changed': {
      const worker = state.workers.get(event.unitID);
      if (!worker) break;
      settle(worker, event.at);
      if (event.from === 'blocked' && event.to === 'working') worker.repairs += 1;
      if (event.to === 'done' && event.from !== 'done') worker.completions += 1;
      worker.status = event.to;
      worker.workingSince = event.to === 'working' ? event.at : null;
      break;
    }
    case 'unit-departed': {
      const worker = state.workers.get(event.unitID);
      if (worker) { settle(worker, event.at); worker.departed = true; }
      break;
    }
    case 'unit-session-restarted': {
      const worker = state.workers.get(event.unitID);
      if (worker) worker.completions += 1;
      break;
    }
  }
  return state;
}

export function workerProductiveSeconds(worker: FoundryWorker, at: number): number {
  return worker.productiveSeconds +
    (worker.workingSince === null ? 0 : Math.max(0, at - worker.workingSince));
}

export function projectFoundry(state: FoundryState, at: number): FoundryTeamProjection[] {
  return [...state.teams.entries()].map(([id, team]) => {
    const workers = [...state.workers.values()].filter(worker => worker.teamID === id && !worker.departed);
    const productiveSeconds = workers.reduce((sum, worker) => sum + workerProductiveSeconds(worker, at), 0);
    const repairs = workers.reduce((sum, worker) => sum + worker.repairs, 0);
    const completions = workers.reduce((sum, worker) => sum + worker.completions, 0);
    const construction = productiveSeconds + repairs * 12 + completions * 20;
    return {
      id, label: team.label, colorSlot: team.colorSlot, productiveSeconds,
      resources: Math.floor(productiveSeconds * 2 + repairs * 25 + completions * 40),
      modules: Math.floor(construction / 30),
      moduleProgress: (construction % 30) / 30,
      activeWorkers: workers.filter(worker => worker.status === 'working').length,
      hazards: workers.filter(worker => worker.status === 'blocked').length,
      repairs,
    };
  }).sort((a, b) => b.modules - a.modules || b.resources - a.resources || a.colorSlot - b.colorSlot);
}

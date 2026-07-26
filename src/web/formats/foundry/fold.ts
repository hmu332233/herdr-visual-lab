import type { AgentStatus, ConnectionState } from '../../../shared/presentation.js';
import type { GameEvent } from '../../../shared/events.js';

export const MISSION_CYCLE = [
  {
    destination: 'MOONLIGHT POST',
    cargo: 'STAR MAIL',
    rocket: 'COMET COURIER',
    color: '#FFD166',
  },
  {
    destination: 'MOSS GARDEN',
    cargo: 'SEED CAPSULES',
    rocket: 'SPROUT SCOUT',
    color: '#72E6A6',
  },
  {
    destination: 'CLOUD ARCHIVE',
    cargo: 'MEMORY CRATES',
    rocket: 'CIRRUS HOPPER',
    color: '#70D7FF',
  },
  {
    destination: 'LAVENDER RING',
    cargo: 'FESTIVAL LIGHTS',
    rocket: 'TWINKLE SHUTTLE',
    color: '#C9A7FF',
  },
] as const;

export const MISSION_DURATION = 75;
export const LOAD_DURATION = 60;
export const DELIVERY_SECONDS = 6;

export interface FoundryWorker {
  id: string;
  teamID: string;
  label: string;
  agentKind: string;
  number: number;
  status: AgentStatus;
  isFocused: boolean;
  productiveSeconds: number;
  workingSince: number | null;
  workIntervals: Array<{ from: number; to: number }>;
  repairTimes: number[];
  completionTimes: number[];
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

export interface FoundryWorkerProjection {
  id: string;
  label: string;
  agentKind: string;
  number: number;
  status: AgentStatus;
  isFocused: boolean;
  productiveSeconds: number;
  missionContribution: number;
  routeProgress: number;
  carrying: boolean;
  repairs: number;
  completions: number;
}

export interface FoundryTeamProjection {
  id: string;
  label: string;
  colorSlot: number;
  productiveSeconds: number;
  missionOutput: number;
  deliveries: number;
  lifetimeDeliveries: number;
  score: number;
  outputRate: number;
  cargoProgress: number;
  activeWorkers: number;
  hazards: number;
  repairs: number;
  workers: FoundryWorkerProjection[];
}

export interface SpaceportProjection {
  missionNumber: number;
  mission: (typeof MISSION_CYCLE)[number];
  phase: 'COLD DOCK' | 'LOADING' | 'FINAL CALL' | 'LAUNCHING' | 'DELAYED' | 'JAMMED';
  timeLeft: number;
  cycleTime: number;
  launchProgress: number;
  output: number;
  quota: number;
  progress: number;
  launchReady: boolean;
  successfulLaunches: number;
  streak: number;
  totalDeliveries: number;
  residents: number;
  activeWorkers: number;
  hazards: number;
  score: number;
  rank: 'S' | 'A' | 'B' | 'C';
}

export function initialFoundry(): FoundryState {
  return {
    teams: new Map(),
    workers: new Map(),
    lastEventAt: 0,
    connection: { kind: 'waiting' },
  };
}

function settle(worker: FoundryWorker, at: number): void {
  if (worker.workingSince === null) return;
  const duration = Math.max(0, at - worker.workingSince);
  worker.productiveSeconds += duration;
  if (duration > 0) worker.workIntervals.push({ from: worker.workingSince, to: at });
  worker.workingSince = null;
}

export function foldFoundry(state: FoundryState, event: GameEvent): FoundryState {
  state.lastEventAt = Math.max(state.lastEventAt, event.at);
  switch (event.kind) {
    case 'team-joined':
      if (!state.teams.has(event.team.id)) {
        state.teams.set(event.team.id, {
          label: event.team.label,
          colorSlot: state.teams.size,
        });
      }
      break;
    case 'connection-changed':
      state.connection = event.connection;
      break;
    case 'team-updated': {
      const team = state.teams.get(event.teamID);
      if (team) team.label = event.label;
      break;
    }
    case 'unit-profile-changed': {
      const worker = state.workers.get(event.unitID);
      if (worker) {
        worker.teamID = event.profile.teamID;
        worker.label = event.profile.tabLabel;
        worker.agentKind = event.profile.agentKind;
        worker.isFocused = event.profile.isFocused;
      }
      break;
    }
    case 'snapshot-applied':
      break;
    case 'unit-joined': {
      const existing = state.workers.get(event.unit.id);
      if (existing) {
        existing.departed = false;
        existing.teamID = event.unit.teamID;
        existing.label = event.unit.tabLabel;
        existing.agentKind = event.unit.agentKind;
        existing.isFocused = event.unit.isFocused;
        existing.status = event.unit.status;
        existing.workingSince = event.unit.status === 'working' ? event.at : null;
      } else {
        state.workers.set(event.unit.id, {
          id: event.unit.id,
          teamID: event.unit.teamID,
          label: event.unit.tabLabel,
          agentKind: event.unit.agentKind,
          number: state.workers.size + 1,
          status: event.unit.status,
          isFocused: event.unit.isFocused,
          productiveSeconds: 0,
          workingSince: event.unit.status === 'working' ? event.at : null,
          workIntervals: [],
          repairTimes: [],
          completionTimes: event.unit.status === 'done' ? [event.at] : [],
          repairs: 0,
          completions: event.unit.status === 'done' ? 1 : 0,
          departed: false,
        });
      }
      break;
    }
    case 'status-changed': {
      const worker = state.workers.get(event.unitID);
      if (!worker) break;
      settle(worker, event.at);
      if (event.from === 'blocked' && event.to === 'working') {
        worker.repairs += 1;
        worker.repairTimes.push(event.at);
      }
      if (event.to === 'done' && event.from !== 'done') {
        worker.completions += 1;
        worker.completionTimes.push(event.at);
      }
      worker.status = event.to;
      worker.workingSince = event.to === 'working' ? event.at : null;
      break;
    }
    case 'unit-departed': {
      const worker = state.workers.get(event.unitID);
      if (worker) {
        settle(worker, event.at);
        worker.departed = true;
      }
      break;
    }
    case 'unit-session-restarted': {
      const worker = state.workers.get(event.unitID);
      if (worker) {
        worker.completions += 1;
        worker.completionTimes.push(event.at);
      }
      break;
    }
  }
  return state;
}

export function workerProductiveSeconds(worker: FoundryWorker, at: number): number {
  return worker.productiveSeconds
    + (worker.workingSince === null ? 0 : Math.max(0, at - worker.workingSince));
}

export function workerProductiveBetween(
  worker: FoundryWorker,
  from: number,
  to: number,
): number {
  let total = 0;
  for (const interval of worker.workIntervals) {
    total += Math.max(0, Math.min(to, interval.to) - Math.max(from, interval.from));
  }
  if (worker.workingSince !== null) {
    total += Math.max(0, to - Math.max(from, worker.workingSince));
  }
  return total;
}

function eventCountBetween(times: readonly number[], from: number, to: number): number {
  return times.filter(time => time >= from && time <= to).length;
}

function workerOutputBetween(worker: FoundryWorker, from: number, to: number): number {
  return workerProductiveBetween(worker, from, to)
    + eventCountBetween(worker.repairTimes, from, to) * 6
    + eventCountBetween(worker.completionTimes, from, to) * 12;
}

function missionWindow(at: number): { start: number; loadEnd: number; cycleTime: number } {
  const start = Math.floor(Math.max(0, at) / MISSION_DURATION) * MISSION_DURATION;
  return {
    start,
    loadEnd: start + LOAD_DURATION,
    cycleTime: Math.max(0, at) - start,
  };
}

export function projectFoundry(state: FoundryState, at: number): FoundryTeamProjection[] {
  const { start, loadEnd } = missionWindow(at);
  const outputEnd = Math.min(at, loadEnd);
  return [...state.teams.entries()].map(([id, team]) => {
    const workers = [...state.workers.values()]
      .filter(worker => worker.teamID === id && !worker.departed)
      .sort((a, b) => a.number - b.number);
    const productiveSeconds = workers.reduce(
      (sum, worker) => sum + workerProductiveSeconds(worker, at),
      0,
    );
    const missionOutput = workers.reduce(
      (sum, worker) => sum + workerOutputBetween(worker, start, outputEnd),
      0,
    );
    const lifetimeOutput = workers.reduce(
      (sum, worker) => sum + workerProductiveSeconds(worker, at)
        + worker.repairs * 6 + worker.completions * 12,
      0,
    );
    const activeWorkers = workers.filter(worker => worker.status === 'working').length;
    const hazards = workers.filter(worker => worker.status === 'blocked').length;
    const repairs = workers.reduce((sum, worker) => sum + worker.repairs, 0);
    const deliveries = Math.floor(missionOutput / DELIVERY_SECONDS);
    return {
      id,
      label: team.label,
      colorSlot: team.colorSlot,
      productiveSeconds,
      missionOutput,
      deliveries,
      lifetimeDeliveries: Math.floor(lifetimeOutput / DELIVERY_SECONDS),
      score: Math.floor(lifetimeOutput * 10 + deliveries * 25),
      outputRate: activeWorkers,
      cargoProgress: (missionOutput % DELIVERY_SECONDS) / DELIVERY_SECONDS,
      activeWorkers,
      hazards,
      repairs,
      workers: workers.map(worker => {
        const missionContribution = workerOutputBetween(worker, start, outputEnd);
        return {
          id: worker.id,
          label: worker.label,
          agentKind: worker.agentKind,
          number: worker.number,
          status: worker.status,
          isFocused: worker.isFocused,
          productiveSeconds: workerProductiveSeconds(worker, at),
          missionContribution,
          routeProgress: (missionContribution % DELIVERY_SECONDS) / DELIVERY_SECONDS,
          carrying: worker.status === 'working'
            && Math.floor(missionContribution / (DELIVERY_SECONDS / 2)) % 2 === 0,
          repairs: worker.repairs,
          completions: worker.completions,
        };
      }),
    };
  }).sort((a, b) =>
    b.missionOutput - a.missionOutput
    || b.score - a.score
    || a.colorSlot - b.colorSlot,
  );
}

function rankFor(progress: number): SpaceportProjection['rank'] {
  if (progress >= 1.35) return 'S';
  if (progress >= 1) return 'A';
  if (progress >= 0.65) return 'B';
  return 'C';
}

export function projectSpaceport(
  state: FoundryState,
  teams: readonly FoundryTeamProjection[],
  at: number,
): SpaceportProjection {
  const { start, loadEnd, cycleTime } = missionWindow(at);
  const missionIndex = Math.floor(Math.max(0, at) / MISSION_DURATION);
  const residents = teams.reduce((sum, team) => sum + team.workers.length, 0);
  const activeWorkers = teams.reduce((sum, team) => sum + team.activeWorkers, 0);
  const hazards = teams.reduce((sum, team) => sum + team.hazards, 0);
  const quota = Math.max(36, residents * 7);
  const allWorkers = [...state.workers.values()].filter(worker => !worker.departed);
  const outputIn = (from: number, to: number) =>
    allWorkers.reduce((sum, worker) => sum + workerOutputBetween(worker, from, to), 0);
  const output = outputIn(start, Math.min(at, loadEnd));
  const progress = output / quota;
  let successfulLaunches = 0;
  let streak = 0;
  for (let index = 0; index < missionIndex; index += 1) {
    const missionStart = index * MISSION_DURATION;
    const success = outputIn(missionStart, missionStart + LOAD_DURATION) >= quota;
    if (success) {
      successfulLaunches += 1;
      streak += 1;
    } else {
      streak = 0;
    }
  }
  const launchReady = progress >= 1;
  const launchProgress = Math.max(
    0,
    Math.min(1, (cycleTime - LOAD_DURATION) / (MISSION_DURATION - LOAD_DURATION)),
  );
  const phase = residents === 0 ? 'COLD DOCK'
    : cycleTime >= LOAD_DURATION
      ? launchReady ? 'LAUNCHING' : 'DELAYED'
      : hazards > 0 ? 'JAMMED'
        : LOAD_DURATION - cycleTime <= 12 ? 'FINAL CALL'
          : 'LOADING';
  const totalDeliveries = teams.reduce((sum, team) => sum + team.lifetimeDeliveries, 0);
  return {
    missionNumber: missionIndex + 1,
    mission: MISSION_CYCLE[missionIndex % MISSION_CYCLE.length],
    phase,
    timeLeft: Math.max(0, LOAD_DURATION - cycleTime),
    cycleTime,
    launchProgress,
    output,
    quota,
    progress,
    launchReady,
    successfulLaunches,
    streak,
    totalDeliveries,
    residents,
    activeWorkers,
    hazards,
    score: teams.reduce((sum, team) => sum + team.score, 0)
      + successfulLaunches * 1000 + streak * 250,
    rank: rankFor(progress),
  };
}

/** Compatibility export for code that still uses the original format name. */
export const projectFactory = projectSpaceport;

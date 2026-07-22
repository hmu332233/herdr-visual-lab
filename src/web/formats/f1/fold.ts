import type { GameEvent } from '../../../shared/events.js';
import type { AgentStatus, ConnectionState } from '../../../shared/presentation.js';
import type { FinalResult, TeamColorToken } from '../../presentation.js';
import type { TimelineCursor } from '../../../shared/protocol.js';
import { stableHash } from '../../../shared/deterministic.js';
import { F1Rules, seededF1Pace } from './rules.js';

export interface F1TeamState { id: string; label: string; sourceOrder: number; stableOrder: number; colorToken: TeamColorToken }
export interface F1CarState {
  id: string; number: number; teamID: string; tabLabel: string; agentKind: string;
  status: AgentStatus; isFocused: boolean; sourceOrder: number; stableOrder: number;
  officialLaps: number; displayLaps: number; pace: { multiplier: number; lap: number };
  departed: boolean; queued: boolean; incidentInPit: boolean; newStintUntil: number | null;
}
export interface F1State {
  phase: 'formation' | 'race' | 'podium'; round: number; timelineTime: number;
  timelineRate: number; raceTime: number; podiumElapsed: number; connection: ConnectionState;
  hasSnapshot: boolean; teams: Map<string, F1TeamState>; cars: Map<string, F1CarState>;
  result: FinalResult | null;
}

export function initialF1State(): F1State {
  return { phase: 'formation', round: 1, timelineTime: 0, timelineRate: 1, raceTime: 0,
    podiumElapsed: 0, connection: { kind: 'waiting' }, hasSnapshot: false,
    teams: new Map(), cars: new Map(), result: null };
}

function allocate(preferred: number, maximum: number, used: Set<number>): number {
  for (let probe = 0; probe < maximum; probe += 1) {
    const value = (preferred + probe) % maximum;
    if (!used.has(value)) return value;
  }
  throw new Error('identity space exhausted');
}
function addTeam(state: F1State, event: Extract<GameEvent, { kind: 'team-joined' }>): void {
  if (state.teams.has(event.team.id)) return;
  const used = new Set([...state.teams.values()].filter(t => t.colorToken.kind === 'palette').map(t => t.colorToken.slot));
  const preferred = Number(stableHash(event.team.id) % BigInt(F1Rules.paletteSize));
  const slot = used.size < F1Rules.paletteSize ? allocate(preferred, F1Rules.paletteSize, used) :
    [...state.teams.values()].filter(t => t.colorToken.kind === 'pattern').length;
  state.teams.set(event.team.id, { ...event.team, colorToken: { kind: used.size < F1Rules.paletteSize ? 'palette' : 'pattern', slot } });
}
function addCar(state: F1State, unit: Extract<GameEvent, { kind: 'unit-joined' }>['unit']): void {
  const existing = state.cars.get(unit.id);
  if (existing) { Object.assign(existing, unit, { departed: false }); return; }
  const used = new Set([...state.cars.values()].map(car => car.number));
  const number = allocate(Number(stableHash(unit.id) % 99n), 99, new Set([...used].map(n => n - 1))) + 1;
  const present = [...state.cars.values()].filter(car => !car.departed && !car.queued);
  const start = state.phase === 'race' ? Math.max(0, Math.min(...present.map(car => car.officialLaps), F1Rules.newEntrantDeficit) - F1Rules.newEntrantDeficit) : 0;
  state.cars.set(unit.id, { ...unit, number, officialLaps: start, displayLaps: start,
    pace: { multiplier: 1, lap: -1 }, departed: false, queued: state.phase === 'podium',
    incidentInPit: false, newStintUntil: null });
}
function speed(state: F1State, car: F1CarState): number {
  if (car.status !== 'working' || car.departed || car.queued) return 0;
  const lap = Math.min(Math.floor(car.officialLaps), F1Rules.totalLaps - 1);
  if (car.pace.lap !== lap) { car.pace = { lap, multiplier: seededF1Pace(state.round, car.id, lap) }; }
  return F1Rules.baseSpeed * car.pace.multiplier;
}
function timeToFinish(state: F1State, car: F1CarState): number {
  let value = car.officialLaps;
  let total = 0;
  while (value < F1Rules.totalLaps - 1e-12) {
    const lap = Math.min(Math.floor(value), F1Rules.totalLaps - 1);
    const rate = F1Rules.baseSpeed * seededF1Pace(state.round, car.id, lap);
    const boundary = Math.min(lap + 1, F1Rules.totalLaps);
    total += (boundary - value) / rate; value = boundary;
  }
  return total;
}
function moveCar(state: F1State, car: F1CarState, elapsed: number): void {
  let remaining = elapsed;
  while (remaining > 1e-12 && car.officialLaps < F1Rules.totalLaps) {
    const rate = speed(state, car); if (rate === 0) break;
    const boundary = Math.min(Math.floor(car.officialLaps) + 1, F1Rules.totalLaps);
    const needed = (boundary - car.officialLaps) / rate;
    const used = Math.min(remaining, needed);
    car.officialLaps += used * rate; car.displayLaps += used * rate; remaining -= used;
    if (needed <= used + 1e-9) car.officialLaps = boundary;
  }
}
function rankedTeams(state: F1State) {
  return [...state.teams.values()].map(team => ({ team, cars: [...state.cars.values()].filter(c => c.teamID === team.id) }))
    .filter(group => group.cars.some(c => !c.departed)).map(group => ({ ...group, progress: group.cars.reduce((n, c) => n + c.officialLaps, 0) }))
    .sort((a, b) => Math.round(b.progress * 1e6) - Math.round(a.progress * 1e6) || a.team.sourceOrder - b.team.sourceOrder || a.team.id.localeCompare(b.team.id));
}
function finish(state: F1State): void {
  const teams = rankedTeams(state);
  state.result = { round: state.round, top: teams.slice(0, 3).map((g, i) => ({ rank: i + 1, teamID: g.team.id, label: g.team.label, colorToken: g.team.colorToken, progress: g.progress })) };
  state.phase = 'podium'; state.podiumElapsed = 0;
}
function reset(state: F1State): void {
  state.round += 1; state.raceTime = 0; state.podiumElapsed = 0; state.result = null; state.phase = 'race';
  for (const [id, car] of state.cars) {
    if (car.departed) { state.cars.delete(id); continue; }
    Object.assign(car, { officialLaps: 0, displayLaps: 0, pace: { multiplier: 1, lap: -1 }, queued: false, incidentInPit: false, newStintUntil: null });
  }
  const circulating = [...state.cars.values()].filter(c => c.status === 'done' || c.status === 'blocked').sort((a,b) => a.stableOrder-b.stableOrder);
  circulating.forEach((car, i) => { car.displayLaps = (i + 1) / (circulating.length + 1); });
}
export function advanceF1To(state: F1State, target: number): F1State {
  if (target < state.timelineTime - 1e-9) throw new RangeError('timeline cannot move backwards');
  let remaining = target - state.timelineTime;
  while (remaining > 1e-12) {
    if (state.phase === 'formation') break;
    if (state.phase === 'podium') {
      const used = Math.min(remaining, F1Rules.podiumDuration - state.podiumElapsed);
      for (const car of state.cars.values()) if (!car.departed && !car.queued && (car.status === 'working' || car.status === 'done')) car.displayLaps += used * F1Rules.baseSpeed * F1Rules.doneCooldownFactor;
      state.podiumElapsed += used; state.raceTime += used; remaining -= used;
      if (state.podiumElapsed >= F1Rules.podiumDuration - 1e-9) reset(state); else break;
      continue;
    }
    const drivers = [...state.cars.values()].filter(c => c.status === 'working' && !c.departed && !c.queued);
    const finishAfter = drivers.length ? Math.min(...drivers.map(car => timeToFinish(state, car))) : Infinity;
    const used = Math.min(remaining, finishAfter);
    for (const car of state.cars.values()) {
      if (car.status === 'working') moveCar(state, car, used);
      else if (car.status === 'done' && !car.departed && !car.queued) car.displayLaps += used * F1Rules.baseSpeed * F1Rules.doneCooldownFactor;
    }
    state.raceTime += used; remaining -= used;
    if (finishAfter <= used + 1e-9) finish(state); else break;
  }
  state.timelineTime = target;
  return state;
}
export function setF1Cursor(state: F1State, cursor: TimelineCursor): F1State { advanceF1To(state, cursor.timelineTime); state.timelineRate = cursor.timelineRate; return state; }
export function foldF1(state: F1State, event: GameEvent): F1State {
  advanceF1To(state, event.at);
  switch (event.kind) {
    case 'connection-changed': state.connection = event.connection; break;
    case 'team-joined': addTeam(state, event); break;
    case 'team-updated': { const team = state.teams.get(event.teamID); if (team) team.label = event.label; break; }
    case 'unit-joined': addCar(state, event.unit); break;
    case 'unit-profile-changed': { const car = state.cars.get(event.unitID); if (car) Object.assign(car, event.profile); break; }
    case 'status-changed': { const car = state.cars.get(event.unitID); if (car) { car.incidentInPit = event.to === 'blocked' && (car.status === 'idle' || car.queued); if (event.to !== 'blocked') car.incidentInPit = false; car.status = event.to; } break; }
    case 'unit-session-restarted': { const car = state.cars.get(event.unitID); if (car) car.newStintUntil = state.raceTime + F1Rules.newStintDuration; break; }
    case 'unit-departed': { const car = state.cars.get(event.unitID); if (car) car.departed = true; break; }
    case 'snapshot-applied': if (!state.hasSnapshot) { state.hasSnapshot = true; state.phase = 'race'; state.round = 0; reset(state); } break;
  }
  return state;
}
export function replayF1(events: readonly GameEvent[]): F1State { const state = initialF1State(); for (const event of events) foldF1(state, event); return state; }

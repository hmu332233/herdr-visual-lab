import type { EntryPlacement, EntryPresentation, GameOverlay, FormatViewBase, TeamStanding } from '../../presentation.js';
import { F1Rules } from './rules.js';
import type { F1CarState, F1State } from './fold.js';

export type F1View = FormatViewBase;

function placement(car: F1CarState): EntryPlacement {
  const progress = car.displayLaps - Math.floor(car.displayLaps);
  if (car.queued) return { kind: 'queued' };
  if (car.departed) return { kind: 'departed' };
  if (car.status === 'working') return { kind: 'active', progress };
  if (car.status === 'idle') return { kind: 'resting' };
  if (car.status === 'done') return { kind: 'coolingDown', progress };
  return car.incidentInPit ? { kind: 'blockedResting' } : { kind: 'blockedActive', progress };
}
function displaySpeed(state: F1State, car: F1CarState): number {
  if (state.connection.kind !== 'live' || car.departed || car.queued) return 0;
  if (state.phase === 'podium') return car.status === 'working' || car.status === 'done' ? F1Rules.baseSpeed * F1Rules.doneCooldownFactor * state.timelineRate : 0;
  if (car.status === 'working') return F1Rules.baseSpeed * (car.pace.lap < 0 ? 1 : car.pace.multiplier) * state.timelineRate;
  if (car.status === 'done') return F1Rules.baseSpeed * F1Rules.doneCooldownFactor * state.timelineRate;
  return 0;
}
function overlay(state: F1State): GameOverlay {
  if (state.connection.kind === 'protocolError') return { kind: 'suspended', detail: state.connection.detail };
  if (!state.hasSnapshot) return { kind: 'connecting' };
  if (state.connection.kind !== 'live') return { kind: 'frozen' };
  if ([...state.cars.values()].every(car => car.departed)) return { kind: 'noUnits' };
  return { kind: 'none' };
}
export function projectF1(state: F1State): F1View {
  const q = (value: number) => Math.round(value * 1e9) / 1e9;
  const groups = [...state.teams.values()].map(team => ({ team, cars: [...state.cars.values()].filter(car => car.teamID === team.id) }))
    .filter(group => group.cars.some(car => !car.departed)).map(group => ({ ...group, progress: q(group.cars.reduce((sum, car) => sum + car.officialLaps, 0)) }))
    .sort((a,b) => Math.round(b.progress*1e6)-Math.round(a.progress*1e6) || a.team.sourceOrder-b.team.sourceOrder || a.team.id.localeCompare(b.team.id));
  const teams: TeamStanding[] = groups.map((group, index) => ({
    id: group.team.id, rank: index + 1, label: group.team.label, colorToken: group.team.colorToken, progress: group.progress,
    entries: group.cars.slice().sort((a,b) => Math.round(b.officialLaps*1e6)-Math.round(a.officialLaps*1e6) || a.number-b.number || a.id.localeCompare(b.id)).map((car): EntryPresentation => ({
      id: car.id, unitNumber: car.number, teamID: car.teamID, workspaceLabel: group.team.label,
      tabLabel: car.tabLabel, agentKind: car.agentKind, status: car.status, colorToken: group.team.colorToken,
      officialProgress: q(car.officialLaps), placement: placement({ ...car, displayLaps: q(car.displayLaps) }), displaySpeed: displaySpeed(state, car),
      isFocused: car.isFocused, isDeparted: car.departed, isQueued: car.queued,
      showsNewStint: car.newStintUntil !== null && state.raceTime < car.newStintUntil,
    })),
  }));
  return { phase: state.phase === 'formation' ? 'awaitingUnits' : state.phase === 'race' ? 'live' : 'results',
    round: state.round, leaderProgress: q(Math.max(0, ...[...state.cars.values()].filter(c => !c.queued).map(c => c.officialLaps))),
    teams, results: state.result, connection: state.connection, overlay: overlay(state) };
}

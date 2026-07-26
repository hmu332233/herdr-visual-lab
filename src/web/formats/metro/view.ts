import type { AgentStatus, ConnectionState } from '../../../shared/presentation.js';
import type { GameOverlay, TeamColorToken } from '../../presentation.js';
import type { MetroLineState, MetroState, MetroTrainState } from './fold.js';
import { MetroRules, seededMetroUnitPhase } from './rules.js';
import { METRO_ROUTE_TEMPLATES } from './routes.js';

export type TrainPlacement =
  | { kind: 'route'; progress: number }
  | { kind: 'depot'; slot: number }
  | { kind: 'terminus'; station: number }
  | { kind: 'blocked-route'; progress: number }
  | { kind: 'maintenance'; slot: number }
  | { kind: 'departing'; progress: number };

export interface MetroTrainView {
  id: string;
  unitNumber: number;
  lineID: string;
  workspaceLabel: string;
  tabLabel: string;
  agentKind: string;
  status: AgentStatus;
  colorToken: TeamColorToken;
  officialDistance: number;
  displayDistance: number;
  placement: TrainPlacement;
  displaySpeed: number;
  isFocused: boolean;
  isDeparted: boolean;
  showsNewCrew: boolean;
  transitionStartedAt: number | null;
}

export interface MetroLineView {
  id: string;
  label: string;
  sourceOrder: number;
  stableOrder: number;
  routeTemplate: number;
  colorToken: TeamColorToken;
  workingCount: number;
  totalTrains: number;
  hasBlocked: boolean;
  trains: MetroTrainView[];
}

export interface MetroView {
  phase: 'awaitingUnits' | 'quietHours' | 'live' | 'dawn';
  serviceNight: number;
  activeServiceTime: number;
  serviceTimeRemaining: number;
  dawnElapsed: number;
  isLastTrain: boolean;
  lines: MetroLineView[];
  focusedTrainID: string | null;
  connection: ConnectionState;
  overlay: GameOverlay;
}

const STATUS_ORDER: Readonly<Record<AgentStatus, number>> = {
  blocked: 0,
  working: 1,
  done: 2,
  idle: 3,
};

function quantize(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

function fraction(value: number): number {
  return ((value % 1) + 1) % 1;
}

function routeProgress(train: MetroTrainState): number {
  return fraction(train.displayDistance + seededMetroUnitPhase(train.id));
}

function nearestRouteStation(line: MetroLineState, progress: number): number {
  const route = METRO_ROUTE_TEMPLATES[line.routeTemplate];
  if (!route || route.points.length === 0 || !(route.length > 0)) return 0;

  const normalized = fraction(progress);
  const target = (normalized > .5 ? 1 - normalized : normalized) * route.length;
  let cumulative = 0;
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < route.points.length; index += 1) {
    if (index > 0) {
      const previous = route.points[index - 1];
      const current = route.points[index];
      cumulative += Math.hypot(current.x - previous.x, current.y - previous.y);
    }
    const distance = Math.abs(target - cumulative);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function placement(line: MetroLineState, train: MetroTrainState): TrainPlacement {
  const progress = quantize(routeProgress(train));
  if (train.departed) return { kind: 'departing', progress };
  if (train.status === 'working') return { kind: 'route', progress };
  if (train.status === 'idle') return { kind: 'depot', slot: train.stableOrder };
  if (train.status === 'done') {
    return { kind: 'terminus', station: nearestRouteStation(line, progress) };
  }
  if (train.previousStatus === 'done') {
    return { kind: 'terminus', station: nearestRouteStation(line, progress) };
  }
  if (train.blockedAtDepot || train.previousStatus !== 'working') {
    return { kind: 'maintenance', slot: train.stableOrder };
  }
  return { kind: 'blocked-route', progress };
}

function displaySpeed(state: MetroState, train: MetroTrainState): number {
  if (state.connection.kind !== 'live' || state.phase !== 'service' ||
      train.departed || train.status !== 'working') {
    return 0;
  }
  const multiplier = train.speedNight === state.serviceNight
    ? train.speedSeed
    : 1;
  return MetroRules.baseServiceSpeed * multiplier * state.timelineRate;
}

function overlay(state: MetroState): GameOverlay {
  if (state.connection.kind === 'protocolError') {
    return { kind: 'suspended', detail: state.connection.detail };
  }
  if (!state.hasSnapshot) return { kind: 'connecting' };
  if (state.connection.kind !== 'live') return { kind: 'frozen' };
  if (state.lines.size === 0) {
    return { kind: 'noUnits' };
  }
  return { kind: 'none' };
}

function compareTrains(a: MetroTrainState, b: MetroTrainState): number {
  if (a.departed !== b.departed) return a.departed ? 1 : -1;
  if (a.isFocused !== b.isFocused) return a.isFocused ? -1 : 1;
  const status = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (status !== 0) return status;
  return a.number - b.number || a.stableOrder - b.stableOrder ||
    a.id.localeCompare(b.id);
}

function trainView(
  state: MetroState,
  line: MetroLineState,
  train: MetroTrainState,
): MetroTrainView {
  return {
    id: train.id,
    unitNumber: train.number,
    lineID: train.lineID,
    workspaceLabel: line.label,
    tabLabel: train.tabLabel,
    agentKind: train.agentKind,
    status: train.status,
    colorToken: line.colorToken,
    officialDistance: quantize(train.officialDistance),
    displayDistance: quantize(train.displayDistance),
    placement: placement(line, train),
    displaySpeed: quantize(displaySpeed(state, train)),
    isFocused: train.isFocused,
    isDeparted: train.departed,
    showsNewCrew: train.restartedUntil !== null &&
      state.timelineTime < train.restartedUntil,
    transitionStartedAt: train.transitionStartedAt,
  };
}

export function projectMetro(state: MetroState): MetroView {
  const lines = [...state.lines.values()]
    .sort((a, b) => a.stableOrder - b.stableOrder || a.id.localeCompare(b.id))
    .map((line): MetroLineView => {
      const trains = [...state.trains.values()]
        .filter(train => train.lineID === line.id)
        .sort(compareTrains);
      const present = trains.filter(train => !train.departed);
      return {
        id: line.id,
        label: line.label,
        sourceOrder: line.sourceOrder,
        stableOrder: line.stableOrder,
        routeTemplate: line.routeTemplate,
        colorToken: line.colorToken,
        workingCount: present.filter(train => train.status === 'working').length,
        totalTrains: present.length,
        hasBlocked: present.some(train => train.status === 'blocked'),
        trains: trains.map(train => trainView(state, line, train)),
      };
    });

  const focusedTrain = [...state.trains.values()]
    .filter(train => !train.departed && train.isFocused)
    .sort((a, b) => a.stableOrder - b.stableOrder || a.id.localeCompare(b.id))[0];
  const serviceTimeRemaining = Math.max(
    0,
    MetroRules.serviceDuration - state.activeServiceTime,
  );
  const phase = !state.hasSnapshot || state.phase === 'awaiting'
    ? 'awaitingUnits'
    : state.phase === 'dawn'
      ? 'dawn'
      : state.phase === 'quiet'
        ? 'quietHours'
        : 'live';

  return {
    phase,
    serviceNight: state.serviceNight,
    activeServiceTime: quantize(state.activeServiceTime),
    serviceTimeRemaining: quantize(serviceTimeRemaining),
    dawnElapsed: quantize(state.dawnElapsed),
    isLastTrain: state.phase === 'service' &&
      serviceTimeRemaining <= MetroRules.lastTrainDuration,
    lines,
    focusedTrainID: focusedTrain?.id ?? null,
    connection: state.connection,
    overlay: overlay(state),
  };
}

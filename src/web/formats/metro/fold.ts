import type { GameEvent } from '../../../shared/events.js';
import type { AgentStatus, ConnectionState } from '../../../shared/presentation.js';
import type { TimelineCursor } from '../../../shared/protocol.js';
import { stableHash } from '../../../shared/deterministic.js';
import type { TeamColorToken } from '../../presentation.js';
import {
  MetroRules,
  metroRouteTemplate,
  seededMetroSpeed,
  seededMetroUnitPhase,
} from './rules.js';
import {
  METRO_DEPOTS,
  METRO_ROUTE_TEMPLATES,
  routeProgressAtStation,
} from './routes.js';

export interface MetroLineState {
  id: string;
  label: string;
  sourceOrder: number;
  stableOrder: number;
  routeTemplate: number;
  colorToken: TeamColorToken;
}

export interface MetroTrainState {
  id: string;
  number: number;
  lineID: string;
  tabLabel: string;
  agentKind: string;
  status: AgentStatus;
  isFocused: boolean;
  sourceOrder: number;
  stableOrder: number;
  officialDistance: number;
  displayDistance: number;
  speedSeed: number;
  speedNight: number;
  departed: boolean;
  blockedAtDepot: boolean;
  previousStatus: AgentStatus;
  transitionStartedAt: number | null;
  restartedUntil: number | null;
}

export interface MetroState {
  phase: 'awaiting' | 'service' | 'quiet' | 'dawn';
  serviceNight: number;
  timelineTime: number;
  timelineRate: number;
  activeServiceTime: number;
  dawnElapsed: number;
  connection: ConnectionState;
  hasSnapshot: boolean;
  lines: Map<string, MetroLineState>;
  trains: Map<string, MetroTrainState>;
}

export function initialMetroState(): MetroState {
  return {
    phase: 'awaiting',
    serviceNight: 1,
    timelineTime: 0,
    timelineRate: 1,
    activeServiceTime: 0,
    dawnElapsed: 0,
    connection: { kind: 'waiting' },
    hasSnapshot: false,
    lines: new Map(),
    trains: new Map(),
  };
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function stableOrdinal(stableOrder: number, id: string): number {
  if (Number.isSafeInteger(stableOrder) && stableOrder >= 0) return stableOrder;
  return Number(stableHash(`metro-order|${id}`) % 1_000_000n);
}

function colorForLine(order: number): TeamColorToken {
  return {
    kind: order < MetroRules.paletteSize ? 'palette' : 'pattern',
    slot: positiveModulo(order, MetroRules.paletteSize),
  };
}

function allocateNumber(preferred: number, used: ReadonlySet<number>): number {
  for (let probe = 0; probe < MetroRules.maximumTrainNumber; probe += 1) {
    const number = positiveModulo(preferred - 1 + probe, MetroRules.maximumTrainNumber) + 1;
    if (!used.has(number)) return number;
  }
  throw new Error('metro train number space exhausted');
}

function hasWorkingTrain(state: MetroState): boolean {
  return [...state.trains.values()].some(train =>
    !train.departed && train.status === 'working');
}

function reconcileServicePhase(state: MetroState): void {
  if (!state.hasSnapshot || state.phase === 'dawn') return;
  state.phase = hasWorkingTrain(state) ? 'service' : 'quiet';
}

function addLine(
  state: MetroState,
  event: Extract<GameEvent, { kind: 'team-joined' }>,
): void {
  const existing = state.lines.get(event.team.id);
  if (existing) {
    existing.label = event.team.label;
    existing.sourceOrder = event.team.sourceOrder;
    return;
  }

  const order = stableOrdinal(event.team.stableOrder, event.team.id);
  state.lines.set(event.team.id, {
    id: event.team.id,
    label: event.team.label,
    sourceOrder: event.team.sourceOrder,
    stableOrder: order,
    routeTemplate: metroRouteTemplate(order),
    colorToken: colorForLine(order),
  });
}

function entryDisplayDistance(
  state: MetroState,
  lineID: string,
  unitID: string,
): number {
  const phase = seededMetroUnitPhase(unitID);
  const line = state.lines.get(lineID);
  const route = line ? METRO_ROUTE_TEMPLATES[line.routeTemplate] : undefined;
  if (!route) return -phase;
  const depot = METRO_DEPOTS.find(candidate => candidate.id === route.depotID);
  const returning = phase >= .5;
  const entry = routeProgressAtStation(
    route,
    depot?.entryStationID ?? route.stationIDs[0],
    returning,
  );
  const spread =
    .004 + seededMetroUnitPhase(`metro-entry|${unitID}`) * .012;
  return entry + (returning ? -spread : spread) - phase;
}

function addTrain(
  state: MetroState,
  unit: Extract<GameEvent, { kind: 'unit-joined' }>['unit'],
): void {
  const existing = state.trains.get(unit.id);
  if (existing) {
    const previousStatus = existing.status;
    existing.lineID = unit.teamID;
    existing.tabLabel = unit.tabLabel;
    existing.agentKind = unit.agentKind;
    existing.status = unit.status;
    existing.isFocused = unit.isFocused;
    existing.sourceOrder = unit.sourceOrder;
    existing.departed = false;
    existing.previousStatus = previousStatus;
    existing.blockedAtDepot = unit.status === 'blocked' && previousStatus !== 'working';
    existing.transitionStartedAt = state.timelineTime;
    existing.speedNight = state.serviceNight;
    existing.speedSeed = seededMetroSpeed(state.serviceNight, unit.id);
    if (unit.status === 'working') {
      existing.displayDistance = entryDisplayDistance(
        state,
        unit.teamID,
        unit.id,
      );
    }
    reconcileServicePhase(state);
    return;
  }

  const used = new Set([...state.trains.values()].map(train => train.number));
  const preferred = Number(
    stableHash(`metro-number|${unit.id}`) % BigInt(MetroRules.preferredTrainNumberCount),
  ) + 1;
  const order = stableOrdinal(unit.stableOrder, unit.id);
  state.trains.set(unit.id, {
    id: unit.id,
    number: allocateNumber(preferred, used),
    lineID: unit.teamID,
    tabLabel: unit.tabLabel,
    agentKind: unit.agentKind,
    status: unit.status,
    isFocused: unit.isFocused,
    sourceOrder: unit.sourceOrder,
    stableOrder: order,
    officialDistance: 0,
    displayDistance: entryDisplayDistance(state, unit.teamID, unit.id),
    speedSeed: seededMetroSpeed(state.serviceNight, unit.id),
    speedNight: state.serviceNight,
    departed: false,
    blockedAtDepot: unit.status === 'blocked',
    previousStatus: unit.status,
    transitionStartedAt: state.timelineTime,
    restartedUntil: null,
  });
  reconcileServicePhase(state);
}

function seedTrainForCurrentNight(state: MetroState, train: MetroTrainState): void {
  if (train.speedNight === state.serviceNight) return;
  train.speedNight = state.serviceNight;
  train.speedSeed = seededMetroSpeed(state.serviceNight, train.id);
}

function moveWorkingTrains(state: MetroState, elapsed: number): void {
  for (const train of state.trains.values()) {
    if (train.departed || train.status !== 'working') continue;
    seedTrainForCurrentNight(state, train);
    const distance = elapsed * MetroRules.baseServiceSpeed * train.speedSeed;
    train.officialDistance += distance;
    train.displayDistance += distance;
  }
}

function beginNextServiceNight(state: MetroState): void {
  state.serviceNight += 1;
  state.activeServiceTime = 0;
  state.dawnElapsed = 0;
  for (const [id, train] of state.trains) {
    if (train.departed) {
      state.trains.delete(id);
      continue;
    }
    train.speedNight = state.serviceNight;
    train.speedSeed = seededMetroSpeed(state.serviceNight, train.id);
  }
  state.phase = hasWorkingTrain(state) ? 'service' : 'quiet';
}

function removeExpiredDepartures(state: MetroState, target: number): void {
  if (state.connection.kind !== 'live') return;
  for (const [id, train] of state.trains) {
    if (
      train.departed &&
      train.transitionStartedAt !== null &&
      target - train.transitionStartedAt >= MetroRules.departureDisplayDuration - 1e-9
    ) {
      state.trains.delete(id);
    }
  }
}

/**
 * Advances through exact service/dawn boundaries. Movement is therefore
 * independent of how callers partition the same timeline interval.
 */
export function advanceMetroTo(state: MetroState, target: number): MetroState {
  if (!Number.isFinite(target)) throw new RangeError('timeline target must be finite');
  if (target < state.timelineTime - 1e-9) {
    throw new RangeError('timeline cannot move backwards');
  }

  let remaining = Math.max(0, target - state.timelineTime);
  while (remaining > 1e-12) {
    if (!state.hasSnapshot || state.connection.kind !== 'live' ||
        state.phase === 'awaiting') {
      break;
    }

    if (state.phase === 'dawn') {
      const untilNextNight = Math.max(0, MetroRules.dawnDuration - state.dawnElapsed);
      const used = Math.min(remaining, untilNextNight);
      state.dawnElapsed += used;
      remaining -= used;
      if (state.dawnElapsed >= MetroRules.dawnDuration - 1e-9) {
        beginNextServiceNight(state);
        continue;
      }
      break;
    }

    if (!hasWorkingTrain(state)) {
      state.phase = 'quiet';
      break;
    }
    state.phase = 'service';

    const untilDawn = Math.max(0, MetroRules.serviceDuration - state.activeServiceTime);
    const used = Math.min(remaining, untilDawn);
    moveWorkingTrains(state, used);
    state.activeServiceTime += used;
    remaining -= used;
    if (state.activeServiceTime >= MetroRules.serviceDuration - 1e-9) {
      state.activeServiceTime = MetroRules.serviceDuration;
      state.phase = 'dawn';
      state.dawnElapsed = 0;
      continue;
    }
    break;
  }

  removeExpiredDepartures(state, target);
  state.timelineTime = target;
  return state;
}

export function setMetroCursor(state: MetroState, cursor: TimelineCursor): MetroState {
  advanceMetroTo(state, cursor.timelineTime);
  state.timelineRate = cursor.timelineRate;
  return state;
}

export function foldMetro(state: MetroState, event: GameEvent): MetroState {
  advanceMetroTo(state, event.at);
  switch (event.kind) {
    case 'connection-changed':
      state.connection = event.connection;
      break;
    case 'team-joined':
      addLine(state, event);
      break;
    case 'team-updated': {
      const line = state.lines.get(event.teamID);
      if (line) line.label = event.label;
      break;
    }
    case 'unit-joined':
      addTrain(state, event.unit);
      break;
    case 'unit-profile-changed': {
      const train = state.trains.get(event.unitID);
      if (train) {
        train.lineID = event.profile.teamID;
        train.tabLabel = event.profile.tabLabel;
        train.agentKind = event.profile.agentKind;
        train.isFocused = event.profile.isFocused;
      }
      break;
    }
    case 'status-changed': {
      const train = state.trains.get(event.unitID);
      if (train) {
        const previousStatus = train.status;
        const wasAtDepot = previousStatus === 'idle' || train.blockedAtDepot;
        train.previousStatus = previousStatus;
        train.blockedAtDepot = event.to === 'blocked' && previousStatus !== 'working';
        train.status = event.to;
        train.transitionStartedAt = state.timelineTime;
        if (event.to === 'working') {
          if (wasAtDepot) {
            train.displayDistance = entryDisplayDistance(
              state,
              train.lineID,
              train.id,
            );
          }
          seedTrainForCurrentNight(state, train);
        }
        reconcileServicePhase(state);
      }
      break;
    }
    case 'unit-session-restarted': {
      const train = state.trains.get(event.unitID);
      if (train) {
        train.restartedUntil = state.timelineTime + MetroRules.newCrewDuration;
      }
      break;
    }
    case 'unit-departed': {
      const train = state.trains.get(event.unitID);
      if (train) {
        train.departed = true;
        train.displayDistance = train.officialDistance;
        train.transitionStartedAt = state.timelineTime;
        reconcileServicePhase(state);
      }
      break;
    }
    case 'snapshot-applied':
      if (!state.hasSnapshot) {
        state.hasSnapshot = true;
        state.phase = hasWorkingTrain(state) ? 'service' : 'quiet';
      }
      break;
  }
  return state;
}

export function replayMetro(events: readonly GameEvent[]): MetroState {
  const state = initialMetroState();
  for (const event of events) foldMetro(state, event);
  return state;
}

import type { GameEventBody, EventTeam, EventUnit, EventUnitProfile, TopologyTeam } from '../shared/events.js';
import type { ConnectionState } from '../shared/presentation.js';
import type { HerdrUpdate, SourceAgent, SourceSnapshot } from './herdr/types.js';
import { createEventLog, type EventLog } from './event-log.js';

interface KnownTeam extends EventTeam { present: boolean }
interface KnownUnit extends EventUnit {
  present: boolean;
  sessionReference: string | null;
}

const sameConnection = (a: ConnectionState, b: ConnectionState): boolean =>
  a.kind === b.kind && (a.kind !== 'protocolError' ||
    (b.kind === 'protocolError' && a.detail === b.detail));

const profileOf = (teamID: string, agent: SourceAgent): EventUnitProfile => ({
  teamID,
  tabLabel: agent.tabLabel,
  tabID: agent.tabID,
  terminalTitle: agent.terminalTitle,
  agentKind: agent.agentKind,
  isFocused: agent.isFocused,
});

export function createEventSession(log: EventLog = createEventLog(), initialRate = 1) {
  if (!(initialRate > 0)) throw new RangeError('timeline rate must be positive');
  let time = 0;
  let rate = initialRate;
  let lastTick: number | null = null;
  let connection: ConnectionState = { kind: 'waiting' };
  let hasSnapshot = false;
  let topologyKey: string | null = null;
  let nextTeamSource = 0;
  let nextUnitSource = 0;
  const teams = new Map<string, KnownTeam>();
  const units = new Map<string, KnownUnit>();

  function advance(now: number): void {
    const elapsed = lastTick === null ? 0 : Math.min(Math.max(now - lastTick, 0), 1);
    lastTick = now;
    if (connection.kind === 'live') time += elapsed * rate;
  }

  function applyConnection(next: ConnectionState, now: number): void {
    if (sameConnection(connection, next)) return;
    advance(now);
    log.append(time, [{ kind: 'connection-changed', connection: structuredClone(next) }]);
    connection = structuredClone(next);
    lastTick = null;
  }

  function assignOrdinals(snapshot: SourceSnapshot): void {
    for (const team of snapshot.teams) {
      if (!teams.has(team.id)) {
        teams.set(team.id, { id: team.id, label: team.label, sourceOrder: nextTeamSource++, stableOrder: -1, present: true });
      }
      for (const agent of team.agents) {
        if (!units.has(agent.terminalID)) {
          units.set(agent.terminalID, {
            id: agent.terminalID, ...profileOf(team.id, agent), status: agent.status,
            sourceOrder: nextUnitSource++, stableOrder: -1, present: false,
            sessionReference: agent.agentSessionReference,
          });
        }
      }
    }
    [...teams.values()].filter(team => team.stableOrder < 0).sort((a, b) => a.id.localeCompare(b.id))
      .forEach((team, index, all) => { team.stableOrder = teams.size - all.length + index; });
    [...units.values()].filter(unit => unit.stableOrder < 0).sort((a, b) => a.id.localeCompare(b.id))
      .forEach((unit, index, all) => { unit.stableOrder = units.size - all.length + index; });
  }

  function applySnapshot(source: SourceSnapshot, now: number): void {
    advance(now);
    // Team/unit events stay agent-only so existing game folds never see
    // empty teams; the full hierarchy travels in topology-changed instead.
    const snapshot: SourceSnapshot = { teams: source.teams.filter(team => team.agents.length > 0) };
    assignOrdinals(snapshot);
    const bodies: GameEventBody[] = [];
    const topology: TopologyTeam[] = source.teams.map(team => ({
      id: team.id,
      label: team.label,
      tabs: (team.tabs ?? []).map(tab => ({ id: tab.id, label: tab.label })),
    }));
    const nextTopologyKey = JSON.stringify(topology);
    if (nextTopologyKey !== topologyKey) {
      topologyKey = nextTopologyKey;
      bodies.push({ kind: 'topology-changed', teams: topology });
    }
    const seenTeams = new Set<string>();
    const seenUnits = new Set<string>();
    const incoming = new Map<string, { teamID: string; agent: SourceAgent }>();
    for (const team of snapshot.teams) {
      seenTeams.add(team.id);
      for (const agent of team.agents) {
        seenUnits.add(agent.terminalID);
        incoming.set(agent.terminalID, { teamID: team.id, agent });
      }
    }
    for (const team of [...teams.values()].filter(team => seenTeams.has(team.id)).sort((a, b) => a.stableOrder - b.stableOrder)) {
      const source = snapshot.teams.find(item => item.id === team.id)!;
      if (!team.present) {
        team.present = true;
        bodies.push({ kind: 'team-joined', team: { id: team.id, label: source.label, sourceOrder: team.sourceOrder, stableOrder: team.stableOrder } });
      } else if (!hasSnapshot) {
        bodies.push({ kind: 'team-joined', team: { id: team.id, label: source.label, sourceOrder: team.sourceOrder, stableOrder: team.stableOrder } });
      } else if (team.label !== source.label) {
        bodies.push({ kind: 'team-updated', teamID: team.id, label: source.label });
      }
      team.label = source.label;
    }
    for (const unit of [...units.values()].filter(unit => seenUnits.has(unit.id)).sort((a, b) => a.stableOrder - b.stableOrder)) {
      const { teamID, agent } = incoming.get(unit.id)!;
      const profile = profileOf(teamID, agent);
      const returning = !unit.present;
      const restarted = unit.sessionReference !== null && agent.agentSessionReference !== null &&
        unit.sessionReference !== agent.agentSessionReference;
      if (returning) {
        unit.present = true;
        unit.status = agent.status;
        Object.assign(unit, profile);
        bodies.push({ kind: 'unit-joined', unit: {
          id: unit.id, ...profile, status: agent.status,
          sourceOrder: unit.sourceOrder, stableOrder: unit.stableOrder,
        } });
        if (restarted) bodies.push({ kind: 'unit-session-restarted', unitID: unit.id });
      } else {
        if (unit.status !== agent.status) bodies.push({ kind: 'status-changed', unitID: unit.id, from: unit.status, to: agent.status });
        if (restarted) bodies.push({ kind: 'unit-session-restarted', unitID: unit.id });
        if (unit.teamID !== profile.teamID || unit.tabLabel !== profile.tabLabel ||
            unit.tabID !== profile.tabID || unit.terminalTitle !== profile.terminalTitle ||
            unit.agentKind !== profile.agentKind || unit.isFocused !== profile.isFocused) {
          bodies.push({ kind: 'unit-profile-changed', unitID: unit.id, profile });
        }
        unit.status = agent.status;
        Object.assign(unit, profile);
      }
      if (agent.agentSessionReference !== null) unit.sessionReference = agent.agentSessionReference;
    }
    for (const unit of [...units.values()].filter(unit => unit.present && !seenUnits.has(unit.id)).sort((a, b) => a.id.localeCompare(b.id))) {
      unit.present = false;
      bodies.push({ kind: 'unit-departed', unitID: unit.id });
    }
    if (!hasSnapshot) {
      bodies.push({ kind: 'snapshot-applied' });
      hasSnapshot = true;
    }
    log.append(time, bodies);
  }

  function apply(update: HerdrUpdate, now: number): void {
    if (update.kind === 'snapshot') applySnapshot(update.snapshot, now);
    else applyConnection(update.state, now);
  }
  function setRate(next: number): void {
    if (!(next > 0)) throw new RangeError('timeline rate must be positive');
    rate = next;
  }
  return {
    apply, applySnapshot, applyConnection, advance, setRate,
    setTimeScale: setRate,
    timelineTime: () => time,
    timelineRate: () => rate,
    log,
  };
}

export type EventSession = ReturnType<typeof createEventSession>;

import type { AgentStatus } from '../shared/presentation.js';
import type { SourceSnapshot } from './herdr/types.js';
import type { GameEvent, GameEventBody } from '../shared/events.js';

interface KnownUnit {
  present: boolean;
  status: AgentStatus;
  sessionReference: string | null;
}

export function createEventLog(cap = 20_000) {
  const events: GameEvent[] = [];
  let nextSeq = 1;
  let firstRetained = 1;
  const knownTeams = new Set<string>();
  const known = new Map<string, KnownUnit>();

  function applySnapshot(snapshot: SourceSnapshot, at: number): GameEvent[] {
    const emitted: GameEvent[] = [];
    const push = (body: GameEventBody) => emitted.push({ seq: nextSeq++, at, ...body });
    const seen = new Set<string>();

    for (const team of snapshot.teams) {
      if (!knownTeams.has(team.id)) {
        knownTeams.add(team.id);
        push({ kind: 'team-joined', team: { id: team.id, label: team.label } });
      }
      for (const agent of team.agents) {
        seen.add(agent.terminalID);
        const unit = known.get(agent.terminalID);
        if (!unit || !unit.present) {
          push({
            kind: 'unit-joined',
            unit: {
              id: agent.terminalID,
              teamID: team.id,
              tabLabel: agent.tabLabel,
              agentKind: agent.agentKind,
              status: agent.status,
            },
          });
          known.set(agent.terminalID, {
            present: true,
            status: agent.status,
            sessionReference: agent.agentSessionReference,
          });
          continue;
        }
        if (agent.status !== unit.status) {
          push({ kind: 'status-changed', unitID: agent.terminalID, from: unit.status, to: agent.status });
          unit.status = agent.status;
        }
        if (agent.agentSessionReference !== null && unit.sessionReference !== agent.agentSessionReference) {
          if (unit.sessionReference !== null) push({ kind: 'stint-started', unitID: agent.terminalID });
          unit.sessionReference = agent.agentSessionReference;
        }
      }
    }
    for (const [id, unit] of known) {
      if (unit.present && !seen.has(id)) {
        unit.present = false;
        push({ kind: 'unit-departed', unitID: id });
      }
    }

    events.push(...emitted);
    const overflow = events.length - cap;
    if (overflow > 0) {
      events.splice(0, overflow);
      firstRetained = events[0]?.seq ?? nextSeq;
    }
    return emitted;
  }

  const history = (): GameEvent[] => [...events];
  const eventsSince = (seq: number): GameEvent[] => events.filter(event => event.seq > seq);
  const lastSeq = (): number => nextSeq - 1;
  const droppedBefore = (): number => firstRetained;

  return { applySnapshot, history, eventsSince, lastSeq, droppedBefore };
}

export type EventLog = ReturnType<typeof createEventLog>;

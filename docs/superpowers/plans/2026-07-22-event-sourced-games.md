# Event-Sourced Game Formats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-owned, game-neutral event log so browser game formats can rebuild arbitrary game state as a pure fold over the log — surviving refresh, staying identical across tabs, and enabling games beyond the fixed "progress race" model — proven by a new event-sourced `defense` format.

**Architecture:** The server diffs consecutive herdr snapshots into an append-only `GameEvent` log (`team-joined`, `unit-joined`, `unit-departed`, `status-changed`, `stint-started`). A `SessionHub` wrapper feeds every snapshot to both the existing race simulation and the new log, so live-herdr and fixture paths both produce events with zero changes to `fixtures.ts`. The broadcaster sends the full log as a `history` message on connect and piggybacks per-tick deltas on the existing `sync` message. The browser dedupes by `seq` cursor and hands batches to formats that opt in via a new `GameFormat.onEvents` hook; such formats hold state as `fold(initial, log)` — refresh or reconnect replays history and reproduces identical state.

**Tech Stack:** TypeScript (strict, ESM), Node ≥ 20, `ws`, Vite, Vitest. No new dependencies.

## Global Constraints

- ESM project (`"type": "module"`): every relative import MUST end in `.js`, even inside `.ts` files (e.g. `import ... from '../shared/events.js'`).
- TypeScript strict mode; `npm run typecheck` (= `tsc --noEmit`) must pass before every commit.
- Test runner: `npm test` (= `vitest run`). Single file: `npx vitest run tests/<name>.test.ts`.
- No new runtime or dev dependencies.
- `src/shared/` and `src/server/` stay game-neutral: no format vocabulary (no "boss", "tower", "lap") may appear there.
- Event-fold code (fold functions and fold-driven rendering) must never call `Math.random()`, `Date.now()`, or `new Date()` — two tabs folding the same log must produce identical worlds. Use seq-based hashing for variety (see `rand01` in `src/web/formats/raid/scene.ts`).
- Existing formats keep working unchanged: `?game=f1` and `?game=raid` behavior must be identical before/after.
- All pre-existing tests (101 as of writing) must still pass after every task.
- End every commit message with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- The repo may have NO initial commit yet (everything untracked). Task 1 Step 1 handles this.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/shared/events.ts` | create | Game-neutral event vocabulary (`GameEvent`) shared by server and browser |
| `src/server/event-log.ts` | create | Diff consecutive `SourceSnapshot`s into events; bounded append-only log |
| `src/server/session-hub.ts` | create | `RaceSession`-compatible wrapper feeding snapshots to session + log |
| `src/shared/protocol.ts` | modify | Add `HistoryMessage`, `ServerMessage`; `SyncMessage` gains `events` |
| `src/server/broadcaster.ts` | modify | Send `history` on connect; attach event deltas to each `sync` |
| `src/server/cli.ts` | modify | Wire log + hub into both fixture and live-herdr paths |
| `src/web/event-source.ts` | create | Client-side seq-cursor dedupe; replay-on-reconnect stream |
| `src/web/format.ts` | modify | Optional `onEvents` hook on `GameFormat` |
| `src/web/main.ts` | modify | Dispatch `history`/`sync` messages; wire event source |
| `src/web/formats/defense/fold.ts` | create | Pure fold: events → `DefenseState` (towers, kills, score) |
| `src/web/formats/defense/index.ts` | create | Format registration; owns folded state |
| `src/web/formats/defense/chrome.ts` | create | Header (score, breaches, connection) |
| `src/web/formats/defense/standings.ts` | create | Tower list sorted by kills |
| `src/web/formats/defense/scene.ts` | create | Canvas: tower grid, monsters on blocked towers |
| `tests/event-log.test.ts` | create | Snapshot-diff rules, seq, cap |
| `tests/session-hub.test.ts` | create | Both feed paths reach session and log |
| `tests/broadcaster.test.ts` | rewrite | history-then-sync on connect; per-tick deltas |
| `tests/server.test.ts` | modify | WS integration: first message is `history` |
| `tests/event-source.test.ts` | create | Cursor dedupe, reset semantics |
| `tests/defense-fold.test.ts` | create | Fold rules + determinism |

---

### Task 1: Event vocabulary + server event log

**Files:**
- Create: `src/shared/events.ts`
- Create: `src/server/event-log.ts`
- Test: `tests/event-log.test.ts`

**Interfaces:**
- Consumes: `SourceSnapshot`, `SourceAgent` from `src/server/herdr/types.ts`; `AgentStatus` from `src/shared/presentation.ts`; test helpers `agent`, `team`, `snap` from `tests/helpers/session.ts`.
- Produces (later tasks rely on these exact names):
  - `GameEvent`, `GameEventBody`, `EventUnit` (from `src/shared/events.ts`)
  - `createEventLog(cap?: number)` returning `{ applySnapshot(snapshot: SourceSnapshot, at: number): GameEvent[]; history(): GameEvent[]; eventsSince(seq: number): GameEvent[]; lastSeq(): number; droppedBefore(): number }`
  - `export type EventLog = ReturnType<typeof createEventLog>`

- [ ] **Step 1: Baseline commit if the repo has no commits**

```bash
cd /Users/mark.han/Documents/workspaces/my/herdr-games
git rev-parse HEAD >/dev/null 2>&1 || { git add -A && git commit -m "chore: baseline before event-sourcing work

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"; }
```

- [ ] **Step 2: Create the shared event vocabulary**

Create `src/shared/events.ts`:

```ts
import type { AgentStatus } from './presentation.js';

/** Game-neutral facts derived from consecutive herdr snapshots. The log is
 *  append-only with a monotonic `seq`; event-sourced formats rebuild their
 *  state by folding it, so the same log yields the same state in every tab.
 *  `at` is serverTime (monotonic seconds) when the snapshot was applied. */
export type GameEventBody =
  | { kind: 'team-joined'; team: { id: string; label: string } }
  | { kind: 'unit-joined'; unit: EventUnit }
  | { kind: 'unit-departed'; unitID: string }
  | { kind: 'status-changed'; unitID: string; from: AgentStatus; to: AgentStatus }
  | { kind: 'stint-started'; unitID: string };

export type GameEvent = { seq: number; at: number } & GameEventBody;

/** Identity carried on join. Color/number are NOT here: formats derive them
 *  deterministically from join order so the log stays minimal. */
export interface EventUnit {
  id: string;
  teamID: string;
  tabLabel: string;
  agentKind: string;
  status: AgentStatus;
}
```

- [ ] **Step 3: Write the failing tests**

Create `tests/event-log.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createEventLog } from '../src/server/event-log.js';
import { agent, snap, team } from './helpers/session.js';

describe('EventLog', () => {
  it('emits team-joined then unit-joined for a first snapshot', () => {
    const log = createEventLog();
    const emitted = log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'working')])), 5);
    expect(emitted.map(e => e.kind)).toEqual(['team-joined', 'unit-joined']);
    expect(emitted[0]).toMatchObject({ seq: 1, at: 5, team: { id: 'ws-1', label: 'alpha' } });
    expect(emitted[1]).toMatchObject({
      seq: 2,
      at: 5,
      unit: { id: 't1', teamID: 'ws-1', tabLabel: 'tab-t1', agentKind: 'claude', status: 'working' },
    });
  });

  it('emits nothing when a snapshot repeats', () => {
    const log = createEventLog();
    const s = snap(team('ws-1', 'alpha', [agent('t1', 'working')]));
    log.applySnapshot(s, 0);
    expect(log.applySnapshot(s, 1)).toEqual([]);
  });

  it('emits status-changed with from/to on transitions', () => {
    const log = createEventLog();
    log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'working')])), 0);
    const emitted = log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'blocked')])), 1);
    expect(emitted).toEqual([
      { seq: 3, at: 1, kind: 'status-changed', unitID: 't1', from: 'working', to: 'blocked' },
    ]);
  });

  it('emits stint-started only when a non-null session reference is replaced', () => {
    const log = createEventLog();
    const withRef = (ref: string | null) =>
      snap(team('ws-1', 'alpha', [agent('t1', 'working', { agentSessionReference: ref })]));
    log.applySnapshot(withRef(null), 0);
    // Ref becoming known for the first time is not a restart.
    expect(log.applySnapshot(withRef('s1'), 1)).toEqual([]);
    expect(log.applySnapshot(withRef('s2'), 2)).toEqual([
      { seq: 3, at: 2, kind: 'stint-started', unitID: 't1' },
    ]);
  });

  it('emits unit-departed on leave and unit-joined again on return', () => {
    const log = createEventLog();
    log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'working')])), 0);
    const gone = log.applySnapshot(snap(team('ws-1', 'alpha', [])), 1);
    expect(gone).toEqual([{ seq: 3, at: 1, kind: 'unit-departed', unitID: 't1' }]);
    const back = log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'idle')])), 2);
    expect(back.map(e => e.kind)).toEqual(['unit-joined']);
    expect(back[0]).toMatchObject({ seq: 4, unit: { id: 't1', status: 'idle' } });
  });

  it('serves history and eventsSince by seq', () => {
    const log = createEventLog();
    log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'working')])), 0);
    log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'done')])), 1);
    expect(log.history()).toHaveLength(3);
    expect(log.lastSeq()).toBe(3);
    expect(log.eventsSince(2).map(e => e.seq)).toEqual([3]);
    expect(log.eventsSince(3)).toEqual([]);
  });

  it('drops oldest events past the cap and reports droppedBefore', () => {
    const log = createEventLog(3);
    log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'working')])), 0); // seq 1, 2
    log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'blocked')])), 1); // seq 3
    log.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'working')])), 2); // seq 4 → drop seq 1
    expect(log.history().map(e => e.seq)).toEqual([2, 3, 4]);
    expect(log.droppedBefore()).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/event-log.test.ts`
Expected: FAIL — `Cannot find module '../src/server/event-log.js'` (or equivalent resolve error).

- [ ] **Step 5: Implement the event log**

Create `src/server/event-log.ts`:

```ts
import type { AgentStatus } from '../shared/presentation.js';
import type { SourceSnapshot } from './herdr/types.js';
import type { GameEvent, GameEventBody } from '../shared/events.js';

interface KnownUnit {
  present: boolean;
  status: AgentStatus;
  sessionReference: string | null;
}

/** Diffs consecutive source snapshots into a bounded, append-only event log.
 *  Purely derived from the herdr signal — independent of the race simulation.
 *  Diff order is fixed (teams in snapshot order, then agents, then departures)
 *  so seq assignment is deterministic for identical input sequences. */
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
        // A replaced non-null reference is an agent restart. A reference
        // merely becoming known (null → value) is not.
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
      firstRetained = events[0].seq;
    }
    return emitted;
  }

  /** All retained events, oldest first. */
  function history(): GameEvent[] {
    return [...events];
  }

  /** Events with seq strictly greater than `seq`. */
  function eventsSince(seq: number): GameEvent[] {
    return events.filter(event => event.seq > seq);
  }

  function lastSeq(): number {
    return nextSeq - 1;
  }

  /** Events with seq below this were evicted by the cap. */
  function droppedBefore(): number {
    return firstRetained;
  }

  return { applySnapshot, history, eventsSince, lastSeq, droppedBefore };
}

export type EventLog = ReturnType<typeof createEventLog>;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/event-log.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass (101 pre-existing + 7 new), tsc silent.

- [ ] **Step 8: Commit**

```bash
git add src/shared/events.ts src/server/event-log.ts tests/event-log.test.ts
git commit -m "feat: game-neutral event log diffing herdr snapshots

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: SessionHub — one tap for both feed paths

**Files:**
- Create: `src/server/session-hub.ts`
- Test: `tests/session-hub.test.ts`

**Interfaces:**
- Consumes: `RaceSession` type and `createRaceSession` from `src/server/race-session.ts` (surface: `apply(update, now)`, `applySnapshot(snapshot, now)`, `applyConnection(state, now)`, `advance(now)`, `presentation()`, `setTimeScale(n)`); `EventLog`/`createEventLog` from Task 1; `loadFixture` from `src/server/fixtures.ts`.
- Produces: `createSessionHub(session: RaceSession, log: EventLog)` returning an object structurally assignable to `RaceSession` (so `loadFixture(name, hub)` typechecks unchanged); `export type SessionHub = ReturnType<typeof createSessionHub>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/session-hub.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRaceSession } from '../src/server/race-session.js';
import { createEventLog } from '../src/server/event-log.js';
import { createSessionHub } from '../src/server/session-hub.js';
import { loadFixture } from '../src/server/fixtures.js';
import { agent, snap, team } from './helpers/session.js';

describe('SessionHub', () => {
  it('feeds fixture-style applySnapshot into both the session and the log', () => {
    const session = createRaceSession(() => 1);
    const log = createEventLog();
    const hub = createSessionHub(session, log);
    hub.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'working')])), 0);
    hub.applyConnection({ kind: 'live' }, 0);
    hub.advance(0);
    expect(log.history().map(e => e.kind)).toEqual(['team-joined', 'unit-joined']);
    expect(hub.presentation().teams[0].entries[0].id).toBe('t1');
  });

  it('feeds live herdr apply() updates into both; connection updates emit no events', () => {
    const session = createRaceSession(() => 1);
    const log = createEventLog();
    const hub = createSessionHub(session, log);
    hub.apply({ kind: 'snapshot', snapshot: snap(team('ws-1', 'alpha', [agent('t1', 'working')])) }, 0);
    hub.apply({ kind: 'connection', state: { kind: 'live' } }, 0);
    expect(log.history()).toHaveLength(2);
    expect(hub.presentation().connection.kind).toBe('live');
  });

  it('is accepted by loadFixture and captures fixture events', () => {
    const session = createRaceSession(() => 1);
    const log = createEventLog();
    const hub = createSessionHub(session, log);
    loadFixture('grid', hub);
    expect(log.history().filter(e => e.kind === 'team-joined')).toHaveLength(4);
    expect(log.history().some(e => e.kind === 'unit-joined')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/session-hub.test.ts`
Expected: FAIL — cannot resolve `../src/server/session-hub.js`.

- [ ] **Step 3: Implement the hub**

Create `src/server/session-hub.ts`:

```ts
import type { ConnectionState } from '../shared/presentation.js';
import type { HerdrUpdate, SourceSnapshot } from './herdr/types.js';
import type { EventLog } from './event-log.js';
import type { RaceSession } from './race-session.js';

/** RaceSession-compatible wrapper that also feeds every snapshot into the
 *  event log. Both feed paths — live herdr (`apply`) and fixtures
 *  (`applySnapshot`) — produce events without either knowing about the log. */
export function createSessionHub(session: RaceSession, log: EventLog) {
  function apply(update: HerdrUpdate, now: number): void {
    if (update.kind === 'snapshot') log.applySnapshot(update.snapshot, now);
    session.apply(update, now);
  }

  function applySnapshot(snapshot: SourceSnapshot, now: number): void {
    log.applySnapshot(snapshot, now);
    session.applySnapshot(snapshot, now);
  }

  function applyConnection(state: ConnectionState, now: number): void {
    session.applyConnection(state, now);
  }

  return {
    apply,
    applySnapshot,
    applyConnection,
    advance: session.advance,
    presentation: session.presentation,
    setTimeScale: session.setTimeScale,
  };
}

export type SessionHub = ReturnType<typeof createSessionHub>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/session-hub.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass. If `loadFixture('grid', hub)` fails to typecheck, the hub's method signatures drifted from `RaceSession` — fix the hub, not `fixtures.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/server/session-hub.ts tests/session-hub.test.ts
git commit -m "feat: session hub feeding snapshots to race session and event log

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Protocol + broadcaster — history on connect, deltas per tick

**Files:**
- Modify: `src/shared/protocol.ts` (whole file shown below)
- Modify: `src/server/broadcaster.ts` (whole file shown below)
- Rewrite: `tests/broadcaster.test.ts` (whole file shown below)
- Rewrite: `tests/server.test.ts` (whole file shown below — the broadcaster signature change breaks it, so it is fixed in the same task to keep every commit green)

**Interfaces:**
- Consumes: `EventLog` from Task 1; `SessionHub` helpers from Task 2 (tests only).
- Produces:
  - `SyncMessage` now includes `events: GameEvent[]` (delta since previous broadcast tick; `[]` on the connect-time sync).
  - `HistoryMessage = { type: 'history'; serverTime: number; droppedBefore: number; events: GameEvent[] }`
  - `ServerMessage = SyncMessage | HistoryMessage`
  - `createRaceBroadcaster(session, clock, log, tickMs = 250)` — note the new required third parameter; returns the previous surface plus `buildHistory()`.

- [ ] **Step 1: Update the protocol**

Replace the entire content of `src/shared/protocol.ts` with:

```ts
import type { GamePresentation } from './presentation.js';
import type { GameEvent } from './events.js';

/** Server → browser: the complete authoritative game state at serverTime
 *  (monotonic seconds). Browsers extrapolate marker positions from each
 *  entry's placement.progress + displaySpeed until the next sync.
 *  `events` carries the event-log delta since the previous broadcast tick;
 *  clients dedupe by seq, so overlap with a just-received history is safe. */
export type SyncMessage = { type: 'sync'; serverTime: number; events: GameEvent[] } & GamePresentation;

/** Server → browser, once per (re)connect before the first sync: the full
 *  retained event log. Event-sourced formats refold their state from this. */
export interface HistoryMessage {
  type: 'history';
  serverTime: number;
  /** Events with seq below this were evicted from the server's bounded log. */
  droppedBefore: number;
  events: GameEvent[];
}

export type ServerMessage = SyncMessage | HistoryMessage;

/** Browser → server. Focusing is the only action the dashboard can take. */
export type ClientMessage = { type: 'focus'; terminalID: string };
```

- [ ] **Step 2: Rewrite the broadcaster tests (failing)**

Replace the entire content of `tests/broadcaster.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { createRaceBroadcaster } from '../src/server/broadcaster.js';
import { createRaceSession } from '../src/server/race-session.js';
import { createEventLog } from '../src/server/event-log.js';
import { createSessionHub } from '../src/server/session-hub.js';
import type { HistoryMessage, ServerMessage, SyncMessage } from '../src/shared/protocol.js';
import { agent, goLive, snap, team } from './helpers/session.js';

function makeRig(status: 'working' | 'idle' = 'working') {
  const session = createRaceSession(() => 1);
  const log = createEventLog();
  const hub = createSessionHub(session, log);
  goLive(hub, snap(team('ws-1', 'alpha', [agent('t1', status)])));
  let now = 0;
  const clock = () => now;
  const setNow = (value: number) => { now = value; };
  const broadcaster = createRaceBroadcaster(session, clock, log);
  const sent: ServerMessage[] = [];
  broadcaster.addClient(json => sent.push(JSON.parse(json)));
  return { broadcaster, sent, setNow, hub, log };
}

describe('RaceBroadcaster', () => {
  it('sends history then a full sync when a client connects', () => {
    const { sent } = makeRig();
    expect(sent.map(m => m.type)).toEqual(['history', 'sync']);
    const history = sent[0] as HistoryMessage;
    expect(history.events.map(e => e.kind)).toEqual(['team-joined', 'unit-joined']);
    expect(history.droppedBefore).toBe(1);
    const sync = sent[1] as SyncMessage;
    expect(sync.events).toEqual([]);
    expect(sync.teams[0].entries[0].id).toBe('t1');
    expect(sync.teams[0].entries[0].displaySpeed).toBeGreaterThan(0);
  });

  it('broadcasts event deltas since the previous tick, then empty deltas', () => {
    const rig = makeRig();
    rig.hub.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'blocked')])), 0.2);
    rig.setNow(0.25);
    rig.broadcaster.tick();
    const first = rig.sent.at(-1) as SyncMessage;
    // The connect-time history already carried seq 1-2; the delta resends
    // everything after the broadcaster's cursor — clients dedupe by seq.
    expect(first.events.some(e => e.kind === 'status-changed')).toBe(true);
    rig.setNow(0.5);
    rig.broadcaster.tick();
    const second = rig.sent.at(-1) as SyncMessage;
    expect(second.type).toBe('sync');
    expect(second.events).toEqual([]);
  });

  it('keeps serving remaining clients after one is removed', () => {
    const rig = makeRig('idle');
    const extra: ServerMessage[] = [];
    const send = (json: string) => extra.push(JSON.parse(json));
    rig.broadcaster.addClient(send);
    expect(extra.map(m => m.type)).toEqual(['history', 'sync']);
    rig.broadcaster.removeClient(send);
    rig.setNow(0.25);
    rig.broadcaster.tick();
    expect(extra).toHaveLength(2);
    expect(rig.sent.length).toBe(3); // history + sync + tick sync
  });

  it('gives a late client the full history including earlier deltas', () => {
    const rig = makeRig();
    rig.hub.applySnapshot(snap(team('ws-1', 'alpha', [agent('t1', 'done')])), 0.2);
    rig.setNow(0.25);
    rig.broadcaster.tick();
    const late: ServerMessage[] = [];
    rig.broadcaster.addClient(json => late.push(JSON.parse(json)));
    const history = late[0] as HistoryMessage;
    expect(history.type).toBe('history');
    expect(history.events.some(e => e.kind === 'status-changed')).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/broadcaster.test.ts`
Expected: FAIL — `createRaceBroadcaster` does not accept a log argument / no history message sent.

- [ ] **Step 4: Implement the broadcaster changes**

Replace the entire content of `src/server/broadcaster.ts` with:

```ts
import type { RaceSession } from './race-session.js';
import type { EventLog } from './event-log.js';
import type { GameEvent } from '../shared/events.js';
import type { HistoryMessage, SyncMessage } from '../shared/protocol.js';

/**
 * Owns the server-side tick: advances the race session on a fixed cadence and
 * fans full sync messages out to connected browsers. Every (re)connect first
 * receives the full event-log history; each tick's sync carries the event
 * delta since the previous broadcast (clients dedupe by seq).
 */
export function createRaceBroadcaster(
  session: RaceSession,
  clock: () => number,
  log: EventLog,
  tickMs = 250,
) {
  let timer: ReturnType<typeof setInterval> | null = null;
  const clients = new Set<(json: string) => void>();
  let broadcastSeq = 0; // last event seq fanned out in a sync delta

  function start(): void {
    if (timer) return;
    timer = setInterval(tick, tickMs);
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function addClient(send: (json: string) => void): void {
    clients.add(send);
    const now = clock();
    session.advance(now);
    send(JSON.stringify(buildHistory()));
    send(JSON.stringify(buildSync([])));
  }

  function removeClient(send: (json: string) => void): void {
    clients.delete(send);
  }

  /** One cadence step. Public so tests can drive it with a manual clock. */
  function tick(): void {
    const now = clock();
    session.advance(now);
    if (clients.size === 0) return; // race continues; nothing to fan out
    const events = log.eventsSince(broadcastSeq);
    broadcastSeq = log.lastSeq();
    const json = JSON.stringify(buildSync(events));
    for (const send of clients) send(json);
  }

  function buildHistory(): HistoryMessage {
    return {
      type: 'history',
      serverTime: clock(),
      droppedBefore: log.droppedBefore(),
      events: log.history(),
    };
  }

  function buildSync(events: GameEvent[] = []): SyncMessage {
    return { type: 'sync', serverTime: clock(), events, ...session.presentation() };
  }

  return { start, stop, addClient, removeClient, tick, buildSync, buildHistory };
}

export type RaceBroadcaster = ReturnType<typeof createRaceBroadcaster>;
```

- [ ] **Step 5: Run the broadcaster tests**

Run: `npx vitest run tests/broadcaster.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Update the server integration tests**

The signature change (`createRaceBroadcaster` now requires a log) breaks `tests/server.test.ts`. Replace its entire content with:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { createRaceBroadcaster } from '../src/server/broadcaster.js';
import { createRaceSession } from '../src/server/race-session.js';
import { createEventLog } from '../src/server/event-log.js';
import { createSessionHub } from '../src/server/session-hub.js';
import { loadFixture } from '../src/server/fixtures.js';
import { startServer } from '../src/server/server.js';
import type { HistoryMessage, ServerMessage, SyncMessage } from '../src/shared/protocol.js';
import { waitUntil } from './helpers/fake-herdr.js';

type Dashboard = Awaited<ReturnType<typeof startServer>>;
let dashboard: Dashboard | null = null;
let webRoot = '';

async function makeServer(onFocus: (id: string) => void = () => {}): Promise<Dashboard> {
  webRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-f1-web-'));
  fs.writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>Herdr F1</title>');
  fs.writeFileSync(path.join(webRoot, 'app.js'), 'console.log(1)');
  const session = createRaceSession();
  const log = createEventLog();
  loadFixture('grid', createSessionHub(session, log));
  const broadcaster = createRaceBroadcaster(session, () => 1000, log);
  dashboard = await startServer({ port: 4990, webRoot, broadcaster, onFocus });
  return dashboard;
}

afterEach(async () => {
  await dashboard?.close();
  dashboard = null;
  if (webRoot) fs.rmSync(webRoot, { recursive: true, force: true });
});

describe('startServer', () => {
  it('serves index.html at / and assets by extension', async () => {
    const { port } = await makeServer();
    const home = await fetch(`http://127.0.0.1:${port}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toContain('text/html');
    expect(await home.text()).toContain('Herdr F1');
    const js = await fetch(`http://127.0.0.1:${port}/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('text/javascript');
  });

  it('404s missing files and refuses path traversal', async () => {
    const { port } = await makeServer();
    expect((await fetch(`http://127.0.0.1:${port}/nope.js`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/..%2f..%2fetc%2fpasswd`)).status).toBe(404);
  });

  it('sends history then sync to every new websocket client and routes focus', async () => {
    const focused: string[] = [];
    const { port } = await makeServer(id => focused.push(id));
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages: ServerMessage[] = [];
    socket.on('message', raw => messages.push(JSON.parse(String(raw))));
    await waitUntil(() => messages.length >= 2);
    const history = messages[0] as HistoryMessage;
    expect(history.type).toBe('history');
    expect(history.events.some(e => e.kind === 'unit-joined')).toBe(true);
    const sync = messages[1] as SyncMessage;
    expect(sync.type).toBe('sync');
    expect(sync.teams.length).toBe(4);
    socket.send(JSON.stringify({ type: 'focus', terminalID: 't6' }));
    await waitUntil(() => focused.length === 1);
    expect(focused[0]).toBe('t6');
    socket.send('not json'); // must not crash the server
    socket.close();
  });

  it('probes the next port when the preferred one is taken', async () => {
    const first = await makeServer();
    const session = createRaceSession();
    const broadcaster = createRaceBroadcaster(session, () => 0, createEventLog());
    const second = await startServer({ port: first.port, webRoot, broadcaster, onFocus: () => {} });
    try {
      expect(second.port).toBe(first.port + 1);
    } finally {
      await second.close();
    }
  });
});
```

- [ ] **Step 7: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: everything passes (server.test is green again with the new signature).

- [ ] **Step 8: Commit**

```bash
git add src/shared/protocol.ts src/server/broadcaster.ts tests/broadcaster.test.ts tests/server.test.ts
git commit -m "feat: broadcast event history on connect and deltas per tick

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: CLI wiring — fixtures and live herdr feed the log

**Files:**
- Modify: `src/server/cli.ts:86-96`

**Interfaces:**
- Consumes: `createEventLog` (Task 1), `createSessionHub` (Task 2), `createRaceBroadcaster(session, clock, log)` (Task 3).
- Produces: a running server where BOTH `--fixture` and live-herdr paths populate the event log; every WS client receives `history` → `sync`.

- [ ] **Step 1: Wire the CLI**

In `src/server/cli.ts`, add imports at the top (next to the existing broadcaster/session imports):

```ts
import { createEventLog } from './event-log.js';
import { createSessionHub } from './session-hub.js';
```

Then replace this block (currently around lines 86-96):

```ts
  const session = createRaceSession();
  const broadcaster = createRaceBroadcaster(session, monotonicSeconds);
  let client: HerdrClient | null = null;
  if (options.fixture) {
    // Pre-roll fixtures at real time (1×) for determinism, then apply the
    // live tempo so the sped-up progression is what the viewer watches.
    loadFixture(options.fixture, session);
  } else {
    client = createHerdrClient({ socketPath: options.socket });
    client.start(update => session.apply(update, monotonicSeconds()));
  }
```

with:

```ts
  const session = createRaceSession();
  const log = createEventLog();
  const hub = createSessionHub(session, log);
  const broadcaster = createRaceBroadcaster(session, monotonicSeconds, log);
  let client: HerdrClient | null = null;
  if (options.fixture) {
    // Pre-roll fixtures at real time (1×) for determinism, then apply the
    // live tempo so the sped-up progression is what the viewer watches.
    loadFixture(options.fixture, hub);
  } else {
    client = createHerdrClient({ socketPath: options.socket });
    client.start(update => hub.apply(update, monotonicSeconds()));
  }
```

- [ ] **Step 2: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: everything passes.

- [ ] **Step 3: Smoke-check a fixture server end to end**

```bash
npx tsx src/server/cli.ts start --no-open --fixture grid --port 41695 &
SERVER_PID=$!
sleep 2
node -e "
setTimeout(() => { console.error('timeout'); process.exit(1); }, 5000);
const ws = new (require('ws').WebSocket)('ws://127.0.0.1:41695/ws');
const seen = [];
ws.on('message', raw => {
  seen.push(JSON.parse(raw).type);
  if (seen.length === 2) { console.log(seen.join(',')); process.exit(seen[0] === 'history' && seen[1] === 'sync' ? 0 : 1); }
});
"
STATUS=$?
kill $SERVER_PID
exit $STATUS
```

Expected output: `history,sync` and exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/server/cli.ts
git commit -m "feat: wire event log through cli for fixture and live paths

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Client event source + format hook

**Files:**
- Create: `src/web/event-source.ts`
- Modify: `src/web/format.ts` (whole file shown below)
- Modify: `src/web/main.ts` (whole file shown below)
- Test: `tests/event-source.test.ts`

**Interfaces:**
- Consumes: `GameEvent` (Task 1), `ServerMessage`/`HistoryMessage`/`SyncMessage` (Task 3).
- Produces:
  - `createEventSource(onBatch: (events: GameEvent[], reset: boolean) => void): { ingest(message: ServerMessage): void }`
  - `GameFormat.onEvents?(events: GameEvent[], reset: boolean): void` — Task 7's defense format implements this.

- [ ] **Step 1: Write the failing tests**

Create `tests/event-source.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createEventSource } from '../src/web/event-source.js';
import type { GameEvent } from '../src/shared/events.js';
import type { GamePresentation } from '../src/shared/presentation.js';
import type { HistoryMessage, SyncMessage } from '../src/shared/protocol.js';

const ev = (seq: number): GameEvent => ({ seq, at: seq, kind: 'stint-started', unitID: 'u1' });

const presentation: GamePresentation = {
  phase: 'live',
  round: 1,
  leaderProgress: 0,
  teams: [],
  results: null,
  connection: { kind: 'live' },
  overlay: { kind: 'none' },
};

const history = (events: GameEvent[]): HistoryMessage =>
  ({ type: 'history', serverTime: 0, droppedBefore: 1, events });
const syncWith = (events: GameEvent[]): SyncMessage =>
  ({ type: 'sync', serverTime: 0, events, ...presentation });

function makeRig() {
  const batches: Array<{ events: GameEvent[]; reset: boolean }> = [];
  const source = createEventSource((events, reset) => batches.push({ events, reset }));
  return { batches, source };
}

describe('EventSource', () => {
  it('replays history with reset=true and sets the cursor', () => {
    const { batches, source } = makeRig();
    source.ingest(history([ev(1), ev(2)]));
    expect(batches).toEqual([{ events: [ev(1), ev(2)], reset: true }]);
    source.ingest(syncWith([ev(1), ev(2)])); // overlap with history: all stale
    expect(batches).toHaveLength(1);
  });

  it('forwards only fresh sync events and advances the cursor', () => {
    const { batches, source } = makeRig();
    source.ingest(history([ev(1)]));
    source.ingest(syncWith([ev(1), ev(2), ev(3)]));
    expect(batches.at(-1)).toEqual({ events: [ev(2), ev(3)], reset: false });
    source.ingest(syncWith([ev(3)]));
    expect(batches).toHaveLength(2);
  });

  it('resets again on a second history (reconnect)', () => {
    const { batches, source } = makeRig();
    source.ingest(history([ev(1), ev(2)]));
    source.ingest(history([ev(1), ev(2), ev(3)]));
    expect(batches.at(-1)).toEqual({ events: [ev(1), ev(2), ev(3)], reset: true });
  });

  it('an empty history still resets', () => {
    const { batches, source } = makeRig();
    source.ingest(history([]));
    expect(batches).toEqual([{ events: [], reset: true }]);
    source.ingest(syncWith([ev(1)]));
    expect(batches.at(-1)).toEqual({ events: [ev(1)], reset: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/event-source.test.ts`
Expected: FAIL — cannot resolve `../src/web/event-source.js`.

- [ ] **Step 3: Implement the event source**

Create `src/web/event-source.ts`:

```ts
import type { GameEvent } from '../shared/events.js';
import type { ServerMessage } from '../shared/protocol.js';

/** Orders history and live sync deltas into one deduplicated event stream.
 *  A history message resets the cursor and tells subscribers to refold from
 *  scratch (this is what makes refresh/reconnect lossless). Sync deltas may
 *  overlap a just-received history, so events at or below the cursor are
 *  dropped. Events inside one message are seq-ascending by construction. */
export function createEventSource(
  onBatch: (events: GameEvent[], reset: boolean) => void,
) {
  let cursor = 0;

  function ingest(message: ServerMessage): void {
    if (message.type === 'history') {
      cursor = message.events.length ? message.events[message.events.length - 1].seq : 0;
      onBatch(message.events, true);
      return;
    }
    const fresh = message.events.filter(event => event.seq > cursor);
    if (fresh.length === 0) return;
    cursor = fresh[fresh.length - 1].seq;
    onBatch(fresh, false);
  }

  return { ingest };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/event-source.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the format hook**

Replace the entire content of `src/web/format.ts` with:

```ts
import type { SyncMessage } from '../shared/protocol.js';
import type { GameEvent } from '../shared/events.js';

/** A game format reinterprets the game-neutral SyncMessage into a header, a
 *  standings panel, and a canvas scene. Adding a format is one directory under
 *  `formats/`; the server and protocol never learn its vocabulary. */
export interface GameChrome {
  render(sync: SyncMessage): void;
}

export interface GameStandings {
  render(sync: SyncMessage): void;
}

export interface GameScene {
  setSync(sync: SyncMessage, receivedAtMs: number): void;
  frame(nowMs: number): void;
  resize(): void;
}

export interface GameFormat {
  createChrome(): GameChrome;
  createStandings(el: HTMLElement, onFocus: (terminalID: string) => void): GameStandings;
  createScene(canvas: HTMLCanvasElement, onFocus: (terminalID: string) => void): GameScene;
  /** Optional: event-sourced formats receive the deduplicated event stream.
   *  `reset` means "discard all folded state and refold from scratch" — it
   *  arrives with the full history on every (re)connect, which is what makes
   *  folded state survive refreshes and stay identical across tabs. Folds
   *  must be deterministic: no Math.random()/Date.now(). */
  onEvents?(events: GameEvent[], reset: boolean): void;
}
```

- [ ] **Step 6: Dispatch messages in main.ts**

Replace the entire content of `src/web/main.ts` with:

```ts
import './style.css';
import type { GameFormat } from './format.js';
import { f1Format } from './formats/f1/index.js';
import { raidFormat } from './formats/raid/index.js';
import type { ServerMessage, SyncMessage } from '../shared/protocol.js';
import { createEventSource } from './event-source.js';

// Format is chosen per browser tab (?game=), never by the server: the same
// server session can be watched as F1 in one tab and raid in another.
const formats: Record<string, GameFormat> = {
  f1: f1Format,
  raid: raidFormat,
};
const requested = new URLSearchParams(location.search).get('game') ?? 'f1';
const format = formats[requested] ?? f1Format;

let socket: WebSocket | null = null;
const sendFocus = (terminalID: string): void => {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'focus', terminalID }));
  }
};

const chrome = format.createChrome();
const standings = format.createStandings(document.getElementById('standings')!, sendFocus);
const scene = format.createScene(document.getElementById('track') as HTMLCanvasElement, sendFocus);
const eventSource = createEventSource((events, reset) => format.onEvents?.(events, reset));

let sync: SyncMessage | null = null;

function frame(now: number): void {
  if (sync) scene.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function connect(): void {
  socket = new WebSocket(`ws://${location.host}/ws`);
  socket.onmessage = event => {
    const message = JSON.parse(event.data as string) as ServerMessage;
    eventSource.ingest(message);
    if (message.type !== 'sync') return;
    sync = message;
    chrome.render(sync);
    standings.render(sync);
    scene.setSync(sync, performance.now());
  };
  socket.onclose = () => setTimeout(connect, 1000);
}
connect();

new ResizeObserver(() => {
  scene.resize();
  if (sync) scene.frame(performance.now());
}).observe(document.getElementById('track-wrap')!);
```

- [ ] **Step 7: Full suite + typecheck + build**

Run: `npm test && npm run typecheck && npx vite build`
Expected: all pass; vite build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/web/event-source.ts src/web/format.ts src/web/main.ts tests/event-source.test.ts
git commit -m "feat: client event source with seq dedupe and format onEvents hook

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Defense fold — pure event → state

**Files:**
- Create: `src/web/formats/defense/fold.ts`
- Test: `tests/defense-fold.test.ts`

**Interfaces:**
- Consumes: `GameEvent` (Task 1), `AgentStatus` from `src/shared/presentation.ts`.
- Produces (Task 7 relies on these exact names):
  - `interface TowerState { id; teamID; label; number; status; kills; breaches; rebuilds; departed }`
  - `interface DefenseState { teams: Map<string, { label: string; colorSlot: number }>; towers: Map<string, TowerState>; score: number }`
  - `initialDefense(): DefenseState`
  - `foldDefense(state: DefenseState, event: GameEvent): DefenseState` (mutates and returns `state`)

- [ ] **Step 1: Write the failing tests**

Create `tests/defense-fold.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { foldDefense, initialDefense } from '../src/web/formats/defense/fold.js';
import type { GameEvent, GameEventBody } from '../src/shared/events.js';

function log(...bodies: GameEventBody[]): GameEvent[] {
  return bodies.map((body, index) => ({ seq: index + 1, at: index, ...body }));
}

const joinT1: GameEventBody[] = [
  { kind: 'team-joined', team: { id: 'ws-1', label: 'alpha' } },
  {
    kind: 'unit-joined',
    unit: { id: 't1', teamID: 'ws-1', tabLabel: 'tab-t1', agentKind: 'claude', status: 'working' },
  },
];

function fold(bodies: GameEventBody[]) {
  return log(...bodies).reduce(foldDefense, initialDefense());
}

describe('foldDefense', () => {
  it('creates a numbered tower and a team color slot on join', () => {
    const state = fold(joinT1);
    expect(state.teams.get('ws-1')).toEqual({ label: 'alpha', colorSlot: 0 });
    const tower = state.towers.get('t1')!;
    expect(tower).toMatchObject({ number: 1, label: 'tab-t1', status: 'working', kills: 0 });
  });

  it('counts a breach on blocked and a kill+score on blocked→working', () => {
    const state = fold([
      ...joinT1,
      { kind: 'status-changed', unitID: 't1', from: 'working', to: 'blocked' },
      { kind: 'status-changed', unitID: 't1', from: 'blocked', to: 'working' },
    ]);
    const tower = state.towers.get('t1')!;
    expect(tower.breaches).toBe(1);
    expect(tower.kills).toBe(1);
    expect(state.score).toBe(1);
  });

  it('does not score blocked→idle (a kill requires recovering to working)', () => {
    const state = fold([
      ...joinT1,
      { kind: 'status-changed', unitID: 't1', from: 'working', to: 'blocked' },
      { kind: 'status-changed', unitID: 't1', from: 'blocked', to: 'idle' },
    ]);
    expect(state.towers.get('t1')!.kills).toBe(0);
    expect(state.score).toBe(0);
  });

  it('keeps kills and number across depart/rejoin', () => {
    const state = fold([
      ...joinT1,
      { kind: 'status-changed', unitID: 't1', from: 'working', to: 'blocked' },
      { kind: 'status-changed', unitID: 't1', from: 'blocked', to: 'working' },
      { kind: 'unit-departed', unitID: 't1' },
      {
        kind: 'unit-joined',
        unit: { id: 't1', teamID: 'ws-1', tabLabel: 'tab-t1', agentKind: 'claude', status: 'idle' },
      },
    ]);
    const tower = state.towers.get('t1')!;
    expect(tower).toMatchObject({ departed: false, kills: 1, number: 1, status: 'idle' });
  });

  it('counts rebuilds on stint-started', () => {
    const state = fold([...joinT1, { kind: 'stint-started', unitID: 't1' }]);
    expect(state.towers.get('t1')!.rebuilds).toBe(1);
  });

  it('is deterministic: folding the same log twice yields deep-equal states', () => {
    const bodies: GameEventBody[] = [
      ...joinT1,
      { kind: 'status-changed', unitID: 't1', from: 'working', to: 'blocked' },
      { kind: 'status-changed', unitID: 't1', from: 'blocked', to: 'working' },
    ];
    expect(fold(bodies)).toEqual(fold(bodies));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/defense-fold.test.ts`
Expected: FAIL — cannot resolve `../src/web/formats/defense/fold.js`.

- [ ] **Step 3: Implement the fold**

Create `src/web/formats/defense/fold.ts`:

```ts
import type { AgentStatus } from '../../../shared/presentation.js';
import type { GameEvent } from '../../../shared/events.js';

/** Tower-defense reading of the event log: every unit is a tower on the wall,
 *  a `blocked` transition is a monster breaching it, recovering to `working`
 *  is the kill. All state is a pure fold — same log, same fortress. */
export interface TowerState {
  id: string;
  teamID: string;
  label: string;
  /** Join order, 1-based; stable across depart/rejoin. */
  number: number;
  status: AgentStatus;
  kills: number;
  breaches: number;
  rebuilds: number;
  departed: boolean;
}

export interface DefenseState {
  /** colorSlot is team join order — deterministic across tabs. */
  teams: Map<string, { label: string; colorSlot: number }>;
  towers: Map<string, TowerState>;
  score: number;
}

export function initialDefense(): DefenseState {
  return { teams: new Map(), towers: new Map(), score: 0 };
}

/** Mutates and returns `state` (a render model, not a shared value). */
export function foldDefense(state: DefenseState, event: GameEvent): DefenseState {
  switch (event.kind) {
    case 'team-joined':
      if (!state.teams.has(event.team.id)) {
        state.teams.set(event.team.id, { label: event.team.label, colorSlot: state.teams.size });
      }
      break;
    case 'unit-joined': {
      const existing = state.towers.get(event.unit.id);
      if (existing) {
        existing.departed = false;
        existing.status = event.unit.status;
        break;
      }
      state.towers.set(event.unit.id, {
        id: event.unit.id,
        teamID: event.unit.teamID,
        label: event.unit.tabLabel,
        number: state.towers.size + 1,
        status: event.unit.status,
        kills: 0,
        breaches: 0,
        rebuilds: 0,
        departed: false,
      });
      break;
    }
    case 'unit-departed': {
      const tower = state.towers.get(event.unitID);
      if (tower) tower.departed = true;
      break;
    }
    case 'status-changed': {
      const tower = state.towers.get(event.unitID);
      if (!tower) break;
      if (event.to === 'blocked') tower.breaches += 1;
      if (event.from === 'blocked' && event.to === 'working') {
        tower.kills += 1;
        state.score += 1;
      }
      tower.status = event.to;
      break;
    }
    case 'stint-started': {
      const tower = state.towers.get(event.unitID);
      if (tower) tower.rebuilds += 1;
      break;
    }
  }
  return state;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/defense-fold.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full suite + typecheck, then commit**

Run: `npm test && npm run typecheck`

```bash
git add src/web/formats/defense/fold.ts tests/defense-fold.test.ts
git commit -m "feat: defense format fold - towers, breaches, kills as pure event fold

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Defense format UI + registration + manual verification

**Files:**
- Create: `src/web/formats/defense/chrome.ts`
- Create: `src/web/formats/defense/standings.ts`
- Create: `src/web/formats/defense/scene.ts`
- Create: `src/web/formats/defense/index.ts`
- Modify: `src/web/main.ts` (two-line registry addition)

**Interfaces:**
- Consumes: `DefenseState`, `TowerState`, `initialDefense`, `foldDefense` (Task 6); `GameFormat` with `onEvents` (Task 5); `palette`, `contrastText`, `hexAlpha` from `src/web/palette.ts`; shared DOM ids from `src/web/index.html` (`lap-text`, `phase-text`, `gp-text`, `connection-text`, `car-count`, `overlay`, `standings-empty`, `.panel-title`) and CSS classes `agent-row`, `agent-chip`, `agent-main`, `agent-sub`, `agent-status` from `src/web/style.css`.
- Produces: `defenseFormat: GameFormat` registered as `?game=defense`.

- [ ] **Step 1: Chrome**

Create `src/web/formats/defense/chrome.ts`:

```ts
import type { SyncMessage } from '../../../shared/protocol.js';
import { palette } from '../../palette.js';
import type { DefenseState } from './fold.js';

/** Header for the fortress: score, breach count, connection badge. The scene
 *  and standings read the same folded state via the shared getter. */
export function createChrome(getState: () => DefenseState) {
  const score = document.getElementById('lap-text')!;
  const phase = document.getElementById('phase-text')!;
  const breaches = document.getElementById('gp-text')!;
  const connection = document.getElementById('connection-text')!;
  const towerCount = document.getElementById('car-count')!;
  const overlay = document.getElementById('overlay')!;
  const standingsEmpty = document.getElementById('standings-empty')!;
  const panelTitle = document.querySelector('.panel-title');
  if (panelTitle) panelTitle.textContent = 'GARRISON';
  // PoC simplification: defense keeps all status in the header, no overlays.
  overlay.hidden = true;

  function render(sync: SyncMessage): void {
    const state = getState();
    const towers = [...state.towers.values()].filter(tower => !tower.departed);
    const breachTotal = towers.reduce((sum, tower) => sum + tower.breaches, 0);
    score.textContent = `SCORE ${state.score}`;
    phase.textContent = sync.connection.kind === 'live' ? 'DEFENSE LIVE' : 'GATES HOLD';
    breaches.textContent = `BREACHES ${breachTotal}`;
    towerCount.textContent =
      towers.length === 0 ? '—' : `${towers.length} TOWER${towers.length === 1 ? '' : 'S'}`;
    const live = sync.connection.kind === 'live';
    connection.textContent = live ? 'DEFENSE LIVE' : 'HERDR OFFLINE';
    connection.style.color = live ? palette.statusWorking : palette.liveRed;
    standingsEmpty.hidden = towers.length > 0;
    if (towers.length === 0) standingsEmpty.textContent = 'NO TOWERS';
  }

  return { render };
}
```

- [ ] **Step 2: Standings**

Create `src/web/formats/defense/standings.ts`:

```ts
import type { SyncMessage } from '../../../shared/protocol.js';
import { contrastText, hexAlpha, palette } from '../../palette.js';
import type { DefenseState, TowerState } from './fold.js';

/** Kill leaderboard: one row per tower, top slayers first. Rebuilds only when
 *  the folded state fingerprint changes. */
export function createStandingsPanel(
  container: HTMLElement,
  onFocus: (terminalID: string) => void,
  getState: () => DefenseState,
) {
  let fingerprint = '';

  function render(_sync: SyncMessage): void {
    const state = getState();
    const towers = [...state.towers.values()]
      .filter(tower => !tower.departed)
      .sort((a, b) => b.kills - a.kills || a.number - b.number);
    const next = towers.map(t => `${t.id}:${t.kills}:${t.status}:${t.rebuilds}`).join('|');
    if (next === fingerprint) return;
    fingerprint = next;
    container.replaceChildren(...towers.map(tower => row(tower, state)));
  }

  function row(tower: TowerState, state: DefenseState): HTMLElement {
    const slot = state.teams.get(tower.teamID)?.colorSlot ?? 0;
    const color = palette.teamColors[slot % palette.teamColors.length];
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'agent-row';
    element.dataset.terminalId = tower.id;
    element.style.setProperty('--team-color', color);
    element.addEventListener('click', () => onFocus(tower.id));

    const chip = document.createElement('span');
    chip.className = 'agent-chip';
    chip.style.background = color;
    chip.style.color = contrastText(color);
    chip.textContent = String(tower.number);

    const main = document.createElement('span');
    main.className = 'agent-main';
    main.textContent = tower.label;

    const sub = document.createElement('span');
    sub.className = 'agent-sub';
    const status = document.createElement('span');
    status.className = 'agent-status';
    status.textContent = `${tower.kills} KILLS · ${tower.status.toUpperCase()}`;
    const statusColor = tower.status === 'blocked' ? palette.liveRed : palette.statusWorking;
    status.style.color = statusColor;
    status.style.background = hexAlpha(statusColor, 0.14);
    sub.append(status);

    element.append(chip, main, sub);
    return element;
  }

  return { render };
}
```

- [ ] **Step 3: Scene**

Create `src/web/formats/defense/scene.ts`:

```ts
import type { SyncMessage } from '../../../shared/protocol.js';
import { contrastText, palette } from '../../palette.js';
import type { DefenseState, TowerState } from './fold.js';

// Fixed logical scene, aspect-fitted into the canvas (same skeleton as raid).
const SCENE_W = 620;
const SCENE_H = 540;
const TOWER_R = 16; // half-size of a tower square
const COLS = 5;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

/** Deterministic [0, 1) hash — fold-driven scenes must not use Math.random. */
function rand01(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function createDefenseScene(
  canvas: HTMLCanvasElement,
  onFocus: (terminalID: string) => void,
  getState: () => DefenseState,
) {
  const ctx = canvas.getContext('2d')!;
  let dpr = 1;
  let sceneScale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let markers: Array<{ id: string; x: number; y: number }> = [];

  resize();
  canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - offsetX) / sceneScale;
    const y = (event.clientY - rect.top - offsetY) / sceneScale;
    for (const marker of markers) {
      if (Math.abs(marker.x - x) <= TOWER_R + 4 && Math.abs(marker.y - y) <= TOWER_R + 4) {
        onFocus(marker.id);
        return;
      }
    }
  });

  function setSync(_sync: SyncMessage, _receivedAtMs: number): void {
    // Fold-driven scene: state arrives via the event stream, not the sync.
  }

  function resize(): void {
    const parent = canvas.parentElement!;
    const cssWidth = Math.max(1, parent.clientWidth);
    const cssHeight = Math.max(1, parent.clientHeight);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    sceneScale = Math.min(cssWidth / SCENE_W, cssHeight / SCENE_H);
    offsetX = (cssWidth - SCENE_W * sceneScale) / 2;
    offsetY = (cssHeight - SCENE_H * sceneScale) / 2;
  }

  function frame(nowMs: number): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * sceneScale, 0, 0, dpr * sceneScale, dpr * offsetX, dpr * offsetY);

    const state = getState();
    const towers = [...state.towers.values()].filter(tower => !tower.departed);

    drawGate();
    markers = [];
    towers.forEach((tower, index) => {
      const col = index % COLS;
      const rowIdx = Math.floor(index / COLS);
      const rowCount = Math.min(COLS, towers.length - rowIdx * COLS);
      const x = SCENE_W / 2 + (col - (rowCount - 1) / 2) * 92;
      const y = SCENE_H * 0.4 + rowIdx * 96;
      markers.push({ id: tower.id, x, y });
      drawTower(tower, x, y, nowMs, state);
    });
  }

  function drawGate(): void {
    // The fortress gate the towers defend: a banded wall along the top.
    ctx.fillStyle = palette.asphalt;
    ctx.fillRect(0, 24, SCENE_W, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x < SCENE_W; x += 32) ctx.fillRect(x, 24, 16, 26);
    ctx.fillStyle = palette.textMuted;
    ctx.font = `700 8px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('FORTRESS GATE', SCENE_W / 2, 20);
  }

  function drawTower(
    tower: TowerState, x: number, y: number, nowMs: number, state: DefenseState,
  ): void {
    const slot = state.teams.get(tower.teamID)?.colorSlot ?? 0;
    const color = palette.teamColors[slot % palette.teamColors.length];

    if (tower.status === 'blocked') drawMonster(tower, x, y, nowMs);

    // Tower body with battlement notches.
    ctx.fillStyle = color;
    ctx.strokeStyle = palette.canvas;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - TOWER_R, y - TOWER_R, TOWER_R * 2, TOWER_R * 2, 4);
    ctx.fill();
    ctx.stroke();
    for (let i = -1; i <= 1; i += 1) {
      ctx.fillRect(x + i * 9 - 3, y - TOWER_R - 5, 6, 6);
    }

    ctx.fillStyle = contrastText(color);
    ctx.font = `800 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(tower.number), x, y + 1);

    // Status ring mirrors the shared status colors; blocked pulses.
    const ringColor =
      tower.status === 'working' ? 'rgba(255,255,255,0.85)'
      : tower.status === 'idle' ? palette.statusPit
      : tower.status === 'done' ? palette.statusDone
      : palette.liveRed;
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 1.5;
    if (tower.status === 'blocked') {
      ctx.globalAlpha = 0.25 + 0.75 * Math.abs(Math.sin((Math.PI * nowMs) / 800));
    }
    ctx.strokeRect(x - TOWER_R - 4, y - TOWER_R - 4, (TOWER_R + 4) * 2, (TOWER_R + 4) * 2);
    ctx.globalAlpha = 1;

    ctx.font = `800 7px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = palette.textSoft;
    ctx.fillText(`${tower.kills} KILLS`, x, y + TOWER_R + 8);
    if (tower.status === 'done') {
      ctx.fillStyle = palette.statusDone;
      ctx.fillText('SECURED', x, y + TOWER_R + 17);
    }
  }

  function drawMonster(tower: TowerState, x: number, y: number, nowMs: number): void {
    // One monster per breach-in-progress, bobbing above the tower it attacks.
    // Position is hashed from fold state so every tab draws the same monster.
    const bob = Math.sin(nowMs / 180 + tower.breaches) * 3;
    const mx = x + (rand01(tower.breaches * 7 + tower.number) - 0.5) * 18;
    const my = y - TOWER_R - 26 + bob;
    ctx.fillStyle = palette.liveRed;
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.canvas;
    ctx.beginPath();
    ctx.arc(mx - 3, my - 2, 1.5, 0, Math.PI * 2);
    ctx.arc(mx + 3, my - 2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(mx - 4, my + 3); ctx.lineTo(mx - 2, my + 7); ctx.lineTo(mx, my + 3);
    ctx.moveTo(mx, my + 3); ctx.lineTo(mx + 2, my + 7); ctx.lineTo(mx + 4, my + 3);
    ctx.fill();
  }

  return { setSync, resize, frame };
}
```

- [ ] **Step 4: Format registration**

Create `src/web/formats/defense/index.ts`:

```ts
import type { GameFormat } from '../../format.js';
import type { GameEvent } from '../../../shared/events.js';
import { createChrome } from './chrome.js';
import { createStandingsPanel } from './standings.js';
import { createDefenseScene } from './scene.js';
import { foldDefense, initialDefense, type DefenseState } from './fold.js';

/** Tower defense: the first fully event-sourced format. All state is a pure
 *  fold over the server event log — refreshing the tab or opening a second
 *  one replays the same log into the same fortress. */
let state: DefenseState = initialDefense();

export const defenseFormat: GameFormat = {
  createChrome: () => createChrome(() => state),
  createStandings: (el, onFocus) => createStandingsPanel(el, onFocus, () => state),
  createScene: (canvas, onFocus) => createDefenseScene(canvas, onFocus, () => state),
  onEvents: (events: GameEvent[], reset: boolean) => {
    if (reset) state = initialDefense();
    for (const event of events) state = foldDefense(state, event);
  },
};
```

In `src/web/main.ts`, change:

```ts
import { f1Format } from './formats/f1/index.js';
import { raidFormat } from './formats/raid/index.js';
```

to:

```ts
import { f1Format } from './formats/f1/index.js';
import { raidFormat } from './formats/raid/index.js';
import { defenseFormat } from './formats/defense/index.js';
```

and change:

```ts
const formats: Record<string, GameFormat> = {
  f1: f1Format,
  raid: raidFormat,
};
```

to:

```ts
const formats: Record<string, GameFormat> = {
  f1: f1Format,
  raid: raidFormat,
  defense: defenseFormat,
};
```

- [ ] **Step 5: Full suite + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green; build emits `dist/web` and `dist/server`.

- [ ] **Step 6: Manual verification — refresh and multi-tab consistency**

```bash
node bin/herdr-f1.js start --no-open --fixture dense --port 41690
```

In a browser, open `http://localhost:41690/?game=defense` and verify:
1. Towers render in a grid with team colors and numbers; the kill leaderboard fills the right panel; header shows `SCORE n` / `BREACHES n`.
2. Any tower whose agent is STUNNED in the fixture shows a pulsing red ring with a monster bobbing above it.
3. **Refresh the tab: SCORE, BREACHES, every tower's kill count, and tower numbering are identical after reload** (history replay — this is the core acceptance).
4. Open a second tab with the same URL: both tabs show identical numbers.
5. `?game=raid` and `?game=f1` still render exactly as before.

Note: fixtures pre-roll their transitions at load, then hold still — so the score comes from the pre-rolled history and won't grow live. That is expected; live growth needs a real herdr session.

- [ ] **Step 7: Commit**

```bash
git add src/web/formats/defense src/web/main.ts
git commit -m "feat: event-sourced tower defense format (?game=defense)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

# Event-Sourced F1 and Raid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy server-owned F1/Raid simulation with two deterministic browser-owned folds over one complete, game-neutral `GameEvent` journal, while preserving the existing F1/Raid URLs, visuals, focus behavior, fixtures, and game meaning.

**Architecture:** The authoritative input is a server-owned journal of timestamped herdr facts plus a game-neutral logical clock cursor. The journal grows only when a source fact changes; the 4 Hz `sync` carries `timelineTime`/`timelineRate` without appending clock ticks. `?game=f1` and `?game=raid` each own an isolated format state, advance it to every event's logical `at`, apply the event, then advance it to the message's `timelineTime`. The already event-sourced `?game=foundry` fold keeps its interval model but projects it at the same cursor. The final cutover removes `RaceSession` and the dual-write `SessionHub` rather than retaining two owners.

**Tech Stack:** TypeScript strict mode, native ESM, Node.js >= 20, `ws`, Vite, Vitest. No new dependencies.

## Global Constraints

- Every relative ESM import in `.ts` files ends in `.js`.
- `npm run typecheck` (`tsc --noEmit`) must stay green.
- No runtime or dev dependency may be added.
- `src/shared/` and `src/server/` contain only source/event/transport vocabulary; no new F1 or Raid game terms are allowed there.
- Fold code and fold-derived logical rendering may not call `Math.random()`, `Date.now()`, or `new Date()`.
- Given the same `{ events: GameEvent[], timelineTime: number, timelineRate: number }`, F1/Raid/Foundry must produce deeply equal logical states in every tab.
- `performance.now()` is allowed only as a canvas interpolation origin; it may not change score, official position, HP, damage, rank, phase, result, number, or color.
- Existing public routes remain: `/` and `?game=f1` select F1, `?game=raid` selects Raid, and `?game=foundry` selects Orbital Foundry; an unknown `game` value still falls back to F1.
- Defense is permanently retired. Do not recreate `src/web/formats/defense/**`, register `?game=defense`, add a Defense alias, or preserve its removed tower/kill/breach state.
- Existing focus clicks still send `{ type: 'focus', terminalID }` and never mutate local game state.
- Existing fixture names and CLI flags remain accepted, including `--fixture grid|dense|redflag|error|podium` and `--speed`.
- Foundry's productivity, repairs/completions, resources/modules, stable worker/station identity, URL, and UI must not regress.
- Work test-first. Each task starts with a failing focused test, ends with its focused tests plus `npm run typecheck`, and is committed independently.
- End implementation commits with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` to remain consistent with the prerequisite plan.
- Current baseline (verified 2026-07-22): 21 test files / 109 tests pass outside the restricted network sandbox; `npm run typecheck` passes. Unix-socket and localhost tests report `EPERM` inside a restricted sandbox and must be rerun with network/socket permission.

---

## Investigation Findings and Design Decisions

### Authoritative state

| Layer | Owns | Must not own |
|---|---|---|
| Server `EventSession` | Ordered timestamped herdr facts, accepted cumulative `timelineTime`, configured `timelineRate`, current diffing metadata, full journal | Lap/damage progress, pace outcome, phase/result, HP, rank, placement |
| F1 fold | Cars, teams, official/display progress, pace, grid lifecycle, podium, ranking | Wall clock, WebSocket cursor, Raid state |
| Raid fold | Raiders, guilds, damage/display progress, attack rate, stage lifecycle, result, ranking | Wall clock, WebSocket cursor, F1 state |
| Foundry fold | Workers, productive intervals, repairs, completions, resources/modules projection | Wall clock, F1/Raid state |
| Canvas runtime | Tween origin, particles, hit targets, current animation frame | Any logical score/progress/result/identity |

`SyncMessage` stops carrying `GamePresentation`. A browser format is therefore unable to fall back accidentally to the legacy simulation after the cutover.

### The eight required design judgments

1. **The existing five events are insufficient on their own.** Their `at` values currently use raw server time and they omit connection transitions, focus, workspace moves, label/kind changes, and the end of the first authoritative snapshot. They also lack an authoritative current logical-time cursor. Consequently they cannot reproduce progress, position, pace sampling, F1 podiums, Raid HP/stages, focus treatments, exact bootstrap placement, Foundry production, or frozen time.

2. **Add only game-neutral source facts.** Extend the union with `connection-changed`, `team-updated`, `unit-profile-changed`, and `snapshot-applied`; rename the F1-flavored existing `stint-started` fact to the source-level `unit-session-restarted`. Enrich join records with `isFocused`, `sourceOrder`, and `stableOrder`. Keep `status-changed` with `from`/`to` because Foundry depends on the transition, not only the new status. Do not add periodic clock events.

3. **Time is a cumulative neutral cursor, not one event per tick.** `EventSession.advance(now)` applies the existing one-second phantom-step cap and `--speed` to private cumulative `timelineTime`, but appends nothing. Every source event is stamped with the current logical time. `history` and every `sync` carry `timelineTime` and `timelineRate`. Folds call `advanceTo(event.at)` before discrete reduction and `advanceTo(message.timelineTime)` after the batch. Canvas frames extrapolate only from the latest folded display position and rate.

4. **Remove `RaceSession`; do not retain a compatibility owner.** During migration it remains the only production authority while new folds are tested in shadow. After both UIs consume folds, one atomic cutover deletes `src/server/race-session.ts` and `src/server/session-hub.ts`. No final code path computes the same game state on server and browser.

5. **All variety is deterministic.** Move FNV-1a `stableHash` to a neutral shared helper. The event session records two first-seen ordinals: `sourceOrder` preserves Foundry's current join-order station colors/worker numbers; `stableOrder` preserves F1/Raid's ID-sorted collision probing. F1 pace is seeded by `(round, unitID, lap)`, Raid attack rate by `(stage, unitID, damageBand)`. Official/display positions and Foundry production are pure arithmetic projections over logical-time intervals; no random or civil-time API participates.

6. **The destructive 20,000-event cap must be removed.** A generic server cannot summarize an arbitrary future format's fold without learning that format's state. A current source snapshot is also insufficient: it loses Foundry productivity/repair history and F1/Raid lifecycle history. This plan therefore retains the complete in-process journal and tests replay beyond 20,000 source events. A bounded-memory design would require a lossless cold event archive or a product decision to permit format-owned checkpoints; neither is needed for this process-lifetime dashboard migration.

7. **F1 and Raid interpret the same neutral log independently.** No `lap-completed`, `damage-dealt`, `boss-hit`, or other derived event is added. The folds deliberately have separate state and rules files, even where today's numeric pacing matches, so a later Raid rule change cannot silently alter F1.

8. **Preserve URL and UI behavior at the adapter boundary.** Keep the DOM skeleton, CSS classes, focus protocol, circuit renderer, Raid scene, Foundry stations, labels, overlays, and current registry keys. Replace only their data source: components receive a format-local view getter instead of `SyncMessage`. Add fixture golden assertions and manual refresh/reconnect/multi-tab verification.

### Important trade-offs

- Full replay favors correctness and server neutrality over bounded memory and constant reconnect latency. Because 4 Hz ticks are no longer journaled, the design avoids 345,600 clock records per day; growth is proportional only to actual joins, departures, status/profile changes, connection changes, and first-snapshot boundary facts rather than session duration. A session that truly accumulates tens of thousands of source changes still pays full reconnect payload/replay cost; that is an explicit process-lifetime trade-off, not hidden behind lossy compaction.
- F1 and Raid folds duplicate a modest amount of lifecycle arithmetic. That duplication is intentional: sharing a hidden “progress race” owner would recreate the coupling this migration removes.
- `advanceF1To` and `advanceRaidTo` must be partition-independent and consume leftover elapsed time across finish/result/next-round boundaries. This removes the legacy `RaceSession` behavior that discarded the remainder of the finishing 250 ms tick; the maximum observable timing change is one old broadcast quantum, while refresh/reconnect no longer depends on tick partitioning.
- The CLI/package name and legacy fixture aliases remain for compatibility even though their names predate the neutral architecture; no game rule depends on those strings.

---

## File Structure

| File | Change | Responsibility after this plan |
|---|---|---|
| `src/shared/events.ts` | modify | Complete neutral fact vocabulary and join/profile/order types |
| `src/shared/deterministic.ts` | create | FNV-1a `stableHash` used for repeatable identities/seeds |
| `src/shared/presentation.ts` | reduce | Keep only `AgentStatus` and `ConnectionState` source types |
| `src/shared/protocol.ts` | modify | Event-only messages plus neutral `timelineTime`/`timelineRate` cursor |
| `src/shared/rules.ts` | delete | Progress rules move into F1/Raid directories |
| `src/server/event-log.ts` | rewrite | Lossless seq-assigned journal; no destructive cap |
| `src/server/event-session.ts` | create | Source diffing plus capped/scaled cumulative logical clock ownership |
| `src/server/session-hub.ts` | delete at cutover | Temporary dual feed removed |
| `src/server/race-session.ts` | delete at cutover | Legacy game-state owner removed |
| `src/server/rules.ts` | delete at cutover | Game rules move to formats; hash moves to shared helper |
| `src/server/broadcaster.ts` | modify | Advance `EventSession`; send only history/event deltas |
| `src/server/fixtures.ts` | modify | Drive a neutral fixture sink; keep public fixture aliases |
| `src/server/cli.ts` | modify | Construct one `EventSession`; apply `--speed` to its neutral cursor rate |
| `src/web/event-source.ts` | modify | Contiguous seq validation, reset replay, delta dedupe |
| `src/web/format.ts` | modify | Mandatory event-fed format contract; no `SyncMessage` render input |
| `src/web/main.ts` | modify | Format factory registry; render immediately after each folded batch |
| `src/web/state.ts` | delete | Placement extrapolation becomes format-local |
| `src/web/palette.ts` | modify | Own `TeamColorToken`; accept neutral status parameters |
| `src/web/formats/f1/rules.ts` | create | F1 constants, seeded pace, number/color allocation rules |
| `src/web/formats/f1/fold.ts` | create | Authoritative F1 event fold and lifecycle |
| `src/web/formats/f1/view.ts` | create | Pure `F1State -> F1View` ranking/placement projection |
| `src/web/formats/f1/{index,chrome,standings,track,vocabulary}.ts` | modify | Render the local F1 view without `SyncMessage` game fields |
| `src/web/formats/raid/rules.ts` | create | Raid constants and seeded attack-rate rules |
| `src/web/formats/raid/fold.ts` | create | Authoritative Raid event fold and lifecycle |
| `src/web/formats/raid/view.ts` | create | Pure `RaidState -> RaidView` ranking/placement projection |
| `src/web/formats/raid/{index,chrome,standings,scene,vocabulary}.ts` | modify | Render the local Raid view without `SyncMessage` game fields |
| `src/web/formats/foundry/{fold,index,chrome,standings,scene}.ts` | modify | Fold connection/profile facts, project production at `timelineTime`, use factory/getter contract |
| `tests/helpers/events.ts` | create | Typed event builders and replay helpers |
| `tests/event-log.test.ts` | rewrite | Seq, full retention, defensive copies |
| `tests/event-session.test.ts` | create | Diff ordering, metadata, cumulative timeline cap/rate/freeze, snapshot boundary |
| `tests/event-source.test.ts` | expand | History reset, overlap, gaps, empty-delta timeline updates, reconnect |
| `tests/formats-f1-fold.test.ts` | create | Port all F1 state/lifecycle/scoring assertions to the browser fold |
| `tests/formats-f1-determinism.test.ts` | create | Replay, partition, >20k, exact identity fixture golden |
| `tests/formats-raid-fold.test.ts` | create | Raid damage/HP/stage/lifecycle/state independence |
| `tests/formats-raid-determinism.test.ts` | create | Replay, >20k, seeded rate, F1/Raid isolation |
| `tests/foundry-fold.test.ts` | expand | Neutral event rename/profile handling and cursor-based production regressions |
| `tests/broadcaster.test.ts` | rewrite | Event-only history/sync behavior |
| `tests/server.test.ts` | modify | WS contract contains events but no presentation |
| `tests/fixtures.test.ts` | rewrite | Fold fixture journals into each format and assert public scenarios |
| `tests/race-session-*.test.ts` | delete after ports pass | Replaced by format-fold tests |
| `tests/rules.test.ts` | split/replace | Neutral hash plus local F1/Raid rule tests |
| `tests/state.test.ts` | delete/port | Extrapolation assertions move to format view tests |
| `README.md` | modify | Document browser-owned folds and current `?game=foundry`; remove server-state ownership claim |

---

### Task 1: Neutral authoritative journal and cumulative logical timeline

**Files:**
- Modify: `src/shared/events.ts`
- Create: `src/shared/deterministic.ts`
- Modify temporarily: `src/shared/protocol.ts`
- Rewrite: `src/server/event-log.ts`
- Create: `src/server/event-session.ts`
- Modify temporarily: `src/server/session-hub.ts`
- Modify temporarily: `src/server/broadcaster.ts`
- Modify temporarily: `src/server/cli.ts`
- Modify temporarily: `src/server/fixtures.ts`
- Modify mechanically: `src/web/formats/foundry/fold.ts`
- Test: `tests/event-log.test.ts`
- Create test: `tests/event-session.test.ts`
- Create test: `tests/deterministic.test.ts`
- Modify test: `tests/broadcaster.test.ts`
- Modify test: `tests/fixtures.test.ts`
- Modify test fixtures: `tests/event-source.test.ts`
- Modify test: `tests/foundry-fold.test.ts`
- Modify helper: `tests/helpers/session.ts`

**Interfaces:**
- Produces `stableHash(value: string): bigint` from `src/shared/deterministic.ts`.
- Produces `EventTeam`, `EventUnitProfile`, `EventUnit`, `GameEventBody`, and `GameEvent` from `src/shared/events.ts`.
- Produces `createEventLog(): EventLog`, where `EventLog` has `append(at, bodies)`, `history()`, `eventsSince(seq)`, and `lastSeq()`.
- Produces `createEventSession(log?, initialRate?)`, with `apply`, `applySnapshot`, `applyConnection`, `advance`, `setRate`, `timelineTime`, `timelineRate`, and `log`.
- Temporarily extends both existing protocol messages with `timelineTime: number` and `timelineRate: number` while retaining legacy `GamePresentation` fields until the atomic Task 5 cutover.
- During migration only, `createSessionHub(race, events)` feeds both owners. Its `advance` and `setTimeScale` must call both.
- Temporarily change the broadcaster surface to `createRaceBroadcaster(session: Pick<RaceSession, 'advance' | 'presentation'>, clock, events: EventSession, tickMs?)`. CLI passes the hub as `session` and the same `EventSession` as `events`; tests must not pass the raw `RaceSession`, because that would leave `timelineTime` frozen during broadcaster ticks.
- Change `loadFixture` to return `{ finalNow: number }` in addition to driving its sink. `finalNow` is the last monotonic sample passed to either owner; CLI aligns the post-fixture broadcaster clock to it. Do not derive the wall-clock anchor from `GameEvent.at`, because `at` is now scaled logical time and is intentionally a different domain.

- [ ] **Step 1: Establish the baseline commit if the repository still has no `HEAD`**

Run:

```bash
git rev-parse HEAD >/dev/null 2>&1 || { git add -A && git commit -m "chore: baseline before F1 and Raid event-fold migration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"; }
```

Expected: either the existing `HEAD` is printed or one baseline commit is created. Do not run this after implementation files have been partially edited.

- [ ] **Step 2: Write failing event contract, log-retention, and timeline tests**

Use this exact event shape in `src/shared/events.ts`:

```ts
import type { AgentStatus, ConnectionState } from './presentation.js';

export interface EventTeam {
  id: string;
  label: string;
  sourceOrder: number;
  stableOrder: number;
}

export interface EventUnitProfile {
  teamID: string;
  tabLabel: string;
  agentKind: string;
  isFocused: boolean;
}

export interface EventUnit extends EventUnitProfile {
  id: string;
  status: AgentStatus;
  sourceOrder: number;
  stableOrder: number;
}

export type GameEventBody =
  | { kind: 'connection-changed'; connection: ConnectionState }
  | { kind: 'team-joined'; team: EventTeam }
  | { kind: 'team-updated'; teamID: string; label: string }
  | { kind: 'unit-joined'; unit: EventUnit }
  | { kind: 'unit-profile-changed'; unitID: string; profile: EventUnitProfile }
  | { kind: 'unit-departed'; unitID: string }
  | { kind: 'status-changed'; unitID: string; from: AgentStatus; to: AgentStatus }
  | { kind: 'unit-session-restarted'; unitID: string }
  | { kind: 'snapshot-applied' };

/** `at` is cumulative accepted logical session time, not civil time. */
export type GameEvent = { seq: number; at: number } & GameEventBody;
```

In `src/shared/protocol.ts`, add the cursor once and make both legacy-compatible messages carry it:

```ts
export interface TimelineCursor {
  timelineTime: number;
  timelineRate: number;
}

export type SyncMessage = TimelineCursor &
  { type: 'sync'; serverTime: number; events: GameEvent[] } & GamePresentation;

export interface HistoryMessage extends TimelineCursor {
  type: 'history';
  serverTime: number;
  droppedBefore: number; // removed with legacy presentation in Task 5
  events: GameEvent[];
}
```

Add focused tests with these assertions:

```ts
it('retains a complete prefix after 20,000 events', () => {
  const log = createEventLog();
  for (let index = 0; index < 20_005; index += 1) {
    log.append(index + 1, [{
      kind: 'status-changed', unitID: 't1',
      from: index % 2 === 0 ? 'working' : 'idle',
      to: index % 2 === 0 ? 'idle' : 'working',
    }]);
  }
  expect(log.history()).toHaveLength(20_005);
  expect(log.history()[0].seq).toBe(1);
  expect(log.history().at(-1)?.seq).toBe(20_005);
});

it('advances a capped/scaled timeline without appending tick events', () => {
  const session = createEventSession(createEventLog(), 5);
  session.applyConnection({ kind: 'live' }, 0);
  session.advance(0); // re-anchor after the connection transition
  session.advance(100);
  expect(session.timelineTime()).toBe(5); // one-second cap x rate 5
  expect(session.log.history()).toHaveLength(1); // connection only
  session.setRate(2);
  session.advance(100.5);
  expect(session.timelineTime()).toBe(6);
  expect(session.timelineRate()).toBe(2);
  session.applyConnection({ kind: 'offline' }, 100.5);
  session.advance(200);
  expect(session.timelineTime()).toBe(6);
  expect(session.log.history().at(-1)).toMatchObject({
    kind: 'connection-changed', at: 6,
  });
});

it('emits profile and team changes that the old log lost', () => {
  const session = createEventSession();
  session.applySnapshot(snap(team('ws-1', 'alpha', [
    agent('t1', 'working', { isFocused: false }),
  ])), 0);
  session.applySnapshot(snap(team('ws-2', 'beta', [
    agent('t1', 'working', { isFocused: true, tabLabel: 'renamed' }),
  ])), 0);
  expect(session.log.history()).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'team-joined', team: expect.objectContaining({ id: 'ws-2' }) }),
    expect.objectContaining({
      kind: 'unit-profile-changed', unitID: 't1',
      profile: expect.objectContaining({ teamID: 'ws-2', tabLabel: 'renamed', isFocused: true }),
    }),
  ]));
});
```

Also assert that first-ever teams receive `sourceOrder` in snapshot order and `stableOrder` in ID order; first-ever units use snapshot traversal for `sourceOrder`, terminal-ID order for `stableOrder`; emitted joins are sorted by `stableOrder` while carrying both ordinals; only the first authoritative snapshot ends with `snapshot-applied`; a repeated identical snapshot emits nothing; `null -> sessionRef` emits no restart while replacement of one non-null reference with another emits `unit-session-restarted`. Cover a departed unit returning with a changed non-null session reference: emit its `unit-joined` first and `unit-session-restarted` second so F1/Raid restore identity before applying the restart treatment. Mechanically rename existing `stint-started` fixtures and Foundry's completion switch case in this task so the neutral union compiles; do not otherwise change Foundry behavior until Task 5.

In `tests/broadcaster.test.ts`, keep legacy presentation assertions for this migration task and add:

```ts
const seqBefore = eventSession.log.lastSeq();
const timelineBefore = eventSession.timelineTime();
setNow(0.25);
broadcaster.tick();
const message = sent.at(-1) as SyncMessage;
expect(message.timelineTime).toBeCloseTo(
  timelineBefore + 0.25 * eventSession.timelineRate(), 9,
);
expect(message.timelineRate).toBe(eventSession.timelineRate());
expect(eventSession.log.lastSeq()).toBe(seqBefore);
expect(message.events).toEqual([]);
```

Add `timelineTime: 0, timelineRate: 1` to the temporary `history(...)` and `sync(...)` message builders in `tests/event-source.test.ts` so the new required protocol fields typecheck before Task 2 expands their behavior.

- [ ] **Step 3: Run the focused tests and confirm failure**

Run:

```bash
npx vitest run tests/event-log.test.ts tests/event-session.test.ts tests/deterministic.test.ts
```

Expected: FAIL because `event-session.ts`, `deterministic.ts`, the expanded event variants, and lossless journal API do not exist.

- [ ] **Step 4: Implement the lossless journal and event session**

Implement the journal with this exact surface and no cap parameter:

```ts
export function createEventLog() {
  const events: GameEvent[] = [];
  let nextSeq = 1;

  function append(at: number, bodies: readonly GameEventBody[]): GameEvent[] {
    const appended = bodies.map(body => ({ seq: nextSeq++, at, ...body }));
    events.push(...appended);
    return appended;
  }

  const history = (): GameEvent[] => structuredClone(events);
  const eventsSince = (seq: number): GameEvent[] =>
    structuredClone(events.filter(event => event.seq > seq));
  const lastSeq = (): number => nextSeq - 1;
  return { append, history, eventsSince, lastSeq };
}
```

`createEventSession` must follow this ordering on every input:

1. `advance(now)` calculates `accepted = min(max(now - lastTick, 0), 1)`. When connection is `live`, add `accepted * rate` to private cumulative `timelineTime`; never append an event for this operation.
2. `applySnapshot(snapshot, now)` and `applyConnection(state, now)` call `advance(now)` first so their emitted events are stamped at the exact accepted logical time.
3. On a connection change, append `connection-changed` at `timelineTime`, replace the connection, and clear `lastTick` so frozen wall time is excluded after reconnect.
4. On a snapshot, assign every unseen team/unit ordinal before emitting. Emit unseen team joins in `stableOrder`, team updates, existing-unit status/session-restart/profile changes, first/rejoining unit joins in `stableOrder` (followed by a restart event when the rejoin replaced a known non-null session reference), and departures in stable ID order; append `snapshot-applied` only at the end of the first authoritative snapshot. Stamp every event in that snapshot batch with the same `timelineTime`; a repeated identical snapshot emits nothing. Carry `sourceOrder` in the facts so Foundry keeps source traversal identity even though stable emission order serves F1/Raid collision probing.
5. `setRate(rate)` validates `rate > 0`, changes the private rate without appending an event, and affects subsequent accepted wall-time deltas. CLI calls it only after deterministic fixture pre-roll.
6. Expose `timelineTime(): number` and `timelineRate(): number`; never read civil time internally because every wall-time sample arrives through a method argument.

Move the current FNV-1a implementation verbatim from `src/server/rules.ts` to `src/shared/deterministic.ts`; update imports without changing its known vectors.

Temporarily update `SessionHub` so `apply*`, `advance`, and `setTimeScale` reach both `RaceSession` and `EventSession`. Construct `eventSession`, then `hub = createSessionHub(raceSession, eventSession)`, then `createRaceBroadcaster(hub, gameClock, eventSession)`. The broadcaster calls `hub.advance`, reads `eventSession.log`, and stamps the cursor from `eventSession`; this keeps both temporary owners on one accepted clock path. When a fixture is loaded, compute `fixtureClockOffset` from `loadFixture(...).finalNow`, never from the last event timestamp. Do not let F1/Raid consume the new timeline yet; `RaceSession` remains the sole production game authority until Task 5.

The old `HistoryMessage.droppedBefore` field remains until Task 5; while the journal is already lossless, the temporary broadcaster sends the constant `1` rather than calling a removed `EventLog.droppedBefore()` method. Both temporary message builders include `timelineTime: eventSession.timelineTime()` and `timelineRate: eventSession.timelineRate()` so Task 5 can switch browser ownership and remove the server owner in one change.

- [ ] **Step 5: Verify the focused and baseline server tests**

Run:

```bash
npx vitest run tests/event-log.test.ts tests/event-session.test.ts tests/deterministic.test.ts tests/session-hub.test.ts tests/broadcaster.test.ts tests/fixtures.test.ts tests/foundry-fold.test.ts
npm run typecheck
```

Expected: all listed tests pass; TypeScript is silent. The legacy F1/Raid presentation remains unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/shared/events.ts src/shared/deterministic.ts src/shared/protocol.ts src/server/event-log.ts src/server/event-session.ts src/server/session-hub.ts src/server/broadcaster.ts src/server/cli.ts src/server/fixtures.ts src/web/formats/foundry/fold.ts tests/event-log.test.ts tests/event-session.test.ts tests/deterministic.test.ts tests/session-hub.test.ts tests/broadcaster.test.ts tests/event-source.test.ts tests/fixtures.test.ts tests/foundry-fold.test.ts tests/helpers/session.ts
git commit -m "feat: record neutral source journal and logical timeline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Contiguous browser event delivery

**Files:**
- Modify: `src/web/event-source.ts`
- Modify: `tests/event-source.test.ts`

**Interfaces:**
- Produces `createEventSource(onUpdate, onGap)`.
- `onUpdate(events, reset, cursor)` receives only contiguous, seq-ascending data plus `{ timelineTime, timelineRate }` from the same server message.
- A valid `sync` invokes `onUpdate` even when `events` is empty, because advancing the neutral timeline must update F1/Raid/Foundry without growing history.
- `onGap(expectedSeq, receivedSeq)` requests reconnect; a partial batch is never folded.
- Test builders use `history(events, timelineTime = events.at(-1)?.at ?? 0, timelineRate = 1)` and the analogous `sync` helper so every default cursor is at least the batch's last event time while cursor-specific cases can override it explicitly.

- [ ] **Step 1: Write failing reset/dedupe/gap tests**

Add these cases:

```ts
it('rejects an incomplete history prefix', () => {
  const gaps: Array<[number, number]> = [];
  const source = createEventSource(() => {}, (expected, received) => gaps.push([expected, received]));
  source.ingest(history([ev(2)]));
  expect(gaps).toEqual([[1, 2]]);
});

it('does not fold a delta with an internal gap', () => {
  const batches: GameEvent[][] = [];
  const gaps: Array<[number, number]> = [];
  const source = createEventSource((events) => batches.push(events),
    (expected, received) => gaps.push([expected, received]));
  source.ingest(history([ev(1)]));
  source.ingest(sync([ev(2), ev(4)]));
  expect(batches).toEqual([[ev(1)]]);
  expect(gaps).toEqual([[3, 4]]);
});

it('forwards an empty delta when only timelineTime advances', () => {
  const updates: Array<{ count: number; time: number }> = [];
  const source = createEventSource((events, _reset, cursor) => {
    updates.push({ count: events.length, time: cursor.timelineTime });
  }, () => {});
  source.ingest(history([ev(1)], 5));
  source.ingest(sync([], 6));
  expect(updates).toEqual([{ count: 1, time: 5 }, { count: 0, time: 6 }]);
});
```

Retain tests for history reset, history/sync overlap, stale delta suppression, empty history, and a second history after reconnect.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/event-source.test.ts`

Expected: FAIL because the existing source neither accepts `onGap` nor validates contiguity.

- [ ] **Step 3: Implement contiguous ingestion**

Use a `cursor: number | null`, validate history starts at seq 1 and every adjacent pair increments by one, reset the cursor only after validation, filter stale sync overlap, then validate every fresh seq from `cursor + 1`. Call `onGap` and return without `onUpdate` on the first mismatch. After a valid message, call `onUpdate(freshOrHistory, reset, { timelineTime: message.timelineTime, timelineRate: message.timelineRate })` even when `freshOrHistory` is empty.

The core loop must be:

```ts
function contiguous(events: readonly GameEvent[], expected: number): boolean {
  for (const event of events) {
    if (event.seq !== expected) {
      onGap(expected, event.seq);
      return false;
    }
    expected += 1;
  }
  return true;
}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npx vitest run tests/event-source.test.ts
npm run typecheck
```

Expected: all event-source tests pass.

```bash
git add src/web/event-source.ts tests/event-source.test.ts
git commit -m "fix: reject incomplete event history and deltas

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: F1 format-owned deterministic fold

**Files:**
- Create: `src/web/formats/f1/rules.ts`
- Create: `src/web/formats/f1/fold.ts`
- Create: `src/web/formats/f1/view.ts`
- Create: `tests/helpers/events.ts`
- Create: `tests/formats-f1-fold.test.ts`
- Create: `tests/formats-f1-determinism.test.ts`
- Keep unchanged in this task: `src/web/formats/f1/index.ts`, `chrome.ts`, `standings.ts`, `track.ts`, `vocabulary.ts`

**Interfaces:**
- `initialF1State(): F1State`
- `advanceF1To(state: F1State, timelineTime: number): F1State`
- `setF1Cursor(state: F1State, cursor: TimelineCursor): F1State`
- `foldF1(state: F1State, event: GameEvent): F1State` advances to `event.at`, then applies the discrete fact.
- `replayF1(events: readonly GameEvent[]): F1State`
- `projectF1(state: F1State): F1View`
- `seededF1Pace(round: number, unitID: string, lap: number): number` in F1-local `rules.ts`, ported exactly from the current server algorithm.
- `F1View` supplies exactly the fields consumed by F1 chrome/standings/track, but uses F1-local types rather than `GamePresentation`.
- `tests/helpers/events.ts` produces `eventHistory(...entries: Array<readonly [at: number, body: GameEventBody]>): GameEvent[]` plus body factories `teamJoined`, `unitJoined`, `snapshotApplied`, and `connectionChanged`. It assigns seq from 1 and stamps each body with the tuple's explicit logical time.

Define the local state boundary explicitly:

```ts
export interface F1CarState {
  id: string;
  number: number;
  teamID: string;
  tabLabel: string;
  agentKind: string;
  status: AgentStatus;
  isFocused: boolean;
  sourceOrder: number;
  stableOrder: number;
  officialLaps: number;
  displayLaps: number;
  pace: { multiplier: number; lap: number };
  departed: boolean;
  queued: boolean;
  incidentInPit: boolean;
  newStintUntil: number | null;
}

export interface F1State {
  phase: 'formation' | 'race' | 'podium';
  round: number;
  timelineTime: number;
  timelineRate: number;
  raceTime: number;
  podiumElapsed: number;
  connection: ConnectionState;
  hasSnapshot: boolean;
  teams: Map<string, F1TeamState>;
  cars: Map<string, F1CarState>;
  result: F1Result | null;
}
```

- [ ] **Step 1: Port the legacy state tests before writing the fold**

Move every behavioral assertion from these files into F1 fold/view tests, changing only the subject under test:

- `tests/race-session-scoring.test.ts`: working rate, cursor-rate display multiplier, pace boundary, idle/done/blocked behavior, pit incident, offline freeze, initial formation.
- `tests/race-session-lifecycle.test.ts`: number/color stability, collision probing, late join deficit, departure/rejoin, team move, stint timeout, focus.
- `tests/race-session-podium.test.ts`: earliest finisher, frozen podium, eight-second next round, retired cleanup, podium queue, exact team sum/rank.
- `tests/rules.test.ts`: F1 constants and seeded pace.

Drive time with the explicit neutral cursor rather than periodic events:

```ts
const state = replayF1(eventHistory(
  [0, teamJoined('ws-1', 'alpha')],
  [0, unitJoined('t1', 'ws-1', 'working')],
  [0, snapshotApplied()],
  [0, connectionChanged({ kind: 'live' })],
));
setF1Cursor(state, { timelineTime: 9, timelineRate: 1 });
expect(projectF1(state).entries.get('t1')?.officialLaps).toBeCloseTo(
  9 * F1Rules.baseSpeed * seededF1Pace(1, 't1', 0), 9,
);
```

Add a partition-independence test: advancing one state directly from 0 to 2,100 and another through 0.25-second cursor updates must produce the same normalized state, including any finish, podium remainder, and next-round progress crossed in that interval. Assert two fresh history replays are also deeply equal after converting Maps to sorted arrays.

- [ ] **Step 2: Add exact fixture identity and >20k replay tests**

Use the current `grid` golden values:

```ts
expect(view.round).toBe(1);
expect(view.leaderProgress).toBeCloseTo(22.288381800238046, 9);
expect(view.teams.map(team => [team.id, team.rank, team.colorToken])).toEqual([
  ['ws-infra', 1, { kind: 'palette', slot: 4 }],
  ['ws-pet', 2, { kind: 'palette', slot: 1 }],
  ['ws-herdr', 3, { kind: 'palette', slot: 0 }],
  ['ws-console', 4, { kind: 'palette', slot: 11 }],
]);
expect([...view.entries.values()].map(entry => [entry.id, entry.number]).sort()).toEqual([
  ['t1', 36], ['t10', 32], ['t11', 6], ['t12', 84], ['t2', 62], ['t3', 88],
  ['t4', 5], ['t5', 31], ['t6', 57], ['t7', 83], ['t8', 99], ['t9', 26],
]);
```

Construct a 20,005-event journal with one initial snapshot and alternating timestamped status facts (not clock ticks), set both states to the same final cursor, and assert `replayF1(log.history())` equals incrementally folding every appended event. This is the acceptance test for refresh after the old cap without making history proportional to uptime.

- [ ] **Step 3: Run and confirm failure**

Run:

```bash
npx vitest run tests/formats-f1-fold.test.ts tests/formats-f1-determinism.test.ts
```

Expected: FAIL because the F1 rules/fold/view modules do not exist.

- [ ] **Step 4: Implement F1-local rules and fold**

Copy the current numeric behavior without importing from `src/server/`:

```ts
export const F1Rules = {
  totalLaps: 58,
  baseLapDuration: 18,
  baseSpeed: 1 / 18,
  paceMin: 0.75,
  paceMax: 1.25,
  doneCooldownFactor: 0.25,
  podiumDuration: 8,
  newEntrantDeficit: 0.15,
  newStintDuration: 4,
  paletteSize: 12,
  maximumGridNumber: 99,
} as const;
```

`advanceF1To` and `foldF1` must behave as follows:

- `advanceF1To(target)`: reject a target below `state.timelineTime`; consume the full non-negative delta in a loop. In race phase, stop exactly at the earliest finisher, freeze the result, then spend any remaining delta in podium. In podium phase, stop exactly at eight seconds, reset the next grid, then spend any remaining delta in the next race. Continue until no delta remains. This makes one large projection identical to any partition of that projection.
- `setF1Cursor`: call `advanceF1To(cursor.timelineTime)`, then set `timelineRate`; use the rate only for projected `displaySpeed`, never official progress.
- `connection-changed`: replace connection. Offline time is already excluded because server `timelineTime` does not advance while disconnected.
- `team-joined`/`team-updated`: preserve source order, label, and stable hash/probed color token.
- first `unit-joined`: allocate the hash/probed number in `stableOrder`; initial official/display progress is zero before first `snapshot-applied`, current-last-minus-0.15 during a race, and queued during podium.
- rejoin: clear `departed`, replace profile/status, keep number/progress.
- `unit-profile-changed`: transfer team and update label/kind/focus without changing progress or identity.
- `status-changed`: preserve the existing `incidentInPit` rule.
- `unit-session-restarted`: set F1-local `newStintUntil = raceTime + 4`.
- `unit-departed`: freeze and mark departed until next round cleanup.
- first `snapshot-applied`: reset the complete initial grid, distribute initial done/blocked display positions deterministically, and enter the race phase.

`projectF1` must be pure. Quantize only comparisons with `Math.round(value * 1e6)`, preserve exact sums in output, rank teams by summed official laps then `sourceOrder` then ID, rank cars by official laps then number then ID, and derive placement/display speed/results without mutating state. Working display speed is `baseSpeed * pace.multiplier * timelineRate`; done cars and all cars during podium use `baseSpeed * doneCooldownFactor * timelineRate`; inactive/offline cars use zero.

- [ ] **Step 5: Verify focused tests and static purity**

Run:

```bash
npx vitest run tests/formats-f1-fold.test.ts tests/formats-f1-determinism.test.ts tests/formats-f1-vocabulary.test.ts
npm run typecheck
rg -n "Math\.random|Date\.now|new Date" src/web/formats/f1
```

Expected: all tests pass; typecheck is silent; `rg` prints no matches.

- [ ] **Step 6: Commit**

```bash
git add src/web/formats/f1/rules.ts src/web/formats/f1/fold.ts src/web/formats/f1/view.ts tests/helpers/events.ts tests/formats-f1-fold.test.ts tests/formats-f1-determinism.test.ts
git commit -m "feat: rebuild F1 state from neutral events

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Raid format-owned deterministic fold

**Files:**
- Create: `src/web/formats/raid/rules.ts`
- Create: `src/web/formats/raid/fold.ts`
- Create: `src/web/formats/raid/view.ts`
- Create: `tests/formats-raid-fold.test.ts`
- Create: `tests/formats-raid-determinism.test.ts`
- Keep unchanged in this task: `src/web/formats/raid/index.ts`, `chrome.ts`, `standings.ts`, `scene.ts`, `vocabulary.ts`

**Interfaces:**
- `initialRaidState(): RaidState`
- `advanceRaidTo(state: RaidState, timelineTime: number): RaidState`
- `setRaidCursor(state: RaidState, cursor: TimelineCursor): RaidState`
- `foldRaid(state: RaidState, event: GameEvent): RaidState` advances to `event.at`, then applies the discrete fact.
- `replayRaid(events: readonly GameEvent[]): RaidState`
- `projectRaid(state: RaidState): RaidView`
- `seededRaidAttackRate(stage: number, unitID: string, damageBand: number): number` in Raid-local `rules.ts`. It copies the current seeded algorithm using Raid-local terms and, for equal numeric inputs, intentionally returns the same multiplier as F1 so the initial Raid presentation does not jump during migration.
- No Raid file imports F1 state, rules, view, or vocabulary.

Use local semantic names:

```ts
export interface RaiderState {
  id: string;
  number: number;
  guildID: string;
  status: AgentStatus;
  officialDamage: number;
  displayOrbit: number;
  attackRate: { multiplier: number; damageBand: number };
  felled: boolean;
  queued: boolean;
  stunnedAtCamp: boolean;
  respawnUntil: number | null;
  // profile/order fields match EventUnit exactly
}

export interface RaidState {
  phase: 'summoning' | 'battle' | 'bossDown';
  stage: number;
  timelineTime: number;
  timelineRate: number;
  battleTime: number;
  bossDownElapsed: number;
  connection: ConnectionState;
  hasSnapshot: boolean;
  guilds: Map<string, GuildState>;
  raiders: Map<string, RaiderState>;
  result: RaidResult | null;
}
```

- [ ] **Step 1: Write failing Raid fold tests**

Cover these exact behaviors:

- Projecting the neutral cursor from 0 to 9 at rate 1 yields `9 * baseDamageRate * seededRaidAttackRate(1, id, 0)` damage without adding an event.
- idle, blocked, departed, and queued raiders do not add official damage; done only advances display orbit at quarter speed.
- boss HP is `max(0, 1 - leaderDamage / 58)` and reaching 58 freezes the result.
- boss-down lasts eight accepted seconds, then stage increments and present raiders reset.
- raiders joining during boss-down queue for the next wave.
- guild rank is exact summed damage; raider rank is individual damage.
- workspace move preserves damage/number and changes guild.
- focus/profile/session-restart/depart/rejoin semantics are retained.
- same `{ history, timelineTime, timelineRate }` replay is deep-equal; F1 and Raid states are distinct objects and mutating one test fixture cannot affect the other.
- direct projection across boss-down/stage boundaries equals 0.25-second partitioned projection.
- a 20,005-source-event history plus the same final cursor produces the same Raid state as incremental folding.

The independence test must include:

```ts
const f1 = replayF1(events);
const raid = replayRaid(events);
setF1Cursor(f1, cursor);
setRaidCursor(raid, cursor);
expect(projectF1(f1).leaderProgress).toBeCloseTo(projectRaid(raid).leaderDamage, 9);
expect(projectRaid(raid).bossHpFraction).toBeCloseTo(
  1 - projectF1(f1).leaderProgress / 58, 9,
);
expect(f1).not.toBe(raid);
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
npx vitest run tests/formats-raid-fold.test.ts tests/formats-raid-determinism.test.ts
```

Expected: FAIL because the Raid rules/fold/view modules do not exist.

- [ ] **Step 3: Implement Raid-local rules and fold**

Keep current observable pacing values, but use Raid-local names:

```ts
export const RaidRules = {
  bossHealth: 58,
  baseDamageDuration: 18,
  baseDamageRate: 1 / 18,
  attackRateMin: 0.75,
  attackRateMax: 1.25,
  victoryOrbitFactor: 0.25,
  bossDownDuration: 8,
  newcomerDeficit: 0.15,
  respawnDuration: 4,
  paletteSize: 12,
  maximumRaiderNumber: 99,
} as const;
```

Implement all discrete event cases directly in `foldRaid`. `advanceRaidTo` samples a deterministic multiplier at each integer damage boundary using `(stage, unitID, damageBand)`, stops exactly at the earliest raider to reach 58, freezes official damage during boss-down, advances only display orbit for working/done survivors, consumes any leftover cursor delta through the eight-second boss-down boundary, and resets present raiders before continuing the next stage. Do not call F1 helpers.

`setRaidCursor` advances to `cursor.timelineTime` and stores `cursor.timelineRate` only for display attack rate. `projectRaid` derives the boss HP, guild/raider rankings, camp/orbit/bench placement, display attack rate, connection overlays, and frozen MVP result without mutating `RaidState`. Working attack display rate uses `baseDamageRate * multiplier * timelineRate`; done/boss-down orbit uses `baseDamageRate * victoryOrbitFactor * timelineRate`; inactive/offline raiders use zero.

- [ ] **Step 4: Verify focused tests and static purity**

Run:

```bash
npx vitest run tests/formats-raid-fold.test.ts tests/formats-raid-determinism.test.ts tests/formats-raid-vocabulary.test.ts
npm run typecheck
rg -n "Math\.random|Date\.now|new Date" src/web/formats/raid
```

Expected: all tests pass; typecheck is silent; `rg` prints no matches.

- [ ] **Step 5: Commit**

```bash
git add src/web/formats/raid/rules.ts src/web/formats/raid/fold.ts src/web/formats/raid/view.ts tests/formats-raid-fold.test.ts tests/formats-raid-determinism.test.ts
git commit -m "feat: rebuild Raid state from neutral events

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Atomic browser/server cutover to format-owned folds

This task is intentionally one commit. Tasks 3 and 4 create tested but unregistered fold modules; production keeps using `RaceSession` until this task simultaneously wires those folds and deletes the legacy owner. Do not split the browser switch and server deletion into separate commits or run a production build from a partially completed worktree.

**Files:**
- Modify: `src/shared/protocol.ts`, `src/shared/presentation.ts`
- Delete: `src/shared/rules.ts`
- Modify: `src/server/broadcaster.ts`, `src/server/fixtures.ts`, `src/server/cli.ts`
- Delete: `src/server/race-session.ts`, `src/server/rules.ts`, `src/server/session-hub.ts`
- Modify: `src/web/format.ts`, `src/web/main.ts`, `src/web/palette.ts`
- Delete: `src/web/state.ts`
- Modify: `src/web/formats/f1/{index,chrome,standings,track,vocabulary}.ts`
- Modify: `src/web/formats/raid/{index,chrome,standings,scene,vocabulary}.ts`
- Modify: `src/web/formats/foundry/{index,fold,chrome,standings,scene}.ts`
- Create: `tests/format-factories.test.ts`
- Rewrite: `tests/broadcaster.test.ts`, `tests/fixtures.test.ts`
- Modify: `tests/server.test.ts`, `tests/foundry-fold.test.ts`
- Replace: `tests/rules.test.ts`
- Delete after port verification: `tests/race-session-lifecycle.test.ts`, `tests/race-session-scoring.test.ts`, `tests/race-session-podium.test.ts`, `tests/state.test.ts`

**Interfaces:**

Replace the browser format contract with:

```ts
export interface GameChrome { render(): void }
export interface GameStandings { render(): void }
export interface GameScene {
  commit(receivedAtMs: number): void;
  frame(nowMs: number): void;
  resize(): void;
}
export interface GameFormat {
  onEvents(events: readonly GameEvent[], reset: boolean): void;
  onTimeline(cursor: TimelineCursor): void;
  createChrome(): GameChrome;
  createStandings(el: HTMLElement, onFocus: (terminalID: string) => void): GameStandings;
  createScene(canvas: HTMLCanvasElement, onFocus: (terminalID: string) => void): GameScene;
}
```

Export `createF1Format`, `createRaidFormat`, and `createFoundryFormat`; each call owns fresh state. For DOM-free tests, export `createF1StateOwner`, `createRaidStateOwner`, and `createFoundryStateOwner` with `{ onEvents, onTimeline, view }`. Define `FoundryView` as `{ connection, timelineTime, timelineRate, teams: FoundryTeamProjection[] }`.

The final wire contract is:

```ts
import type { GameEvent } from './events.js';

export interface TimelineCursor {
  timelineTime: number;
  timelineRate: number;
}
export interface HistoryMessage extends TimelineCursor {
  type: 'history';
  serverTime: number;
  events: GameEvent[];
}
export interface SyncMessage extends TimelineCursor {
  type: 'sync';
  serverTime: number;
  events: GameEvent[];
}
export type ServerMessage = HistoryMessage | SyncMessage;
export type ClientMessage = { type: 'focus'; terminalID: string };
```

`src/shared/presentation.ts` retains only `AgentStatus` and `ConnectionState`. `createEventBroadcaster(session: EventSession, clock: () => number, tickMs = 250)` replaces `createRaceBroadcaster`.

- [ ] **Step 1: Write all cutover tests before changing production wiring**

In `tests/format-factories.test.ts`, assert reset/delta behavior, fresh owner isolation, and deep equality for equal history/cursor. Include:

```ts
it('projects Foundry production from timelineTime without tick events', () => {
  const owner = createFoundryStateOwner();
  owner.onEvents(workingHistoryAtZero, true);
  owner.onTimeline({ timelineTime: 5, timelineRate: 1 });
  expect(owner.view().teams[0].resources).toBe(10);
  owner.onTimeline({ timelineTime: 10, timelineRate: 1 });
  expect(owner.view().teams[0].resources).toBe(20);
});
```

Also prove that Foundry ignores differing transport `serverTime`, handles connection/team/profile facts, retains the `unit-session-restarted` completion reward, and treats `snapshot-applied` as scoring-neutral.

Rewrite protocol/broadcaster/server tests to assert:

- connect order is `history`, then `sync`;
- history starts at seq 1 and contains source facts plus the current cursor;
- sync keys are exactly `events`, `serverTime`, `timelineRate`, `timelineTime`, `type`;
- 4 Hz empty ticks advance `timelineTime` without changing `log.lastSeq()`;
- a late client receives >20,000 source events and the current cursor;
- after a client-free interval, the first client's history is not repeated as the next delta;
- focus routing is unchanged;
- no serialized message contains `teams`, `leaderProgress`, `officialProgress`, `phase`, `results`, or `round`.

Run:

```bash
npx vitest run tests/format-factories.test.ts tests/foundry-fold.test.ts tests/broadcaster.test.ts tests/server.test.ts tests/fixtures.test.ts
```

Expected: FAIL because format factories, event-only component signatures, and the final wire contract do not exist.

- [ ] **Step 2: Adapt all browser formats without compatibility wrappers**

- F1 owner resets to `initialF1State`, folds each event, applies `setF1Cursor`, and exposes `projectF1`. Replace `SyncMessage`/`EntryPresentation` component inputs with `F1View` getters. Preserve strings, aria labels, CSS, podium markup, pit transitions, focus hit testing, and draw order.
- Raid owner does the same with `RaidState`/`RaidView`. Preserve boss art, HP bar, projectiles, camp/bench placement, focus behavior, strings, and aria labels.
- Rename scene `setSync` to `commit`. F1/Raid scenes may use `performance.now()` only to interpolate the already folded display position at the view's display rate; interpolation never feeds the fold.
- Foundry folds connection/team/profile facts, keeps its interval/repair/completion formulas, uses `sourceOrder` for current colors/numbers, and projects at `cursor.timelineTime` instead of `sync.serverTime`. Convert the module singleton to a factory and render `FoundryView` getters.
- Move `TeamColorToken` to `src/web/palette.ts`; replace presentation-shaped palette helpers with neutral parameters.

- [ ] **Step 3: Perform the runtime ownership cutover in the same worktree change**

In `main.ts`, construct one format factory and render on every validated history/sync, including empty deltas:

```ts
const formatFactories: Record<string, () => GameFormat> = {
  f1: createF1Format,
  raid: createRaidFormat,
  foundry: createFoundryFormat,
};
const format = (formatFactories[requested] ?? createF1Format)();
const source = createEventSource((events, reset, cursor) => {
  format.onEvents(events, reset);
  format.onTimeline(cursor);
  hydrated = true;
  chrome.render();
  standings.render();
  scene.commit(performance.now());
}, () => socket?.close());
```

At the same time:

- finalize the event-only protocol above and remove `droppedBefore`/derived presentation types;
- rewrite broadcaster to advance only `EventSession`, publish `session.log`, and stamp both message types with the cursor;
- when `addClient` transitions from zero clients, move `broadcastSeq` to the sent history's last seq; never skip pending deltas when another client already exists;
- construct only `EventSession` in CLI, load fixture/live input into it, set rate after fixture pre-roll, and pass it to `createEventBroadcaster`;
- keep Task 1's `{ finalNow }` fixture clock alignment; never derive wall anchoring from logical `GameEvent.at`;
- reduce fixture input to a neutral `FixtureSink` containing `applySnapshot`, `applyConnection`, and `advance`;
- replace the `podium` fixture's `presentation().phase` loop with at-most-one-second advances from its 120-second source scenario through `finalNow = 1_028`; characterize first that this cursor yields F1 `podium` and Raid `bossDown`;
- import `stableHash` from the neutral shared helper and remove game terms from internal fixture variables, retaining public fixture aliases only;
- delete `RaceSession`, `SessionHub`, server/shared progress rules, and `src/web/state.ts` now—do not leave deprecated adapters or fallbacks.

- [ ] **Step 4: Replace legacy assertions before deleting their files**

Map every legacy race-session assertion to the Task 3/4 tests, then delete the old files. Port all four `tests/state.test.ts` interpolation cases to both format view suites before deletion. Rewrite `tests/fixtures.test.ts` to drive a fresh `EventSession`, fold its journal/cursor through F1, Raid, and Foundry, and assert grid identity/spread, dense patterns, redflag/error overlays, podium/boss-down, Foundry projection, and repeat-run equality. Replace `tests/rules.test.ts` with neutral FNV vectors plus F1/Raid-local rule assertions.

- [ ] **Step 5: Verify the atomic cutover and absence of a second owner**

Run:

```bash
npm test
npm run typecheck
npm run build
rg -n "Math\.random|Date\.now|new Date" src/web/formats/f1 src/web/formats/raid src/web/formats/foundry
rg -n "SyncMessage|GamePresentation|serverTime" src/web/formats/f1 src/web/formats/raid src/web/formats/foundry
rg -n "RaceSession|createRaceSession|createRaceBroadcaster|GamePresentation" src tests
rg -n "officialProgress|leaderProgress" src/shared src/server
rg -n "boss|damage|raid|lap|pace|podium|grandPrix|carNumber" src/shared src/server
```

Expected: tests/typecheck/build pass; the first four scans have no matches. The last scan may match only unchanged public fixture compatibility literals; inspect every match and reject any game event, rule, state field, protocol field, or runtime branch.

- [ ] **Step 6: Commit the one-owner cutover**

```bash
git add -A src/shared src/server src/web tests
git commit -m "refactor: move F1 and Raid authority to browser event folds

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end refresh, reconnect, multi-tab, and documentation regression gate

**Files:**
- Modify: `README.md`
- Modify: `tests/server.test.ts`
- Modify: `tests/event-source.test.ts` if end-to-end coverage exposes an untested reconnect edge
- Verify only: `src/web/index.html`, `src/web/style.css`, all format renderers

**Interfaces:**
- No new production interface.
- Documents the final ownership model and all three URLs.

- [ ] **Step 1: Add a full WebSocket replay/reconnect test**

Start an event session, connect two WebSocket clients at different times, collect `history` plus deltas/cursors, and feed each stream through a separate `createEventSource` and separate F1/Raid/Foundry state owner. After both clients have the same final seq, `timelineTime`, and `timelineRate`, assert their normalized logical views are deeply equal.

The test must cover:

- client A connects before the logical timeline advances;
- client B connects after status/focus/team-move events;
- client A disconnects, more events are appended, then reconnects and resets from history;
- duplicated overlap in the first sync is ignored;
- several timeline-only syncs contain `events: []` and advance F1/Raid/Foundry without increasing event seq;
- final F1 official positions/rank/round/result, Raid damage/HP/rank/stage/result, and Foundry resources/modules/repairs/worker identity are identical.

- [ ] **Step 2: Run the integration gate**

Run outside a restricted socket sandbox:

```bash
npx vitest run tests/server.test.ts tests/event-source.test.ts tests/formats-f1-determinism.test.ts tests/formats-raid-determinism.test.ts tests/foundry-fold.test.ts
```

Expected: all selected tests pass, including the late-tab/reconnect equality assertions.

- [ ] **Step 3: Update README ownership and URLs**

Document these exact facts:

- the server owns a process-lifetime neutral event journal, not F1/Raid state;
- every browser tab folds the complete journal and applies seq-contiguous deltas;
- `--speed` controls the rate at which capped wall time increases neutral `timelineTime`; it does not create log records;
- full history is retained beyond 20,000 events for correctness;
- `/`, `?game=f1`, `?game=raid`, and the current `?game=foundry` examples;
- Defense has been retired and is not a supported route; remove any stale Defense reference from current public documentation rather than adding a compatibility alias;
- process restart still starts a new journal; this plan does not add cross-process persistence.

Remove the current README sentence claiming the Node server owns race state.

- [ ] **Step 4: Manual fixture verification**

Build and start:

```bash
npm run build
node bin/herdr-f1.js start --no-open --fixture grid --speed 5 --port 41690
```

Verify in separate tabs:

1. `http://127.0.0.1:41690/` and `?game=f1` show the same cars, numbers, team colors, lap/rank, pit/incident/done states, focus treatment, and animations.
2. `?game=raid` shows the same unit identity/team colors interpreted as raiders/guilds, with HP/damage/stage matching the fold tests.
3. `?game=foundry` preserves station colors, worker numbers, resources, modules, hazards, repairs, completions, and orbital animation.
4. Refresh each tab: logical values are reconstructed from history and then projected to the history message's `timelineTime`; changes during reload come only from the legitimately advanced cursor, not replay duplication.
5. Open a second tab of each format and compare after the same latest seq and `timelineTime`: F1 position/rank/round, Raid damage/HP/rank/stage, and Foundry resources/modules all match.
6. Stop network delivery briefly and reconnect: the new history reset does not double-count laps, damage, Foundry productive time, repairs, or completions.
7. In F1 and Raid, click the existing marker/row focus targets and confirm the same terminal receives `agent.focus`; Foundry keeps its current non-interactive station behavior.
8. Repeat visual states with `--fixture dense`, `redflag`, `error`, and `podium`; default/unknown URL fallback remains F1.
9. Open `?game=defense` and confirm it follows the ordinary unknown-format fallback to F1; no Defense-specific module, registry entry, copy, or state is restored.

- [ ] **Step 5: Final automated and static gates**

Run:

```bash
npm test
npm run typecheck
npm run build
rg -n "Math\.random|Date\.now|new Date" src/web/formats/f1 src/web/formats/raid src/web/formats/foundry
rg -n "GamePresentation|RaceSession|createRaceSession|createRaceBroadcaster" src tests
rg -n "formats/defense|createDefense|defenseFormat|game=defense" src tests README.md
git status --short
```

Expected: all tests pass, typecheck/build pass, all three code scans print no matches, and status lists only the intended README/test changes for this task before commit.

- [ ] **Step 6: Commit**

```bash
git add README.md tests/server.test.ts tests/event-source.test.ts
git commit -m "docs: document event-fold ownership and replay guarantees

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Final Acceptance Checklist

- [ ] Server wire messages contain only event history/deltas, transport `serverTime`, and neutral `timelineTime`/`timelineRate`.
- [ ] `RaceSession`, `SessionHub`, shared progress rules, and `GamePresentation` are absent.
- [ ] F1, Raid, and Foundry each have one fresh per-tab state owner created by a factory.
- [ ] Same complete history plus the same timeline cursor produces deep-equal logical state across fresh replay, incremental delivery, refresh, reconnect, and a second tab.
- [ ] More than 20,000 source events replay from seq 1 with no truncation; timeline-only ticks do not increment seq.
- [ ] F1 semantics from all legacy race-session tests exist in F1 fold tests.
- [ ] Raid HP/damage/stage/result are produced only by Raid fold code.
- [ ] Foundry projects productivity from `timelineTime`, not `serverTime`, and retains its transition-based repairs/completions and resource/module formulas.
- [ ] Number, color, pace/attack rate, official/display position, damage, HP, rank, and results use deterministic inputs only.
- [ ] Animation frame differences never feed logical state.
- [ ] Existing routes, DOM copy, focus behavior, fixtures, CLI flags, and build/package behavior remain operational.
- [ ] Defense has no source directory, test suite, registry key, URL alias, or public README claim; `?game=defense` follows the normal unknown-format F1 fallback.
- [ ] `npm test`, `npm run typecheck`, and `npm run build` pass.

## Decisions Required Before Implementation

No mandatory product decision remains for the stated scope. Defense is explicitly retired, and the plan preserves Foundry as the existing event-sourced third format without an alias.

Only if bounded memory or process-restart recovery is added to the scope, decide before Task 1 between (a) a lossless game-neutral cold event archive or (b) relaxing server neutrality to permit format-owned checkpoints. The present plan deliberately chooses a complete process-lifetime in-memory source journal; 4 Hz cursor updates do not enter it, so normal uptime no longer drives history growth.

# Orbital Foundry Implementation Plan

> **For agentic workers:** Implement task-by-task with tests before verification.

**Goal:** Replace the static Defense proof-of-concept with a continuously progressing, event-sourced orbital construction game at `?game=foundry`.

**Architecture:** Herdr events fold into worker status intervals and accumulated productive seconds. Rendering projects resources, completed modules, and live construction progress from that folded state at authoritative `serverTime`; fixture servers align their broadcast clock to pre-rolled event timestamps so progress continues immediately.

**Tech Stack:** TypeScript strict ESM, Canvas 2D, Vitest, Vite. No dependencies.

## Global Constraints

- Relative imports include `.js`.
- Fold state is deterministic and uses no random or wall-clock APIs.
- F1 and Raid remain unchanged.
- Fixture and live input both progress.

### Task 1: Deterministic foundry domain

Create `src/web/formats/foundry/fold.ts` with event folding and pure `projectFoundry(state, at)` projection. Replace defense fold tests with working-time, recovery, rejoin, and deterministic projection tests.

### Task 2: Continuous fixture time

Reorder `src/server/cli.ts` initialization so fixtures load before broadcaster creation, then offset the broadcaster clock to the final retained event timestamp. Verify the clock increases beyond the pre-roll immediately.

### Task 3: Foundry UI

Create foundry chrome, standings, scene, and format registration. Render team stations, construction arcs, worker shuttles, blocked hazards, resources, modules, and rates. Remove the Defense format and register `foundry`.

### Task 4: Verification

Run `npm test`, `npm run typecheck`, and `npm run build`. Use agent-browser to assert resource/progress changes after several seconds, refresh preservation, blocked visuals, and unchanged F1/Raid rendering.

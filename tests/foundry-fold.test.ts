import { describe, expect, it } from 'vitest';
import { foldFoundry, initialFoundry, projectFoundry } from '../src/web/formats/foundry/fold.js';
import type { GameEvent, GameEventBody } from '../src/shared/events.js';

function fold(...items: Array<{ at: number; body: GameEventBody }>) {
  return items.map((item, index): GameEvent => ({ seq: index + 1, at: item.at, ...item.body }))
    .reduce(foldFoundry, initialFoundry());
}

const team: GameEventBody = { kind: 'team-joined', team: { id: 'a', label: 'alpha' } };
const unit: GameEventBody = { kind: 'unit-joined', unit: {
  id: 'u', teamID: 'a', tabLabel: 'core', agentKind: 'codex', status: 'working',
} };

describe('Orbital Foundry fold', () => {
  it('continues production at projection time without new events', () => {
    const state = fold({ at: 0, body: team }, { at: 0, body: unit });
    expect(projectFoundry(state, 5)[0].resources).toBe(10);
    expect(projectFoundry(state, 10)[0].resources).toBe(20);
  });

  it('settles production when blocked and rewards repair', () => {
    const state = fold(
      { at: 0, body: team }, { at: 0, body: unit },
      { at: 5, body: { kind: 'status-changed', unitID: 'u', from: 'working', to: 'blocked' } },
      { at: 9, body: { kind: 'status-changed', unitID: 'u', from: 'blocked', to: 'working' } },
    );
    const atNine = projectFoundry(state, 9)[0];
    expect(atNine.repairs).toBe(1);
    expect(atNine.resources).toBe(35);
    expect(projectFoundry(state, 14)[0].resources).toBe(45);
  });
});

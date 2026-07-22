import { describe, expect, it } from 'vitest';
import type { AgentStatus, EntryPresentation } from '../src/shared/presentation.js';
import {
  distanceText, gapText, headerLap, lapOf, statusText,
} from '../src/web/formats/f1/vocabulary.js';

// The string logic these tests cover used to live in the server's present()
// /rankedTeams(); moving it client-side must not lose coverage, so each case
// here corresponds 1:1 to an assertion deleted from the race-session tests.

function entry(overrides: Partial<EntryPresentation> = {}): EntryPresentation {
  return {
    id: 't1',
    unitNumber: 1,
    teamID: 'ws-1',
    workspaceLabel: 'ws-1',
    tabLabel: 'tab',
    agentKind: 'claude',
    status: 'working' as AgentStatus,
    colorToken: { kind: 'palette', slot: 0 },
    officialProgress: 0,
    placement: { kind: 'active', progress: 0 },
    displaySpeed: 0,
    isFocused: false,
    isDeparted: false,
    isQueued: false,
    showsNewStint: false,
    ...overrides,
  };
}

describe('lapOf / headerLap', () => {
  it('is one-based and capped at 58', () => {
    expect(lapOf(0)).toBe(1);
    expect(lapOf(1)).toBe(2); // official distance 1.0 → LAP 2
    expect(lapOf(57.9)).toBe(58);
    expect(lapOf(58)).toBe(58);
    expect(headerLap(0)).toBe(1);
    expect(headerLap(1)).toBe(2);
    expect(headerLap(58)).toBe(58);
  });
});

describe('statusText', () => {
  it('working shows the current lap', () => {
    expect(statusText(entry({ status: 'working', officialProgress: 1 }))).toBe('LAP 2');
  });

  it('idle is PIT', () => {
    expect(statusText(entry({ status: 'idle', officialProgress: 0.5 }))).toBe('PIT');
  });

  it('done shows DONE · LAP n', () => {
    expect(statusText(entry({ status: 'done', officialProgress: 0.5 }))).toBe('DONE · LAP 1');
  });

  it('blocked shows INCIDENT · LAP n', () => {
    expect(statusText(entry({ status: 'blocked', officialProgress: 0.5 }))).toBe('INCIDENT · LAP 1');
  });

  it('departed shows RETIRED · LAP n', () => {
    expect(statusText(entry({ isDeparted: true, officialProgress: 0.5 }))).toBe('RETIRED · LAP 1');
  });

  it('queued shows NEXT GRID regardless of status', () => {
    expect(statusText(entry({ isQueued: true, status: 'working', officialProgress: 3 }))).toBe('NEXT GRID');
  });
});

describe('distanceText / gapText', () => {
  it('formats team distance as x.x LAPS', () => {
    expect(distanceText(2)).toBe('2.0 LAPS');
  });

  it('shows sub-lap gaps in nominal seconds', () => {
    expect(gapText(1 / 12)).toBe('+1.5s'); // 1/12 lap * 18 s
  });

  it('shows one-lap-or-more gaps in laps', () => {
    expect(gapText(1)).toBe('+1.0 LAPS');
  });
});

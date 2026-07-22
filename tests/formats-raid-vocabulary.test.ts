import { describe, expect, it } from 'vitest';
import type { AgentStatus, EntryPresentation } from '../src/shared/presentation.js';
import { progressTarget } from '../src/shared/rules.js';
import {
  bossHpFraction, damageOf, damageText, dpsGapText, overlayLabel, stageLabel, statusLabel,
} from '../src/web/formats/raid/vocabulary.js';

function entry(overrides: Partial<EntryPresentation> = {}): EntryPresentation {
  return {
    id: 'r1',
    unitNumber: 1,
    teamID: 'guild-1',
    workspaceLabel: 'guild-1',
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

describe('bossHpFraction', () => {
  it('is full at zero progress and empty when the leader reaches the target', () => {
    expect(bossHpFraction(0)).toBe(1);
    expect(bossHpFraction(progressTarget / 2)).toBeCloseTo(0.5, 9);
    expect(bossHpFraction(progressTarget)).toBe(0);
  });

  it('clamps past the target (BOSS DOWN)', () => {
    expect(bossHpFraction(progressTarget + 10)).toBe(0);
  });
});

describe('labels', () => {
  it('stage tracks the round number', () => {
    expect(stageLabel(3)).toBe('STAGE 3');
  });

  it('damage is whole-number stacks', () => {
    expect(damageOf(2.7)).toBe(3);
    expect(damageText(1234.2)).toBe('1,234 DMG');
    expect(dpsGapText(1000)).toBe('-1,000 DMG');
  });

  it('maps each combat state', () => {
    expect(statusLabel(entry({ status: 'working' }))).toBe('ATTACKING');
    expect(statusLabel(entry({ status: 'idle' }))).toBe('CAMP');
    expect(statusLabel(entry({ status: 'done' }))).toBe('VICTORY');
    expect(statusLabel(entry({ status: 'blocked' }))).toBe('STUNNED');
    expect(statusLabel(entry({ isDeparted: true }))).toBe('FELLED');
    expect(statusLabel(entry({ isQueued: true, status: 'working' }))).toBe('NEXT WAVE');
  });

  it('renames the overlays', () => {
    expect(overlayLabel('connecting')).toBe('SUMMONING');
    expect(overlayLabel('noUnits')).toBe('NO RAIDERS');
    expect(overlayLabel('frozen')).toBe('TIME FREEZE');
    expect(overlayLabel('suspended')).toBe('RAID SUSPENDED');
  });
});

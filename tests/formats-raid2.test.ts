import { describe, expect, it } from 'vitest';
import { createRaid2Format } from '../src/web/formats/raid2/index.js';
import {
  connectionChanged,
  eventHistory,
  snapshotApplied,
  teamJoined,
  unitJoined,
} from './helpers/events.js';

describe('raid2 format', () => {
  it('exposes the GameFormat surface and folds events without a DOM', () => {
    const format = createRaid2Format();
    format.onEvents(
      eventHistory(
        [0, teamJoined()],
        [0, unitJoined()],
        [0, snapshotApplied()],
        [0, connectionChanged({ kind: 'live' })],
      ),
      true,
    );
    format.onTimeline({ timelineTime: 10, timelineRate: 1 });
    expect(typeof format.createChrome).toBe('function');
    expect(typeof format.createStandings).toBe('function');
    expect(typeof format.createScene).toBe('function');
  });
});

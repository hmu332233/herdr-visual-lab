import type { GameEvent } from '../shared/events.js';
import type { ServerMessage, TimelineCursor } from '../shared/protocol.js';

export function createEventSource(
  onUpdate: (events: GameEvent[], reset: boolean, cursor: TimelineCursor) => void,
  onGap: (expectedSeq: number, receivedSeq: number) => void = () => {},
) {
  let cursor: number | null = null;
  const contiguous = (events: readonly GameEvent[], expected: number): boolean => {
    for (const event of events) {
      if (event.seq !== expected) { onGap(expected, event.seq); return false; }
      expected += 1;
    }
    return true;
  };
  function ingest(message: ServerMessage): void {
    const timeline = { timelineTime: message.timelineTime, timelineRate: message.timelineRate };
    if (message.type === 'history') {
      if (!contiguous(message.events, 1)) return;
      cursor = message.events.at(-1)?.seq ?? 0;
      onUpdate(message.events, true, timeline);
      return;
    }
    if (cursor === null) {
      if (message.events.length) onGap(1, message.events[0].seq);
      return;
    }
    const fresh = message.events.filter(event => event.seq > cursor!);
    if (!contiguous(fresh, cursor + 1)) return;
    cursor = fresh.at(-1)?.seq ?? cursor;
    onUpdate(fresh, false, timeline);
  }
  return { ingest };
}

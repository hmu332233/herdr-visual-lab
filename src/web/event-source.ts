import type { GameEvent } from '../shared/events.js';
import type { ServerMessage } from '../shared/protocol.js';

export function createEventSource(onBatch: (events: GameEvent[], reset: boolean) => void) {
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

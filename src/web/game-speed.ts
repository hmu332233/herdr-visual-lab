import type { ServerMessage } from '../shared/protocol.js';

export const DEFAULT_GAME_SPEEDS: Readonly<Record<string, number>> = {
  f1: 1,
  raid: 5,
  raid2: 5,
  foundry: 1,
};

export function applyGameSpeed(message: ServerMessage, game: string): ServerMessage {
  const speed = DEFAULT_GAME_SPEEDS[game] ?? DEFAULT_GAME_SPEEDS.f1;
  if (speed === 1) return message;
  return {
    ...message,
    timelineTime: message.timelineTime * speed,
    timelineRate: message.timelineRate * speed,
    events: message.events.map(event => ({ ...event, at: event.at * speed })),
  };
}

import type { ServerMessage } from '../shared/protocol.js';

export const DEFAULT_GAME_SPEEDS: Readonly<Record<string, number>> = {
  kanban: 1,
  f1: 1,
  raid: 5,
  raid2: 5,
  spaceport: 1,
  foundry: 1,
  metro: 1,
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

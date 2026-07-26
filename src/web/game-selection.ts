export type GameName =
  | 'f1'
  | 'raid'
  | 'raid2'
  | 'spaceport'
  | 'foundry'
  | 'metro';

const GAME_NAMES = new Set<GameName>([
  'f1',
  'raid',
  'raid2',
  'spaceport',
  'foundry',
  'metro',
]);

export function resolveGameName(search: string): GameName {
  const requested = new URLSearchParams(search).get('game') ?? 'f1';
  return GAME_NAMES.has(requested as GameName) ? requested as GameName : 'f1';
}

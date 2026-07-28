export type GameName =
  | 'kanban'
  | 'f1'
  | 'raid'
  | 'raid2'
  | 'spaceport'
  | 'foundry'
  | 'metro'
  | 'galaxy';

const GAME_NAMES = new Set<GameName>([
  'kanban',
  'f1',
  'raid',
  'raid2',
  'spaceport',
  'foundry',
  'metro',
  'galaxy',
]);

export function resolveGameName(search: string): GameName {
  const requested = new URLSearchParams(search).get('game') ?? 'galaxy';
  return GAME_NAMES.has(requested as GameName) ? requested as GameName : 'galaxy';
}

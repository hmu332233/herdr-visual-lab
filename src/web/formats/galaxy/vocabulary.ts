import type { AgentStatus } from '../../../shared/presentation.js';

/** Visible UI vocabulary is English uppercase, matching the other formats. */
export const TITLE = 'HERDR GALAXY';

export const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'IDLE', working: 'WORKING', blocked: 'BLOCKED', done: 'DONE',
};

export const STATUS_ORDER: readonly AgentStatus[] = ['working', 'idle', 'blocked', 'done'];

/** Node palette. Status is never encoded by color alone — motion (orbit
 *  speed, pulse, stillness) always carries it too. */
export const STATUS_COLOR: Record<AgentStatus, number> = {
  working: 0x9fd8ff,
  idle: 0x4a566e,
  blocked: 0xff4d4d,
  done: 0xffc94d,
};

export const PALETTE = {
  background: 0x05070f,
  core: 0xf2ecdc,
  star: 0xffe9b0,
  planet: 0x8f9bb8,
  ring: 0x1c2438,
  label: 0xaab4cc,
  focusRing: 0xffffff,
  flow: 0xbfe6ff,
} as const;

/** Star temperature by team heat: lifeless ember → warm sun → blue-white. */
export const HEAT_STOPS: ReadonlyArray<[number, number]> = [
  [0, 0x8a4a3a],
  [0.3, 0xffe9b0],
  [1, 0xe8f6ff],
];

/** Color identity of one workspace's star system. A workspace keeps one
 *  stable family by id hash: star flare, orbit rings, and nebula agree. */
export interface SystemHue {
  star: number;
  ring: number;
  nebula: number;
}

export const SYSTEM_HUES: readonly SystemHue[] = [
  { star: 0x8fd0ff, ring: 0x4f7fb8, nebula: 0x1d3a5e }, // ice blue
  { star: 0xc79bff, ring: 0x7e58b8, nebula: 0x3a2566 }, // violet
  { star: 0x7df0da, ring: 0x3fa393, nebula: 0x14453e }, // teal
  { star: 0xffd27d, ring: 0xb8913f, nebula: 0x4d3a14 }, // amber
  { star: 0xff9fb8, ring: 0xb85f78, nebula: 0x4d1f2e }, // rose
  { star: 0xa8ff9f, ring: 0x63b85a, nebula: 0x1f4d1c }, // aurora green
];

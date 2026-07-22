import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEED, parseArgs } from '../src/server/cli.js';
import { defaultSocketPath } from '../src/server/herdr/client.js';

describe('parseArgs', () => {
  it('defaults: start on 4158, open browser, live herdr, default speed', () => {
    expect(parseArgs([])).toEqual({
      port: 4158, open: true, fixture: null, socket: defaultSocketPath, speed: DEFAULT_SPEED,
    });
  });

  it('parses direct options', () => {
    expect(parseArgs(['--port', '5000', '--no-open', '--fixture', 'podium', '--socket', '/tmp/h.sock', '--speed', '3']))
      .toEqual({ port: 5000, open: false, fixture: 'podium', socket: '/tmp/h.sock', speed: 3 });
  });

  it('retains start as a compatibility alias', () => {
    expect(parseArgs(['start', '--no-open'])).toEqual({
      port: 4158, open: false, fixture: null, socket: defaultSocketPath, speed: DEFAULT_SPEED,
    });
  });

  it('defaults to a faster-than-real-time tempo', () => {
    expect(DEFAULT_SPEED).toBeGreaterThan(1);
    expect(parseArgs(['--speed', '1']).speed).toBe(1);
  });

  it('rejects unknown commands, bad ports, unknown fixtures, bad speed and flags', () => {
    expect(() => parseArgs(['serve'])).toThrowError(/^Usage:/);
    expect(() => parseArgs(['--port', 'abc'])).toThrowError(/^Usage:/);
    expect(() => parseArgs(['--port', '0'])).toThrowError(/^Usage:/);
    expect(() => parseArgs(['--fixture', 'nope'])).toThrowError(/^Usage:/);
    expect(() => parseArgs(['--speed', '0'])).toThrowError(/^Usage:/);
    expect(() => parseArgs(['--speed', 'fast'])).toThrowError(/^Usage:/);
    expect(() => parseArgs(['--wat'])).toThrowError(/^Usage:/);
  });
});

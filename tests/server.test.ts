import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { createEventBroadcaster } from '../src/server/broadcaster.js';
import { createEventSession } from '../src/server/event-session.js';
import { loadFixture } from '../src/server/fixtures.js';
import { startServer } from '../src/server/server.js';
import type { ServerMessage, SyncMessage } from '../src/shared/protocol.js';
import { waitUntil } from './helpers/fake-herdr.js';

type Dashboard = Awaited<ReturnType<typeof startServer>>;
let dashboard: Dashboard | null = null;
let webRoot = '';

async function makeServer(onFocus: (id: string) => void = () => {}): Promise<Dashboard> {
  webRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-visual-lab-web-'));
  fs.writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>Herdr Visual Lab</title>');
  fs.writeFileSync(path.join(webRoot, 'app.js'), 'console.log(1)');
  const session = createEventSession();
  loadFixture('grid', session);
  const broadcaster = createEventBroadcaster(session, () => 1000);
  dashboard = await startServer({ port: 4990, webRoot, broadcaster, onFocus });
  return dashboard;
}

afterEach(async () => {
  await dashboard?.close();
  dashboard = null;
  if (webRoot) fs.rmSync(webRoot, { recursive: true, force: true });
});

describe('startServer', () => {
  it('serves index.html at / and assets by extension', async () => {
    const { port } = await makeServer();
    const home = await fetch(`http://127.0.0.1:${port}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toContain('text/html');
    expect(await home.text()).toContain('Herdr Visual Lab');
    const js = await fetch(`http://127.0.0.1:${port}/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('text/javascript');
  });

  it('404s missing files and refuses path traversal', async () => {
    const { port } = await makeServer();
    expect((await fetch(`http://127.0.0.1:${port}/nope.js`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/..%2f..%2fetc%2fpasswd`)).status).toBe(404);
  });

  it('sends history then sync to every new websocket client and routes focus messages', async () => {
    const focused: string[] = [];
    const { port } = await makeServer(id => focused.push(id));
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages: ServerMessage[] = [];
    socket.on('message', raw => messages.push(JSON.parse(String(raw))));
    await waitUntil(() => messages.length >= 2);
    expect(messages[0].type).toBe('history');
    expect(messages[1].type).toBe('sync');
    expect((messages[1] as SyncMessage).events).toEqual([]);
    expect((messages[0] as { events: unknown[] }).events.length).toBeGreaterThan(0);
    socket.send(JSON.stringify({ type: 'focus', terminalID: 't6' }));
    await waitUntil(() => focused.length === 1);
    expect(focused[0]).toBe('t6');
    socket.send('not json'); // must not crash the server
    socket.close();
  });

  it('probes the next port when the preferred one is taken', async () => {
    const first = await makeServer();
    const session = createEventSession();
    const broadcaster = createEventBroadcaster(session, () => 0);
    const second = await startServer({ port: first.port, webRoot, broadcaster, onFocus: () => {} });
    try {
      expect(second.port).toBe(first.port + 1);
    } finally {
      await second.close();
    }
  });
});

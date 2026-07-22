import './style.css';
import type { GameFormat } from './format.js';
import { f1Format } from './formats/f1/index.js';
import { raidFormat } from './formats/raid/index.js';
import { foundryFormat } from './formats/foundry/index.js';
import type { ServerMessage, SyncMessage } from '../shared/protocol.js';
import { createEventSource } from './event-source.js';

// Format is chosen per browser tab (?game=), never by the server: the same
// server session can be watched as F1 in one tab and raid in another.
const formats: Record<string, GameFormat> = {
  f1: f1Format,
  raid: raidFormat,
  foundry: foundryFormat,
};
const requested = new URLSearchParams(location.search).get('game') ?? 'f1';
const format = formats[requested] ?? f1Format;

let socket: WebSocket | null = null;
const sendFocus = (terminalID: string): void => {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'focus', terminalID }));
  }
};

const chrome = format.createChrome();
const standings = format.createStandings(document.getElementById('standings')!, sendFocus);
const scene = format.createScene(document.getElementById('track') as HTMLCanvasElement, sendFocus);
const eventSource = createEventSource((events, reset) => format.onEvents?.(events, reset));

let sync: SyncMessage | null = null;

function frame(now: number): void {
  if (sync) scene.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function connect(): void {
  socket = new WebSocket(`ws://${location.host}/ws`);
  socket.onmessage = event => {
    const message = JSON.parse(event.data as string) as ServerMessage;
    eventSource.ingest(message);
    if (message.type !== 'sync') return;
    sync = message;
    chrome.render(sync);
    standings.render(sync);
    scene.setSync(sync, performance.now());
  };
  socket.onclose = () => setTimeout(connect, 1000);
}
connect();

new ResizeObserver(() => {
  scene.resize();
  if (sync) scene.frame(performance.now());
}).observe(document.getElementById('track-wrap')!);

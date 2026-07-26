import './style.css';
import type { GameFormat } from './format.js';
import { createF1Format } from './formats/f1/index.js';
import { createRaidFormat } from './formats/raid/index.js';
import { createFoundryFormat } from './formats/foundry/index.js';
import { createMetroFormat } from './formats/metro/index.js';
import type { ServerMessage } from '../shared/protocol.js';
import { createEventSource } from './event-source.js';
import { applyGameSpeed } from './game-speed.js';
import { resolveGameName } from './game-selection.js';

async function bootstrap(): Promise<void> {
  const factories: Record<string, () => GameFormat> = {
    f1: createF1Format,
    raid: createRaidFormat,
    spaceport: createFoundryFormat,
    foundry: createFoundryFormat,
    metro: createMetroFormat,
  };
  const activeGame = resolveGameName(location.search);
  const format = activeGame === 'raid2'
    ? (await import('./formats/raid2/index.js')).createRaid2Format()
    : factories[activeGame]();

  document.body.dataset.game = activeGame;
  let socket: WebSocket | null = null;
  let hydrated = false;
  const focus = (terminalID: string) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'focus', terminalID }));
    }
  };

  const chrome = format.createChrome();
  const standings = format.createStandings(document.getElementById('standings')!, focus);
  const scene = format.createScene(
    document.getElementById('track') as HTMLCanvasElement,
    focus,
  );
  const source = createEventSource(
    (events, reset, cursor) => {
      format.onEvents(events, reset);
      format.onTimeline(cursor);
      hydrated = true;
      chrome.render();
      standings.render();
      scene.commit(performance.now());
    },
    () => socket?.close(),
  );

  function frame(now: number): void {
    if (hydrated) scene.frame(now);
    requestAnimationFrame(frame);
  }

  function connect(): void {
    socket = new WebSocket(`ws://${location.host}/ws`);
    socket.onmessage = event => {
      source.ingest(
        applyGameSpeed(
          JSON.parse(event.data as string) as ServerMessage,
          activeGame,
        ),
      );
    };
    socket.onclose = () => setTimeout(connect, 1000);
  }

  requestAnimationFrame(frame);
  connect();
  new ResizeObserver(() => {
    scene.resize();
    if (hydrated) scene.frame(performance.now());
  }).observe(document.getElementById('track-wrap')!);
}

void bootstrap();

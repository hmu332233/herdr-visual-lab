import type { SyncMessage } from '../shared/protocol.js';
import type { GameEvent } from '../shared/events.js';

/** A game format reinterprets the game-neutral SyncMessage into a header, a
 *  standings panel, and a canvas scene. Adding a format is one directory under
 *  `formats/`; the server and protocol never learn its vocabulary. */
export interface GameChrome {
  render(sync: SyncMessage): void;
}

export interface GameStandings {
  render(sync: SyncMessage): void;
}

export interface GameScene {
  setSync(sync: SyncMessage, receivedAtMs: number): void;
  frame(nowMs: number): void;
  resize(): void;
}

export interface GameFormat {
  createChrome(): GameChrome;
  createStandings(el: HTMLElement, onFocus: (terminalID: string) => void): GameStandings;
  createScene(canvas: HTMLCanvasElement, onFocus: (terminalID: string) => void): GameScene;
  onEvents?(events: GameEvent[], reset: boolean): void;
}

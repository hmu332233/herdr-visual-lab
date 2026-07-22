import type { GameEvent } from '../shared/events.js';
import type { TimelineCursor } from '../shared/protocol.js';
export interface GameChrome { render():void }
export interface GameStandings { render():void }
export interface GameScene { commit(receivedAtMs:number):void; frame(nowMs:number):void; resize():void }
export interface GameFormat {
  onEvents(events:readonly GameEvent[],reset:boolean):void;
  onTimeline(cursor:TimelineCursor):void;
  createChrome():GameChrome;
  createStandings(el:HTMLElement,onFocus:(terminalID:string)=>void):GameStandings;
  createScene(canvas:HTMLCanvasElement,onFocus:(terminalID:string)=>void):GameScene;
}

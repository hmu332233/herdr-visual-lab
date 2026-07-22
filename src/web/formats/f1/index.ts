import type { GameEvent } from '../../../shared/events.js';
import type { TimelineCursor } from '../../../shared/protocol.js';
import type { GameFormat } from '../../format.js';
import { createChrome } from './chrome.js';
import { createStandingsPanel } from './standings.js';
import { createTrackRenderer } from './track.js';
import { foldF1, initialF1State, setF1Cursor } from './fold.js';
import { projectF1 } from './view.js';

export function createF1StateOwner(){let state=initialF1State();return{onEvents(events:readonly GameEvent[],reset:boolean){if(reset)state=initialF1State();for(const event of events)foldF1(state,event);},onTimeline(cursor:TimelineCursor){setF1Cursor(state,cursor);},view:()=>projectF1(state)};}
export function createF1Format():GameFormat{const owner=createF1StateOwner();return{
  onEvents:owner.onEvents,onTimeline:owner.onTimeline,
  createChrome(){const component=createChrome();return{render:()=>component.render(owner.view())};},
  createStandings(el,onFocus){const component=createStandingsPanel(el,onFocus);return{render:()=>component.render(owner.view())};},
  createScene(canvas,onFocus){const component=createTrackRenderer(canvas,onFocus);return{commit:(at)=>component.setSync(owner.view(),at),frame:component.frame,resize:component.resize};},
};}

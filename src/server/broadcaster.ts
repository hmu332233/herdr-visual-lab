import type { GameEvent } from '../shared/events.js';
import type { HistoryMessage, SyncMessage } from '../shared/protocol.js';
import type { EventSession } from './event-session.js';
export function createEventBroadcaster(session:EventSession,clock:()=>number,tickMs=250){let timer:ReturnType<typeof setInterval>|null=null;const clients=new Set<(json:string)=>void>();let broadcastSeq=0;
  const cursor=()=>({timelineTime:session.timelineTime(),timelineRate:session.timelineRate()});
  const buildHistory=():HistoryMessage=>({type:'history',serverTime:clock(),events:session.log.history(),...cursor()});
  const buildSync=(events:GameEvent[]=[]):SyncMessage=>({type:'sync',serverTime:clock(),events,...cursor()});
  function start(){if(!timer)timer=setInterval(tick,tickMs);}function stop(){if(timer){clearInterval(timer);timer=null;}}
  function addClient(send:(json:string)=>void){const wasEmpty=clients.size===0;clients.add(send);session.advance(clock());const history=buildHistory();send(JSON.stringify(history));if(wasEmpty)broadcastSeq=session.log.lastSeq();send(JSON.stringify(buildSync()));}
  function removeClient(send:(json:string)=>void){clients.delete(send);}
  function tick(){session.advance(clock());if(!clients.size)return;const events=session.log.eventsSince(broadcastSeq);broadcastSeq=session.log.lastSeq();const json=JSON.stringify(buildSync(events));for(const send of clients)send(json);}
  return{start,stop,addClient,removeClient,tick,buildHistory,buildSync};
}
export type EventBroadcaster=ReturnType<typeof createEventBroadcaster>;

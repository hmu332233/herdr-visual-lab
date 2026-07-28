import type{ConnectionState}from'../../src/shared/presentation.js';import type{GameEvent,GameEventBody}from'../../src/shared/events.js';
export const teamJoined=(id='ws',label='team',sourceOrder=0,stableOrder=0):GameEventBody=>({kind:'team-joined',team:{id,label,sourceOrder,stableOrder}});
export const unitJoined=(id='t1',teamID='ws',status:'idle'|'working'|'done'|'blocked'='working',sourceOrder=0,stableOrder=0):GameEventBody=>({kind:'unit-joined',unit:{id,teamID,tabLabel:id,tabID:`tab-${id}`,terminalTitle:null,agentKind:'codex',status,isFocused:false,sourceOrder,stableOrder}});
export const snapshotApplied=():GameEventBody=>({kind:'snapshot-applied'});export const connectionChanged=(connection:ConnectionState):GameEventBody=>({kind:'connection-changed',connection});
export function eventHistory(...entries:Array<readonly[at:number,body:GameEventBody]>):GameEvent[]{return entries.map(([at,body],i)=>({seq:i+1,at,...body} as GameEvent));}

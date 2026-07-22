import type { AgentStatus,ConnectionState } from '../shared/presentation.js';
export interface TeamColorToken{kind:'palette'|'pattern';slot:number}
export type EntryPlacement={kind:'active';progress:number}|{kind:'resting'}|{kind:'coolingDown';progress:number}|{kind:'blockedActive';progress:number}|{kind:'blockedResting'}|{kind:'departed'}|{kind:'queued'};
export type GameOverlay={kind:'none'}|{kind:'connecting'}|{kind:'noUnits'}|{kind:'frozen'}|{kind:'suspended';detail:string};
export interface EntryPresentation{id:string;unitNumber:number;teamID:string;workspaceLabel:string;tabLabel:string;agentKind:string;status:AgentStatus;colorToken:TeamColorToken;officialProgress:number;placement:EntryPlacement;displaySpeed:number;isFocused:boolean;isDeparted:boolean;isQueued:boolean;showsNewStint:boolean}
export interface TeamStanding{id:string;rank:number;label:string;colorToken:TeamColorToken;progress:number;entries:EntryPresentation[]}
export interface FinalResultTeam{rank:number;teamID:string;label:string;colorToken:TeamColorToken;progress:number}
export interface FinalResult{round:number;top:FinalResultTeam[]}
export interface FormatViewBase{phase:'awaitingUnits'|'live'|'results';round:number;leaderProgress:number;teams:TeamStanding[];results:FinalResult|null;connection:ConnectionState;overlay:GameOverlay}
export function extrapolateProgress(placement:EntryPlacement,displaySpeed:number,elapsedSeconds:number):number|null{if(placement.kind!=='active'&&placement.kind!=='coolingDown'&&placement.kind!=='blockedActive')return null;const progress=placement.progress+displaySpeed*elapsedSeconds;return progress-Math.floor(progress);}

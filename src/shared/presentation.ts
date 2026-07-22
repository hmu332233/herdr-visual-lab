/** Authoritative source status. */
export type AgentStatus='idle'|'working'|'done'|'blocked';
export type ConnectionState={kind:'waiting'}|{kind:'live'}|{kind:'offline'}|{kind:'protocolError';detail:string};

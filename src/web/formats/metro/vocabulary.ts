import type { AgentStatus } from '../../../shared/presentation.js';

export const METRO_STATUS_LABEL: Readonly<Record<AgentStatus, string>> = {
  working: 'IN SERVICE',
  idle: 'AT DEPOT',
  done: 'TERMINATED',
  blocked: 'SIGNAL HOLD',
};

export const METRO_STATUS_CLASS: Readonly<Record<AgentStatus, string>> = {
  working: 'is-service',
  idle: 'is-depot',
  done: 'is-terminated',
  blocked: 'is-hold',
};

export function servicePhaseLabel(
  phase: 'awaitingUnits' | 'quietHours' | 'live' | 'lastTrain' | 'dawn',
): string {
  switch (phase) {
    case 'awaitingUnits': return 'AWAITING SERVICE';
    case 'quietHours': return 'QUIET HOURS';
    case 'lastTrain': return 'LAST TRAIN';
    case 'dawn': return 'DAWN';
    case 'live': return 'NIGHT SERVICE';
  }
}

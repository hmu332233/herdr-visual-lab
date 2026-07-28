import type { AgentStatus } from '../../../shared/presentation.js';
import type { KanbanView } from './view.js';
import { KANBAN_STATUSES } from './view.js';

interface WorkspaceRow {
  row: HTMLElement;
  dot: HTMLElement;
  label: HTMLElement;
  count: HTMLElement;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'IDLE',
  working: 'WORKING',
  blocked: 'BLOCKED',
  done: 'DONE',
};

/**
 * Read-only left rail: workspace roster and a status legend. Nothing here is
 * interactive — the board itself owns every focus action.
 */
export function createKanbanSidebar(app: HTMLElement) {
  const aside = document.createElement('aside');
  aside.className = 'kanban-sidebar';
  aside.setAttribute('aria-label', 'Herdr workspaces');

  const brand = document.createElement('div');
  brand.className = 'kanban-brand';
  const mark = document.createElement('span');
  mark.className = 'kanban-brand-mark';
  mark.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'kanban-brand-name';
  name.textContent = 'Herdr';
  brand.append(mark, name);

  const workspaceGroup = document.createElement('div');
  workspaceGroup.className = 'kanban-side-group is-scroll';
  const workspaceHeading = document.createElement('h3');
  workspaceHeading.className = 'kanban-side-heading';
  workspaceHeading.id = 'kanban-workspace-heading';
  workspaceHeading.textContent = 'WORKSPACES';
  const workspaceList = document.createElement('div');
  workspaceList.className = 'kanban-workspace-list';
  workspaceList.setAttribute('role', 'list');
  workspaceList.setAttribute('aria-labelledby', workspaceHeading.id);
  workspaceGroup.append(workspaceHeading, workspaceList);

  const legendGroup = document.createElement('div');
  legendGroup.className = 'kanban-side-group';
  const legendHeading = document.createElement('h3');
  legendHeading.className = 'kanban-side-heading';
  legendHeading.textContent = 'STATUS';
  const legend = document.createElement('div');
  legend.className = 'kanban-legend';
  const legendCounts = new Map<AgentStatus, HTMLElement>();
  for (const status of KANBAN_STATUSES) {
    const row = document.createElement('div');
    row.className = 'kanban-legend-row';
    row.dataset.status = status;
    const swatch = document.createElement('span');
    swatch.className = 'kanban-legend-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'kanban-legend-label';
    label.textContent = STATUS_LABEL[status];
    const count = document.createElement('span');
    count.className = 'kanban-legend-count mono';
    count.textContent = '0';
    row.append(swatch, label, count);
    legend.append(row);
    legendCounts.set(status, count);
  }
  legendGroup.append(legendHeading, legend);

  const footer = document.createElement('div');
  footer.className = 'kanban-side-footer';
  const total = document.createElement('span');
  total.className = 'kanban-side-total';
  total.textContent = '0 AGENTS';
  footer.append(total);

  aside.append(brand, workspaceGroup, legendGroup, footer);
  app.prepend(aside);

  const rows = new Map<string, WorkspaceRow>();

  function render(view: KanbanView): void {
    const present = new Set<string>();
    view.workspaces.forEach((workspace, index) => {
      present.add(workspace.id);
      const entry = rows.get(workspace.id) ?? createRow();
      rows.set(workspace.id, entry);
      entry.dot.dataset.slot = String(index % 6);
      entry.label.textContent = workspace.label;
      entry.count.textContent = String(workspace.agentCount);
      entry.row.setAttribute(
        'aria-label',
        `${workspace.label}, ${workspace.agentCount} agent${workspace.agentCount === 1 ? '' : 's'}`,
      );
      workspaceList.append(entry.row);
    });
    for (const [id, entry] of rows) {
      if (!present.has(id)) {
        entry.row.remove();
        rows.delete(id);
      }
    }
    for (const column of view.columns) {
      const count = legendCounts.get(column.status);
      if (count) count.textContent = String(column.cards.length);
    }
    total.textContent = `${view.totalAgents} AGENT${view.totalAgents === 1 ? '' : 'S'}`;
  }

  return { render };
}

function createRow(): WorkspaceRow {
  const row = document.createElement('div');
  row.className = 'kanban-workspace';
  row.setAttribute('role', 'listitem');
  const dot = document.createElement('span');
  dot.className = 'kanban-workspace-dot';
  dot.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'kanban-workspace-label';
  const count = document.createElement('span');
  count.className = 'kanban-workspace-count mono';
  row.append(dot, label, count);
  return { row, dot, label, count };
}

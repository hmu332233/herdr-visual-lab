import type { GalaxyView } from './view.js';
import { STATUS_LABEL } from './vocabulary.js';

/** Screen-reader / keyboard mirror of the galaxy. Visually hidden; buttons
 *  focus the matching Herdr terminal via the shared focus path. */
export function createGalaxyRoster(root: HTMLElement, onFocus: (terminalID: string) => void) {
  root.setAttribute('aria-label', 'Galaxy agents');

  function render(view: GalaxyView): void {
    root.replaceChildren();
    for (const team of view.teams) {
      for (const tab of team.tabs) {
        for (const agent of tab.agents) {
          const button = document.createElement('button');
          button.type = 'button';
          button.setAttribute('role', 'listitem');
          button.dataset.terminal = agent.id;
          button.textContent =
            `${team.label} · ${tab.label} · ${agent.agentKind} · ${STATUS_LABEL[agent.status]}` +
            (agent.isFocused ? ' · FOCUSED' : '');
          button.addEventListener('click', () => onFocus(agent.id));
          root.appendChild(button);
        }
      }
    }
  }

  return { render };
}

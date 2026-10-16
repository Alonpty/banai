import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import { getCatalog, getDefaultDesign, getHealth } from './api/client.js';
import { createAgentClient } from './chat/agentClient.js';
import { mountChat } from './chat/chatPanel.js';
import { mountPanel } from './editor/panel.js';
import { createStore } from './state/store.js';
import { mountRoomControls } from './ui/roomControls.js';
import { mountShell } from './ui/shell.js';
import { mountStartScreen } from './ui/startScreen.js';
import { mountStructureNav } from './ui/structureNav.js';
import { createViewer } from './viewer/viewer.js';

function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.hidden = false;
}

async function boot() {
  let catalog;
  let initial;
  let health;
  try {
    [catalog, initial, health] = await Promise.all([getCatalog(), getDefaultDesign(), getHealth()]);
  } catch {
    showError('Could not reach the design service. Please check your connection and reload.');
    return;
  }
  // Validates the server data before anything is rendered (throws on invalid data).
  const store = createStore({ design: initial.design, revision: initial.revision, catalog });
  const viewer = createViewer(document.getElementById('viewer'), store);
  const shell = mountShell({ store, viewer });
  mountRoomControls(document.getElementById('viewer-reset'), store);
  mountStructureNav(document.getElementById('structure-nav'), store);
  mountPanel(document.getElementById('properties-content'), store, { headingRoot: document.getElementById('inspector-heading') });
  // The real AI agent when the server has an OpenAI key; otherwise the labelled demo.
  const agent = createAgentClient({ agentAvailable: health.data.agent === true });
  const chat = mountChat(document.getElementById('chat-root'), store, agent);
  mountStartScreen({ chat, shell, notice: agent.mode === 'demo' ? agent.notice : '' });
  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat });
  }
}

boot().catch(() => {
  showError('The designer could not start. Please reload the page.');
});

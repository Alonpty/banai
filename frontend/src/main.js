import { getCatalog, getDefaultDesign } from './api/client.js';
import { createStore } from './state/store.js';
import { describeSelection } from './viewer/format.js';
import { createViewer } from './viewer/viewer.js';

function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.hidden = false;
}

function bindInteriorToggle(store) {
  const toggle = document.getElementById('toggle-interior');
  toggle.addEventListener('change', () => store.setDoorsVisible(!toggle.checked));
  store.subscribe((state) => { toggle.checked = !state.ui.doorsVisible; });
}

function bindSelectionReadout(store) {
  const readout = document.getElementById('selection-readout');
  const render = ({ design, selection }) => {
    readout.textContent = selection ? describeSelection(design, selection) : 'Click a component in the 3D view.';
  };
  store.subscribe(render);
  render(store.getState());
}

async function boot() {
  let catalog;
  let initial;
  try {
    [catalog, initial] = await Promise.all([getCatalog(), getDefaultDesign()]);
  } catch {
    showError('Could not reach the design service. Please check your connection and reload.');
    return;
  }
  // Validates the server data before anything is rendered (throws on invalid data).
  const store = createStore({ design: initial.design, revision: initial.revision, catalog });
  const viewer = createViewer(document.getElementById('viewer'), store);
  bindInteriorToggle(store);
  bindSelectionReadout(store);
  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer });
  }
}

boot().catch(() => {
  showError('The designer could not start. Please reload the page.');
});

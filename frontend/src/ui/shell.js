// Application chrome around the 3D workspace: top bar (history, share, room preview,
// save status), collapsible side panels, the 3D toolbar, the proposal preview badge,
// mobile tabs and keyboard shortcuts. Reads store state; changes it only through the
// store's own methods (undo/redo, view toggles).
import { el } from '../editor/fields.js';
import { openDialog } from './dialog.js';
import { icon } from './icons.js';
import { PREVIEW_COLORS } from '../viewer/proposalPreview.js';

const PANEL_KEY = 'banai.panels';

function readPanels() {
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_KEY) ?? 'null');
    return { left: saved?.left !== 'closed', right: saved?.right !== 'closed' };
  } catch {
    return { left: true, right: true };
  }
}

function writePanels(panels) {
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify({ left: panels.left ? 'open' : 'closed', right: panels.right ? 'open' : 'closed' }));
  } catch {
    // Storage unavailable (private mode): panels simply reset on reload.
  }
}

function bindPanels(workspace) {
  const panels = readPanels();
  const render = () => {
    workspace.dataset.left = panels.left ? 'open' : 'closed';
    workspace.dataset.right = panels.right ? 'open' : 'closed';
    workspace.querySelectorAll('.side__toggle').forEach((button) => {
      const side = button.dataset.panel;
      const open = panels[side];
      const name = side === 'left' ? 'assistant' : 'inspector';
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} ${name}`);
      button.title = `${open ? 'Collapse' : 'Expand'} ${name}`;
      const pointsLeft = (side === 'left') === open;
      button.replaceChildren(icon(pointsLeft ? 'chevronLeft' : 'chevronRight'));
    });
  };
  workspace.querySelectorAll('.side__toggle, .side__rail').forEach((button) => {
    button.addEventListener('click', () => {
      panels[button.dataset.panel] = !panels[button.dataset.panel];
      writePanels(panels);
      render();
    });
  });
  render();
  return {
    open(side) {
      if (!panels[side]) {
        panels[side] = true;
        writePanels(panels);
        render();
      }
    },
  };
}

function bindMobileTabs(workspace) {
  const tabs = document.querySelectorAll('.mobile-tabs [data-tab]');
  const show = (tab) => {
    workspace.dataset.tab = tab;
    tabs.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
  };
  tabs.forEach((button) => button.addEventListener('click', () => show(button.dataset.tab)));
  return { show };
}

function toolbarButton(label, iconName, onClick, testId) {
  const button = el('button', { className: 'seg', attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': label, title: label, 'data-testid': testId } }, [icon(iconName, { size: 16 }), el('span', { text: label })]);
  button.addEventListener('click', onClick);
  return button;
}

/** Labelled button with an icon; the label hides on narrow screens (aria-label stays). */
function decorate(button, iconName, label) {
  button.replaceChildren(icon(iconName, { size: 16 }), el('span', { className: 'btn__label', text: label }));
}

function bindToolbar(root, resetRoot, store, viewer) {
  const front = toolbarButton('Front', 'front', () => store.setDoorsVisible(true), 'view-front');
  const interior = toolbarButton('Interior', 'interior', () => store.setDoorsVisible(false), 'view-interior');
  const dims = toolbarButton('Dimensions', 'ruler', () => store.setDimensionsVisible(!store.getState().ui.dimensions), 'view-dimensions');
  root.replaceChildren(front, interior, dims);
  const reset = el('button', { className: 'btn btn--secondary', attrs: { type: 'button', 'aria-label': 'Reset view', 'data-testid': 'view-reset' } });
  decorate(reset, 'reset', 'Reset view');
  reset.addEventListener('click', () => viewer.resetView());
  resetRoot.replaceChildren(reset);
  return (state) => {
    front.setAttribute('aria-pressed', String(state.ui.doorsVisible));
    interior.setAttribute('aria-pressed', String(!state.ui.doorsVisible));
    dims.setAttribute('aria-pressed', String(state.ui.dimensions));
  };
}

function legendItem(label, color) {
  const dot = el('span', { className: 'legend__dot' });
  dot.style.backgroundColor = color;
  return el('span', { className: 'legend__item' }, [dot, el('span', { text: label })]);
}

/** Floating badge over the 3D view while a proposal is previewed (mirrors the card). */
function bindPreviewBadge(badge, store) {
  let shown;
  return (state) => {
    const proposal = state.proposal && !state.proposal.stale ? state.proposal : null;
    if (proposal === shown) return;
    shown = proposal;
    badge.hidden = !proposal;
    if (!proposal) return;
    const children = [el('strong', { text: proposal.replaces ? 'Previewing new design' : 'Previewing suggested changes' })];
    if (!proposal.replaces) {
      const { added, modified, removed } = proposal.diff;
      children.push(el('span', { className: 'legend' }, [
        ...(added.length ? [legendItem('Added', PREVIEW_COLORS.added)] : []),
        ...(modified.length ? [legendItem('Changed', PREVIEW_COLORS.modified)] : []),
        ...(removed.length ? [legendItem('Removed', PREVIEW_COLORS.removed)] : []),
      ]));
    }
    const cancel = el('button', { className: 'btn btn--secondary btn--sm', text: 'Cancel', attrs: { type: 'button', 'data-testid': 'preview-cancel' } });
    const apply = el('button', { className: 'btn btn--primary btn--sm', text: 'Apply changes', attrs: { type: 'button', 'data-testid': 'preview-apply' } });
    cancel.addEventListener('click', () => store.cancelProposal());
    apply.addEventListener('click', () => store.applyProposal());
    children.push(el('span', { className: 'preview-badge__actions' }, [cancel, apply]));
    badge.replaceChildren(...children);
  };
}

function shareDialog() {
  const field = el('input', { className: 'field__input', attrs: { type: 'text', readonly: '', 'aria-label': 'Design link', placeholder: 'https://banai…/#d=…' } });
  field.disabled = true;
  openDialog({
    title: 'Share your design',
    body: [
      el('p', { text: 'Secure share links arrive together with cloud saving (Phase 7). Each link will carry its own private access key; nobody can open a design without it.' }),
      el('div', { className: 'share-row' }, [field, el('button', { className: 'btn btn--secondary', text: 'Copy link', attrs: { type: 'button', disabled: '' } })]),
      el('p', { className: 'dialog__note', text: 'Coming soon. For now your design lives in this browser tab.' }),
    ],
    actions: [{ label: 'Close', variant: 'primary' }],
  });
}

function roomPreviewDialog() {
  openDialog({
    title: 'Realistic preview',
    wide: true,
    body: [
      el('div', { className: 'render-placeholder' }, [
        icon('sparkle', { size: 28 }),
        el('p', { text: 'Photoreal previews arrive in Phase 8.' }),
      ]),
      el('p', { className: 'dialog__note', text: 'This image is illustrative. The 3D design and dimensions remain unchanged.' }),
    ],
    actions: [{ label: 'Regenerate', variant: 'secondary', disabled: true }, { label: 'Close', variant: 'primary' }],
  });
}

const isTyping = (target) => target instanceof HTMLElement
  && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function mountShell({ store, viewer }) {
  const workspace = document.getElementById('workspace');
  const panels = bindPanels(workspace);
  const tabs = bindMobileTabs(workspace);
  const undo = document.getElementById('undo');
  const redo = document.getElementById('redo');
  decorate(undo, 'undo', 'Undo');
  decorate(redo, 'redo', 'Redo');
  decorate(document.getElementById('preview-room'), 'room', 'Preview in room');
  decorate(document.getElementById('share'), 'link', 'Share');
  undo.addEventListener('click', () => store.undo());
  redo.addEventListener('click', () => store.redo());
  document.getElementById('share').addEventListener('click', shareDialog);
  document.getElementById('preview-room').addEventListener('click', roomPreviewDialog);
  const status = document.getElementById('save-status');
  status.title = 'Cloud saving and autosave arrive in Phase 7.';

  const syncToolbar = bindToolbar(document.getElementById('viewer-toolbar'), document.getElementById('viewer-reset'), store, viewer);
  const syncBadge = bindPreviewBadge(document.getElementById('preview-badge'), store);

  document.addEventListener('keydown', (event) => {
    if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
    } else if (mod && key === 'y') {
      event.preventDefault();
      store.redo();
    } else if (event.key === 'Escape' && store.getState().selection) {
      store.select(null);
    }
  });

  const sync = (state) => {
    undo.disabled = !state.history.canUndo;
    redo.disabled = !state.history.canRedo;
    syncToolbar(state);
    syncBadge(state);
  };
  store.subscribe(sync);
  sync(store.getState());
  return { panels, tabs };
}

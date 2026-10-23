// Save and share dialog. Saving stores the design on the server and gives a private link; nothing is
// faked: the link field stays empty until a save has really succeeded. "Save as copy" stores the
// current design as a new design with its own link and token; the original is never touched.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';

const UNAVAILABLE = 'Saving is not available on this server.';
const READY = 'Save to get your private link.';
const SAVED = 'Saved. Use this link to reopen and keep editing.';
const COPIED = 'Saved as a copy. This is a new link; the previous link still opens the original design.';

/**
 * `available`: whether the server can store designs. `onSave()` saves the current design and resolves
 * to its private link. `onSaveCopy()` saves it as a new design (new link and token, the original is
 * left as it was) and resolves to the new link. `link`: the link of a design that was reopened from
 * one, if any. A copy needs an original, so "Save as copy" is enabled once a link exists.
 */
export function createSaveDialog({ available, onSave, onSaveCopy = null, link = '' }) {
  const linkField = el('input', { className: 'field__input', attrs: { id: 'share-link', type: 'text', readonly: '', placeholder: 'Your private link will appear here', 'aria-label': 'Private share link' } });
  linkField.dataset.testid = 'share-link';
  linkField.value = link;
  const status = el('p', { className: 'dialog__status', text: available ? READY : UNAVAILABLE, attrs: { role: 'status' } });
  status.dataset.testid = 'save-status';

  let saved = Boolean(link);
  const copy = button('Copy link', async () => {
    try {
      await navigator.clipboard.writeText(linkField.value);
      status.textContent = 'Link copied.';
    } catch {
      linkField.select(); // clipboard blocked: leave it selected for a manual copy
      status.textContent = 'Select the link and copy it.';
    }
  }, { variant: 'secondary', testId: 'copy-link' });
  const save = button('Save design', () => perform(onSave, SAVED), { variant: 'primary', testId: 'save-confirm' });
  const saveCopy = onSaveCopy ? button('Save as copy', () => perform(onSaveCopy, COPIED), { variant: 'secondary', testId: 'save-copy' }) : null;

  /** Buttons follow the server and the dialog state; everything waits while a save is in flight. */
  const refresh = (inFlight = false) => {
    copy.disabled = inFlight || !saved;
    save.disabled = inFlight || !available;
    if (saveCopy) saveCopy.disabled = inFlight || !available || !saved;
  };

  async function perform(run, done) {
    refresh(true);
    status.textContent = 'Saving…';
    try {
      linkField.value = await run();
      saved = true;
      status.textContent = done;
    } catch (error) {
      status.textContent = error?.message || 'Saving failed. Please try again.';
    } finally {
      refresh(false);
    }
  }
  refresh();

  const dialog = createDialog({
    title: 'Save your design',
    labelId: 'save-dialog-title',
    testId: 'save-dialog',
    body: [
      el('p', { className: 'dialog__text', text: 'Saving gives you a private link you can use to reopen and keep editing this design. No account is needed.' }),
      el('div', { className: 'field' }, [
        el('label', { className: 'field__label', text: 'Private link', attrs: { for: 'share-link' } }),
        linkField,
      ]),
      el('p', { className: 'dialog__note', text: 'Anyone with this link can edit the design, so keep it private. "Save as copy" gives the current design a second, separate link and leaves the original as it is.' }),
      status,
    ],
    actions: [copy, ...(saveCopy ? [saveCopy] : []), save, button('Close', () => dialog.close(), { variant: 'ghost', testId: 'save-close' })],
  });
  return dialog;
}

// Save and share dialog. Saving needs the backend (Phase 7), so every action here is disabled and
// says so. Nothing is faked: no link is shown until a design has really been saved.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';

export function createSaveDialog() {
  const linkField = el('input', { className: 'field__input', attrs: { id: 'share-link', type: 'text', readonly: '', placeholder: 'Your private link will appear here', 'aria-label': 'Private share link' } });
  linkField.dataset.testid = 'share-link';
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
      el('p', { className: 'dialog__note', text: 'Anyone with this link can edit the design, so keep it private.' }),
      el('p', { className: 'dialog__status', text: 'Saving is not available yet. It arrives with the Supabase phase.', attrs: { role: 'status' } }),
    ],
    actions: [
      button('Copy link', () => {}, { variant: 'secondary', testId: 'copy-link', disabled: true }),
      button('Save design', () => {}, { variant: 'primary', testId: 'save-confirm', disabled: true }),
      button('Close', () => dialog.close(), { variant: 'ghost', testId: 'save-close' }),
    ],
  });
  return dialog;
}

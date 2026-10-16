// Photorealistic render dialog. Rendering needs the backend image service (Phase 8), so the action
// is disabled and says so. The image is always labelled as illustrative, never as the accurate model.
import { el, button } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createDialog } from '../ui/dialog.js';

export const RENDER_DISCLAIMER = 'Illustrative image, not the accurate 3D model';

export function createRenderDialog() {
  const placeholder = el('div', { className: 'render__placeholder' }, [icon('image', { size: 48 }), el('span', { text: 'Your render will appear here' })]);
  const dialog = createDialog({
    title: 'Photorealistic render',
    labelId: 'render-dialog-title',
    testId: 'render-dialog',
    body: [
      el('p', { className: 'dialog__text', text: 'Create an illustrative image of your wardrobe on a clean background. Your design and its dimensions are not changed.' }),
      placeholder,
      el('span', { className: 'chip', text: RENDER_DISCLAIMER }),
      el('p', { className: 'dialog__status', text: 'Rendering is not available yet. It arrives with the AI rendering phase.', attrs: { role: 'status' } }),
    ],
    actions: [
      button('Generate render', () => {}, { variant: 'primary', testId: 'render-generate', disabled: true }),
      button('Close', () => dialog.close(), { variant: 'ghost', testId: 'render-close' }),
    ],
  });
  return dialog;
}

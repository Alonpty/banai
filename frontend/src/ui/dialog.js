// One shared modal <dialog>. Content is built from DOM nodes (textContent only).
import { el } from '../editor/fields.js';

export function openDialog({ title, body, actions, wide = false }) {
  const dialog = document.getElementById('dialog');
  dialog.classList.toggle('dialog--wide', wide);
  document.getElementById('dialog-title').textContent = title;
  document.getElementById('dialog-body').replaceChildren(...body);
  document.getElementById('dialog-actions').replaceChildren(...actions.map(({ label, variant = 'secondary', disabled = false, onClick }) => {
    const button = el('button', { className: `btn btn--${variant}`, text: label, attrs: { value: label } });
    button.disabled = disabled;
    if (onClick) button.addEventListener('click', onClick);
    return button;
  }));
  if (!dialog.open) dialog.showModal();
  return dialog;
}

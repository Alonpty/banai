// First screen: one prompt field, "Design with AI", or "Start from basic wardrobe".
// "Design with AI" hands the text to the assistant, which proposes a first design that
// is previewed in 3D and still needs the customer's approval.
export function mountStartScreen({ chat, shell, notice }) {
  const screen = document.getElementById('start-screen');
  const form = document.getElementById('start-form');
  const prompt = document.getElementById('start-prompt');
  const error = document.getElementById('start-error');
  document.getElementById('start-note').textContent = notice ?? '';

  const close = () => {
    screen.hidden = true;
    document.body.classList.remove('is-starting');
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = prompt.value.trim();
    if (!text) {
      error.textContent = 'Describe your wardrobe first, or start from the basic wardrobe.';
      prompt.focus();
      return;
    }
    close();
    shell.panels.open('left');
    shell.tabs.show('design');
    chat.submit(text, { mode: 'create' });
  });
  prompt.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) form.requestSubmit();
  });
  prompt.addEventListener('input', () => {
    error.textContent = '';
  });
  document.getElementById('start-basic').addEventListener('click', close);

  screen.hidden = false;
  document.body.classList.add('is-starting');
  prompt.focus();
}

// Left column: conversation, proposal card and composer. The agent is not connected until
// Phase 5, so this panel never changes the design by itself.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { MAX_MESSAGE_LENGTH } from './chatModel.js';
import { renderProposalCard } from './proposalCard.js';

export function mountChat(container, { model, onConfirm }) {
  const list = el('div', { className: 'chat__messages', attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' } });
  list.dataset.testid = 'chat-messages';
  const proposalSlot = el('div', { className: 'chat__proposal' });

  const input = el('textarea', { className: 'chat__input', attrs: { rows: '2', maxlength: String(MAX_MESSAGE_LENGTH), placeholder: 'Ask the AI designer…', 'aria-label': 'Message to the AI designer' } });
  input.dataset.testid = 'chat-input';
  const sendButton = el('button', { className: 'icon-btn icon-btn--filled', attrs: { type: 'submit', 'aria-label': 'Send message' } }, [icon('send')]);
  sendButton.dataset.testid = 'chat-send';
  const form = el('form', { className: 'chat__composer' }, [input, sendButton]);

  const submit = () => {
    if (model.send(input.value).ok) input.value = '';
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });

  function render() {
    list.replaceChildren(...model.getMessages().map((message) => {
      const bubble = el('div', { className: `chat__bubble chat__bubble--${message.role}`, text: message.text });
      return bubble;
    }));
    list.scrollTop = list.scrollHeight;

    const proposal = model.getProposal();
    proposalSlot.replaceChildren();
    if (proposal) {
      proposalSlot.append(renderProposalCard(proposal, model.getProposalStatus(), {
        onConfirm,
        onCancel: () => model.cancelProposal(),
      }));
    }
  }

  const intro = el('p', { className: 'panel__note', text: 'Describe the wardrobe you want. The AI designer will propose changes for you to confirm.' });
  container.replaceChildren(
    el('h2', { className: 'panel__title', text: 'AI Designer' }),
    intro,
    list,
    proposalSlot,
    form,
  );
  model.subscribe(render);
  render();

  return {
    focus: (hint) => {
      if (hint) input.placeholder = hint;
      input.focus();
    },
    /** Re-render, e.g. after the design revision changed (a pending proposal may now be stale). */
    refresh: render,
  };
}

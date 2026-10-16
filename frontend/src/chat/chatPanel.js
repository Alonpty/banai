// Compact assistant panel. Message types: conversation, clarification, suggested-changes
// card, and confirmations. The current selection is shown as a context chip above the
// composer and sent with every message, so "move this 15 cm higher" works. Quick chips
// under the composer adapt to what is selected.
//
// Suggested changes are staged with store.proposeChanges() (previewed in 3D, never
// committed) and applied only by an explicit "Apply changes" (store.applyProposal()).
import { el } from '../editor/fields.js';
import { friendlyError } from '../editor/opsFromForm.js';
import { confirmProposal } from './confirm.js';
import { icon } from '../ui/icons.js';
import { labelOf } from '../ui/naming.js';

// Quick actions per selection kind. Each is a plain message to the assistant.
const QUICK = Object.freeze({
  none: ['Add a drawer to the right section', 'Make the wardrobe 240 cm wide', 'Sliding doors', 'Mirror doors', 'Oak finish'],
  compartment: ['Add a drawer', 'Add 2 shelves', 'Add a hanging rail', 'Make this section 10 cm wider'],
  shelf: ['Move this 10 cm higher', 'Move this 10 cm lower', 'Make this walnut', 'Remove this'],
  drawer: ['Move this 10 cm higher', 'Make this walnut', 'Remove this'],
  rail: ['Move this 10 cm higher', 'Move this 10 cm lower', 'Remove this'],
  partition: ['Remove this'],
  door: ['Make this a mirror door', 'Make this walnut', 'Sliding doors', 'Remove this'],
});

const APPLY_ERRORS = Object.freeze({
  INVALID_SIGNATURE: 'That suggestion could not be verified. Please ask again.',
  INVALID_OPS: 'That suggestion no longer fits the design. Please ask again.',
  NETWORK: 'Could not reach the server to apply the changes. Please try again.',
});

/** Earlier conversation for the agent (oldest first): text, questions and suggestions. */
function historyOf(messages) {
  return messages
    .filter((m) => ['text', 'clarification', 'proposal'].includes(m.type) && m.text)
    .map((m) => ({
      role: m.role,
      content: (m.type === 'proposal'
        ? [m.text, ...(m.lines ?? []).map((line) => `- ${line}`)].join('\n')
        : m.text).slice(0, 2000),
    }));
}

const GREETING = 'I help only with designing your wardrobe. Describe a change, or click a part of the wardrobe and tell me what to do with it. '
  + 'Suggested changes are previewed in 3D first and only applied when you approve them.';

export function mountChat(root, store, agent) {
  const messages = []; // { role, type, text, lines?, ops?, status?, context? }
  let busy = false;

  const title = document.getElementById('chat-title');
  if (title) title.replaceChildren(icon('sparkle', { size: 16 }), 'Design with BanAI');

  const list = el('ol', { className: 'chat__list', attrs: { 'aria-live': 'polite', 'data-testid': 'chat-list' } });
  const chip = el('div', { className: 'context-chip-row' });
  const input = el('textarea', {
    className: 'chat__input',
    attrs: { rows: '3', maxlength: '2000', placeholder: 'Ask BanAI to change the selected component…', 'aria-label': 'Message the assistant', 'data-testid': 'chat-input' },
  });
  const send = el('button', { className: 'btn btn--primary chat__send', attrs: { type: 'submit', 'aria-label': 'Send', title: 'Send (Enter)' } }, [icon('send', { size: 18 })]);
  const form = el('form', { className: 'chat__row' }, [input, send]);
  const quick = el('div', { className: 'quick-chips', attrs: { role: 'group', 'aria-label': 'Quick actions' } });
  const notice = agent.mode === 'demo'
    ? [el('p', { className: 'chat__notice', text: 'Demo assistant', attrs: { title: agent.notice ?? '' } })]
    : [];
  root.replaceChildren(el('div', { className: 'chat' }, [
    el('div', { className: 'chat__scroll' }, [...notice, list]),
    el('div', { className: 'composer' }, [chip, form, quick]),
  ]));

  const push = (message) => {
    messages.push(message);
    renderList();
  };

  const avatar = (role) => el('span', { className: `avatar avatar--${role}`, attrs: { 'aria-hidden': 'true' } }, [icon(role === 'user' ? 'user' : 'sparkle', { size: 14 })]);

  const proposalCard = (message, state) => {
    const pending = state.proposal && state.proposal.ops === message.ops ? state.proposal : null;
    const count = message.lines.length;
    const card = el('div', { className: `proposal${pending ? ' is-pending' : ''}`, attrs: { 'data-testid': 'proposal-card' } }, [
      el('p', { className: 'proposal__title' }, [el('span', { className: 'proposal__dot', attrs: { 'aria-hidden': 'true' } }), el('span', { text: `${count} suggested change${count === 1 ? '' : 's'}` })]),
      el('ul', { className: 'proposal__lines' }, message.lines.map((line) => el('li', { text: line }))),
    ]);
    if (pending && !pending.stale) {
      const cancel = el('button', { className: 'btn btn--secondary', text: 'Cancel', attrs: { type: 'button', 'data-testid': 'proposal-cancel' } });
      const apply = el('button', { className: 'btn btn--primary', text: 'Apply changes', attrs: { type: 'button', 'data-testid': 'proposal-apply' } });
      cancel.addEventListener('click', () => store.cancelProposal());
      apply.addEventListener('click', async () => {
        apply.disabled = true;
        cancel.disabled = true;
        apply.textContent = 'Applying…';
        const result = await confirmProposal(store);
        if (!result.ok && !['STALE', 'BUSY'].includes(result.error?.code)) {
          push({ role: 'assistant', type: 'text', text: APPLY_ERRORS[result.error?.code] ?? friendlyError(result.error) });
        }
      });
      card.append(
        el('p', { className: 'proposal__status' }, [el('span', { className: 'pulse', attrs: { 'aria-hidden': 'true' } }), el('span', { text: 'Previewing in 3D' })]),
        el('div', { className: 'proposal__actions' }, [cancel, apply]),
      );
    } else if (pending?.stale) {
      const dismiss = el('button', { className: 'btn btn--secondary', text: 'Dismiss', attrs: { type: 'button' } });
      dismiss.addEventListener('click', () => store.cancelProposal());
      card.classList.add('is-stale');
      card.append(
        el('p', { className: 'proposal__status proposal__status--stale', text: 'The design changed after this suggestion. Ask again for an updated one.' }),
        el('div', { className: 'proposal__actions' }, [dismiss]),
      );
    } else {
      const label = { applied: 'Applied', cancelled: 'Cancelled', superseded: 'Replaced by a newer suggestion' }[message.status] ?? 'Closed';
      card.classList.add('is-closed');
      card.append(el('p', { className: 'proposal__status proposal__status--closed', text: label }));
    }
    return card;
  };

  const renderMessage = (message, state) => {
    if (message.type === 'event') {
      return el('li', { className: `msg-event${message.tone ? ` msg-event--${message.tone}` : ''}` }, [
        ...(message.tone === 'success' ? [icon('check', { size: 14 })] : []),
        el('span', { text: message.text }),
      ]);
    }
    if (message.type === 'proposal') {
      return el('li', { className: 'msg msg--assistant msg--proposal' }, [
        ...(message.text ? [el('div', { className: 'msg__row' }, [avatar('assistant'), el('p', { className: 'bubble', text: message.text })])] : []),
        proposalCard(message, state),
      ]);
    }
    if (message.type === 'scope') {
      // A declined, unrelated question: clearly labelled so the customer knows why.
      return el('li', { className: 'msg msg--assistant' }, [el('div', { className: 'msg__row' }, [
        avatar('assistant'),
        el('div', { className: 'bubble bubble--scope', attrs: { 'data-testid': 'out-of-scope' } }, [
          el('span', { className: 'bubble__scope-label' }, [icon('info', { size: 13 }), el('span', { text: 'Outside wardrobe design' })]),
          el('p', { className: 'bubble__text', text: message.text, attrs: { dir: 'auto' } }),
        ]),
      ])]);
    }
    const bubble = el('div', { className: `bubble${message.role === 'user' ? ' bubble--user' : ''}${message.type === 'clarification' ? ' bubble--clarify' : ''}` }, [
      ...(message.context ? [el('span', { className: 'bubble__context', text: message.context })] : []),
      el('p', { className: 'bubble__text', text: message.text }),
    ]);
    return el('li', { className: `msg msg--${message.role}` }, [el('div', { className: 'msg__row' }, [avatar(message.role), bubble])]);
  };

  function renderList() {
    const state = store.getState();
    const greeting = renderMessage({ role: 'assistant', type: 'text', text: GREETING }, state);
    list.replaceChildren(greeting, ...messages.map((m) => renderMessage(m, state)));
    if (busy) {
      list.append(el('li', { className: 'msg msg--assistant' }, [el('div', { className: 'msg__row' }, [
        avatar('assistant'),
        el('div', { className: 'bubble typing', attrs: { 'aria-label': 'Assistant is typing' } }, [el('span'), el('span'), el('span')]),
      ])]));
    }
    const scroller = list.parentElement;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  const renderChip = (state) => {
    if (!state.selection || state.selection.kind === 'carcass') {
      chip.replaceChildren();
      return;
    }
    const clear = el('button', { className: 'context-chip__clear', attrs: { type: 'button', 'aria-label': 'Clear selection' } }, [icon('close', { size: 12 })]);
    clear.addEventListener('click', () => store.select(null));
    chip.replaceChildren(el('span', { className: 'context-chip', attrs: { 'data-testid': 'context-chip' } }, [
      el('span', { className: 'context-chip__label', text: 'Selected:' }),
      el('span', { text: labelOf(state.design, state.selection.id) }),
      clear,
    ]));
  };

  const renderQuick = (state) => {
    const kind = state.selection && state.selection.kind !== 'carcass' ? state.selection.kind : 'none';
    quick.replaceChildren(...(QUICK[kind] ?? QUICK.none).map((text) => {
      const button = el('button', { className: 'chip', text, attrs: { type: 'button' } });
      button.addEventListener('click', () => submit(text));
      return button;
    }));
  };

  async function submit(text, { mode = 'edit' } = {}) {
    const message = String(text ?? '').trim();
    if (!message || busy) return;
    const state = store.getState();
    const context = state.selection && state.selection.kind !== 'carcass' ? labelOf(state.design, state.selection.id) : null;
    const history = historyOf(messages);
    push({ role: 'user', type: 'text', text: message, context });
    busy = true;
    renderList();
    let response;
    try {
      // The agent always receives the latest COMMITTED design and the current selection.
      const latest = store.getState();
      response = await agent.send({ message, history, design: latest.design, selection: latest.selection, revision: latest.revision, catalog: latest.catalog, mode });
    } catch {
      response = { kind: 'reply', text: 'The assistant is not reachable right now. You can keep editing manually.' };
    } finally {
      busy = false;
    }
    if (response.kind === 'out_of_scope') {
      push({ role: 'assistant', type: 'scope', text: response.text });
      return;
    }
    if (response.kind !== 'proposal') {
      push({ role: 'assistant', type: response.kind === 'clarification' ? 'clarification' : 'text', text: response.text });
      return;
    }
    const previous = messages.find((m) => m.type === 'proposal' && !m.status && store.getState().proposal?.ops === m.ops);
    const staged = store.proposeChanges({ ops: response.ops, summary: response.summary, signed: response.signed ?? null });
    if (!staged.ok) {
      push({ role: 'assistant', type: 'text', text: `I could not suggest that on the current design: ${friendlyError(staged.error)}` });
      return;
    }
    if (previous) previous.status = 'superseded';
    // Interior changes would be hidden behind closed doors: show the inside for the preview.
    const { proposal } = store.getState();
    const touchesInterior = proposal.replaces || [...proposal.diff.added, ...proposal.diff.modified, ...proposal.diff.removed]
      .some((id) => !id.startsWith('dr_') && id !== 'carcass');
    if (touchesInterior && store.getState().ui.doorsVisible) store.setDoorsVisible(false);
    push({ role: 'assistant', type: 'proposal', text: response.text, lines: response.summary ?? [], ops: response.ops });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value;
    input.value = '';
    submit(text);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  let seen = { selection: undefined, proposal: undefined, outcome: undefined, design: undefined };
  store.subscribe((state) => {
    if (state.selection !== seen.selection || state.design !== seen.design) {
      renderChip(state);
      renderQuick(state);
    }
    if (state.proposalOutcome && state.proposalOutcome !== seen.outcome) {
      const message = messages.find((m) => m.ops === state.proposalOutcome.ops);
      if (message && !message.status) {
        message.status = state.proposalOutcome.result;
        messages.push(state.proposalOutcome.result === 'applied'
          ? { role: 'assistant', type: 'event', tone: 'success', text: 'Changes applied' }
          : { role: 'assistant', type: 'event', text: 'Suggestion cancelled. Nothing was changed.' });
      }
    }
    if (state.proposal !== seen.proposal || state.proposalOutcome !== seen.outcome) renderList();
    seen = { selection: state.selection, proposal: state.proposal, outcome: state.proposalOutcome, design: state.design };
  });
  renderChip(store.getState());
  renderQuick(store.getState());
  renderList();

  return { submit, focus: () => input.focus() };
}

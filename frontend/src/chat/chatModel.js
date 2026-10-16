// Pure chat view-model (no DOM). The agent arrives in Phase 5; until then a sent message gets
// an honest "not connected" reply and nothing is ever applied to the design.
//
// A proposal is { id, baseRevision, summary, changes: [{ title, detail }] }. It is kept apart from
// the committed design and is only ever "pending" or "stale" (the design changed after it was made).

export const NOT_CONNECTED_MESSAGE =
  "The AI agent isn't connected yet (planned for Phase 5). You can design manually in the Properties panel.";
export const STALE_MESSAGE = 'Design changed. Ask the agent to re-propose.';
export const MAX_MESSAGE_LENGTH = 2000;

export function proposalStatus(proposal, currentRevision) {
  if (!proposal) return null;
  return proposal.baseRevision === currentRevision ? 'pending' : 'stale';
}

export function createChatModel({ getRevision, agentConnected = false }) {
  let nextId = 1;
  let proposal = null;
  const messages = [];
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  const push = (role, text) => {
    messages.push(Object.freeze({ id: nextId, role, text }));
    nextId += 1;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getMessages: () => [...messages],
    getProposal: () => proposal,
    getProposalStatus: () => proposalStatus(proposal, getRevision()),

    /** A customer message. Returns { ok } and never touches the design. */
    send(rawText) {
      const text = String(rawText ?? '').trim();
      if (!text) return { ok: false, reason: 'empty' };
      if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too-long' };
      push('user', text);
      if (!agentConnected) push('system', NOT_CONNECTED_MESSAGE);
      notify();
      return { ok: true };
    },

    /** Set by the agent integration (Phase 5) or the dev-only demo. */
    setProposal(next) {
      proposal = next;
      notify();
    },

    /** Cancel never changes the design; it only drops the pending proposal. */
    cancelProposal() {
      if (!proposal) return false;
      proposal = null;
      push('system', 'Proposal cancelled. No changes were made.');
      notify();
      return true;
    },

    /** Called after the host applied (or refused) the proposal. */
    resolveProposal(message) {
      proposal = null;
      if (message) push('system', message);
      notify();
    },
  };
}

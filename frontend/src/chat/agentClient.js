// The assistant's transport.
// - 'live': the real AI agent (POST /api/chat; OpenAI on the backend, signed proposals).
// - 'demo': the in-browser rule-based interpreter, used when the server has no AI key.
// Either way the agent only sees the latest committed design + selection, is called only
// when the customer sends a message, and its proposals still need explicit approval.
import { postChat } from '../api/client.js';
import { labelOf } from '../ui/naming.js';
import { DEMO_NOTICE, respond } from './demoAgent.js';

const DEMO_LATENCY_MS = 350; // a short pause so the demo conversation reads naturally
const HISTORY_LIMIT = 20; // most recent messages sent with each turn
const CREATE_PREFIX = 'Design a new wardrobe from this description: ';

const FRIENDLY_ERRORS = Object.freeze({
  RATE_LIMITED: 'You are sending messages very quickly. Please wait a moment and try again.',
  AGENT_UNAVAILABLE: 'The AI designer is not reachable right now. You can keep editing manually.',
  INVALID_DESIGN: 'The current design could not be read. Please undo the last change and try again.',
});

function demoClient() {
  return {
    mode: 'demo',
    notice: DEMO_NOTICE,
    send({ message, design, selection, catalog, mode }) {
      const response = respond({ message, design, selection, catalog, mode });
      return new Promise((resolve) => {
        setTimeout(() => resolve(response), DEMO_LATENCY_MS);
      });
    },
  };
}

/** `agentAvailable` comes from GET /api/health (data.agent). */
export function createAgentClient({ agentAvailable = false, fetchImpl } = {}) {
  const demo = demoClient();
  if (!agentAvailable) return demo;

  const client = {
    mode: 'live',
    notice: '',
    /** history: earlier [{ role: 'user'|'assistant', content }] (oldest first). */
    async send(input) {
      const { message, history = [], design, selection, revision, mode } = input;
      if (client.mode === 'demo') return demo.send(input);
      const content = mode === 'create' ? `${CREATE_PREFIX}${message}` : message;
      const messages = [...history.slice(-HISTORY_LIMIT), { role: 'user', content }];
      const sentSelection = selection && selection.kind !== 'carcass' && labelOf(design, selection.id)
        ? { id: selection.id, kind: selection.kind } : null;
      const result = await postChat({ messages, design, revision, selection: sentSelection }, fetchImpl);
      if (!result.ok) {
        if (result.error?.code === 'AGENT_NOT_CONFIGURED') {
          // The server lost its key: keep the conversation working with the demo.
          Object.assign(client, { mode: 'demo', notice: demo.notice });
          return demo.send(input);
        }
        return { kind: 'reply', text: FRIENDLY_ERRORS[result.error?.code] ?? 'Something went wrong. Please try again.' };
      }
      const { kind, text, proposal } = result.data;
      if (kind === 'proposal' && proposal) {
        return { kind, text, ops: proposal.ops, summary: proposal.summary ?? [], signed: proposal };
      }
      return { kind: kind === 'clarification' ? 'clarification' : 'reply', text };
    },
  };
  return client;
}

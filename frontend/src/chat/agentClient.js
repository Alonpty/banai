// The assistant's transport. Today it is the in-browser DEMO interpreter; Phase 5 swaps
// this for POST /api/chat (OpenAI on the backend, signed proposals). Either way the
// agent only ever sees the latest committed state + selection, is called only when the
// customer sends a message, and returns a proposal that still needs explicit approval.
import { DEMO_NOTICE, respond } from './demoAgent.js';

const DEMO_LATENCY_MS = 350; // a short pause so the conversation reads naturally

export function createAgentClient() {
  return {
    mode: 'demo',
    notice: DEMO_NOTICE,
    /** @returns {Promise<{ kind: 'reply'|'clarification'|'proposal', text: string, ops?: object[], summary?: string[] }>} */
    send({ message, design, selection, catalog, mode }) {
      const response = respond({ message, design, selection, catalog, mode });
      return new Promise((resolve) => {
        setTimeout(() => resolve(response), DEMO_LATENCY_MS);
      });
    },
  };
}

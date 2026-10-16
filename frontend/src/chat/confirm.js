// Applying a pending proposal, shared by the assistant card and the 3D preview badge.
// AI-agent proposals are signed by the server and applied THROUGH it (POST
// /api/proposals/apply re-checks the signature, revision and design hash; 409 = stale).
// Demo proposals are applied locally by the same domain engine.
import { postApplyProposal } from '../api/client.js';

let inFlight = false;

/** Returns { ok } or { ok: false, error: { code } }. Never applies twice concurrently. */
export async function confirmProposal(store, { fetchImpl } = {}) {
  const { proposal, design, revision } = store.getState();
  if (!proposal) return { ok: false, error: { code: 'NO_PROPOSAL' } };
  if (!proposal.signed) return store.applyProposal();
  if (proposal.stale || proposal.baseRevision !== revision) return store.applyProposal(); // reports STALE
  if (inFlight) return { ok: false, error: { code: 'BUSY' } };
  inFlight = true;
  try {
    const result = await postApplyProposal({ design, revision, proposal: proposal.signed }, fetchImpl);
    if (!result.ok) {
      if (result.status === 409) store.markProposalStale();
      return { ok: false, error: result.error ?? { code: 'UNEXPECTED' } };
    }
    return store.applyProposal({ serverDesign: result.data.design });
  } catch {
    return { ok: false, error: { code: 'NETWORK' } };
  } finally {
    inFlight = false;
  }
}

import { API_BASE_URL } from '../config.js';

async function getJson(path, fetchImpl) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  const response = await fetchImpl(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }
  const body = await response.json();
  if (!body || body.success !== true) {
    throw new Error(`Request to ${path} returned an unsuccessful response`);
  }
  return body.data;
}

/**
 * POST JSON and return { ok, status, data, error } instead of throwing on API errors,
 * so callers can react to codes like STALE (409) or AGENT_NOT_CONFIGURED (503).
 * Network failures still throw.
 */
async function postJson(path, payload, fetchImpl) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  const response = await fetchImpl(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const ok = response.ok && body?.success === true;
  return { ok, status: response.status, data: ok ? body.data : null, error: ok ? null : (body?.error ?? { code: `HTTP_${response.status}` }) };
}

export const getHealth = (fetchImpl = fetch) => getJson('/api/health', fetchImpl).then((data) => ({ success: true, data }));

export const getCatalog = (fetchImpl = fetch) => getJson('/api/catalog', fetchImpl);

/** Returns { design, revision } for the predefined basic wardrobe. */
export const getDefaultDesign = (fetchImpl = fetch) => getJson('/api/designs/default', fetchImpl);

/** One agent turn: { messages, design, revision, selection } -> reply | clarification | signed proposal. */
export const postChat = (payload, fetchImpl = fetch) => postJson('/api/chat', payload, fetchImpl);

/** Apply a signed proposal: { design, revision, proposal } -> { design, revision } or 409 STALE. */
export const postApplyProposal = (payload, fetchImpl = fetch) => postJson('/api/proposals/apply', payload, fetchImpl);

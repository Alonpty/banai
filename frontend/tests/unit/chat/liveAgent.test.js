import { describe, expect, it, vi } from 'vitest';
import { createAgentClient } from '../../../src/chat/agentClient.js';
import { confirmProposal } from '../../../src/chat/confirm.js';
import { createStore } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const design = loadDesign('basic');
const reply = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const ok = (data) => reply(200, { success: true, data, error: null });
const fail = (status, code) => reply(status, { success: false, data: null, error: { code } });

const SIGNED = {
  proposalId: 'prp_0123456789abcdef', ops: [{ op: 'modify_shelf', id: 'shf_l2', y: 950 }],
  baseRevision: 1, baseHash: 'a'.repeat(64), signature: 'b'.repeat(64), summary: ['Shelf 2 · Left section: 80.0 → 95.0 cm'],
};

describe('live agent client', () => {
  it('sends history, the current design, revision and selection; maps a signed proposal', async () => {
    const fetchImpl = vi.fn(() => ok({ kind: 'proposal', text: 'Sure.', proposal: SIGNED }));
    const agent = createAgentClient({ agentAvailable: true, fetchImpl });
    expect(agent.mode).toBe('live');
    const result = await agent.send({
      message: 'move this up 15 cm', history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello' }],
      design, revision: 1, selection: { id: 'shf_l2', kind: 'shelf' }, catalog,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/\/api\/chat$/);
    const body = JSON.parse(init.body);
    expect(body.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(body.messages.at(-1).content).toBe('move this up 15 cm');
    expect(body.selection).toEqual({ id: 'shf_l2', kind: 'shelf' });
    expect(body.revision).toBe(1);
    expect(result).toMatchObject({ kind: 'proposal', ops: SIGNED.ops, summary: SIGNED.summary, signed: SIGNED });
  });

  it('marks start-screen descriptions as a new wardrobe', async () => {
    const fetchImpl = vi.fn(() => ok({ kind: 'reply', text: 'ok' }));
    await createAgentClient({ agentAvailable: true, fetchImpl }).send({ message: '3 sections', design, revision: 1, catalog, mode: 'create' });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).messages[0].content).toMatch(/^Design a new wardrobe/);
  });

  it('falls back to the demo when the server reports no agent, and explains other errors', async () => {
    const notConfigured = createAgentClient({ agentAvailable: true, fetchImpl: () => fail(503, 'AGENT_NOT_CONFIGURED') });
    const result = await notConfigured.send({ message: 'sliding doors', design, revision: 1, catalog });
    expect(notConfigured.mode).toBe('demo');
    expect(result.kind).toBe('proposal');
    const limited = createAgentClient({ agentAvailable: true, fetchImpl: () => fail(429, 'RATE_LIMITED') });
    expect((await limited.send({ message: 'x', design, revision: 1, catalog })).text).toMatch(/wait a moment/);
  });

  it('uses the demo when the server has no agent', () => {
    expect(createAgentClient({ agentAvailable: false }).mode).toBe('demo');
  });
});

describe('confirmProposal', () => {
  const staged = () => {
    const store = createStore({ design, revision: 1, catalog });
    store.proposeChanges({ ops: SIGNED.ops, summary: SIGNED.summary, signed: SIGNED });
    return store;
  };

  it('applies a signed proposal through the server and commits the server design', async () => {
    const store = staged();
    const serverDesign = store.getState().proposal.previewDesign;
    const fetchImpl = vi.fn(() => ok({ design: serverDesign, revision: 2 }));
    expect((await confirmProposal(store, { fetchImpl })).ok).toBe(true);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).proposal.signature).toBe(SIGNED.signature);
    expect(store.getState().design.compartments[0].shelves[1].y).toBe(950);
    expect(store.getState().proposal).toBeNull();
  });

  it('a 409 from the server marks the proposal stale and commits nothing', async () => {
    const store = staged();
    const before = store.getState().design;
    const result = await confirmProposal(store, { fetchImpl: () => fail(409, 'STALE') });
    expect(result.ok).toBe(false);
    expect(store.getState().proposal.stale).toBe(true);
    expect(store.getState().design).toBe(before);
  });

  it('a manual edit while the request is in flight still blocks the commit', async () => {
    const store = staged();
    let release;
    const fetchImpl = () => new Promise((resolve) => { release = resolve; });
    const pending = confirmProposal(store, { fetchImpl });
    store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 450 }]);
    release({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { design, revision: 2 } }) });
    expect((await pending).error.code).toBe('STALE');
    expect(store.getState().design.compartments[0].shelves[0].y).toBe(450);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { getCatalog, getDefaultDesign, getHealth } from '../../src/api/client.js';

const okResponse = (body) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

describe('api client', () => {
  it('returns the health payload', async () => {
    const fetchImpl = okResponse({ success: true, data: { status: 'ok' } });
    await expect(getHealth(fetchImpl)).resolves.toEqual({ success: true, data: { status: 'ok' } });
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:8000/api/health');
  });

  it('unwraps the envelope for catalog and default design', async () => {
    await expect(getCatalog(okResponse({ success: true, data: { colors: [] } }))).resolves.toEqual({ colors: [] });
    await expect(getDefaultDesign(okResponse({ success: true, data: { design: {}, revision: 1 } })))
      .resolves.toEqual({ design: {}, revision: 1 });
  });

  it('throws on HTTP errors and unsuccessful envelopes', async () => {
    await expect(getCatalog(vi.fn().mockResolvedValue({ ok: false, status: 503 }))).rejects.toThrow('503');
    await expect(getCatalog(okResponse({ success: false, error: 'x' }))).rejects.toThrow('unsuccessful');
  });
});

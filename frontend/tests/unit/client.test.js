import { describe, expect, it, vi } from 'vitest';
import { getHealth } from '../../src/api/client.js';

describe('getHealth', () => {
  it('returns the parsed health payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { status: 'ok' } }),
    });
    await expect(getHealth(fetchImpl)).resolves.toEqual({ success: true, data: { status: 'ok' } });
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:8000/api/health');
  });

  it('throws on a non-OK response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(getHealth(fetchImpl)).rejects.toThrow('503');
  });
});

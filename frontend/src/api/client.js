import { API_BASE_URL } from '../config.js';

export async function getHealth(fetchImpl = fetch) {
  const response = await fetchImpl(`${API_BASE_URL}/api/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return response.json();
}

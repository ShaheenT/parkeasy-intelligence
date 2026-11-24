import { afterAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';
process.env.PEI_API_KEYS ??= 'test-key-that-is-long-enough-for-config';
process.env.CORS_ORIGINS ??= '';

const { buildApp } = await import('../src/app.js');
const app = buildApp();

describe('health endpoints', () => {
  it('reports liveness without requiring a database query', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });

  it('protects ingestion endpoints with an API key', async () => {
    const response = await app.inject({
      method: 'POST', url: '/v1/events',
      payload: { eventType: 'search_performed' }
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns a not-found status for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });
});

afterAll(async () => { await app.close(); });

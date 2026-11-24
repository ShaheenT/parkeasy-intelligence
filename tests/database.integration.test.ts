import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl ?? 'postgresql://unused:unused@localhost:5432/unused';
process.env.PEI_API_KEYS ??= 'test-key-that-is-long-enough-for-config';
process.env.CORS_ORIGINS ??= '';

const { buildApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const app = buildApp();
const apiKey = process.env.PEI_API_KEYS.split(',')[0]!;
const headers = { 'x-api-key': apiKey, 'content-type': 'application/json' };

describe.skipIf(!testDatabaseUrl)('PostgreSQL API integration', () => {
  const eventId = 'a4d39c91-0b14-4b58-94d9-6b1f11a22c01';
  const externalId = 'integration-space-001';

  beforeAll(async () => {
    await pool.query('DELETE FROM mobility_events WHERE id = $1', [eventId]);
    await pool.query('DELETE FROM parking_space_snapshots WHERE external_id = $1', [externalId]);
  });

  it('persists events and treats retries with the same eventId as duplicates', async () => {
    const payload = { eventId, eventType: 'search_performed', properties: { source: 'integration-test' } };
    const first = await app.inject({ method: 'POST', url: '/v1/events', headers, payload });
    const retry = await app.inject({ method: 'POST', url: '/v1/events', headers, payload });

    expect(first.statusCode).toBe(202);
    expect(first.json().duplicate).toBe(false);
    expect(retry.statusCode).toBe(202);
    expect(retry.json().duplicate).toBe(true);

    const stored = await pool.query('SELECT id FROM mobility_events WHERE id = $1', [eventId]);
    expect(stored.rowCount).toBe(1);
  });

  it('rejects an older inventory snapshot instead of overwriting newer data', async () => {
    const observedAt = new Date().toISOString();
    const payload = {
      latitude: -33.9036, longitude: 18.4201, pricePerHourZar: 25,
      status: 'available', observedAt, attributes: { covered: true }
    };
    const first = await app.inject({
      method: 'PUT', url: `/v1/parking/spaces/${externalId}`, headers, payload
    });
    const stale = await app.inject({
      method: 'PUT', url: `/v1/parking/spaces/${externalId}`, headers,
      payload: { ...payload, pricePerHourZar: 1, observedAt: new Date(Date.now() - 60_000).toISOString() }
    });

    expect(first.statusCode).toBe(200);
    expect(stale.statusCode).toBe(409);
    const stored = await pool.query(
      'SELECT price_per_hour_zar FROM parking_space_snapshots WHERE external_id = $1',
      [externalId]
    );
    expect(Number(stored.rows[0].price_per_hour_zar)).toBe(25);
  });

  it('returns nearby fresh snapshots as advisory recommendations', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/intelligence/parking/recommendations',
      headers,
      payload: {
        destination: { latitude: -33.9036, longitude: 18.4201 },
        durationMinutes: 60, radiusKm: 3, maxResults: 10
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().algorithmVersion).toBe('baseline-v1');
    expect(response.json().results.some((item: { spaceRef: string }) => item.spaceRef === externalId)).toBe(true);
  });
});

afterAll(async () => { await app.close(); });

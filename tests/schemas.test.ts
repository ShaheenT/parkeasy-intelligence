import { describe, expect, it } from 'vitest';
import { eventSchema, recommendationSchema, spaceSnapshotSchema } from '../src/schemas.js';

describe('request schemas', () => {
  it('accepts a supported mobility event', () => {
    expect(eventSchema.safeParse({
      eventId: '2d3b8b2a-7b44-4e5a-9a25-5b4c0e3f8a11',
      eventType: 'search_performed',
      properties: { source: 'marketplace' }
    }).success).toBe(true);
  });

  it('rejects unsupported event types', () => {
    expect(eventSchema.safeParse({ eventType: 'driver_location_tracking' }).success).toBe(false);
  });

  it('rejects invalid coordinates', () => {
    expect(spaceSnapshotSchema.safeParse({
      externalId: 'space-1', latitude: 200, longitude: 18,
      pricePerHourZar: 20, status: 'available'
    }).success).toBe(false);
  });

  it('applies recommendation defaults', () => {
    const parsed = recommendationSchema.parse({
      destination: { latitude: -33.9, longitude: 18.4 }
    });
    expect(parsed.radiusKm).toBe(5);
    expect(parsed.maxResults).toBe(10);
    expect(parsed.durationMinutes).toBe(60);
  });
});

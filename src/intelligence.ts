import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import type { RecommendationInput } from './schemas.js';

type SpaceRow = {
  external_id: string;
  latitude: number;
  longitude: number;
  price_per_hour_zar: string;
  currency: string;
  status: string;
  available_from: Date | null;
  available_until: Date | null;
  updated_at: Date;
  attributes: Record<string, unknown>;
};

const EARTH_RADIUS_KM = 6371;
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (n: number) => n * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export async function recommendParking(input: RecommendationInput) {
  const arrival = input.arrivalTime ? new Date(input.arrivalTime) : new Date();
  const end = new Date(arrival.getTime() + input.durationMinutes * 60_000);
  const freshnessMinutes = Number(process.env.INVENTORY_FRESHNESS_MINUTES ?? 15);

  const result = await pool.query<SpaceRow>(
    `SELECT external_id, latitude, longitude, price_per_hour_zar, currency,
            status, available_from, available_until, updated_at, attributes
       FROM parking_space_snapshots
      WHERE status = 'available'
        AND updated_at >= NOW() - ($1::int * INTERVAL '1 minute')
        AND (available_from IS NULL OR available_from <= $2)
        AND (available_until IS NULL OR available_until >= $3)
        AND ($4::numeric IS NULL OR price_per_hour_zar <= $4)`,
    [freshnessMinutes, arrival, end, input.maxPricePerHourZar ?? null]
  );

  const candidates = result.rows
    .map(row => {
      const distance = distanceKm(
        input.destination.latitude, input.destination.longitude,
        Number(row.latitude), Number(row.longitude)
      );
      const ageMinutes = Math.max(0, (Date.now() - new Date(row.updated_at).getTime()) / 60_000);
      const freshness = Math.max(0, 1 - ageMinutes / freshnessMinutes);
      const proximity = Math.max(0, 1 - distance / input.radiusKm);
      const price = Number(row.price_per_hour_zar);
      const score = Math.round((proximity * 0.65 + freshness * 0.35) * 1000) / 1000;
      return {
        spaceRef: row.external_id,
        distanceKm: Math.round(distance * 100) / 100,
        pricePerHour: price,
        currency: row.currency,
        estimatedTotalPrice: Math.round(price * input.durationMinutes / 60 * 100) / 100,
        score,
        availabilityConfidence: Math.round(freshness * 100),
        updatedAt: new Date(row.updated_at).toISOString(),
        attributes: row.attributes
      };
    })
    .filter(candidate => candidate.distanceKm <= input.radiusKm)
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
    .slice(0, input.maxResults);

  const runId = randomUUID();
  await pool.query(
    `INSERT INTO recommendation_runs
       (id, destination_latitude, destination_longitude, arrival_time, duration_minutes,
        radius_km, result_count, algorithm_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'baseline-v1')`,
    [runId, input.destination.latitude, input.destination.longitude, arrival,
      input.durationMinutes, input.radiusKm, candidates.length]
  );

  return {
    runId,
    algorithmVersion: 'baseline-v1',
    generatedAt: new Date().toISOString(),
    results: candidates,
    limitations: [
      'Recommendations use the latest inventory snapshots received by ParkEasy Intelligence.',
      'Availability confidence measures snapshot freshness; it is not a guarantee of a space.',
      'The calling application must revalidate availability and price before booking.'
    ]
  };
}

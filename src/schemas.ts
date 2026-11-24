import { z } from 'zod';

export const eventSchema = z.object({
  eventId: z.string().uuid().optional(),
  eventType: z.enum([
    'search_performed', 'listing_viewed', 'booking_created', 'booking_cancelled',
    'payment_succeeded', 'arrival_verified', 'departure_verified',
    'host_availability_changed', 'scout_lead_submitted'
  ]),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  subjectRef: z.string().min(1).max(128).optional(),
  properties: z.record(z.string(), z.unknown()).default({})
}).strict();

export const spaceSnapshotSchema = z.object({
  externalId: z.string().min(1).max(128),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  pricePerHourZar: z.number().nonnegative().max(100000),
  currency: z.literal('ZAR').default('ZAR'),
  status: z.enum(['available', 'unavailable', 'inactive']),
  availableFrom: z.string().datetime({ offset: true }).optional(),
  availableUntil: z.string().datetime({ offset: true }).optional(),
  attributes: z.record(z.string(), z.unknown()).default({})
}).strict().refine(
  value => !value.availableFrom || !value.availableUntil ||
    new Date(value.availableFrom) < new Date(value.availableUntil),
  { message: 'availableFrom must be earlier than availableUntil' }
);

export const recommendationSchema = z.object({
  destination: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  }).strict(),
  arrivalTime: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(15).max(10080).default(60),
  radiusKm: z.number().positive().max(50).default(5),
  maxResults: z.number().int().min(1).max(50).default(10),
  maxPricePerHourZar: z.number().nonnegative().optional()
}).strict();

export type SpaceSnapshot = z.infer<typeof spaceSnapshotSchema>;
export type RecommendationInput = z.infer<typeof recommendationSchema>;

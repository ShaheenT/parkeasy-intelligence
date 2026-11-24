import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { pool, checkDatabase } from './db.js';
import { requireApiKey } from './auth.js';
import { eventSchema, recommendationSchema, spaceSnapshotSchema } from './schemas.js';
import { recommendParking } from './intelligence.js';

export function buildApp() {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL, redact: ['req.headers.x-api-key', 'req.headers.authorization'] },
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    bodyLimit: 256 * 1024
  });

  app.register(helmet);
  app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS']
  });
  app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW
  });

  app.get('/health/live', async () => ({ status: 'ok', service: 'parkeasy-intelligence-api' }));

  app.get('/health/ready', async (_request, reply) => {
    try {
      await checkDatabase();
      return { status: 'ready', dependencies: { database: 'ok' } };
    } catch {
      return reply.code(503).send({
        status: 'not_ready',
        dependencies: { database: 'unavailable' }
      });
    }
  });

  app.post('/v1/events', { preHandler: requireApiKey }, async (request, reply) => {
    const parsed = eventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid event payload.', details: parsed.error.flatten() }
      });
    }
    const event = parsed.data;
    const id = event.eventId ?? randomUUID();
    await pool.query(
      `INSERT INTO mobility_events (id, event_type, occurred_at, subject_ref, properties)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id, event.eventType, event.occurredAt ? new Date(event.occurredAt) : new Date(),
        event.subjectRef ?? null, JSON.stringify(event.properties)]
    );
    return reply.code(202).send({ accepted: true, eventId: id });
  });

  app.put('/v1/parking/spaces/:externalId', { preHandler: requireApiKey }, async (request, reply) => {
    const params = request.params as { externalId: string };
    const parsed = spaceSnapshotSchema.safeParse({ ...(request.body as object), externalId: params.externalId });
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid parking snapshot.', details: parsed.error.flatten() }
      });
    }
    const space = parsed.data;
    await pool.query(
      `INSERT INTO parking_space_snapshots
         (external_id, latitude, longitude, price_per_hour_zar, currency, status,
          available_from, available_until, attributes, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (external_id) DO UPDATE SET
         latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
         price_per_hour_zar=EXCLUDED.price_per_hour_zar, currency=EXCLUDED.currency,
         status=EXCLUDED.status, available_from=EXCLUDED.available_from,
         available_until=EXCLUDED.available_until, attributes=EXCLUDED.attributes,
         updated_at=NOW()`,
      [space.externalId, space.latitude, space.longitude, space.pricePerHourZar,
        space.currency, space.status, space.availableFrom ? new Date(space.availableFrom) : null,
        space.availableUntil ? new Date(space.availableUntil) : null, JSON.stringify(space.attributes)]
    );
    return reply.code(200).send({ accepted: true, spaceRef: space.externalId, updatedAt: new Date().toISOString() });
  });

  app.post('/v1/intelligence/parking/recommendations', { preHandler: requireApiKey }, async (request, reply) => {
    const parsed = recommendationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid recommendation request.', details: parsed.error.flatten() }
      });
    }
    const response = await recommendParking(parsed.data);
    return reply.code(200).send(response);
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Request failed');
    const statusCode = typeof error.statusCode === 'number' &&
      error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    const code = statusCode === 404 ? 'NOT_FOUND' :
      statusCode === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
    const message = statusCode === 404 ? 'The requested resource was not found.' :
      statusCode === 400 ? 'The request could not be processed.' :
      'An unexpected error occurred.';
    return reply.code(statusCode).send({
      error: { code, message, requestId: request.id }
    });
  });

  app.addHook('onClose', async () => { await pool.end(); });
  return app;
}

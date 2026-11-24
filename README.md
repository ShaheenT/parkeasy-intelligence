# ParkEasy Intelligence API

Independent API foundation for the ParkEasy Mobility Intelligence Layer.

## Architecture and safety boundary

- This service is designed to run independently of `parkeasy-web-v1`.
- It owns a **separate intelligence database**. Do not point `DATABASE_URL` at the ParkEasy production database.
- It stores event telemetry and parking inventory **snapshots**, not authoritative listings, bookings, payments, wallets or host payouts.
- ParkEasy remains the system of record for marketplace and financial transactions.
- Recommendations are advisory. Revalidate price and availability in ParkEasy immediately before booking.
- No AI model is claimed in this initial release. `baseline-v1` is a deterministic, explainable proximity/freshness ranking baseline.

## Requirements

- Node.js 22+
- PostgreSQL 14+ (local Docker Compose uses PostgreSQL 16)

## Local setup

```bash
cp .env.example .env
npm install
npm run keys:generate
```

Copy the generated `PEI_API_KEYS=...` value into `.env`. Start PostgreSQL:

```bash
docker compose up -d db
```

Set `DATABASE_URL` in `.env` to:

```text
postgresql://postgres:postgres@localhost:5433/parkeasy_intelligence
```

Apply the schema and start the API:

```bash
npm run db:migrate
npm run dev
```

API listens on `http://localhost:8080`.

Alternatively, run the API and database together:

```bash
npm run keys:generate
# Put the generated key in .env
docker compose up --build
```

## Verify

```bash
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

Authenticated endpoints require `x-api-key`.

### Upsert an inventory snapshot

```bash
curl -X PUT http://localhost:8080/v1/parking/spaces/space-001 \
  -H "content-type: application/json" \
  -H "x-api-key: $PEI_API_KEY" \
  -d '{
    "latitude": -33.9036,
    "longitude": 18.4201,
    "pricePerHourZar": 25,
    "status": "available",
    "attributes": {"covered": true}
  }'
```

### Request recommendations

```bash
curl -X POST http://localhost:8080/v1/intelligence/parking/recommendations \
  -H "content-type: application/json" \
  -H "x-api-key: $PEI_API_KEY" \
  -d '{
    "destination": {"latitude": -33.9036, "longitude": 18.4201},
    "durationMinutes": 180,
    "radiusKm": 3,
    "maxResults": 10
  }'
```

### Ingest an event

```bash
curl -X POST http://localhost:8080/v1/events \
  -H "content-type: application/json" \
  -H "x-api-key: $PEI_API_KEY" \
  -d '{
    "eventType": "search_performed",
    "properties": {"surface": "marketplace"}
  }'
```

## API

See [`openapi.yaml`](./openapi.yaml).

| Endpoint | Purpose | Authentication |
|---|---|---|
| `GET /health/live` | Process liveness | No |
| `GET /health/ready` | Database readiness | No |
| `POST /v1/events` | Idempotent event ingestion (event UUID) | API key |
| `PUT /v1/parking/spaces/{externalId}` | Upsert an inventory snapshot | API key |
| `POST /v1/intelligence/parking/recommendations` | Rank fresh snapshots | API key |

## Tests and build

```bash
npm run typecheck
npm test
npm run build
```

The health and schema tests do not require a running PostgreSQL instance. Add database-backed integration tests against an ephemeral PostgreSQL service in CI before production release.

## Deployment

Deploy as a long-running Node.js service or container. Configure:
- `DATABASE_URL` for a dedicated managed PostgreSQL database
- `DATABASE_SSL=true` when the provider requires TLS with a valid certificate
- `PEI_API_KEYS` with independently generated, rotated secrets
- `CORS_ORIGINS` with only the exact browser origins that need access
- `INVENTORY_FRESHNESS_MINUTES` based on the snapshot delivery SLA

Run `npm run db:migrate` as a controlled release step before deploying code that requires the new schema. Keep database credentials and API keys in the hosting provider's secret manager. Do not expose the API key in browser code; call this API from a ParkEasy server-side adapter.

## Production hardening still required

This is a deployable foundation, not a claim of production certification. Before production traffic:
1. Configure managed PostgreSQL backups, point-in-time recovery, TLS and connection limits.
2. Add database-backed integration tests and load/security testing.
3. Add API key storage/rotation via a secrets manager and per-client scopes.
4. Define event retention, deletion, consent and POPIA controls with a data-processing review.
5. Establish snapshot delivery SLAs and stale-data alerting.
6. Add metrics/tracing, alert routing and operational runbooks.
7. Review CORS and rate limits for the actual server-to-server deployment.
8. Validate the integration contract against the real ParkEasy schema and staging flows.

## Versioning

All business endpoints are under `/v1`. Breaking changes require a new major API path. Additive response fields are permitted; clients should ignore unknown fields.

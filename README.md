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

Build the service, apply versioned migrations, and start the API:

```bash
npm run build
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
    "observedAt": "2026-11-24T10:00:00Z",
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
    "eventId": "2d3b8b2a-7b44-4e5a-9a25-5b4c0e3f8a11",
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

The health and schema tests run without PostgreSQL. Database integration tests run when TEST_DATABASE_URL is set; CI provisions PostgreSQL 16, applies migrations, and executes the full test suite.

## Deployment

Deploy as a long-running Node.js service or container. Configure:
- `DATABASE_URL` for a dedicated managed PostgreSQL database
- `DATABASE_SSL=true` when the provider requires TLS with a valid certificate
- `PEI_API_KEYS` with independently generated, rotated secrets
- `CORS_ORIGINS` with only the exact browser origins that need access
- `INVENTORY_FRESHNESS_MINUTES` based on the snapshot delivery SLA

Run `npm run db:migrate` as a controlled release step before deploying code that requires the new schema. Keep database credentials and API keys in the hosting provider's secret manager. Do not expose the API key in browser code; call this API from a ParkEasy server-side adapter.

## Production deployment gates

This repository now includes versioned, checksum-verified migrations, PostgreSQL-backed CI, and a multi-stage Docker image. A production release still requires a managed PostgreSQL instance, backup/PITR configuration, TLS, secret provisioning, monitoring/alerting, a data retention policy, load testing, and a verified staging integration. The local Compose credentials are for local development only.

## Production hardening still required

Before production traffic, complete these environment-specific gates:
1. Provision managed PostgreSQL with TLS, backups, point-in-time recovery and tested restore procedures.
2. Store API keys and database credentials in the hosting secret manager; rotate keys and use separate credentials per environment.
3. Define event retention, deletion, consent and POPIA controls with a data-processing review.
4. Establish snapshot delivery SLAs and stale-data alerting.
5. Add metrics/tracing, alert routing and operational runbooks.
6. Run load, abuse and security testing against staging; confirm rate limiting across replicas or keep a single API replica until a shared rate-limit store is configured.
7. Validate the read-only adapter contract against ParkEasy staging, including field mapping, deletion propagation and event minimisation.

## Versioning

All business endpoints are under `/v1`. Breaking changes require a new major API path. Additive response fields are permitted; clients should ignore unknown fields.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mobility_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'search_performed','listing_viewed','booking_created','booking_cancelled',
    'payment_succeeded','arrival_verified','departure_verified',
    'host_availability_changed','scout_lead_submitted'
  )),
  occurred_at TIMESTAMPTZ NOT NULL,
  subject_ref TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mobility_events_type_time_idx ON mobility_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS mobility_events_received_idx ON mobility_events(received_at DESC);

CREATE TABLE IF NOT EXISTS parking_space_snapshots (
  external_id TEXT PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  price_per_hour_zar NUMERIC(12,2) NOT NULL CHECK (price_per_hour_zar >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL CHECK (status IN ('available','unavailable','inactive')),
  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (available_from IS NULL OR available_until IS NULL OR available_from < available_until)
);
CREATE INDEX IF NOT EXISTS parking_snapshots_status_updated_idx ON parking_space_snapshots(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_runs (
  id UUID PRIMARY KEY,
  destination_latitude DOUBLE PRECISION NOT NULL,
  destination_longitude DOUBLE PRECISION NOT NULL,
  arrival_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 10080),
  radius_km NUMERIC(6,2) NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  algorithm_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS recommendation_runs_created_idx ON recommendation_runs(created_at DESC);

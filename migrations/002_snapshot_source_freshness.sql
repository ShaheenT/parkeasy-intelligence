ALTER TABLE parking_space_snapshots
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS parking_snapshots_geo_status_idx
  ON parking_space_snapshots(status, latitude, longitude);

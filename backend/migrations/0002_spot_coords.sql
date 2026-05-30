-- Add geographic coordinates to spots so the frontend can plot them on a map.
-- Nullable: spots without coordinates simply don't get a pin. Idempotent like
-- the rest of the schema (safe to re-run).

ALTER TABLE kidgo_spots ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE kidgo_spots ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;

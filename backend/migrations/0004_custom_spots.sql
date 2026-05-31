-- Allow user-created (custom) locations alongside the curated spot library.
-- `curated = false` marks an ad-hoc place a parent named when posting; these
-- still back real activities (and show on the map if geocoded) but are kept out
-- of the curated pickers ("Popular spots", filters). Idempotent.

ALTER TABLE kidgo_spots ADD COLUMN IF NOT EXISTS curated BOOLEAN NOT NULL DEFAULT TRUE;

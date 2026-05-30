-- Short manage-link codes (e.g. /m/AB3D9KQ). A code is a small, unguessable key
-- into this table; resolving it hands back a normal 1-hour session token, so the
-- link in WhatsApp stays short while the rest of the auth machinery is unchanged.
-- Idempotent like the rest of the schema.

CREATE TABLE IF NOT EXISTS kidgo_link_codes (
    code        TEXT PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES kidgo_users(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES kidgo_activities(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kidgo_link_codes_expires_idx ON kidgo_link_codes (expires_at);

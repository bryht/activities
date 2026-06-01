-- Multi-platform identity (Telegram + WhatsApp + Signal).
--
-- Until now a user was keyed solely by `phone` (UNIQUE), which held whatever
-- opaque id the single chat platform supplied. With several platforms the same
-- digits can identify different people — a Telegram numeric user id can collide
-- with a real WhatsApp/Signal phone number — so identity becomes (platform, phone).
--
-- Existing rows predate multi-platform and all came from Telegram, so backfill
-- that via the column default; the community host seed row is covered too.

ALTER TABLE kidgo_users
    ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'telegram';

-- Swap the global UNIQUE(phone) for UNIQUE(platform, phone). The old constraint
-- created by `phone TEXT UNIQUE` is named `kidgo_users_phone_key`.
ALTER TABLE kidgo_users DROP CONSTRAINT IF EXISTS kidgo_users_phone_key;
ALTER TABLE kidgo_users
    ADD CONSTRAINT kidgo_users_platform_phone_key UNIQUE (platform, phone);

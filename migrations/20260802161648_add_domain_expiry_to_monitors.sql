-- migrate:up
ALTER TABLE monitors ADD COLUMN domain_expires_at DATETIME;
ALTER TABLE monitors ADD COLUMN domain_registrar TEXT;
ALTER TABLE monitors ADD COLUMN domain_checked_at DATETIME;

-- migrate:down
ALTER TABLE monitors DROP COLUMN domain_checked_at;
ALTER TABLE monitors DROP COLUMN domain_registrar;
ALTER TABLE monitors DROP COLUMN domain_expires_at;

-- =====================================================================
--  REALITY HEALTH BRIDGE - database update 2 (device health for the RHS admin site)
--  Run ONCE in phpMyAdmin on rmsugnxf_rhb (click the database > SQL > paste > Go).
--  If you see "Duplicate column name", it was already run - that is fine.
-- =====================================================================
ALTER TABLE devices
  ADD COLUMN pending_count  INT         NOT NULL DEFAULT 0  AFTER last_seen_at,
  ADD COLUMN rejected_count INT         NOT NULL DEFAULT 0  AFTER pending_count,
  ADD COLUMN app_version    VARCHAR(20) NOT NULL DEFAULT '' AFTER rejected_count;

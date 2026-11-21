-- =====================================================================
--  REALITY HEALTH BRIDGE - database update 1 (licences managed by the RHS admin site)
--  Run ONCE in phpMyAdmin on rmsugnxf_rhb (click the database > SQL > paste > Go).
--  Only needed for a database created with the FIRST schema.sql (19 Nov 2026).
--  If you see "Duplicate column name", it was already run - that is fine, nothing is lost.
-- =====================================================================
ALTER TABLE facilities
  ADD COLUMN license_updated_at DATETIME(3) NULL AFTER trial_used,
  ADD COLUMN license_source   VARCHAR(10)  NOT NULL DEFAULT '' AFTER license_updated_at,
  ADD COLUMN license_code     VARCHAR(20)  NOT NULL DEFAULT '' AFTER license_source,
  ADD COLUMN suspended        TINYINT(1)   NOT NULL DEFAULT 0  AFTER license_code,
  ADD COLUMN suspended_reason VARCHAR(300) NOT NULL DEFAULT '' AFTER suspended;

-- Existing pharmacies: their licence came from the app before the server checked it.
UPDATE facilities SET license_source = IF(license_trial = 1, 'trial', 'legacy'), license_updated_at = updated_at
 WHERE license_expiry IS NOT NULL AND license_source = '';

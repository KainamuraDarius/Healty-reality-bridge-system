-- =====================================================================
--  REALITY HEALTH BRIDGE - database update 6 (Standard plan: 5 -> 8 devices)
--  Run ONCE in phpMyAdmin on rmsugnxf_rhb (click the database > SQL > paste > Go),
--  right AFTER uploading the new files. Safe to run again (it only changes facilities still at 5).
--
--  Facilities on the Standard plan, and on the free trial (which gets the Standard limit), that
--  still have the old default of 5 devices get 8. A facility RHS gave a custom number keeps it.
--  Each changed facility gets a new sync number, so its phones receive the new limit on the next sync.
-- =====================================================================

START TRANSACTION;
SELECT value INTO @seq FROM sync_counter WHERE id = 1 FOR UPDATE;

UPDATE facilities
   SET max_devices = 8,
       license_updated_at = UTC_TIMESTAMP(3),
       server_seq = (@seq := @seq + 1)
 WHERE deleted = 0
   AND max_devices = 5
   AND (license_tier = 'standard' OR (license_trial = 1 AND (license_tier IS NULL OR license_tier = '')));

UPDATE sync_counter SET value = @seq WHERE id = 1;
COMMIT;

-- How many facilities were raised to 8 (for your information):
SELECT COUNT(*) AS standard_or_trial_with_8_devices FROM facilities
 WHERE deleted = 0 AND max_devices = 8 AND (license_tier = 'standard' OR license_trial = 1);

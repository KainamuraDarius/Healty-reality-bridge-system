-- =====================================================================
--  REALITY HEALTH BRIDGE - database update 7 (privacy policy and terms, data deletion requests)
--  Run ONCE in phpMyAdmin on rmsugnxf_rhb (click the database > SQL > paste > Go),
--  BEFORE uploading the new files.
--  If you see "Duplicate column name 'terms_version'", this update was already run - fine.
-- =====================================================================

-- Server only (never synced to phones). A facility's super admin asks RHS to delete the
-- facility's data (app: Settings -> Privacy). RHS handles it on the admin site (privacy.php).
-- Kept after the facility is erased, as the record that the request was carried out.
CREATE TABLE IF NOT EXISTS data_requests (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  facility_id   VARCHAR(36)  NOT NULL,
  facility_name VARCHAR(200) NOT NULL DEFAULT '',  -- as it was when they asked
  user_id       VARCHAR(36)  NOT NULL DEFAULT '',
  user_name     VARCHAR(200) NOT NULL DEFAULT '',
  contact       VARCHAR(200) NOT NULL DEFAULT '',  -- phone / email RHS should use to confirm
  kind          VARCHAR(20)  NOT NULL DEFAULT 'delete',
  reason        TEXT         NULL,
  status        VARCHAR(12)  NOT NULL DEFAULT 'open',  -- open | done | cancelled
  admin_note    VARCHAR(500) NOT NULL DEFAULT '',
  handled_by    VARCHAR(200) NOT NULL DEFAULT '',
  handled_at    DATETIME(3)  NULL,
  created_at    DATETIME(3)  NOT NULL,
  KEY idx_status (status, created_at),
  KEY idx_fac (facility_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Which version of the privacy policy and terms the facility agreed to, when, and who agreed.
-- Set by the server only (when registering, or Settings -> Privacy -> I agree); phones read it.
ALTER TABLE facilities
  ADD COLUMN terms_version     VARCHAR(20)  NOT NULL DEFAULT '' AFTER license_code,
  ADD COLUMN terms_accepted_at DATETIME(3)  NULL AFTER terms_version,
  ADD COLUMN terms_accepted_by VARCHAR(200) NOT NULL DEFAULT '' AFTER terms_accepted_at;

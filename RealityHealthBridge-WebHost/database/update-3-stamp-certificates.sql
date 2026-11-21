-- =====================================================================
--  REALITY HEALTH BRIDGE - database update 3 (stamp, certificates, cadre vs position,
--  super admin + admin permissions, super admin edits the facility profile)
--  Run ONCE in phpMyAdmin on rmsugnxf_rhb (click the database > SQL > paste > Go),
--  BEFORE uploading the new api/ files.
--  If you see "Duplicate column name" or "already exists", that part was already run - fine.
-- =====================================================================

-- Each person's job at the facility (e.g. Administrator), separate from their cadre (e.g. Nurse),
-- and for admins the sensitive areas the super admin ticked for them (none at first).
ALTER TABLE users
  ADD COLUMN position    VARCHAR(100) NOT NULL DEFAULT '' AFTER cadre,
  ADD COLUMN permissions VARCHAR(200) NOT NULL DEFAULT '' AFTER position;

-- The facility's digital stamp, printed on receipts and reports.
-- profile_updated_at: when the super admin (in the app) or RHS last changed the profile.
ALTER TABLE facilities
  ADD COLUMN stamp              MEDIUMTEXT  NULL AFTER logo,
  ADD COLUMN stamp_updated_at   DATETIME(3) NULL AFTER stamp,
  ADD COLUMN profile_updated_at DATETIME(3) NULL AFTER stamp_updated_at;

-- Operational certificates / licences uploaded by the facility (picture or PDF).
CREATE TABLE IF NOT EXISTS facility_documents (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  facility_id VARCHAR(36)  NOT NULL,
  device_id   VARCHAR(40)  NOT NULL DEFAULT '',
  kind        VARCHAR(20)  NOT NULL DEFAULT 'certificate',
  title       VARCHAR(200) NOT NULL DEFAULT '',   -- e.g. "NDA operating licence 2026"
  file_name   VARCHAR(200) NOT NULL DEFAULT '',
  mime        VARCHAR(100) NOT NULL DEFAULT '',
  size_bytes  INT          NOT NULL DEFAULT 0,
  data        MEDIUMTEXT   NULL,                   -- the file as text (data URL), at most 2 MB
  valid_until DATE         NULL,
  uploaded_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at  DATETIME(3)  NOT NULL,
  updated_at  DATETIME(3)  NOT NULL,
  deleted     TINYINT(1)   NOT NULL DEFAULT 0,
  server_seq  BIGINT UNSIGNED NOT NULL,
  KEY idx_fac_seq (facility_id, server_seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
--  REALITY HEALTH BRIDGE - database update 5 (feedback and ratings from the app)
--  Run ONCE in phpMyAdmin on rmsugnxf_rhb (click the database > SQL > paste > Go),
--  BEFORE uploading the new api/ files. Safe to run again.
-- =====================================================================

-- Server only (never synced to phones). Feedback and star ratings people send from the app
-- (Settings -> Feedback & rating). Read by RHS super admins on the admin site (feedback.php).
CREATE TABLE IF NOT EXISTS app_feedback (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  facility_id  VARCHAR(36)  NOT NULL,
  user_id      VARCHAR(36)  NOT NULL DEFAULT '',
  user_name    VARCHAR(200) NOT NULL DEFAULT '',   -- as it was when they sent it
  user_role    VARCHAR(20)  NOT NULL DEFAULT '',   -- Super admin | Admin | Staff
  device_id    VARCHAR(40)  NOT NULL DEFAULT '',
  rating       TINYINT      NOT NULL,              -- 1 to 5 stars
  category     VARCHAR(20)  NOT NULL DEFAULT 'general', -- general | idea | problem | praise
  message      TEXT         NULL,
  app_version  VARCHAR(20)  NOT NULL DEFAULT '',
  status       VARCHAR(10)  NOT NULL DEFAULT 'new',     -- new | read
  reviewed_by  VARCHAR(200) NOT NULL DEFAULT '',   -- the RHS admin who marked it read
  reviewed_at  DATETIME(3)  NULL,
  created_at   DATETIME(3)  NOT NULL,
  KEY idx_time (created_at),
  KEY idx_status (status, created_at),
  KEY idx_fac_time (facility_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

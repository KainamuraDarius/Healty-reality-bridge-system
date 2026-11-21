-- =====================================================================
--  RHS ADMIN - extra tables for the system-admin website
--  Run in phpMyAdmin on the SAME database as the pharmacy app (rmsugnxf_rhb):
--  click rmsugnxf_rhb on the left > SQL tab > paste this whole file > Go.
--  Safe to run again: it only creates what is missing and deletes nothing.
--  It does not change any pharmacy table.
-- =====================================================================
SET NAMES utf8mb4;

-- People at REALITY HEALTH SYSTEM who can log in to the admin site.
--   role: super   = everything, including managing the admin team
--         support = everything except the admin team
CREATE TABLE IF NOT EXISTS admin_users (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email                VARCHAR(191) NOT NULL,
  full_name            VARCHAR(200) NOT NULL DEFAULT '',
  role                 ENUM('super','support') NOT NULL DEFAULT 'support',
  password_hash        VARCHAR(255) NOT NULL,
  active               TINYINT(1)   NOT NULL DEFAULT 1,
  must_change_password TINYINT(1)   NOT NULL DEFAULT 0,  -- 1 = must pick a new password at next login
  last_login_at        DATETIME     NULL,
  signups_seen_id      BIGINT UNSIGNED NULL,               -- newest sign-up this admin has looked at
  created_by           INT UNSIGNED NULL,
  created_at           DATETIME     NOT NULL,
  updated_at           DATETIME     NOT NULL,
  UNIQUE KEY uq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every login attempt, to lock out password guessing.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email        VARCHAR(191) NOT NULL,
  ip           VARCHAR(45)  NOT NULL,
  success      TINYINT(1)   NOT NULL DEFAULT 0,
  attempted_at DATETIME     NOT NULL,
  KEY idx_email_time (email, attempted_at),
  KEY idx_ip_time (ip, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Who did what, when, to which pharmacy. Never edited or deleted by the site.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_id    INT UNSIGNED NULL,
  admin_email VARCHAR(191) NOT NULL DEFAULT '',
  action      VARCHAR(60)  NOT NULL,          -- e.g. login, admin.create, licence.renew
  facility_id VARCHAR(36)  NULL,              -- the pharmacy it was about, if any
  target      VARCHAR(200) NOT NULL DEFAULT '',  -- short human description of what was changed
  details     TEXT         NULL,              -- JSON with before/after values
  ip          VARCHAR(45)  NOT NULL DEFAULT '',
  created_at  DATETIME     NOT NULL,
  KEY idx_time (created_at),
  KEY idx_facility (facility_id, created_at),
  KEY idx_admin (admin_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Money received from pharmacies. Payments are never deleted: a mistake is "voided" with a reason.
CREATE TABLE IF NOT EXISTS admin_payments (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  facility_id VARCHAR(36)   NOT NULL,
  amount      DECIMAL(14,2) NOT NULL,
  method      ENUM('momo','cash','bank','other') NOT NULL DEFAULT 'momo',
  reference   VARCHAR(100)  NOT NULL DEFAULT '',   -- MoMo transaction ID, receipt or bank slip number
  paid_on     DATE          NOT NULL,              -- the day the money was received
  purpose     ENUM('setup','renewal','other') NOT NULL DEFAULT 'renewal',
  package     VARCHAR(20)   NOT NULL DEFAULT '',
  months      INT           NOT NULL DEFAULT 0,    -- months of licence this payment covers (0 = not a licence payment)
  note        VARCHAR(300)  NOT NULL DEFAULT '',
  recorded_by INT UNSIGNED  NULL,
  created_at  DATETIME      NOT NULL,
  voided      TINYINT(1)    NOT NULL DEFAULT 0,
  void_reason VARCHAR(300)  NOT NULL DEFAULT '',
  voided_by   INT UNSIGNED  NULL,
  voided_at   DATETIME      NULL,
  KEY idx_facility (facility_id, paid_on),
  KEY idx_paid_on (paid_on),
  KEY idx_reference (method, reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Messages shown inside the pharmacy app (a banner at the top). Delivered with each sync.
CREATE TABLE IF NOT EXISTS announcements (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(120)  NOT NULL,
  body        VARCHAR(1000) NOT NULL DEFAULT '',
  level       ENUM('info','warning','urgent') NOT NULL DEFAULT 'info',
  who         ENUM('all','owners') NOT NULL DEFAULT 'all',      -- owners = pharmacy admins only
  audience    ENUM('all','selected') NOT NULL DEFAULT 'all',    -- selected = only the pharmacies in announcement_targets
  dismissible TINYINT(1)   NOT NULL DEFAULT 1,                  -- 1 = people can close it with x
  starts_at   DATETIME     NOT NULL,                            -- UTC
  ends_at     DATETIME     NULL,                                -- UTC; NULL = until stopped
  active      TINYINT(1)   NOT NULL DEFAULT 1,                  -- 0 = stopped by an admin
  shown_at    DATETIME     NOT NULL,                            -- changing it shows the message again to people who closed it
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  KEY idx_live (active, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcement_targets (
  announcement_id INT UNSIGNED NOT NULL,
  facility_id     VARCHAR(36)  NOT NULL,
  PRIMARY KEY (announcement_id, facility_id),
  KEY idx_facility (facility_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Small settings changed from the admin site (e.g. who gets an email when a pharmacy signs up).
CREATE TABLE IF NOT EXISTS admin_settings (
  name       VARCHAR(60)  NOT NULL PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

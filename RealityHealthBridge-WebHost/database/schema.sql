-- =====================================================================
--  REALITY HEALTH BRIDGE - MySQL schema
--  How to use: cPanel > phpMyAdmin > click database "rmsugnxf_rhb" on the
--  left > "SQL" tab > paste this whole file > Go.
--  Safe to run again: it only creates what is missing and deletes nothing.
-- =====================================================================
--
--  Columns every synced table has (explained simply):
--    id          - the record's own ID, created on the phone/computer that made it
--    facility_id - which pharmacy the record belongs to
--    device_id   - which phone/computer created or last changed it
--    created_at  - when it was first made (UTC)
--    updated_at  - when it was last changed (UTC). Newest one wins.
--    deleted     - 1 = deleted. Synced data is never truly removed, so every
--                  device learns about the delete.
--    server_seq  - a number the SERVER stamps on the row each time it is saved.
--                  Devices remember the highest number they have seen and ask
--                  "give me everything after number N".
--
--  Stock remaining is NOT stored anywhere. It is always calculated:
--    qty_received - sold (sale_items) + adjustments
--  so two devices selling at the same time can never overwrite each other.
-- =====================================================================

SET NAMES utf8mb4;

-- One shared counter that hands out server_seq numbers.
CREATE TABLE IF NOT EXISTS sync_counter (
  id    TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  value BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO sync_counter (id, value) VALUES (1, 0);

-- ---------------------------------------------------------------------
-- Pharmacy profile + licence. facility_id = id for this table.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facilities (
  id               VARCHAR(36)  NOT NULL PRIMARY KEY,
  facility_id      VARCHAR(36)  NOT NULL,
  device_id        VARCHAR(40)  NOT NULL DEFAULT '',
  name             VARCHAR(200) NOT NULL DEFAULT '',
  slogan           VARCHAR(300) NOT NULL DEFAULT '',
  location         VARCHAR(300) NOT NULL DEFAULT '',
  contact          VARCHAR(100) NOT NULL DEFAULT '',
  email            VARCHAR(191) NOT NULL DEFAULT '',
  logo             MEDIUMTEXT   NULL,               -- small picture stored as text (data URL)
  stamp            MEDIUMTEXT   NULL,               -- digital stamp picture (data URL), printed on receipts/reports
  stamp_updated_at DATETIME(3)  NULL,               -- when the stamp last changed (newest wins)
  profile_updated_at DATETIME(3) NULL,              -- when the super admin (or RHS) last changed name/contacts/logo
  license_facility VARCHAR(200) NOT NULL DEFAULT '', -- pharmacy name the licence code was issued for
  license_expiry   DATE         NULL,
  license_trial    TINYINT(1)   NOT NULL DEFAULT 0,
  license_tier     VARCHAR(20)  NOT NULL DEFAULT '',
  max_devices      INT          NOT NULL DEFAULT 5,
  trial_used       TINYINT(1)   NOT NULL DEFAULT 0,
  license_updated_at DATETIME(3) NULL,               -- when the licence last changed (kept separate from the profile)
  license_source   VARCHAR(10)  NOT NULL DEFAULT '', -- trial | code | momo | admin | legacy
  license_code     VARCHAR(20)  NOT NULL DEFAULT '', -- activation code a device used, if any
  terms_version    VARCHAR(20)  NOT NULL DEFAULT '', -- privacy policy + terms version the facility agreed to (server sets it)
  terms_accepted_at DATETIME(3) NULL,
  terms_accepted_by VARCHAR(200) NOT NULL DEFAULT '',
  suspended        TINYINT(1)   NOT NULL DEFAULT 0,  -- set ONLY by the RHS admin site
  suspended_reason VARCHAR(300) NOT NULL DEFAULT '',
  created_at       DATETIME(3)  NOT NULL,
  updated_at       DATETIME(3)  NOT NULL,
  deleted          TINYINT(1)   NOT NULL DEFAULT 0,
  server_seq       BIGINT UNSIGNED NOT NULL,
  KEY idx_fac_seq (facility_id, server_seq),
  KEY idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Logins (admins and staff).
--   pw_salt + pw_verifier : synced to every device so people can log in OFFLINE.
--                           The verifier is a one-way scramble, not the password.
--   password_hash         : server only, never sent to devices. Used by login.php.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  facility_id   VARCHAR(36)  NOT NULL,
  device_id     VARCHAR(40)  NOT NULL DEFAULT '',
  username      VARCHAR(100) NOT NULL,
  pw_salt       VARCHAR(64)  NOT NULL DEFAULT '',
  pw_verifier   VARCHAR(100) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NULL,
  role          ENUM('owner','staff') NOT NULL DEFAULT 'staff',  -- owner = Admin
  is_primary    TINYINT(1)   NOT NULL DEFAULT 0,                 -- 1 = main admin
  full_name     VARCHAR(200) NOT NULL DEFAULT '',
  contact       VARCHAR(100) NOT NULL DEFAULT '',
  email         VARCHAR(191) NOT NULL DEFAULT '',
  cadre         VARCHAR(100) NOT NULL DEFAULT '',                -- what they trained as, e.g. Nurse
  position      VARCHAR(100) NOT NULL DEFAULT '',                -- their job here, e.g. Administrator
  permissions   VARCHAR(200) NOT NULL DEFAULT '',                -- admins: areas the super admin ticked, e.g. "finance,reports"
  created_by    VARCHAR(100) NOT NULL DEFAULT '',
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  deleted       TINYINT(1)   NOT NULL DEFAULT 0,
  server_seq    BIGINT UNSIGNED NOT NULL,
  KEY idx_fac_seq (facility_id, server_seq),
  KEY idx_fac_user (facility_id, username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Phones/computers allowed to use a pharmacy. Created by the server when a
-- device logs in. device_code (A, B, C...) goes into patient numbers.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  id           VARCHAR(40)  NOT NULL PRIMARY KEY,
  facility_id  VARCHAR(36)  NOT NULL,
  device_id    VARCHAR(40)  NOT NULL DEFAULT '',
  label        VARCHAR(100) NOT NULL DEFAULT '',
  device_code  VARCHAR(4)   NOT NULL,
  added_date   DATE         NULL,
  last_seen_at DATETIME(3)  NULL,
  pending_count  INT        NOT NULL DEFAULT 0,   -- records waiting to upload, as the device last reported
  rejected_count INT        NOT NULL DEFAULT 0,   -- records the server refused, as the device last reported
  app_version  VARCHAR(20)  NOT NULL DEFAULT '',
  created_at   DATETIME(3)  NOT NULL,
  updated_at   DATETIME(3)  NOT NULL,
  deleted      TINYINT(1)   NOT NULL DEFAULT 0,
  server_seq   BIGINT UNSIGNED NOT NULL,
  KEY idx_fac_seq (facility_id, server_seq),
  UNIQUE KEY uq_fac_code (facility_id, device_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Products (drugs and supplies).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  facility_id   VARCHAR(36)  NOT NULL,
  device_id     VARCHAR(40)  NOT NULL DEFAULT '',
  name          VARCHAR(200) NOT NULL,
  form          VARCHAR(100) NOT NULL DEFAULT '',
  unit          VARCHAR(100) NOT NULL DEFAULT '',
  pack_size     VARCHAR(100) NOT NULL DEFAULT '',
  reorder_level INT          NOT NULL DEFAULT 0,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  deleted       TINYINT(1)   NOT NULL DEFAULT 0,
  server_seq    BIGINT UNSIGNED NOT NULL,
  KEY idx_fac_seq (facility_id, server_seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Stock received (one row per stock-in). No "qty remaining" column on purpose.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_batches (
  id            VARCHAR(36)   NOT NULL PRIMARY KEY,
  facility_id   VARCHAR(36)   NOT NULL,
  device_id     VARCHAR(40)   NOT NULL DEFAULT '',
  product_id    VARCHAR(36)   NOT NULL,
  batch_no      VARCHAR(100)  NOT NULL DEFAULT '',
  expiry        DATE          NULL,
  cost_price    DECIMAL(14,2) NOT NULL DEFAULT 0,
  sell_price    DECIMAL(14,2) NOT NULL DEFAULT 0,
  qty_received  INT           NOT NULL DEFAULT 0,
  date_received DATE          NULL,
  supplier      VARCHAR(200)  NOT NULL DEFAULT '',
  received_by   VARCHAR(100)  NOT NULL DEFAULT '',
  created_at    DATETIME(3)   NOT NULL,
  updated_at    DATETIME(3)   NOT NULL,
  deleted       TINYINT(1)    NOT NULL DEFAULT 0,
  server_seq    BIGINT UNSIGNED NOT NULL,
  KEY idx_fac_seq (facility_id, server_seq),
  KEY idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Sales. "Amount paid" is NOT stored: it is the sum of sale_payments.
-- items_rev: when a sale is edited, its items get a new revision tag and only
-- items with the sale's current items_rev count.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  id                 VARCHAR(36)   NOT NULL PRIMARY KEY,
  facility_id        VARCHAR(36)   NOT NULL,
  device_id          VARCHAR(40)   NOT NULL DEFAULT '',
  sale_date          DATETIME(3)   NOT NULL,
  patient_no         VARCHAR(40)   NOT NULL DEFAULT '',
  buyer              VARCHAR(200)  NOT NULL DEFAULT '',
  buyer_contact      VARCHAR(100)  NOT NULL DEFAULT '',
  diagnosis          VARCHAR(500)  NOT NULL DEFAULT '',
  additional_details TEXT          NULL,
  total              DECIMAL(14,2) NOT NULL DEFAULT 0,
  sold_by            VARCHAR(100)  NOT NULL DEFAULT '',
  sold_by_role       VARCHAR(20)   NOT NULL DEFAULT '',
  items_rev          VARCHAR(36)   NOT NULL DEFAULT '',
  created_at         DATETIME(3)   NOT NULL,
  updated_at         DATETIME(3)   NOT NULL,
  deleted            TINYINT(1)    NOT NULL DEFAULT 0,
  server_seq         BIGINT UNSIGNED NOT NULL,
  KEY idx_fac_seq (facility_id, server_seq),
  KEY idx_fac_date (facility_id, sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sale_items (
  id          VARCHAR(36)   NOT NULL PRIMARY KEY,
  facility_id VARCHAR(36)   NOT NULL,
  device_id   VARCHAR(40)   NOT NULL DEFAULT '',
  sale_id     VARCHAR(36)   NOT NULL,
  sale_rev    VARCHAR(36)   NOT NULL DEFAULT '',
  product_id  VARCHAR(36)   NOT NULL,
  batch_id    VARCHAR(36)   NOT NULL,
  qty         INT           NOT NULL DEFAULT 0,
  unit_price  DECIMAL(14,2) NOT NULL DEFAULT 0,
  cost        DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at  DATETIME(3)   NOT NULL,
  updated_at  DATETIME(3)   NOT NULL,
  deleted     TINYINT(1)    NOT NULL DEFAULT 0,
  server_seq  BIGINT UNSIGNED NOT NULL,
  KEY idx_fac_seq (facility_id, server_seq),
  KEY idx_sale (sale_id),
  KEY idx_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every payment, including the first one at the time of sale.
CREATE TABLE IF NOT EXISTS sale_payments (
  id          VARCHAR(36)   NOT NULL PRIMARY KEY,
  facility_id VARCHAR(36)   NOT NULL,
  device_id   VARCHAR(40)   NOT NULL DEFAULT '',
  sale_id     VARCHAR(36)   NOT NULL,
  amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_at     DATETIME(3)   NOT NULL,
  recorded_by VARCHAR(100)  NOT NULL DEFAULT '',
  created_at  DATETIME(3)   NOT NULL,
  updated_at  DATETIME(3)   NOT NULL,
  deleted     TINYINT(1)    NOT NULL DEFAULT 0,
  server_seq  BIGINT UNSIGNED NOT NULL,
  KEY idx_fac_seq (facility_id, server_seq),
  KEY idx_sale (sale_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stock corrections: +5 found, -3 damaged, count corrections, etc.
CREATE TABLE IF NOT EXISTS adjustments (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  facility_id VARCHAR(36)  NOT NULL,
  device_id   VARCHAR(40)  NOT NULL DEFAULT '',
  batch_id    VARCHAR(36)  NOT NULL,
  product_id  VARCHAR(36)  NOT NULL,
  qty_change  INT          NOT NULL DEFAULT 0,
  reason      VARCHAR(300) NOT NULL DEFAULT '',
  adjusted_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at  DATETIME(3)  NOT NULL,
  updated_at  DATETIME(3)  NOT NULL,
  deleted     TINYINT(1)   NOT NULL DEFAULT 0,
  server_seq  BIGINT UNSIGNED NOT NULL,
  KEY idx_fac_seq (facility_id, server_seq),
  KEY idx_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Operational certificates / licences uploaded by the facility (picture or PDF).
-- ---------------------------------------------------------------------
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

-- =====================================================================
-- SERVER-ONLY tables (never synced to devices)
-- =====================================================================

-- Login tokens. Only a SHA-256 fingerprint of each token is stored.
CREATE TABLE IF NOT EXISTS api_tokens (
  token_hash   CHAR(64)    NOT NULL PRIMARY KEY,
  facility_id  VARCHAR(36) NOT NULL,
  user_id      VARCHAR(36) NOT NULL,
  device_id    VARCHAR(40) NOT NULL,
  created_at   DATETIME(3) NOT NULL,
  last_used_at DATETIME(3) NOT NULL,
  expires_at   DATETIME(3) NOT NULL,
  revoked      TINYINT(1)  NOT NULL DEFAULT 0,
  KEY idx_device (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Online subscription payments (Nylon Pay), server only. One row per payment a facility starts in the app.
CREATE TABLE IF NOT EXISTS payment_requests (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,  -- also the "reference" sent to Nylon Pay
  facility_id     VARCHAR(36)  NOT NULL,
  user_id         VARCHAR(36)  NOT NULL DEFAULT '',   -- who started it
  device_id       VARCHAR(40)  NOT NULL DEFAULT '',
  kind            VARCHAR(10)  NOT NULL DEFAULT 'setup', -- setup (new plan / upgrade) | renewal
  package         VARCHAR(20)  NOT NULL DEFAULT '',
  months          INT          NOT NULL DEFAULT 1,
  amount          INT          NOT NULL,              -- UGX, set by the server from the plan
  currency        VARCHAR(3)   NOT NULL DEFAULT 'UGX',
  phone           VARCHAR(20)  NOT NULL DEFAULT '',
  status          VARCHAR(20)  NOT NULL DEFAULT 'starting', -- starting|pending|processing|on_hold|successful|failed|cancelled
  nylon_id        VARCHAR(64)  NOT NULL DEFAULT '',
  operator_tid    VARCHAR(64)  NOT NULL DEFAULT '',   -- MTN / Airtel transaction ID
  failure_reason  VARCHAR(300) NOT NULL DEFAULT '',
  last_error      VARCHAR(300) NOT NULL DEFAULT '',
  licence_applied TINYINT(1)   NOT NULL DEFAULT 0,    -- 1 = the licence was renewed for this payment
  licence_until   DATE         NULL,
  paid_at         DATETIME(3)  NULL,
  last_checked_at DATETIME(3)  NULL,
  created_at      DATETIME(3)  NOT NULL,
  updated_at      DATETIME(3)  NOT NULL,
  KEY idx_fac_time (facility_id, created_at),
  KEY idx_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Failed logins, to slow down password guessing.
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ip           VARCHAR(45) NOT NULL,
  attempted_at DATETIME(3) NOT NULL,
  KEY idx_ip_time (ip, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

-- ---------------------------------------------------------------------
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

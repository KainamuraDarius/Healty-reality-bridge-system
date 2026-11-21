-- =====================================================================
--  REALITY HEALTH BRIDGE - database update 4 (online subscription payments through Nylon Pay)
--  Run ONCE in phpMyAdmin on rmsugnxf_rhb (click the database > SQL > paste > Go),
--  BEFORE uploading the new api/ files. Safe to run again.
-- =====================================================================

-- Server only (never synced to phones). One row per payment a facility starts in the app.
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

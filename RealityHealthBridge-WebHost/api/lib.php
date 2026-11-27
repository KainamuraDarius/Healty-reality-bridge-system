<?php
// Shared helpers for the API: JSON in/out, HTTPS + CORS checks, tokens, the list of
// synced tables and how each column is checked. Blocked from the web by .htaccess.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }

// Errors go to the server's error log, never onto the page (they can show file paths and SQL).
ini_set('display_errors', '0'); ini_set('log_errors', '1');

require_once __DIR__ . '/db.php';

const PBKDF2_ITERATIONS = 100000; // must match js/services/api-client.js
const MAX_ROWS_PER_PUSH = 1000;
const PULL_LIMIT        = 500;
// Tables whose rows are large: at most this many per sync call.
const PULL_LIMITS       = ['facility_documents' => 3];

// Areas the super admin can tick for another admin (must match js/domain/accounts.js PERMISSIONS).
const ADMIN_PERMISSIONS = ['finance', 'reports', 'records', 'staff', 'subscription', 'backup', 'devices'];
function clean_permissions(string $v): string {
    return implode(',', array_values(array_intersect(ADMIN_PERMISSIONS, explode(',', $v))));
}

// May the logged-in user ($me) save this users row? Returns [columns to save, null] or [null, reason].
// - is_primary (super admin) never changes after registration, and the super admin cannot be removed.
// - The super admin may add / change / remove anyone and set admins' permissions.
// - An admin ticked "staff" may add / change / remove staff only.
// - Everyone may change their own login (name, contacts, password) but not their own access.
function check_user_change(array $me, ?array $existing, array $cols): array {
    $cols['is_primary'] = $existing ? (int)$existing['is_primary'] : 0;
    if ($existing && $existing['is_primary'] && $cols['deleted']) return [null, 'the super admin cannot be removed'];
    $cols['permissions'] = $cols['role'] === 'owner' ? clean_permissions((string)$cols['permissions']) : '';
    if ((int)$me['is_primary'] === 1) return [$cols, null];
    if ($existing && $existing['id'] === $me['id']) {
        $cols['role'] = $existing['role'];
        $cols['permissions'] = $existing['permissions'];
        $cols['deleted'] = (int)$existing['deleted'];
        return [$cols, null];
    }
    $mayManageStaff = $me['role'] === 'owner' && in_array('staff', explode(',', (string)$me['permissions']), true);
    if ($mayManageStaff && $cols['role'] === 'staff' && (!$existing || $existing['role'] === 'staff')) return [$cols, null];
    return [null, 'not allowed for this login'];
}

// The person (not the device) asking: their user row if act_key proves the password, else null.
// act_key is made on the phone at login like the login key (see js/core/storage.js startSession).
function verified_person(string $facilityId, $userId, $key): ?array {
    if (!is_string($userId) || !valid_login_key($key)) return null;
    $s = db()->prepare('SELECT * FROM users WHERE id = ? AND facility_id = ? AND deleted = 0');
    $s->execute([$userId, $facilityId]);
    $u = $s->fetch();
    return ($u && $u['password_hash'] && password_verify($key, $u['password_hash'])) ? $u : null;
}
// Super admin, or an admin the super admin ticked $perm for.
function person_may(array $u, string $perm): bool {
    if ((int)$u['is_primary'] === 1) return true;
    return $u['role'] === 'owner' && in_array($perm, explode(',', (string)$u['permissions']), true);
}

// Uploaded files (must match js/components/facility-docs.js).
const DOC_MIME_TYPES    = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const DOC_MAX_BYTES     = 2 * 1024 * 1024;   // one certificate file
const STAMP_MAX_BYTES   = 400 * 1024;        // the stamp picture

// Bytes in a "data:<mime>;base64,...." value, or null if it is not one of the allowed kinds.
function data_url_bytes(?string $v, array $mimes): ?int {
    if ($v === null || $v === '') return 0;
    if (!preg_match('#^data:([a-z]+/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]*)$#', $v, $m)) return null;
    if (!in_array($m[1], $mimes, true)) return null;
    return (int)floor(strlen($m[2]) * 3 / 4);
}
// Extra checks for rows that carry files. Returns an error reason or null.
function check_file_columns(string $table, array $cols): ?string {
    if ($table === 'facilities' && array_key_exists('stamp', $cols)) {
        $n = data_url_bytes($cols['stamp'], ['image/png', 'image/jpeg', 'image/webp']);
        if ($n === null) return 'stamp must be a picture';
        if ($n > STAMP_MAX_BYTES) return 'stamp picture too large';
    }
    if ($table === 'facility_documents' && empty($cols['deleted'])) {
        $n = data_url_bytes($cols['data'], DOC_MIME_TYPES);
        if ($n === null || $n === 0) return 'file must be a picture or PDF';
        if ($n > DOC_MAX_BYTES) return 'file too large';
        if (!str_starts_with((string)$cols['data'], 'data:' . $cols['mime'] . ';')) return 'file type does not match';
    }
    return null;
}

// ---------------------------------------------------------------------
// Tables that sync, in the order they are saved. Each column has a type:
//   ['str', maxLength] | 'text' | 'int' | 'money' | 'bool' | 'date' | 'datetime' | 'id' | ['enum', [...]]
// 'write' = columns a device may send. 'read' = extra columns the server sends back.
// Every table also has: id, facility_id, device_id, created_at, updated_at, deleted, server_seq.
// ---------------------------------------------------------------------
function sync_tables(): array {
    return [
        'facilities' => ['write' => [
            'name' => ['str', 200], 'slogan' => ['str', 300], 'location' => ['str', 300],
            'contact' => ['str', 100], 'email' => ['str', 191], 'logo' => 'text',
            'license_facility' => ['str', 200], 'license_expiry' => 'date', 'license_trial' => 'bool',
            'license_tier' => ['str', 20], 'max_devices' => 'int', 'trial_used' => 'bool',
            'license_updated_at' => 'datetime_null', 'license_source' => ['str', 10], 'license_code' => ['str', 20],
            // Digital stamp: a small picture the facility's main admin uploads; printed on receipts and reports.
            'stamp' => 'text', 'stamp_updated_at' => 'datetime_null',
            // When the super admin last changed the profile (name, contacts, logo); newest wins.
            'profile_updated_at' => 'datetime_null',
        ], 'read' => ['suspended' => 'bool', 'suspended_reason' => ['str', 300],
                       // Privacy policy + terms the facility agreed to. Set by the server only (register.php, privacy.php).
                       'terms_version' => ['str', 20], 'terms_accepted_at' => 'datetime_null', 'terms_accepted_by' => ['str', 200]]],
        'users' => ['write' => [
            'username' => ['str', 100], 'pw_salt' => ['str', 64], 'pw_verifier' => ['str', 100],
            'role' => ['enum', ['owner', 'staff']], 'is_primary' => 'bool',
            'full_name' => ['str', 200], 'contact' => ['str', 100], 'email' => ['str', 191],
            'cadre' => ['str', 100], 'position' => ['str', 100], 'permissions' => ['str', 200], 'created_by' => ['str', 100],
        ], 'read' => []],
        // Devices are created by login.php/register.php. Devices may only rename or remove one.
        'devices' => ['write' => ['label' => ['str', 100]],
                      'read'  => ['device_code' => ['str', 4], 'added_date' => 'date', 'last_seen_at' => 'datetime']],
        'products' => ['write' => [
            'name' => ['str', 200], 'form' => ['str', 100], 'unit' => ['str', 100],
            'pack_size' => ['str', 100], 'reorder_level' => 'int',
        ], 'read' => []],
        'stock_batches' => ['write' => [
            'product_id' => 'id', 'batch_no' => ['str', 100], 'expiry' => 'date',
            'cost_price' => 'money', 'sell_price' => 'money', 'qty_received' => 'int',
            'date_received' => 'date', 'supplier' => ['str', 200], 'received_by' => ['str', 100],
        ], 'read' => []],
        'sales' => ['write' => [
            'sale_date' => 'datetime', 'patient_no' => ['str', 40], 'buyer' => ['str', 200],
            'buyer_contact' => ['str', 100], 'diagnosis' => ['str', 500], 'additional_details' => 'text',
            'total' => 'money', 'sold_by' => ['str', 100], 'sold_by_role' => ['str', 20], 'items_rev' => ['str', 36],
        ], 'read' => []],
        'sale_items' => ['write' => [
            'sale_id' => 'id', 'sale_rev' => ['str', 36], 'product_id' => 'id', 'batch_id' => 'id',
            'qty' => 'int', 'unit_price' => 'money', 'cost' => 'money',
        ], 'read' => []],
        'sale_payments' => ['write' => [
            'sale_id' => 'id', 'amount' => 'money', 'paid_at' => 'datetime', 'recorded_by' => ['str', 100],
        ], 'read' => []],
        'adjustments' => ['write' => [
            'batch_id' => 'id', 'product_id' => 'id', 'qty_change' => 'int',
            'reason' => ['str', 300], 'adjusted_by' => ['str', 100],
        ], 'read' => []],
        // Operational certificates / licences of the facility (picture or PDF as a data URL).
        // Kept last: rows are big, so the pull sends only a few at a time (PULL_LIMITS).
        'facility_documents' => ['write' => [
            'kind' => ['enum', ['certificate']], 'title' => ['str', 200], 'file_name' => ['str', 200],
            'mime' => ['enum', DOC_MIME_TYPES], 'size_bytes' => 'int', 'data' => 'text',
            'valid_until' => 'date', 'uploaded_by' => ['str', 100],
        ], 'read' => []],
    ];
}

// ---------------------------------------------------------------------
// Request / response
// ---------------------------------------------------------------------
function send_json(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(int $status, string $code, string $message): void {
    send_json($status, ['ok' => false, 'error' => $code, 'message' => $message]);
}

// Call at the top of every endpoint: HTTPS, CORS, POST-only, JSON body, error handler.
function start_request(): array {
    set_exception_handler(function (Throwable $e) {
        error_log('RHB API error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        fail(500, 'server_error', 'Something went wrong on the server. Please try again.');
    });
    $c = config();

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && $origin === rtrim($c['allowed_origin'], '/')) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-RHB-Token');
        header('Access-Control-Max-Age: 86400');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

    if (!empty($c['require_https'])) {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
              || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
              || (($_SERVER['SERVER_PORT'] ?? '') == 443);
        if (!$https) fail(403, 'https_required', 'Use https:// to reach the server.');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'post_only', 'Use POST.');

    $raw = file_get_contents('php://input', false, null, 0, 20 * 1024 * 1024);
    $body = json_decode($raw ?: '', true);
    if (!is_array($body)) fail(400, 'bad_json', 'The request was not valid JSON.');
    return $body;
}

function client_ip(): string { return substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45); }

// ---------------------------------------------------------------------
// Time, ids, sequence numbers
// ---------------------------------------------------------------------
function now_ms(): string { return (new DateTime('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.v'); }

// '2026-11-19T10:22:33.123Z' (any ISO form) -> '2026-11-19 10:22:33.123' in UTC, or null.
function to_db_datetime($v): ?string {
    if (!is_string($v) || $v === '' || strlen($v) > 40) return null;
    try { $d = new DateTime($v); } catch (Exception $e) { return null; }
    $d->setTimezone(new DateTimeZone('UTC'));
    $y = (int)$d->format('Y');
    if ($y < 2000 || $y > 2100) return null;
    return $d->format('Y-m-d H:i:s.v');
}
function uuid_v4(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40); $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}
function to_iso($dbValue): ?string {
    if ($dbValue === null) return null;
    return str_replace(' ', 'T', substr($dbValue, 0, 23)) . 'Z';
}
function valid_id($v, int $max = 36): bool {
    return is_string($v) && $v !== '' && strlen($v) <= $max && preg_match('/^[A-Za-z0-9_-]+$/', $v);
}

// Hand out the next server_seq. lock_counter() must be called first in the transaction:
// it makes saves queue up one after another so a device can never skip over a row.
function lock_counter(): void { db()->query('SELECT value FROM sync_counter WHERE id = 1 FOR UPDATE')->fetch(); }
function next_seq(): int {
    db()->exec('UPDATE sync_counter SET value = LAST_INSERT_ID(value + 1) WHERE id = 1');
    return (int)db()->lastInsertId();
}

// ---------------------------------------------------------------------
// Checking one incoming row. Returns [columns, null] or [null, 'reason'].
// ---------------------------------------------------------------------
function normalize_row(string $table, $row, string $facilityId, string $tokenDeviceId): array {
    $spec = sync_tables()[$table]['write'];
    if (!is_array($row)) return [null, 'not an object'];
    $idMax = $table === 'devices' ? 40 : 36;
    if (!valid_id($row['id'] ?? null, $idMax)) return [null, 'bad id'];

    $updated = to_db_datetime($row['updated_at'] ?? null);
    if ($updated === null) return [null, 'bad updated_at'];
    $now = now_ms();
    if ($updated > $now) $updated = $now; // a phone with its clock set to the future must not win forever
    $created = to_db_datetime($row['created_at'] ?? null) ?? $updated;

    $dev = $row['device_id'] ?? $tokenDeviceId;
    if (!valid_id($dev, 40)) $dev = $tokenDeviceId;

    $out = [
        'id' => $row['id'], 'facility_id' => $facilityId, 'device_id' => $dev,
        'created_at' => $created, 'updated_at' => $updated,
        'deleted' => !empty($row['deleted']) ? 1 : 0,
    ];
    foreach ($spec as $col => $type) {
        $v = $row[$col] ?? null;
        $kind = is_array($type) ? $type[0] : $type;
        switch ($kind) {
            case 'str':
                if (is_array($v) || is_object($v)) return [null, "bad $col"];
                $out[$col] = mb_substr((string)($v ?? ''), 0, $type[1]);
                break;
            case 'text':
                if (is_array($v) || is_object($v)) return [null, "bad $col"];
                $out[$col] = $v === null ? null : (string)$v;
                if ($out[$col] !== null && strlen($out[$col]) > 4 * 1024 * 1024) return [null, "$col too large"];
                break;
            case 'int':
                if ($v === null || $v === '') { $out[$col] = 0; break; }
                if (!is_numeric($v)) return [null, "bad $col"];
                $out[$col] = (int)round((float)$v);
                break;
            case 'money':
                if ($v === null || $v === '') { $out[$col] = 0; break; }
                if (!is_numeric($v)) return [null, "bad $col"];
                $out[$col] = round((float)$v, 2);
                break;
            case 'bool':
                $out[$col] = !empty($v) ? 1 : 0;
                break;
            case 'date':
                if ($v === null || $v === '') { $out[$col] = null; break; }
                if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return [null, "bad $col"];
                $out[$col] = "$m[1]-$m[2]-$m[3]";
                break;
            case 'datetime':
                $out[$col] = to_db_datetime($v);
                if ($out[$col] === null) return [null, "bad $col"];
                break;
            case 'datetime_null':
                $out[$col] = ($v === null || $v === '') ? null : to_db_datetime($v);
                if ($v !== null && $v !== '' && $out[$col] === null) return [null, "bad $col"];
                if ($out[$col] !== null && $out[$col] > now_ms()) $out[$col] = now_ms();
                break;
            case 'id':
                if (!valid_id($v)) return [null, "bad $col"];
                $out[$col] = $v;
                break;
            case 'enum':
                if (!in_array($v, $type[1], true)) return [null, "bad $col"];
                $out[$col] = $v;
                break;
        }
    }
    $fileErr = check_file_columns($table, $out);
    if ($fileErr) return [null, $fileErr];
    return [$out, null];
}

// Turn a database row into the JSON a device receives.
function row_to_json(string $table, array $r): array {
    $t = sync_tables()[$table];
    $types = $t['write'] + $t['read'];
    $out = [
        'id' => $r['id'], 'facility_id' => $r['facility_id'], 'device_id' => $r['device_id'],
        'created_at' => to_iso($r['created_at']), 'updated_at' => to_iso($r['updated_at']),
        'deleted' => (int)$r['deleted'], 'server_seq' => (int)$r['server_seq'],
    ];
    foreach ($types as $col => $type) {
        $kind = is_array($type) ? $type[0] : $type;
        $v = $r[$col] ?? null;
        if ($v === null) { $out[$col] = in_array($kind, ['date', 'datetime', 'datetime_null', 'text'], true) ? null : $v; continue; }
        switch ($kind) {
            case 'int': case 'bool': $out[$col] = (int)$v; break;
            case 'money':            $out[$col] = (float)$v; break;
            case 'datetime': case 'datetime_null': $out[$col] = to_iso($v); break;
            default:                 $out[$col] = $v;
        }
    }
    return $out;
}

// Insert a full row (columns already checked) with a fresh server_seq.
function insert_row(string $table, array $cols): void {
    $cols['server_seq'] = next_seq();
    $names = array_keys($cols);
    $sql = "INSERT INTO `$table` (`" . implode('`,`', $names) . "`) VALUES (" . implode(',', array_fill(0, count($names), '?')) . ")";
    db()->prepare($sql)->execute(array_values($cols));
}
// Update a row by id with a fresh server_seq.
function update_row(string $table, string $id, array $cols): void {
    unset($cols['id']);
    $cols['server_seq'] = next_seq();
    $set = implode(',', array_map(fn($c) => "`$c` = ?", array_keys($cols)));
    db()->prepare("UPDATE `$table` SET $set WHERE id = ?")->execute([...array_values($cols), $id]);
}

// ---------------------------------------------------------------------
// Passwords. The device never sends its stored verifier; it sends a "login key"
// made from the password with a different prefix, and the server keeps only
// password_hash() of that key.
// ---------------------------------------------------------------------
function login_key_from_password(string $password, string $salt): string {
    return base64_encode(hash_pbkdf2('sha256', $password, 'k:' . $salt, PBKDF2_ITERATIONS, 32, true));
}
function valid_login_key($k): bool { return is_string($k) && strlen($k) === 44 && base64_decode($k, true) !== false; }

function too_many_failed_logins(): bool {
    $s = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND attempted_at > (UTC_TIMESTAMP(3) - INTERVAL 15 MINUTE)');
    $s->execute([client_ip()]);
    return (int)$s->fetchColumn() >= 20;
}
function record_failed_login(): void {
    db()->prepare('INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)')->execute([client_ip(), now_ms()]);
    db()->exec('DELETE FROM login_attempts WHERE attempted_at < (UTC_TIMESTAMP(3) - INTERVAL 1 DAY)');
}

// ---------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------
function issue_token(string $facilityId, string $userId, string $deviceId): string {
    $token = bin2hex(random_bytes(32));
    $now = now_ms();
    $days = (int)(config()['token_days'] ?? 180);
    $exp = (new DateTime('now', new DateTimeZone('UTC')))->modify("+$days days")->format('Y-m-d H:i:s.v');
    db()->prepare('INSERT INTO api_tokens (token_hash, facility_id, user_id, device_id, created_at, last_used_at, expires_at) VALUES (?,?,?,?,?,?,?)')
        ->execute([hash('sha256', $token), $facilityId, $userId, $deviceId, $now, $now, $exp]);
    return $token;
}

// Returns ['facility_id','user_id','device_id'] or stops with 401.
function require_auth(): array {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $token = preg_match('/^Bearer\s+([a-f0-9]{64})$/i', trim($h), $m) ? $m[1] : ($_SERVER['HTTP_X_RHB_TOKEN'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/i', $token)) fail(401, 'no_token', 'Please log in again.');

    $s = db()->prepare(
        'SELECT t.token_hash, t.facility_id, t.user_id, t.device_id
           FROM api_tokens t
           JOIN devices d ON d.id = t.device_id AND d.facility_id = t.facility_id AND d.deleted = 0
          WHERE t.token_hash = ? AND t.revoked = 0 AND t.expires_at > UTC_TIMESTAMP(3)');
    $s->execute([hash('sha256', strtolower($token))]);
    $a = $s->fetch();
    if (!$a) fail(401, 'bad_token', 'This device was logged out or removed. Please log in again.');

    $now = now_ms();
    db()->prepare('UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ?')->execute([$now, $a['token_hash']]);
    db()->prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?')->execute([$now, $a['device_id']]);
    return $a;
}

// ---------------------------------------------------------------------
// Devices: add this device to the pharmacy (or re-use it), respecting the device limit.
// Must run inside a transaction after lock_counter().
// ---------------------------------------------------------------------
function device_code_for(int $n): string {
    $s = '';
    do { $s = chr(65 + $n % 26) . $s; $n = intdiv($n, 26) - 1; } while ($n >= 0);
    return $s; // 0->A, 25->Z, 26->AA
}
function ensure_device(string $facilityId, string $deviceId, string $label): array {
    $s = db()->prepare('SELECT * FROM devices WHERE id = ? FOR UPDATE');
    $s->execute([$deviceId]);
    $dev = $s->fetch();
    if ($dev && $dev['facility_id'] !== $facilityId) {
        fail(409, 'device_other_facility', 'This device is registered to another facility.');
    }
    if ($dev && !$dev['deleted']) return $dev;

    $f = db()->prepare('SELECT max_devices FROM facilities WHERE id = ?');
    $f->execute([$facilityId]);
    $max = (int)$f->fetchColumn();
    $c = db()->prepare('SELECT COUNT(*) FROM devices WHERE facility_id = ? AND deleted = 0');
    $c->execute([$facilityId]);
    if ((int)$c->fetchColumn() >= max($max, 1)) {
        fail(403, 'device_limit', "This facility already uses its $max allowed device(s). An admin can remove an old device in System, or upgrade the package.");
    }

    $now = now_ms();
    $label = mb_substr(trim($label), 0, 100);
    if ($dev) { // removed earlier, now coming back
        update_row('devices', $deviceId, ['deleted' => 0, 'updated_at' => $now, 'device_id' => $deviceId]);
    } else {
        $all = db()->prepare('SELECT COUNT(*) FROM devices WHERE facility_id = ?');
        $all->execute([$facilityId]);
        $n = (int)$all->fetchColumn();
        $used = db()->prepare('SELECT 1 FROM devices WHERE facility_id = ? AND device_code = ?');
        do { $code = device_code_for($n++); $used->execute([$facilityId, $code]); } while ($used->fetchColumn());
        insert_row('devices', [
            'id' => $deviceId, 'facility_id' => $facilityId, 'device_id' => $deviceId,
            'label' => $label !== '' ? $label : "Device $code", 'device_code' => $code,
            'added_date' => substr($now, 0, 10), 'last_seen_at' => $now,
            'created_at' => $now, 'updated_at' => $now, 'deleted' => 0,
        ]);
    }
    $s->execute([$deviceId]);
    return $s->fetch();
}

function device_json(array $d): array {
    return ['id' => $d['id'], 'code' => $d['device_code'], 'label' => $d['label']];
}

// ---------------------------------------------------------------------
// Licences. The licence (expiry, trial, package, devices allowed) changes separately from the
// pharmacy profile: each has its own "last changed" time, so a phone that was offline can never
// undo a renewal made in the RHS admin site, and a profile edit never undoes a licence change.
// A licence change sent by a device is accepted only if it is a real trial start or carries a
// valid activation code (or a Mobile Money confirmation, flagged for checking).
// ---------------------------------------------------------------------
const LICENCE_COLS = ['license_facility', 'license_expiry', 'license_trial', 'license_tier', 'max_devices', 'trial_used',
                      'license_updated_at', 'license_source', 'license_code'];
const TRIAL_DAYS_MAX = 15; // the app's 14-day trial + a day for time zones

// Same formula as computeLicenseCode() in the app (js/services/license.js).
function licence_code_for(string $facility, string $expiryDate, int $maxDevices): string {
    $raw = (string)(config()['license_secret'] ?? '') . '|' . mb_strtolower(trim($facility)) . '|' . $expiryDate . '|' . $maxDevices;
    $units = unpack('n*', mb_convert_encoding($raw, 'UTF-16BE', 'UTF-8')) ?: [];
    $hash = 0;
    foreach ($units as $u) $hash = ($hash * 31 + $u) & 0xFFFFFFFF;
    return strtoupper(base_convert((string)$hash, 10, 36));
}

// Is this device-made licence (in $new) believable, given the stored one ($old, or null for a new pharmacy)?
// Returns the source to record, or null to refuse the change.
function device_licence_source(?array $old, array $new): ?string {
    if (empty($new['license_expiry'])) return null;
    $src = $new['license_source'] ?? '';
    if ($src === 'trial') {
        $maxEnd = (new DateTime('now', new DateTimeZone('UTC')))->modify('+' . TRIAL_DAYS_MAX . ' days')->format('Y-m-d');
        $hadLicence = $old && (!empty($old['license_expiry']) || !empty($old['trial_used']));
        return (!$hadLicence && $new['license_trial'] && $new['license_expiry'] <= $maxEnd) ? 'trial' : null;
    }
    if ($src === 'code') {
        $code = strtoupper(trim((string)($new['license_code'] ?? '')));
        return ($code !== '' && hash_equals(licence_code_for((string)$new['license_facility'], (string)$new['license_expiry'], (int)$new['max_devices']), $code)) ? 'code' : null;
    }
    // 'momo' / 'nylonpay': a phone saying "Mobile Money confirmed it" is NOT accepted any more. Paid
    // licences are applied by the server itself after Nylon Pay confirms the payment (nylonpay.php).
    return null;
}

// The app starts a TRIAL_DAYS_APP-day trial (older cached copies of the app: 7 days). RHS can choose
// another length on the admin site (Settings -> Free trial for new facilities). When a facility
// registers, the server sets its trial to that length counted from today, whatever the app sent.
// The new licence time is "now", so it beats the device's copy and is sent down on the next sync.
const TRIAL_DAYS_APP = 14;
function apply_trial_length(array &$facRow): void {
    $days = (int)admin_setting('trial_days', (string)TRIAL_DAYS_APP);
    if ($days < 1 || $days > 365) $days = TRIAL_DAYS_APP;
    if (empty($facRow['license_expiry'])) return;
    $end = (new DateTime('now', new DateTimeZone('UTC')))->modify('+' . $days . ' days')->format('Y-m-d');
    if ($end === $facRow['license_expiry']) return;
    $facRow['license_expiry'] = $end;
    $facRow['license_updated_at'] = now_ms();
}

// Note something for the RHS admin site's audit log (no admin involved).
function system_audit(string $action, ?string $facilityId, string $target, array $details = []): void {
    try {
        db()->prepare('INSERT INTO admin_audit_log (admin_id, admin_email, action, facility_id, target, details, ip, created_at) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)')
            ->execute(['system', $action, $facilityId, mb_substr($target, 0, 200), json_encode($details, JSON_UNESCAPED_UNICODE), client_ip(), substr(now_ms(), 0, 19)]);
    } catch (Throwable $e) { /* admin tables not installed yet: ignore */ }
}

// Merge an incoming facilities row with the stored one. Returns [columnsToSave or null if nothing changes].
// The facility profile (name, contacts, logo) is owned by the facility's SUPER ADMIN: it is taken
// from a device only when that device is logged in as the super admin and its profile_updated_at
// is newer. REALITY HEALTH SYSTEM can also change it on the admin site (fallback). Any other
// device that sends a different profile (another admin, an old app version, a phone that was
// offline) gets the server's profile back.
const PROFILE_COLS = ['name', 'slogan', 'location', 'contact', 'email', 'logo'];

// Messages for the device that sent this sync (e.g. "that email is taken"), added to the reply.
$GLOBALS['sync_notices'] = [];

function merge_facility(array $old, array $new, bool $fromSuperAdmin = false): ?array {
    $profileChanged = false;
    foreach (PROFILE_COLS as $c) {
        if (array_key_exists($c, $new) && (string)($new[$c] ?? '') !== (string)($old[$c] ?? '')) { $profileChanged = true; break; }
    }
    $profileWins = $profileChanged && $fromSuperAdmin && !empty($new['profile_updated_at'])
        && (empty($old['profile_updated_at']) || $new['profile_updated_at'] > $old['profile_updated_at']);
    if ($profileWins && mb_strtolower(trim((string)$new['email'])) !== mb_strtolower(trim((string)$old['email']))) {
        $e = db()->prepare('SELECT 1 FROM facilities WHERE LOWER(email) = LOWER(?) AND id <> ? AND deleted = 0');
        $e->execute([$new['email'], $old['id']]);
        if (!filter_var($new['email'], FILTER_VALIDATE_EMAIL) || $e->fetch()) {
            $new['email'] = $old['email']; // keep the old email; everything else in the profile is saved
            $GLOBALS['sync_notices'][] = 'email_taken';
        }
    }
    if ($profileWins) {
        $changed = [];
        foreach (PROFILE_COLS as $c) if ((string)($new[$c] ?? '') !== (string)($old[$c] ?? '')) $changed[$c] = $c === 'logo' ? 'new picture' : $new[$c];
        system_audit('facility.profile_by_super_admin', $old['id'], (string)$new['name'], ['changed' => $changed]);
    }
    $licChanged = false;
    foreach (['license_facility', 'license_expiry', 'license_trial', 'license_tier', 'max_devices', 'trial_used'] as $c) {
        if ((string)($new[$c] ?? '') !== (string)($old[$c] ?? '')) { $licChanged = true; break; }
    }
    $licNewer = $licChanged && !empty($new['license_updated_at']) && (empty($old['license_updated_at']) || $new['license_updated_at'] > $old['license_updated_at']);
    $licWins = false;
    if ($licNewer) {
        $src = device_licence_source($old, $new);
        if ($src) { $licWins = true; $new['license_source'] = $src; }
        else system_audit('licence.refused', $old['id'], (string)$old['name'], [
            'reason' => 'device sent a licence change without a valid code', 'expiry' => $new['license_expiry'],
            'devices' => $new['max_devices'], 'source' => $new['license_source'] ?? '', 'code' => $new['license_code'] ?? '']);
    }
    // The digital stamp: the facility's super admin may change it from a device, and RHS from the
    // admin site. The newest stamp_updated_at wins; an older or missing one gets the server's back.
    $stampChanged = (string)($new['stamp'] ?? '') !== (string)($old['stamp'] ?? '')
                 || (string)($new['stamp_updated_at'] ?? '') !== (string)($old['stamp_updated_at'] ?? '');
    $stampWins = $stampChanged && $fromSuperAdmin && !empty($new['stamp_updated_at'])
              && (empty($old['stamp_updated_at']) || $new['stamp_updated_at'] > $old['stamp_updated_at']);
    if ($stampWins) system_audit('facility.stamp', $old['id'], (string)$old['name'], ['change' => empty($new['stamp']) ? 'removed' : 'new stamp']);

    // A device holding a licence different from the server's (and not newer, or refused) gets the
    // server's licence back by re-stamping the row, so it is sent down on the next pull.
    $restamp = ($licChanged && !$licWins) || ($profileChanged && !$profileWins) || ($stampChanged && !$stampWins)
            || ($profileWins && $GLOBALS['sync_notices']);
    if (!$profileWins && !$licWins && !$stampWins && !$restamp) return null;

    $out = $profileWins ? $new : array_intersect_key($old, $new);
    foreach (LICENCE_COLS as $c) $out[$c] = $licWins ? ($new[$c] ?? null) : ($old[$c] ?? null);
    foreach (['stamp', 'stamp_updated_at'] as $c) $out[$c] = $stampWins ? ($new[$c] ?? null) : ($old[$c] ?? null);
    $out['updated_at'] = max($old['updated_at'], $new['updated_at'], $restamp ? now_ms() : '');
    if ($licWins && $new['license_source'] === 'momo') system_audit('licence.momo', $old['id'], (string)$old['name'], ['expiry' => $new['license_expiry'], 'package' => $new['license_tier']]);
    if ($licWins && $new['license_source'] === 'code') system_audit('licence.code', $old['id'], (string)$old['name'], ['expiry' => $new['license_expiry'], 'package' => $new['license_tier'], 'code' => $new['license_code']]);
    if ($licWins && in_array($new['license_source'], ['code', 'momo'], true)) activation_alert_after_reply($old, $new);
    return $out;
}

// ---------------------------------------------------------------------------------------------
// Messages from REALITY HEALTH SYSTEM (made on the admin site) that this pharmacy should see now.
// Returns null when the admin tables are not installed, so the app keeps what it had.
function announcements_for(string $facilityId): ?array {
    try {
        $s = db()->prepare("SELECT a.id, a.title, a.body, a.level, a.who, a.dismissible, a.shown_at FROM announcements a
            WHERE a.active = 1 AND a.starts_at <= UTC_TIMESTAMP() AND (a.ends_at IS NULL OR a.ends_at > UTC_TIMESTAMP())
              AND (a.audience = 'all' OR EXISTS (SELECT 1 FROM announcement_targets t WHERE t.announcement_id = a.id AND t.facility_id = ?))
            ORDER BY FIELD(a.level, 'urgent', 'warning', 'info'), a.starts_at DESC LIMIT 5");
        $s->execute([$facilityId]);
        return array_map(fn($r) => [
            'id' => (int)$r['id'], 'title' => $r['title'], 'body' => $r['body'], 'level' => $r['level'],
            'who' => $r['who'], 'dismissible' => (bool)$r['dismissible'], 'stamp' => $r['shown_at'],
        ], $s->fetchAll());
    } catch (Throwable $e) { return null; }
}

function admin_setting(string $name, string $default = ''): string {
    try {
        $s = db()->prepare('SELECT value FROM admin_settings WHERE name = ?');
        $s->execute([$name]);
        $v = $s->fetchColumn();
        return $v === false ? $default : (string)$v;
    } catch (Throwable $e) { return $default; }
}

// Email alerts to RHS (who gets them, and for which events, is set on the admin site: Settings).
// Sent after the app already has its answer, so a slow mail server never delays the pharmacy.
function alert_recipients(): array {
    return array_values(array_unique(array_filter(array_map('trim', preg_split('/[,;\s]+/', admin_setting('signup_emails'))),
        fn($e) => filter_var($e, FILTER_VALIDATE_EMAIL))));
}
// Gmail, Yahoo, Outlook… reject mail that claims to be from them but comes from our server (DMARC),
// so alerts always go out from our own domain; a free-mail "Send from" becomes the Reply-To.
const FREE_MAIL_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com',
    'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'zoho.com'];
function mail_base_domain(): string {
    $host = parse_url(admin_setting('admin_url'), PHP_URL_HOST) ?: preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '');
    $labels = explode('.', strtolower(preg_replace('/[^A-Za-z0-9.-]/', '', (string)$host)));
    // bhr-admin.truehome.com.ug -> truehome.com.ug ; app.example.com -> example.com ; truehome.com.ug stays
    if (count($labels) >= 4 || (count($labels) === 3 && strlen(end($labels)) > 2)) array_shift($labels);
    return implode('.', $labels);
}
function alert_sender(): array {
    $set = strtolower(trim(admin_setting('mail_from')));
    $ok = filter_var($set, FILTER_VALIDATE_EMAIL) && !in_array(substr(strrchr($set, '@'), 1), FREE_MAIL_DOMAINS, true);
    $domain = mail_base_domain();
    $from = $ok ? $set : ($domain ? 'no-reply@' . $domain : '');
    $replyTo = (!$ok && filter_var($set, FILTER_VALIDATE_EMAIL)) ? $set : '';
    return [$from, $replyTo];
}

function alert_date(?string $ymd): string {
    $t = $ymd ? strtotime($ymd . ' UTC') : false;
    return $t ? gmdate('j M Y', $t) : '-';
}
function alert_now_local(): string {
    return (new DateTime('now', new DateTimeZone('Africa/Kampala')))->format('j M Y, H:i') . ' (Kampala time)';
}

// One alert = a heading, a short sentence, a table of details and an optional button.
// Sent as text + HTML together: the HTML is what people see, the text keeps spam filters happy.
function alert_email_after_reply(string $subject, string $heading, string $intro, array $rows, string $button, ?string $link, string $floodAction): void {
    register_shutdown_function(function () use ($subject, $heading, $intro, $rows, $button, $link, $floodAction) {
        try {
            if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
            $to = alert_recipients();
            if (!$to) return;
            // A flood of fake sign-ups or activations must not turn into a flood of email.
            $s = db()->prepare('SELECT COUNT(*) FROM admin_audit_log WHERE action = ? AND created_at >= (UTC_TIMESTAMP() - INTERVAL 1 HOUR)');
            $s->execute([$floodAction]);
            if ((int)$s->fetchColumn() > 20) return;

            [$from, $replyTo] = alert_sender();
            $boundary = 'rhb_' . bin2hex(random_bytes(12));
            $headers = "MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"$boundary\"\r\n";
            if ($from) {
                $headers .= "From: Reality Health Bridge <$from>\r\n";
                $headers .= 'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . substr(strrchr($from, '@'), 1) . ">\r\n";
            }
            if ($replyTo) $headers .= "Reply-To: $replyTo\r\n";
            $subject = preg_replace('/[\r\n]+/', ' ', $subject);
            if (function_exists('mb_encode_mimeheader')) $subject = mb_encode_mimeheader($subject, 'UTF-8');

            $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n"
                  . quoted_printable_encode(alert_text($heading, $intro, $rows, $button, $link)) . "\r\n"
                  . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n"
                  . quoted_printable_encode(alert_html($heading, $intro, $rows, $button, $link)) . "\r\n"
                  . "--$boundary--\r\n";
            @mail(implode(', ', $to), $subject, $body, $headers, $from ? '-f' . $from : '');
        } catch (Throwable $e) { error_log('RHB email alert: ' . $e->getMessage()); }
    });
}
function alert_text(string $heading, string $intro, array $rows, string $button, ?string $link): string {
    $w = max(array_map('mb_strlen', array_keys($rows)) ?: [0]) + 2;
    $out = [$heading, str_repeat('=', mb_strlen($heading)), '', $intro, ''];
    foreach ($rows as $k => $v) $out[] = str_pad($k . ':', $w) . $v;
    if ($link) array_push($out, '', $button . ': ' . $link);
    array_push($out, '', '--', 'Reality Health Bridge - automatic alert for the Reality Health System team.', 'Who gets these emails is set in RHS Admin > Settings.');
    return implode("\r\n", $out);
}
function alert_html(string $heading, string $intro, array $rows, string $button, ?string $link): string {
    $e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;";
    $trs = '';
    $i = 0;
    foreach ($rows as $k => $v) {
        $bg = $i++ % 2 ? '#ffffff' : '#f6f8fb';
        $trs .= "<tr><td style=\"{$font}padding:10px 14px;background:$bg;color:#5b6573;font-size:14px;width:38%;vertical-align:top;\">{$e($k)}</td>"
              . "<td style=\"{$font}padding:10px 14px;background:$bg;color:#1b2430;font-size:14px;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;\">{$e($v)}</td></tr>";
    }
    $btn = $link ? "<tr><td style=\"padding:8px 32px 28px;\"><a href=\"{$e($link)}\" style=\"{$font}display:inline-block;background:#1565C0;color:#ffffff;"
                 . "text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:6px;\">{$e($button)} &rarr;</a></td></tr>" : '';
    return <<<HTML
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{$e($heading)}</title></head>
<body style="margin:0;padding:0;background:#eef2f7;">
<div style="display:none;max-height:0;overflow:hidden;">{$e($intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #dde3ec;">
    <tr><td style="{$font}background:#1565C0;color:#ffffff;padding:18px 32px;font-size:16px;font-weight:700;letter-spacing:.2px;">Reality Health Bridge</td></tr>
    <tr><td style="{$font}padding:28px 32px 6px;color:#1b2430;font-size:21px;font-weight:700;">{$e($heading)}</td></tr>
    <tr><td style="{$font}padding:0 32px 20px;color:#3d4756;font-size:15px;line-height:1.5;">{$e($intro)}</td></tr>
    <tr><td style="padding:0 32px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e8ef;border-radius:6px;border-collapse:separate;overflow:hidden;">$trs</table>
    </td></tr>
    $btn
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="{$font}padding:16px 32px;color:#7a8594;font-size:12px;line-height:1.5;text-align:center;">
      Automatic alert for the Reality Health System team.<br>Who gets these emails is set in RHS Admin &rsaquo; Settings.
    </td></tr>
  </table>
</td></tr></table>
</body></html>
HTML;
}
function alert_clean($s): string { return trim(preg_replace('/[\r\n\t]+/', ' ', (string)$s)); }
function alert_admin_link(string $facilityId): ?string {
    $url = rtrim(admin_setting('admin_url'), '/');
    return $url ? $url . '/pharmacy.php?id=' . rawurlencode($facilityId) : null;
}
function alert_licence(?string $expiry, $trial): string {
    return $expiry ? (($trial ? 'Free trial until ' : 'Active until ') . alert_date($expiry)) : 'None yet';
}

// A new pharmacy registered.
function signup_alert_after_reply(array $fac): void {
    if (admin_setting('alert_signups', '1') !== '1') return;
    $name = alert_clean($fac['name']);
    alert_email_after_reply('New facility registered: ' . $name, 'New facility registered',
        "$name has just signed up on Reality Health Bridge.", [
            'Facility'   => $name,
            'Location'   => alert_clean($fac['location']) ?: '-',
            'Phone'      => alert_clean($fac['contact']) ?: '-',
            'Email'      => alert_clean($fac['email']) ?: '-',
            'Licence'    => alert_licence($fac['license_expiry'] ?? null, !empty($fac['license_trial'])),
            'Registered' => alert_now_local(),
        ], 'Open in RHS Admin', alert_admin_link($fac['id']), 'pharmacy.registered');
}

// A pharmacy activated or renewed a package from the app (activation code or Mobile Money).
function activation_alert_after_reply(array $old, array $new): void {
    if (admin_setting('alert_activations', '1') !== '1') return;
    $name = alert_clean($old['name']);
    $how = $new['license_source'] === 'nylonpay' ? 'Mobile Money via Nylon Pay (confirmed)'
         : ($new['license_source'] === 'momo' ? 'Mobile Money (please check the payment arrived)' : 'Activation code');
    alert_email_after_reply('Subscription: ' . $name, 'Subscription activated',
        "$name has activated a subscription on Reality Health Bridge.", [
            'Facility'  => $name,
            'Package'   => (alert_clean($new['license_tier']) ?: '-') . ' (' . (int)$new['max_devices'] . ' devices)',
            'Valid to'  => alert_date($new['license_expiry']),
            'Paid by'   => $how,
            'Before'    => alert_licence($old['license_expiry'] ?? null, !empty($old['license_trial'])),
            'Activated' => alert_now_local(),
        ], 'Open in RHS Admin', alert_admin_link($old['id']), 'licence.' . $new['license_source']);
}

// ---------------------------------------------------------------------
// Privacy policy and terms (privacy.html, terms.html). When they change in a way people must
// agree to again, change this date AND TERMS_VERSION in js/core/brand.js.
const TERMS_VERSION = '2026-11-27';

// True once database update 7 was run (so nothing breaks if the files go up first).
function privacy_ready(): bool {
    static $ok = null;
    if ($ok === null) {
        try { db()->query('SELECT terms_version FROM facilities LIMIT 0'); db()->query('SELECT 1 FROM data_requests LIMIT 0'); $ok = true; }
        catch (Throwable $e) { $ok = false; }
    }
    return $ok;
}
// The terms version a device says the person agreed to, if it is the current one.
function terms_version_from($v): ?string {
    return is_string($v) && $v === TERMS_VERSION ? $v : null;
}

// A facility asked RHS to delete its data (app: Settings -> Privacy).
function data_request_alert_after_reply(array $fac, array $req): void {
    $name = alert_clean($fac['name']) ?: 'A facility';
    $url = rtrim(admin_setting('admin_url'), '/');
    alert_email_after_reply('Data deletion request: ' . $name, 'Data deletion request',
        "The super admin of $name has asked RHS to delete the facility's data. Please confirm with them, then act within 30 days.", [
            'Facility'  => $name,
            'Asked by'  => alert_clean($req['user_name']) ?: '-',
            'Contact'   => alert_clean($req['contact']) ?: '-',
            'Reason'    => alert_clean($req['reason'] ?? '') ?: '(none given)',
            'Asked on'  => alert_now_local(),
        ], 'Open privacy requests', $url ? $url . '/privacy.php' : null, 'privacy.delete_requested');
}

// Someone sent feedback / a rating from the app (Settings -> Feedback & rating).
function feedback_alert_after_reply(array $fac, array $fb): void {
    if (admin_setting('alert_feedback', '1') !== '1') return;
    $name = alert_clean($fac['name']) ?: 'A facility';
    $stars = str_repeat('★', (int)$fb['rating']) . str_repeat('☆', 5 - (int)$fb['rating']);
    $kind = ['general' => 'General', 'idea' => 'Suggestion / idea', 'problem' => 'Problem', 'praise' => 'Praise'][$fb['category']] ?? 'General';
    $url = rtrim(admin_setting('admin_url'), '/');
    alert_email_after_reply('Feedback ' . $fb['rating'] . '/5 from ' . $name, 'New feedback: ' . $fb['rating'] . ' out of 5',
        "Someone at $name sent feedback from the app.", [
            'Rating'   => $stars . '  (' . $fb['rating'] . '/5)',
            'Type'     => $kind,
            'Message'  => alert_clean($fb['message'] ?? '') ?: '(no message)',
            'From'     => (alert_clean($fb['user_name']) ?: '-') . ' (' . $fb['user_role'] . ')',
            'Facility' => $name,
            'Sent'     => alert_now_local(),
        ], 'See all feedback', $url ? $url . '/feedback.php' : null, 'feedback.received');
}

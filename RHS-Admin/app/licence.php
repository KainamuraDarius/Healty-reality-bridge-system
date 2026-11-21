<?php
// Licences and other changes the admin site makes to a facility. Every change gets a fresh
// server_seq number (the same counter the facility app's sync uses), so the facility's phones
// download it on their next sync.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }

// Same packages and prices as the app (js/services/license.js).
const PACKAGES = [
    'starter'  => ['label' => 'Starter',  'devices' => 2, 'setup_fee' => 150000],
    'standard' => ['label' => 'Standard', 'devices' => 5, 'setup_fee' => 300000],
];
const MONTHLY_FEE = 20000;

function package_label(?string $tier): string { return PACKAGES[$tier]['label'] ?? ($tier ? ucfirst($tier) : '—'); }

// Where the current licence came from, in plain words, and whether RHS should double-check it.
function licence_source_info(?string $src): array {
    return [
        'admin'  => ['Set in admin site', '', false],
        'trial'  => ['Free trial', '', false],
        'code'   => ['Activation code (checked by server)', '', false],
        'momo'   => ['Mobile Money in the app — check payment', 'warning', true],
        'nylonpay' => ['Paid online (Nylon Pay, confirmed by the server)', 'success', false],
        'legacy' => ['From the old app — not checked', 'warning', true],
    ][$src ?? ''] ?? ['—', '', false];
}

// Same formula as the app's computeLicenseCode() (codes for facilities that are offline for long).
function licence_code_for(string $facility, string $expiryDate, int $maxDevices): string {
    $raw = (string)(config()['license_secret'] ?? '') . '|' . mb_strtolower(trim($facility)) . '|' . $expiryDate . '|' . $maxDevices;
    $units = unpack('n*', mb_convert_encoding($raw, 'UTF-16BE', 'UTF-8')) ?: [];
    $hash = 0;
    foreach ($units as $u) $hash = ($hash * 31 + $u) & 0xFFFFFFFF;
    return strtoupper(base_convert((string)$hash, 10, 36));
}

function now_ms_utc(): string { return (new DateTime('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.v'); }

function facility_by_id(string $id): ?array {
    $s = db()->prepare('SELECT * FROM facilities WHERE id = ? AND deleted = 0');
    $s->execute([$id]);
    return $s->fetch() ?: null;
}

// Change columns of a facility's row so its devices pick the change up on their next sync.
// $licence = true marks it as a licence change made in the admin site.
// Returns the row as it was before the change.
function change_facility(string $id, array $cols, bool $licence): array {
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->query('SELECT value FROM sync_counter WHERE id = 1 FOR UPDATE')->fetch(); // same queue as the app's sync
        $s = $pdo->prepare('SELECT * FROM facilities WHERE id = ? FOR UPDATE');
        $s->execute([$id]);
        $before = $s->fetch();
        if (!$before) throw new RuntimeException('Facility not found');
        $now = now_ms_utc();
        if ($licence) { $cols['license_updated_at'] = $now; $cols['license_source'] = 'admin'; $cols['license_code'] = ''; }
        // updated_at is the PROFILE's "last changed" time and is left alone, so a profile edit a
        // phone made offline is not thrown away. The new server_seq is what makes devices fetch it.
        $pdo->exec('UPDATE sync_counter SET value = LAST_INSERT_ID(value + 1) WHERE id = 1');
        $cols['server_seq'] = (int)$pdo->lastInsertId();
        $set = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($cols)));
        $pdo->prepare("UPDATE facilities SET $set WHERE id = ?")->execute([...array_values($cols), $id]);
        $pdo->commit();
        return $before;
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
}

// Renew a facility's licence: add $days (from the current end date if paid time is left, else from
// today) or set an exact $until date. Writes the audit log. Returns the new end date.
function renew_licence(array $f, ?int $days, ?string $until, string $tier, ?int $devices, string $note = '', array $extra = []): string {
    $today = today_local();
    if (!array_key_exists($tier, PACKAGES)) $tier = $f['license_tier'] ?: 'standard';
    $devices = $devices ?: PACKAGES[$tier]['devices'];
    if (!$until) {
        $from = (!$f['license_trial'] && $f['license_expiry'] && $f['license_expiry'] > $today) ? $f['license_expiry'] : $today;
        $until = (new DateTime($from))->modify('+' . max(1, (int)$days) . ' days')->format('Y-m-d');
    }
    $before = change_facility($f['id'], ['license_expiry' => $until, 'license_trial' => 0, 'trial_used' => 1, 'license_tier' => $tier,
        'max_devices' => $devices, 'license_facility' => $f['license_facility'] ?: $f['name']], true);
    audit('licence.renew', $f['id'], $f['name'], array_merge(['from' => $before['license_expiry'], 'to' => $until,
        'package' => package_label($tier), 'devices' => $devices], $note !== '' ? ['note' => $note] : [], $extra));
    return $until;
}
const MONTH_DAYS = ['1' => 30, '3' => 90, '6' => 180, '12' => 365];

// Extend (or give) a FREE TRIAL: it stays a trial, so the app keeps saying "free trial" and the
// facility can still pick a package later. Adds $days from the current end date if the trial is
// still running, else from today; or sets an exact $until date. Returns the new end date.
const TRIAL_EXTEND_DAYS = [7, 14, 30, 60, 90];
const TRIAL_DAYS_DEFAULT = 7;   // the app's own trial length (js/services/license.js TRIAL_DAYS)
function extend_trial(array $f, ?int $days, ?string $until, string $note = ''): string {
    $today = today_local();
    if (!$until) {
        $from = ($f['license_trial'] && $f['license_expiry'] && $f['license_expiry'] > $today) ? $f['license_expiry'] : $today;
        $until = (new DateTime($from))->modify('+' . max(1, (int)$days) . ' days')->format('Y-m-d');
    }
    $cols = ['license_expiry' => $until, 'license_trial' => 1, 'trial_used' => 1,
             'license_facility' => $f['license_facility'] ?: $f['name']];
    if ((int)$f['max_devices'] < 1) $cols['max_devices'] = PACKAGES['standard']['devices'];
    $before = change_facility($f['id'], $cols, true);
    audit('licence.trial_extend', $f['id'], $f['name'], array_merge(['from' => $before['license_expiry'], 'to' => $until],
        $note !== '' ? ['note' => $note] : []));
    return $until;
}

function payment_method_label(string $m): string { return ['momo' => 'Mobile Money', 'cash' => 'Cash', 'bank' => 'Bank', 'other' => 'Other'][$m] ?? $m; }
function payment_purpose_label(string $p): string { return ['setup' => 'Setup fee', 'renewal' => 'Monthly renewal', 'other' => 'Other'][$p] ?? $p; }

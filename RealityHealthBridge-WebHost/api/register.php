<?php
// POST /api/register.php
// Saves a NEW pharmacy and its main admin on the server, adds this device (code "A"),
// and returns a token. Also used once by existing pharmacies to move their local data up.
// Safe to retry: sending the same pharmacy + admin again just returns a new token.
//
// Request:  { facility: {id, name, email, ..., updated_at},
//             user: {id, username, pw_salt, pw_verifier, role:'owner', ..., login_key},
//             device_id, device_label, terms_version }   (terms_version: the privacy policy + terms they agreed to)
// Response: { ok, token, facility_id, user: {id, username, role}, device: {id, code, label} }
require_once __DIR__ . '/lib.php';

$body = start_request();
$deviceId = $body['device_id'] ?? '';
if (!valid_id($deviceId, 40)) fail(400, 'bad_device', 'Missing device id.');
$fac  = $body['facility'] ?? null;
$user = $body['user'] ?? null;
if (!is_array($fac) || !is_array($user)) fail(400, 'bad_request', 'Facility and admin details are required.');

$facilityId = $fac['id'] ?? '';
if (!valid_id($facilityId)) fail(400, 'bad_facility', 'Missing facility id.');
[$facRow, $err] = normalize_row('facilities', $fac, $facilityId, $deviceId);
if (!$facRow) fail(400, 'bad_facility', "Facility details: $err.");
if ($facRow['name'] === '') fail(400, 'bad_facility', 'Facility name is required.');
if (!filter_var($facRow['email'], FILTER_VALIDATE_EMAIL)) fail(400, 'bad_email', 'A valid facility email is required.');
if ($facRow['max_devices'] < 1) $facRow['max_devices'] = 5;

[$userRow, $err] = normalize_row('users', $user, $facilityId, $deviceId);
if (!$userRow) fail(400, 'bad_user', "Admin details: $err.");
if ($userRow['role'] !== 'owner' || $userRow['username'] === '') fail(400, 'bad_user', 'The first account must be an admin with a username.');
$loginKey = $user['login_key'] ?? null;
if (!valid_login_key($loginKey) || $userRow['pw_salt'] === '' || $userRow['pw_verifier'] === '') fail(400, 'bad_user', 'Admin password is missing.');

$pdo = db();
$pdo->beginTransaction();
lock_counter();

$s = $pdo->prepare('SELECT id FROM facilities WHERE id = ? FOR UPDATE');
$s->execute([$facilityId]);
if ($s->fetch()) {
    // Already registered: allow only a retry by the same admin with the same password.
    $u = $pdo->prepare('SELECT id, username, role, password_hash FROM users WHERE id = ? AND facility_id = ? AND deleted = 0');
    $u->execute([$userRow['id'], $facilityId]);
    $existing = $u->fetch();
    if (!$existing || !$existing['password_hash'] || !password_verify($loginKey, $existing['password_hash'])) {
        $pdo->rollBack();
        fail(409, 'already_registered', 'This facility is already registered. Log in with the facility email instead.');
    }
    $dev = ensure_device($facilityId, $deviceId, (string)($body['device_label'] ?? ''));
    $token = issue_token($facilityId, $existing['id'], $deviceId);
    $pdo->commit();
    send_json(200, ['ok' => true, 'token' => $token, 'facility_id' => $facilityId,
        'user' => ['id' => $existing['id'], 'username' => $existing['username'], 'role' => $existing['role']],
        'device' => device_json($dev)]);
}

$e = $pdo->prepare('SELECT 1 FROM facilities WHERE LOWER(email) = LOWER(?) AND deleted = 0');
$e->execute([$facRow['email']]);
if ($e->fetch()) {
    $pdo->rollBack();
    fail(409, 'email_taken', 'Another facility is already registered with this email. Use a different email, or log in.');
}

// The licence a new pharmacy arrives with: a real trial, a valid code, or (for pharmacies that
// used the app before the server existed) kept but marked 'legacy' for RHS to check.
if (!empty($facRow['license_expiry'])) {
    $facRow['license_source'] = device_licence_source(null, $facRow) ?? 'legacy';
    if (empty($facRow['license_updated_at'])) $facRow['license_updated_at'] = $facRow['updated_at'];
    if ($facRow['license_source'] === 'trial') apply_trial_length($facRow);
}
// Privacy policy + terms: the person ticked "I agree" when registering (new app versions send it).
if (privacy_ready() && ($tv = terms_version_from($body['terms_version'] ?? null))) {
    $facRow['terms_version'] = $tv;
    $facRow['terms_accepted_at'] = now_ms();
    $facRow['terms_accepted_by'] = mb_substr(trim((string)($userRow['full_name'] ?: $userRow['username'])), 0, 200);
}
insert_row('facilities', $facRow);
if ($facRow['license_source'] === 'legacy') system_audit('licence.legacy', $facilityId, $facRow['name'], ['expiry' => $facRow['license_expiry'], 'devices' => $facRow['max_devices']]);
system_audit('pharmacy.registered', $facilityId, $facRow['name'], ['email' => $facRow['email'], 'location' => $facRow['location']]);
$userRow['password_hash'] = password_hash($loginKey, PASSWORD_DEFAULT);
$userRow['is_primary'] = 1;
insert_row('users', $userRow);
$dev = ensure_device($facilityId, $deviceId, (string)($body['device_label'] ?? ''));
$token = issue_token($facilityId, $userRow['id'], $deviceId);
$pdo->commit();
signup_alert_after_reply($facRow);

send_json(200, ['ok' => true, 'token' => $token, 'facility_id' => $facilityId,
    'user' => ['id' => $userRow['id'], 'username' => $userRow['username'], 'role' => $userRow['role']],
    'device' => device_json($dev)]);

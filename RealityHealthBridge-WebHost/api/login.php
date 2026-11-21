<?php
// POST /api/login.php
// Logs a device in to the server: pharmacy email + username + password.
// Needed only once per device (first time on a new phone/computer). After that the
// device keeps its token and people log in offline on the device itself.
//
// Request:  { email, username, password, device_id, device_label }
// Response: { ok, token, facility_id, user: {id, username, role}, device: {id, code, label} }
require_once __DIR__ . '/lib.php';

$body = start_request();
$email    = trim((string)($body['email'] ?? ''));
$username = trim((string)($body['username'] ?? ''));
$password = (string)($body['password'] ?? '');
$deviceId = $body['device_id'] ?? '';
if ($email === '' || $username === '' || $password === '') fail(400, 'missing', 'Enter the facility email, username and password.');
if (!valid_id($deviceId, 40)) fail(400, 'bad_device', 'Missing device id.');
if (strlen($password) > 200 || strlen($username) > 100 || strlen($email) > 191) fail(400, 'too_long', 'Details are too long.');
if (too_many_failed_logins()) fail(429, 'too_many_attempts', 'Too many wrong attempts. Wait 15 minutes and try again.');

$pdo = db();
$s = $pdo->prepare(
    'SELECT u.id, u.username, u.role, u.pw_salt, u.password_hash, u.facility_id
       FROM facilities f
       JOIN users u ON u.facility_id = f.id AND u.deleted = 0
      WHERE LOWER(f.email) = LOWER(?) AND f.deleted = 0 AND LOWER(u.username) = LOWER(?)
        AND u.password_hash IS NOT NULL AND u.pw_salt <> \'\'
      ORDER BY u.updated_at DESC');
$s->execute([$email, $username]);

$match = null;
foreach ($s->fetchAll() as $u) {
    if (password_verify(login_key_from_password($password, $u['pw_salt']), $u['password_hash'])) { $match = $u; break; }
}
if (!$match) {
    record_failed_login();
    fail(401, 'wrong_login', 'Wrong facility email, username or password.');
}

$pdo->beginTransaction();
lock_counter();
$dev = ensure_device($match['facility_id'], $deviceId, (string)($body['device_label'] ?? ''));
$token = issue_token($match['facility_id'], $match['id'], $deviceId);
$pdo->commit();

send_json(200, ['ok' => true, 'token' => $token, 'facility_id' => $match['facility_id'],
    'user' => ['id' => $match['id'], 'username' => $match['username'], 'role' => $match['role']],
    'device' => device_json($dev)]);

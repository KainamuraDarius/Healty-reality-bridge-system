<?php
// Support actions on a facility's data. Each change gets a fresh server_seq so the facility's
// devices download it on their next sync (same rule as app/licence.php).
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }

const PBKDF2_ROUNDS = 100000; // must match the app (js/core/crypto.js) and its api/lib.php

// Run $fn inside a transaction that holds the sync counter, and give it a function for new numbers.
function with_sync_seq(callable $fn) {
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->query('SELECT value FROM sync_counter WHERE id = 1 FOR UPDATE')->fetch();
        $next = function () use ($pdo): int { $pdo->exec('UPDATE sync_counter SET value = LAST_INSERT_ID(value + 1) WHERE id = 1'); return (int)$pdo->lastInsertId(); };
        $out = $fn($pdo, $next);
        $pdo->commit();
        return $out;
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
}

// New password for a facility login (forgotten password). Works OFFLINE on their devices after
// their next sync, and on new devices straight away. Same scrambling as the app:
//   verifier  = PBKDF2(password, "v:"+salt)  (kept on devices, for offline login)
//   login key = PBKDF2(password, "k:"+salt)  -> server keeps only password_hash(login key)
function reset_pharmacy_password(string $facilityId, string $userId, string $password): array {
    $salt = bin2hex(random_bytes(16));
    $verifier = base64_encode(hash_pbkdf2('sha256', $password, 'v:' . $salt, PBKDF2_ROUNDS, 32, true));
    $loginKey = base64_encode(hash_pbkdf2('sha256', $password, 'k:' . $salt, PBKDF2_ROUNDS, 32, true));
    return with_sync_seq(function (PDO $pdo, callable $next) use ($facilityId, $userId, $salt, $verifier, $loginKey) {
        $s = $pdo->prepare('SELECT * FROM users WHERE id = ? AND facility_id = ? AND deleted = 0 FOR UPDATE');
        $s->execute([$userId, $facilityId]);
        $u = $s->fetch();
        if (!$u) throw new RuntimeException('Login not found');
        $pdo->prepare('UPDATE users SET pw_salt = ?, pw_verifier = ?, password_hash = ?, updated_at = ?, device_id = ?, server_seq = ? WHERE id = ?')
            ->execute([$salt, $verifier, password_hash($loginKey, PASSWORD_DEFAULT), max(now_ms_utc(), $u['updated_at']), 'rhs-admin', $next(), $userId]);
        // Any device logged in to the server as this person must log in again with the new password.
        $pdo->prepare('UPDATE api_tokens SET revoked = 1 WHERE user_id = ? AND facility_id = ?')->execute([$userId, $facilityId]);
        return $u;
    });
}

// Remove a lost/stolen/replaced device: frees its slot and logs it out of the server at once.
function remove_device(string $facilityId, string $deviceId): array {
    return with_sync_seq(function (PDO $pdo, callable $next) use ($facilityId, $deviceId) {
        $s = $pdo->prepare('SELECT * FROM devices WHERE id = ? AND facility_id = ? AND deleted = 0 FOR UPDATE');
        $s->execute([$deviceId, $facilityId]);
        $d = $s->fetch();
        if (!$d) throw new RuntimeException('Device not found');
        $pdo->prepare('UPDATE devices SET deleted = 1, updated_at = ?, device_id = ?, server_seq = ? WHERE id = ?')
            ->execute([max(now_ms_utc(), $d['updated_at']), 'rhs-admin', $next(), $deviceId]);
        $pdo->prepare('UPDATE api_tokens SET revoked = 1 WHERE device_id = ? AND facility_id = ?')->execute([$deviceId, $facilityId]);
        return $d;
    });
}

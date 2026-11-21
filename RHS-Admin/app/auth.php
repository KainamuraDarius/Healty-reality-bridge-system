<?php
// Admin login, logout, lock-out after wrong passwords, idle timeout, roles.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }

const LOCK_FAILS_PER_EMAIL = 5;   // wrong passwords for one email ...
const LOCK_FAILS_PER_IP    = 20;  // ... or from one internet address ...
const LOCK_MINUTES         = 15;  // ... within this many minutes = locked for this long

// The logged-in admin (fresh from the database every request), or null.
function current_admin(bool $reload = false): ?array {
    static $cache = false;
    if ($cache !== false && !$reload) return $cache;
    $cache = null;
    if (empty($_SESSION['admin_id'])) return null;
    $s = db()->prepare('SELECT id, email, full_name, role, active, must_change_password, signups_seen_id, created_at FROM admin_users WHERE id = ?');
    $s->execute([$_SESSION['admin_id']]);
    $a = $s->fetch();
    if (!$a || !$a['active']) { logout_session(); return null; }   // deactivated: thrown out at once
    return $cache = $a;
}
function is_super(): bool { $a = current_admin(); return $a && $a['role'] === 'super'; }

function require_login(): array {
    $idle = (int)(config()['idle_minutes'] ?? 30) * 60;
    if (!empty($_SESSION['admin_id']) && (time() - ($_SESSION['last_seen'] ?? 0)) > $idle) {
        logout_session();
        fresh_session();
        flash('info', 'You were logged out after ' . (int)config()['idle_minutes'] . ' minutes without activity.');
        redirect('login.php');
    }
    $a = current_admin();
    if (!$a) redirect('login.php');
    $_SESSION['last_seen'] = time();
    $self = basename($_SERVER['SCRIPT_NAME'] ?? '');
    if ($a['must_change_password'] && !in_array($self, ['account.php', 'logout.php'], true)) {
        flash('warning', 'Please choose your own password before continuing.');
        redirect('account.php');
    }
    return $a;
}
function require_super(): array {
    $a = require_login();
    if ($a['role'] !== 'super') { http_response_code(403); layout_start('Not allowed', ''); echo '<div class="panel"><h2>Only a super admin can open this page.</h2></div>'; layout_end(); exit; }
    return $a;
}

function login_locked(string $email): bool {
    $s = db()->prepare('SELECT COUNT(*) FROM admin_login_attempts WHERE success = 0 AND attempted_at > (UTC_TIMESTAMP() - INTERVAL ' . LOCK_MINUTES . ' MINUTE) AND email = ?');
    $s->execute([$email]);
    if ((int)$s->fetchColumn() >= LOCK_FAILS_PER_EMAIL) return true;
    $s = db()->prepare('SELECT COUNT(*) FROM admin_login_attempts WHERE success = 0 AND attempted_at > (UTC_TIMESTAMP() - INTERVAL ' . LOCK_MINUTES . ' MINUTE) AND ip = ?');
    $s->execute([client_ip()]);
    return (int)$s->fetchColumn() >= LOCK_FAILS_PER_IP;
}

// Returns null on success, or a message to show.
function attempt_login(string $email, string $password): ?string {
    $email = strtolower(trim($email));
    if (login_locked($email)) return 'Too many wrong attempts. Wait ' . LOCK_MINUTES . ' minutes and try again.';
    $s = db()->prepare('SELECT id, email, password_hash, active FROM admin_users WHERE email = ?');
    $s->execute([$email]);
    $a = $s->fetch();
    // Always run password_verify, so a wrong email takes as long as a wrong password.
    $ok = password_verify($password, $a['password_hash'] ?? '$2y$12$kwyE1DYDzjZMqPtgtcI6G.sTXQzFwn6/Yn64Ve5iPyxMD2qGEYfN.') && $a && $a['active'];
    db()->prepare('INSERT INTO admin_login_attempts (email, ip, success, attempted_at) VALUES (?,?,?,?)')->execute([$email, client_ip(), $ok ? 1 : 0, now_utc()]);
    db()->exec('DELETE FROM admin_login_attempts WHERE attempted_at < (UTC_TIMESTAMP() - INTERVAL 30 DAY)');
    if (!$ok) {
        if (login_locked($email)) audit('login.locked', null, $email, ['email' => $email]);
        return 'Wrong email or password.';
    }
    session_regenerate_id(true);
    $_SESSION = ['admin_id' => (int)$a['id'], 'last_seen' => time()];
    if (password_needs_rehash($a['password_hash'], PASSWORD_DEFAULT)) {
        db()->prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $a['id']]);
    }
    db()->prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?')->execute([now_utc(), $a['id']]);
    current_admin(true);
    audit('login', null, $a['email']);
    return null;
}

// A brand-new, empty session (after logout), so a message can still be shown on the login page.
function fresh_session(): void {
    session_start();
    session_regenerate_id(true);
}

function logout_session(): void {
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Strict']);
        session_destroy();
    }
}

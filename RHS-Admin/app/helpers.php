<?php
// Small helpers used by every page.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }

// Escape text for HTML.
function h($s): string { return htmlspecialchars((string)($s ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function now_utc(): string { return gmdate('Y-m-d H:i:s'); }
function today_local(): string { return (new DateTime('now', new DateTimeZone(config()['timezone'])))->format('Y-m-d'); }

// UTC database time -> "19 Nov 2026, 17:22" in Kampala time.
function show_time(?string $utc, bool $withTime = true): string {
    if (!$utc) return '—';
    try { $d = new DateTime($utc, new DateTimeZone('UTC')); } catch (Exception $e) { return h($utc); }
    $d->setTimezone(new DateTimeZone(config()['timezone']));
    return $d->format($withTime ? 'j M Y, H:i' : 'j M Y');
}
function show_date(?string $ymd): string {
    if (!$ymd) return '—';
    $d = DateTime::createFromFormat('Y-m-d', substr($ymd, 0, 10));
    return $d ? $d->format('j M Y') : h($ymd);
}
function time_ago(?string $utc): string {
    if (!$utc) return 'never';
    $s = time() - strtotime($utc . ' UTC');
    if ($s < 90) return 'just now';
    if ($s < 3600) return floor($s / 60) . ' min ago';
    if ($s < 86400) return floor($s / 3600) . ' h ago';
    if ($s < 86400 * 60) return floor($s / 86400) . ' days ago';
    return show_time($utc, false);
}
function money($n): string { return 'UGX ' . number_format((float)$n, 0); }

function client_ip(): string { return substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45); }

function redirect(string $to): void { header('Location: ' . $to, true, 303); exit; }

// --- flash messages (shown once on the next page)
function flash(string $type, string $msg): void { $_SESSION['flash'][] = [$type, $msg]; }
function take_flashes(): array { $f = $_SESSION['flash'] ?? []; unset($_SESSION['flash']); return $f; }

// --- protection against forged form posts from other websites
function csrf_token(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}
function csrf_field(): string { return '<input type="hidden" name="csrf" value="' . h(csrf_token()) . '">'; }
function require_post_csrf(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); exit('Use the form.'); }
    if (!hash_equals($_SESSION['csrf'] ?? '', (string)($_POST['csrf'] ?? ''))) {
        http_response_code(400);
        exit('This form expired. Go back, reload the page and try again.');
    }
}
function is_post(): bool { return ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'; }
function post(string $k): string { return trim((string)($_POST[$k] ?? '')); }
function get(string $k): string { return trim((string)($_GET[$k] ?? '')); }

// --- audit log: every change made in the admin site is written here
function audit(string $action, ?string $facilityId = null, string $target = '', array $details = []): void {
    $a = current_admin();
    db()->prepare('INSERT INTO admin_audit_log (admin_id, admin_email, action, facility_id, target, details, ip, created_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$a['id'] ?? null, $a['email'] ?? ($details['email'] ?? ''), $action, $facilityId, mb_substr($target, 0, 200),
                   $details ? json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null, client_ip(), now_utc()]);
}

// Password rules for admin accounts.
const ADMIN_MIN_PASSWORD = 10;
function password_problem(string $pw, string $email = ''): ?string {
    if (mb_strlen($pw) < ADMIN_MIN_PASSWORD) return 'Password must be at least ' . ADMIN_MIN_PASSWORD . ' characters.';
    if ($email !== '' && stripos($pw, explode('@', $email)[0]) !== false) return 'Password must not contain your email name.';
    if (preg_match('/^(.)\1+$/', $pw) || in_array(strtolower($pw), ['password123', '1234567890', 'qwertyuiop', 'admin12345'], true)) return 'That password is too easy to guess.';
    return null;
}

// --- Facility licence status, same rules as the app (7 days of grace after expiry, then locked).
const GRACE_DAYS = 7;
function licence_status(array $f): array {
    if (empty($f['license_expiry'])) return ['No licence', ''];
    $days = (int)floor((strtotime($f['license_expiry']) - strtotime(today_local())) / 86400);
    if ($days >= 0) {
        if ($f['license_trial']) return [$days <= 7 ? "Trial · $days d left" : 'Trial', $days <= 2 ? 'warning' : 'violet'];
        return [$days <= 7 ? "Active · $days d left" : 'Active', $days <= 7 ? 'warning' : 'success'];
    }
    if (-$days <= GRACE_DAYS) return ['Expired · in grace', 'danger'];
    return ['Locked (expired)', 'danger'];
}

<?php
// Messages to facilities (announcements), admin-site settings, sign-up alerts and email.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }

const ANN_LEVELS = ['info' => 'Information', 'warning' => 'Important', 'urgent' => 'Urgent'];
const ANN_WHO    = ['all' => 'Everyone who logs in', 'owners' => 'Facility admins only'];

// ---- settings stored in the database (admin_settings)
function setting(string $name, string $default = ''): string {
    $s = db()->prepare('SELECT value FROM admin_settings WHERE name = ?');
    $s->execute([$name]);
    $v = $s->fetchColumn();
    return $v === false ? $default : (string)$v;
}
function save_setting(string $name, string $value): void {
    $a = current_admin();
    db()->prepare('INSERT INTO admin_settings (name, value, updated_by, updated_at) VALUES (?,?,?,?)
                   ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)')
        ->execute([$name, $value, $a['id'] ?? null, now_utc()]);
}
// "a@x.ug, b@y.ug" -> valid addresses only
function email_list(string $s): array {
    return array_values(array_unique(array_filter(array_map('trim', preg_split('/[,;\s]+/', $s)), fn($e) => filter_var($e, FILTER_VALIDATE_EMAIL))));
}
// This site's own address, e.g. https://bhr-admin.truehome.com.ug (used for links in emails).
function site_url(): string {
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $host = preg_replace('/[^A-Za-z0-9.:-]/', '', $_SERVER['HTTP_HOST'] ?? '');
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return ($https || !empty(config()['require_https']) ? 'https' : 'http') . '://' . $host . $dir;
}
// Gmail, Yahoo, Outlook… reject mail that claims to be from them but comes from our server (DMARC).
const FREE_MAIL_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com',
    'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'zoho.com'];
function is_free_mail(string $email): bool {
    return in_array(strtolower(substr(strrchr($email, '@') ?: '', 1)), FREE_MAIL_DOMAINS, true);
}
// bhr-admin.truehome.com.ug -> truehome.com.ug
function mail_base_domain(): string {
    $labels = explode('.', strtolower(preg_replace('/[^A-Za-z0-9.-]/', '', preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''))));
    if (count($labels) >= 4 || (count($labels) === 3 && strlen(end($labels)) > 2)) array_shift($labels);
    return implode('.', $labels);
}
function send_mail(array $to, string $subject, string $body): bool {
    $set = trim(setting('mail_from'));
    $ok = filter_var($set, FILTER_VALIDATE_EMAIL) && !is_free_mail($set);
    $from = $ok ? $set : (mail_base_domain() ? 'no-reply@' . mail_base_domain() : '');
    $headers = "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    if ($from) $headers .= "From: Reality Health Bridge <$from>\r\n";
    if (!$ok && filter_var($set, FILTER_VALIDATE_EMAIL)) $headers .= "Reply-To: $set\r\n";
    $subject = mb_encode_mimeheader(preg_replace('/[\r\n]+/', ' ', $subject), 'UTF-8');
    return @mail(implode(', ', $to), $subject, $body, $headers, $from ? '-f' . $from : '');
}

// ---- local (Kampala) <-> UTC for the date-and-time boxes
function local_to_utc(string $local): ?string {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $local)) return null;
    $d = DateTime::createFromFormat('Y-m-d\TH:i', $local, new DateTimeZone(config()['timezone']));
    if (!$d) return null;
    return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}
function utc_to_local_input(?string $utc): string {
    if (!$utc) return '';
    $d = new DateTime($utc, new DateTimeZone('UTC'));
    return $d->setTimezone(new DateTimeZone(config()['timezone']))->format('Y-m-d\TH:i');
}

// ---- announcements
function announcement_state(array $a): array {
    $now = now_utc();
    if (!$a['active']) return ['Stopped', ''];
    if ($a['ends_at'] && $a['ends_at'] <= $now) return ['Ended', ''];
    if ($a['starts_at'] > $now) return ['Scheduled', 'info'];
    return ['Showing now', 'success'];
}
function announcement_targets(int $id): array {
    $s = db()->prepare('SELECT facility_id FROM announcement_targets WHERE announcement_id = ?');
    $s->execute([$id]);
    return $s->fetchAll(PDO::FETCH_COLUMN);
}
// How many devices it is meant for, and how many have synced since it was (re)published.
function announcement_reach(array $a): array {
    $since = max($a['starts_at'], $a['shown_at']);
    if ($a['audience'] === 'all') {
        $s = db()->prepare('SELECT COUNT(*), COALESCE(SUM(d.last_seen_at >= ?), 0) FROM devices d JOIN facilities f ON f.id = d.facility_id WHERE d.deleted = 0 AND f.deleted = 0');
        $s->execute([$since]);
    } else {
        $s = db()->prepare('SELECT COUNT(*), COALESCE(SUM(d.last_seen_at >= ?), 0) FROM devices d JOIN announcement_targets t ON t.facility_id = d.facility_id WHERE d.deleted = 0 AND t.announcement_id = ?');
        $s->execute([$since, $a['id']]);
    }
    [$total, $got] = $s->fetch(PDO::FETCH_NUM);
    return [(int)$total, (int)$got];
}

// ---- sign-up alerts: facilities registered since this admin last looked
function new_signups_count(?array $a): int {
    if (!$a) return 0;
    $s = db()->prepare("SELECT COUNT(*) FROM admin_audit_log l JOIN facilities f ON f.id = l.facility_id
                        WHERE l.action = 'pharmacy.registered' AND l.id > ? AND l.created_at >= ? AND f.deleted = 0");
    $s->execute([(int)($a['signups_seen_id'] ?? 0), $a['created_at']]);
    return (int)$s->fetchColumn();
}
function new_signups(array $a, int $limit = 20): array {
    $s = db()->prepare("SELECT l.id AS log_id, l.created_at AS registered_at, f.id, f.name, f.location, f.email, f.contact, f.license_expiry, f.license_trial
                        FROM admin_audit_log l JOIN facilities f ON f.id = l.facility_id
                        WHERE l.action = 'pharmacy.registered' AND l.id > ? AND l.created_at >= ? AND f.deleted = 0
                        ORDER BY l.id DESC LIMIT " . (int)$limit);
    $s->execute([(int)($a['signups_seen_id'] ?? 0), $a['created_at']]);
    return $s->fetchAll();
}
function mark_signups_seen(array $a): void {
    $max = (int)db()->query("SELECT COALESCE(MAX(id), 0) FROM admin_audit_log WHERE action = 'pharmacy.registered'")->fetchColumn();
    db()->prepare('UPDATE admin_users SET signups_seen_id = ? WHERE id = ?')->execute([$max, $a['id']]);
}

// "New sign-ups" panel shown on the dashboard and the facilities page until marked as seen.
function handle_signups_seen(string $back): void {
    if (is_post() && post('do') === 'signups_seen') {
        require_post_csrf();
        mark_signups_seen(current_admin());
        flash('success', 'New sign-ups marked as seen.');
        redirect($back);
    }
}
function signups_panel(): string {
    $a = current_admin();
    $rows = new_signups($a);
    if (!$rows) return '';
    $n = new_signups_count($a);
    $o = '<section class="panel signups" id="signups"><div class="panel-head"><h2>' . $n . ' new sign-up' . ($n === 1 ? '' : 's') . '</h2>'
       . '<form method="post">' . csrf_field() . '<input type="hidden" name="do" value="signups_seen"><button class="btn small secondary" type="submit">' . icon('check') . 'Mark as seen</button></form></div>'
       . '<p class="small muted">Facilities that registered since you last looked. A welcome call helps them get started.</p>'
       . '<div class="table-wrap"><table><thead><tr><th>Facility</th><th>Contact</th><th>Registered</th><th>Licence</th></tr></thead><tbody>';
    foreach ($rows as $f) {
        [$lbl, $tone] = licence_status($f);
        $o .= '<tr><td><a href="pharmacy.php?id=' . h(urlencode($f['id'])) . '"><strong>' . h($f['name'] ?: '(no name yet)') . '</strong></a><span class="sub">' . h($f['location']) . '</span></td>'
            . '<td>' . h($f['contact']) . '<span class="sub">' . h($f['email']) . '</span></td>'
            . '<td class="nowrap">' . h(time_ago($f['registered_at'])) . '<span class="sub">' . show_time($f['registered_at']) . '</span></td><td>' . badge($lbl, $tone) . '</td></tr>';
    }
    return $o . '</tbody></table></div></section>';
}


// ---- Support contacts the app shows (landing page, System page, lock screens).
// Saved as JSON in admin_settings 'support_contacts'; the app reads them from api/public.php.
const SUPPORT_CONTACTS_MAX = 12;
const DEFAULT_SUPPORT_CONTACTS = [
    ['name' => 'REALITY HEALTH SYSTEM', 'role' => 'Support & payments', 'phone' => '0789511736', 'email' => 'realityhealthsystem10@gmail.com', 'whatsapp' => true],
    ['name' => 'System owner', 'role' => 'System owner', 'phone' => '+256740535992', 'email' => 'kainamuradarius@gmail.com', 'whatsapp' => true],
];
function support_contacts(): array {
    $raw = setting('support_contacts');
    if ($raw === '') return DEFAULT_SUPPORT_CONTACTS;
    $list = json_decode($raw, true);
    return is_array($list) ? $list : DEFAULT_SUPPORT_CONTACTS;
}

// Feedback from the app that no RHS admin has marked as read yet (0 before database update 5).
function new_feedback_count(): int {
    try { return (int)db()->query("SELECT COUNT(*) FROM app_feedback WHERE status = 'new'")->fetchColumn(); }
    catch (Throwable $e) { return 0; }
}

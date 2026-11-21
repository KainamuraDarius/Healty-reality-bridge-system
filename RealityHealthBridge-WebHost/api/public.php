<?php
// POST /api/public.php  (no login needed)
// Public details the app shows before anyone logs in: REALITY HEALTH SYSTEM's support contacts
// and the free-trial length. Both are set on the RHS admin site (Settings).
//
// Response: { ok, contacts: [ {name, role, phone, email, whatsapp} ] | null, trial_days, google_client_id }
//   google_client_id: the OAuth Web Client ID for one-tap Google Drive backups ('' = not set up).
//   contacts is null when RHS has not saved any yet - the app then keeps its built-in ones.
require_once __DIR__ . '/lib.php';

start_request();

$contacts = null;
$raw = admin_setting('support_contacts');
if ($raw !== '') {
    $list = json_decode($raw, true);
    if (is_array($list)) {
        $contacts = [];
        foreach (array_slice($list, 0, 12) as $c) {
            if (!is_array($c)) continue;
            $s = fn($k, $max) => mb_substr(trim((string)($c[$k] ?? '')), 0, $max);
            $row = ['name' => $s('name', 80), 'role' => $s('role', 80), 'phone' => $s('phone', 30),
                    'email' => $s('email', 120), 'whatsapp' => !empty($c['whatsapp'])];
            if ($row['email'] !== '' && !filter_var($row['email'], FILTER_VALIDATE_EMAIL)) $row['email'] = '';
            if ($row['name'] !== '' && ($row['phone'] !== '' || $row['email'] !== '')) $contacts[] = $row;
        }
    }
}
$days = (int)admin_setting('trial_days', (string)TRIAL_DAYS_APP);
if ($days < 1 || $days > 365) $days = TRIAL_DAYS_APP;

$gid = trim(admin_setting('google_client_id'));
if (!preg_match('/^[0-9]{6,20}-[a-z0-9]{10,64}\.apps\.googleusercontent\.com$/', $gid)) $gid = '';

send_json(200, ['ok' => true, 'contacts' => $contacts, 'trial_days' => $days, 'google_client_id' => $gid]);

<?php
// POST /api/privacy.php   (needs the device token: "Authorization: Bearer <token>")
// The facility's privacy settings (app: Settings -> Privacy). Only the facility's SUPER ADMIN may
// agree to the terms or ask for deletion; anyone logged in may read the status.
//
// Status:  { action: "status", act_by, act_key }
//          -> { ok, terms: {version, accepted_at, accepted_by} | null, current_version, request: {...} | null }
// Agree:   { action: "accept", terms_version, act_by, act_key }   -> { ok, terms }
// Delete:  { action: "request_delete", reason, contact, act_by, act_key }  -> { ok, request }
// Cancel:  { action: "cancel_delete", act_by, act_key }  -> { ok }
//
// Deleting is done by a person at RHS (admin site: Privacy), after they confirm with the facility.
require_once __DIR__ . '/lib.php';

$body = start_request();
$auth = require_auth();
$facilityId = $auth['facility_id'];
if (!privacy_ready()) fail(503, 'not_ready', 'This is not available yet. Please try again later.');

$person = verified_person($facilityId, $body['act_by'] ?? null, $body['act_key'] ?? null);
if (!$person) fail(403, 'log_in_again', 'Please log out and log in again, then try once more.');
$isSuper = (int)$person['is_primary'] === 1;
$who = mb_substr(trim((string)($person['full_name'] ?: $person['username'])), 0, 200);

function fac_row(string $id, bool $lock = false): array {
    $f = db()->prepare('SELECT id, name, contact, email, terms_version, terms_accepted_at, terms_accepted_by FROM facilities WHERE id = ?' . ($lock ? ' FOR UPDATE' : ''));
    $f->execute([$id]);
    $r = $f->fetch();
    if (!$r) fail(404, 'no_facility', 'Facility not found.');
    return $r;
}
function terms_out(array $f): ?array {
    return $f['terms_version'] === '' ? null
        : ['version' => $f['terms_version'], 'accepted_at' => to_iso($f['terms_accepted_at']), 'accepted_by' => $f['terms_accepted_by']];
}
function open_request(string $facilityId): ?array {
    $s = db()->prepare("SELECT * FROM data_requests WHERE facility_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1");
    $s->execute([$facilityId]);
    $r = $s->fetch();
    return $r ? ['id' => $r['id'], 'created_at' => to_iso($r['created_at']), 'user_name' => $r['user_name'],
                 'reason' => (string)$r['reason'], 'contact' => $r['contact']] : null;
}

$action = $body['action'] ?? 'status';

if ($action === 'status') {
    send_json(200, ['ok' => true, 'terms' => terms_out(fac_row($facilityId)), 'current_version' => TERMS_VERSION,
                    'request' => open_request($facilityId)]);
}

if (!$isSuper) fail(403, 'super_admin_only', "Only the facility's super admin can do this.");

if ($action === 'accept') {
    $tv = terms_version_from($body['terms_version'] ?? null);
    if (!$tv) fail(400, 'old_version', 'The privacy policy was updated. Close this and open it again.');
    $pdo = db();
    $pdo->beginTransaction();
    lock_counter();
    $fac = fac_row($facilityId, true);
    if ($fac['terms_version'] !== $tv) {
        // update_row gives the row a new server_seq, so every device of the facility learns about it.
        update_row('facilities', $facilityId, ['terms_version' => $tv, 'terms_accepted_at' => now_ms(), 'terms_accepted_by' => $who]);
    }
    $pdo->commit();
    if ($fac['terms_version'] !== $tv) system_audit('privacy.terms_accepted', $facilityId, (string)$fac['name'], ['version' => $tv, 'by' => $who]);
    send_json(200, ['ok' => true, 'terms' => terms_out(fac_row($facilityId))]);
}

if ($action === 'request_delete') {
    if (open_request($facilityId)) fail(409, 'already_asked', 'You already asked. RHS will contact you.');
    $reason = mb_substr(trim(str_replace("\r\n", "\n", (string)($body['reason'] ?? ''))), 0, 2000);
    $contact = mb_substr(trim(preg_replace('/[\r\n\t]+/', ' ', (string)($body['contact'] ?? ''))), 0, 200);
    if ($contact === '') fail(400, 'need_contact', 'Enter a phone number or email RHS can use to confirm with you.');
    $fac = fac_row($facilityId);
    $row = ['id' => uuid_v4(), 'facility_id' => $facilityId, 'facility_name' => mb_substr((string)$fac['name'], 0, 200),
            'user_id' => $person['id'], 'user_name' => $who, 'contact' => $contact, 'kind' => 'delete',
            'reason' => $reason === '' ? null : $reason, 'status' => 'open', 'created_at' => now_ms()];
    db()->prepare('INSERT INTO data_requests (`' . implode('`,`', array_keys($row)) . '`) VALUES (' . implode(',', array_fill(0, count($row), '?')) . ')')
        ->execute(array_values($row));
    system_audit('privacy.delete_requested', $facilityId, (string)$fac['name'], ['by' => $who, 'contact' => $contact]);
    data_request_alert_after_reply($fac, $row);
    send_json(200, ['ok' => true, 'request' => open_request($facilityId)]);
}

if ($action === 'cancel_delete') {
    $s = db()->prepare("UPDATE data_requests SET status = 'cancelled', handled_by = ?, handled_at = ?, admin_note = 'Cancelled by the facility' WHERE facility_id = ? AND status = 'open'");
    $s->execute([$who, now_ms(), $facilityId]);
    if ($s->rowCount()) system_audit('privacy.delete_cancelled', $facilityId, (string)fac_row($facilityId)['name'], ['by' => $who]);
    send_json(200, ['ok' => true]);
}

fail(400, 'bad_action', 'Unknown action.');

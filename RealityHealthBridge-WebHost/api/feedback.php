<?php
// POST /api/feedback.php   (needs the device token: "Authorization: Bearer <token>")
// Feedback and star ratings from the app (Settings -> Feedback & rating). Anyone logged in can send it.
// RHS super admins read it on the admin site (feedback.php there).
//
// Send:  { action: "send", rating: 1-5, category: "general"|"idea"|"problem"|"praise", message,
//          app_version, act_by: <user id>, act_key: <the person's act key> }
//        -> { ok, feedback: {...} }
// List:  { action: "list", act_by, act_key }  -> { ok, feedback: [ ...this person's last 10 ] }
require_once __DIR__ . '/lib.php';

const FEEDBACK_CATEGORIES = ['general', 'idea', 'problem', 'praise'];
const FEEDBACK_MAX_CHARS  = 2000;
const FEEDBACK_PER_DAY    = 10;   // per person, so a stuck button cannot flood RHS

$body = start_request();
$auth = require_auth();
$facilityId = $auth['facility_id'];

$person = verified_person($facilityId, $body['act_by'] ?? null, $body['act_key'] ?? null);
if (!$person) fail(403, 'log_in_again', 'Please log out and log in again, then send your feedback once more.');

function feedback_out(array $r): array {
    return ['id' => $r['id'], 'rating' => (int)$r['rating'], 'category' => $r['category'], 'message' => (string)$r['message'],
            'created_at' => to_iso($r['created_at']), 'seen' => $r['status'] === 'read'];
}

if (($body['action'] ?? 'send') === 'list') {
    $s = db()->prepare('SELECT * FROM app_feedback WHERE facility_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 10');
    $s->execute([$facilityId, $person['id']]);
    send_json(200, ['ok' => true, 'feedback' => array_map('feedback_out', $s->fetchAll())]);
}

$rating = filter_var($body['rating'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 5]]);
if ($rating === false) fail(400, 'bad_rating', 'Choose from 1 to 5 stars.');
$category = in_array($body['category'] ?? '', FEEDBACK_CATEGORIES, true) ? $body['category'] : 'general';
$message = trim(str_replace("\r\n", "\n", (string)($body['message'] ?? '')));
if (mb_strlen($message) > FEEDBACK_MAX_CHARS) fail(400, 'too_long', 'Please keep your feedback under ' . FEEDBACK_MAX_CHARS . ' characters.');
if ($category === 'problem' && $message === '') fail(400, 'need_message', 'Please describe the problem so we can fix it.');

$n = db()->prepare('SELECT COUNT(*) FROM app_feedback WHERE user_id = ? AND created_at > (UTC_TIMESTAMP(3) - INTERVAL 1 DAY)');
$n->execute([$person['id']]);
if ((int)$n->fetchColumn() >= FEEDBACK_PER_DAY) fail(429, 'too_many', 'Thank you! You have sent a lot of feedback today. Please try again tomorrow.');

$role = (int)$person['is_primary'] === 1 ? 'Super admin' : ($person['role'] === 'owner' ? 'Admin' : 'Staff');
$row = [
    'id' => uuid_v4(), 'facility_id' => $facilityId, 'user_id' => $person['id'],
    'user_name' => mb_substr(trim((string)($person['full_name'] ?: $person['username'] ?? '')), 0, 200),
    'user_role' => $role, 'device_id' => (string)$auth['device_id'], 'rating' => $rating, 'category' => $category,
    'message' => $message === '' ? null : $message,
    'app_version' => mb_substr(preg_replace('/[^0-9A-Za-z.\-]/', '', (string)($body['app_version'] ?? '')), 0, 20),
    'status' => 'new', 'created_at' => now_ms(),
];
db()->prepare('INSERT INTO app_feedback (`' . implode('`,`', array_keys($row)) . '`) VALUES (' . implode(',', array_fill(0, count($row), '?')) . ')')
    ->execute(array_values($row));

$f = db()->prepare('SELECT id, name FROM facilities WHERE id = ?');
$f->execute([$facilityId]);
$fac = $f->fetch() ?: ['id' => $facilityId, 'name' => ''];
system_audit('feedback.received', $facilityId, (string)$fac['name'], ['rating' => $rating, 'category' => $category, 'by' => $row['user_name']]);
feedback_alert_after_reply($fac, $row);

send_json(200, ['ok' => true, 'feedback' => feedback_out($row)]);

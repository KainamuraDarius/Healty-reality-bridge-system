<?php
// POST /api/pay-start.php   (needs the device token: "Authorization: Bearer <token>")
// Starts a Mobile Money payment for a subscription through Nylon Pay. See nylonpay.php.
//
// Request:  { kind: "setup"|"renewal", package: "starter"|"standard", phone: "07XXXXXXXX",
//             act_by: <user id>, act_key: <the person's act key> }
// Response: { ok, payment: { reference, status, amount, package, kind, licence_until, message } }
// The PRICE is set here from the facility's current plan - whatever the phone sends is ignored.
require_once __DIR__ . '/nylonpay.php';

$body = start_request();
$auth = require_auth();
$facilityId = $auth['facility_id'];
if (!pay_configured()) fail(503, 'payments_off', 'Online payment is not switched on yet. Pay by Mobile Money to ' . 'REALITY HEALTH SYSTEM and enter the activation code they give you.');

$person = verified_person($facilityId, $body['act_by'] ?? null, $body['act_key'] ?? null);
if (!$person) fail(403, 'log_in_again', 'Please log out and log in again, then try the payment once more.');
if (!person_may($person, 'subscription')) fail(403, 'not_allowed', 'Only the super admin, or an admin allowed "Subscription & payments", can pay.');

$phone = pay_phone((string)($body['phone'] ?? ''));
if (!$phone) fail(400, 'bad_phone', 'Enter an MTN or Airtel number in Uganda, e.g. 0772 123456.');
$kind = ($body['kind'] ?? '') === 'renewal' ? 'renewal' : 'setup';

$f = db()->prepare('SELECT * FROM facilities WHERE id = ? AND deleted = 0');
$f->execute([$facilityId]);
$fac = $f->fetch();
if (!$fac) fail(404, 'not_found', 'Facility not found.');
if (!empty($fac['suspended'])) fail(403, 'suspended', 'This facility is suspended. Contact REALITY HEALTH SYSTEM.');
[$package, $amount, $err] = pay_price($fac, $kind, (string)($body['package'] ?? ''));
if ($err) fail(400, 'bad_plan', $err);

// One payment at a time, and not too many tries.
$w = db()->prepare("SELECT * FROM payment_requests WHERE facility_id = ? AND status IN ('starting','pending','processing') AND created_at > (UTC_TIMESTAMP(3) - INTERVAL 3 MINUTE) ORDER BY created_at DESC LIMIT 1");
$w->execute([$facilityId]);
if ($waiting = $w->fetch()) {
    $waiting = payment_refresh($waiting['id']);
    if (!in_array($waiting['status'], PAY_TERMINAL, true))
        fail(409, 'payment_waiting', 'A payment of UGX ' . number_format((int)$waiting['amount']) . ' to ' . $waiting['phone'] . ' is still waiting for approval. Approve it on that phone, or wait 3 minutes and try again.');
}
$n = db()->prepare('SELECT COUNT(*) FROM payment_requests WHERE facility_id = ? AND created_at > (UTC_TIMESTAMP(3) - INTERVAL 1 HOUR)');
$n->execute([$facilityId]);
if ((int)$n->fetchColumn() >= 10) fail(429, 'too_many', 'Too many payment attempts. Please wait an hour, or contact REALITY HEALTH SYSTEM.');

$ref = uuid_v4();
$now = now_ms();
db()->prepare('INSERT INTO payment_requests (id, facility_id, user_id, device_id, kind, package, months, amount, currency, phone, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)')
    ->execute([$ref, $facilityId, $person['id'], $auth['device_id'], $kind, $package, $amount, 'UGX', $phone, 'starting', $now, $now]);

$what = PAY_PACKAGES[$package]['label'] . ($kind === 'renewal' ? ' renewal (30 days)' : ' plan (setup + first 30 days)');
try {
    $res = nylon('collect-payment', [
        'amount' => $amount, 'currency' => 'UGX', 'method' => 'mobileMoney',
        'description' => mb_substr('Reality Health Bridge ' . $what, 0, 120),
        'customer' => array_filter(['name' => mb_substr((string)$fac['name'], 0, 100), 'phoneNumber' => $phone,
                                    'email' => filter_var($fac['email'], FILTER_VALIDATE_EMAIL) ? $fac['email'] : null]),
        'reference' => $ref,
        'metadata' => ['facilityId' => $facilityId, 'kind' => $kind, 'package' => $package],
        'tags' => ['rhb-subscription'],
    ]);
} catch (NylonError $e) {
    payment_update($ref, ['status' => 'failed', 'failure_reason' => mb_substr($e->getMessage(), 0, 300)]);
    $msg = in_array($e->type, ['validation', 'limit', 'account'], true) ? $e->getMessage() : 'Nylon Pay could not start the payment right now. Please try again in a few minutes.';
    fail(502, 'nylon_' . $e->type, $msg);
}
$status = strtolower((string)($res['status'] ?? 'pending'));
payment_update($ref, ['status' => in_array($status, ['pending', 'processing', 'on_hold', 'failed', 'cancelled'], true) ? $status : 'pending',
                      'nylon_id' => mb_substr((string)($res['id'] ?? $res['transactionId'] ?? ''), 0, 64)]);
$pr = $status === 'successful' ? payment_refresh($ref) : payment_row($ref);
send_json(200, ['ok' => true, 'payment' => payment_json($pr)]);

<?php
// POST /api/pay-status.php   (needs the device token)
// Request:  { reference }   Response: { ok, payment: {...} }  (see payment_json in nylonpay.php)
// While a payment is open, asks Nylon Pay for its real status (at most every few seconds) and,
// once it is successful, renews the licence. The app then syncs to receive the new licence.
require_once __DIR__ . '/nylonpay.php';

$body = start_request();
$auth = require_auth();
$ref = (string)($body['reference'] ?? '');
if (!valid_id($ref)) fail(400, 'bad_reference', 'Missing payment reference.');
$pr = payment_row($ref);
if (!$pr || $pr['facility_id'] !== $auth['facility_id']) fail(404, 'not_found', 'Payment not found.');
$recent = $pr['last_checked_at'] && strtotime($pr['last_checked_at'] . ' UTC') > time() - PAY_CHECK_EVERY_SECONDS;
if (!in_array($pr['status'], PAY_TERMINAL, true) && !$recent && pay_configured()) $pr = payment_refresh($ref);
send_json(200, ['ok' => true, 'payment' => payment_json($pr)]);

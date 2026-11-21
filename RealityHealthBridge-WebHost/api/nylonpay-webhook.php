<?php
// POST /api/nylonpay-webhook.php - Nylon Pay calls this when a payment changes
// (transaction.successful / failed / cancelled / processing). Put this address in the Nylon Pay
// dashboard: API Settings > your key > Webhook Configuration.
//
// 1. The "x-nylon-signature" header must be HMAC-SHA256 (lowercase hex) of the RAW body with the
//    webhook secret (same as Nylon's own SDK, VerifyWebhook.php). Anything else gets 401.
// 2. Even a correctly signed message is only a hint: the server then asks Nylon Pay for the
//    payment's status itself (payment_refresh) before renewing anything. So an old message sent
//    again can never renew a licence twice or wrongly.
// 3. Answer 200 quickly (Nylon retries anything else for days).
require_once __DIR__ . '/nylonpay.php';

set_exception_handler(function (Throwable $e) {
    error_log('RHB webhook error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500); echo 'error'; exit;
});
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); echo 'POST only'; exit; }

$raw = (string)file_get_contents('php://input', false, null, 0, 256 * 1024);
$sig = (string)($_SERVER['HTTP_X_NYLON_SIGNATURE'] ?? '');
$secret = (string)(pay_config()['webhook_secret'] ?? '');
if (!pay_configured() || !preg_match('/^[0-9a-f]{64}$/', $sig) || !hash_equals(hash_hmac('sha256', $raw, $secret), $sig)) {
    http_response_code(401); echo 'bad signature'; exit;
}
$msg = json_decode($raw, true);
$p = is_array($msg['payload'] ?? null) ? $msg['payload'] : [];
$ref = (string)($p['reference'] ?? '');
$isOurs = ($p['type'] ?? 'collection') === 'collection' && valid_id($ref) && payment_row($ref);
// A live key must never be paid by a sandbox message (and the other way round).
if ($isOurs && isset($p['mode']) && $p['mode'] !== pay_mode()) $isOurs = false;
if ($isOurs) {
    if (!empty($p['operatorTid'])) payment_update($ref, ['operator_tid' => mb_substr((string)$p['operatorTid'], 0, 64)]);
    $hint = isset($p['amount']) && is_numeric($p['amount']) ? (int)round((float)$p['amount']) : null;
    if (isset($p['currency']) && $p['currency'] !== 'UGX') $hint = -1; // never matches: held for RHS to check
    payment_refresh($ref, $hint);
}
http_response_code(200);
header('Content-Type: text/plain');
echo 'OK';

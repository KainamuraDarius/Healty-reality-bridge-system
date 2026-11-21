<?php
// Online subscription payments through Nylon Pay (MTN Mobile Money / Airtel Money).
//
// How a payment works:
//   1. pay-start.php: an admin allowed "Subscription & payments" chooses a plan. The SERVER sets the
//      price (never the phone), saves a payment_requests row and asks Nylon Pay to collect it.
//   2. The customer approves on their phone (Mobile Money PIN).
//   3. Nylon Pay calls nylonpay-webhook.php (signature checked), and/or the app asks pay-status.php.
//      Either way the server ASKS NYLON PAY ITSELF for the payment's status - a webhook or a phone
//      saying "paid" is never trusted on its own.
//   4. On "successful": the licence is renewed here (licence_source 'nylonpay'), the payment is
//      written to the RHS payments ledger, and the facility's devices get the new licence on their
//      next sync. Applying it twice is impossible (licence_applied, row lock).
//
// Nylon Pay REST: every call is POST <base_url> with {"intent":"execute","service":"rest",
// "action":..., "payload":...}; "auth" swaps the API key + secret for a Bearer token.
// Docs: https://docs.nylonpay.com/docs/rest  and  /docs/guides/webhooks
// Blocked from the web by .htaccess.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }

require_once __DIR__ . '/lib.php';

// Same packages and prices as the app (js/services/license.js) and the admin site (app/licence.php).
const PAY_PACKAGES = [
    'starter'  => ['label' => 'Starter',  'devices' => 2, 'setup_fee' => 150000],
    'standard' => ['label' => 'Standard', 'devices' => 5, 'setup_fee' => 300000],
];
const PAY_MONTHLY_FEE = 20000;
const PAY_DAYS = 30;                 // every payment (setup or renewal) gives 30 days
const PAY_TERMINAL = ['successful', 'failed', 'cancelled'];
const PAY_CHECK_EVERY_SECONDS = 8;   // pay-status asks Nylon Pay at most this often per payment

function pay_config(): array {
    static $c = null;
    if ($c === null) { $f = __DIR__ . '/payment-config.php'; $c = is_file($f) ? (require $f) : []; }
    return $c;
}
function pay_configured(): bool {
    $c = pay_config();
    foreach (['api_key', 'api_secret', 'webhook_secret'] as $k) if (empty($c[$k]) || str_starts_with((string)$c[$k], 'PUT_YOUR')) return false;
    return true;
}
function pay_mode(): string { return str_starts_with((string)(pay_config()['api_key'] ?? ''), 'npk_test_') ? 'sandbox' : 'live'; }

class NylonError extends Exception {
    public string $type;
    public function __construct(string $message, string $type = 'internal') { parent::__construct($message); $this->type = $type; }
}

// One call to Nylon Pay. Returns the "data" part of a successful answer.
function nylon_call(string $action, array $payload, ?string $token = null): array {
    $url = (string)(pay_config()['base_url'] ?? 'https://api.nylonpay.com/api/services');
    $headers = ['Content-Type: application/json', 'Accept: application/json'];
    if ($token) $headers[] = 'Authorization: Bearer ' . $token;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => json_encode(['intent' => 'execute', 'service' => 'rest', 'action' => $action, 'payload' => $payload], JSON_UNESCAPED_SLASHES),
        CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 30,
    ]);
    $raw = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) throw new NylonError('Could not reach Nylon Pay: ' . $err, 'network');
    $res = json_decode($raw, true);
    if (!is_array($res)) throw new NylonError("Nylon Pay sent an unreadable answer (HTTP $http).", $http >= 500 ? 'provider' : 'internal');
    if (($res['status'] ?? null) === true && $http >= 200 && $http < 300) return is_array($res['data'] ?? null) ? $res['data'] : [];
    // Refusals: {"status": false, "message": "... -- error-type: <type> -- error-code: <code>"}
    $msg = (string)($res['message'] ?? "HTTP $http");
    $type = (string)($res['error-type'] ?? $res['errorType'] ?? '');
    if ($type === '' && preg_match('/--\s*error-type:\s*([a-z_]+)/i', $msg, $m)) $type = strtolower($m[1]);
    $clean = trim(preg_replace('/\s*--\s*error-(type|code):.*$/is', '', $msg));
    throw new NylonError($clean !== '' ? $clean : "HTTP $http", $type ?: ($http >= 500 ? 'provider' : 'internal'));
}

// Swap the API key + secret for a Bearer token (valid up to an hour). Kept for the length of this request.
function nylon_token(bool $fresh = false): string {
    static $token = null;
    if ($token && !$fresh) return $token;
    $c = pay_config();
    $d = nylon_call('auth', ['apiKey' => $c['api_key'], 'apiSecret' => $c['api_secret']]);
    $token = (string)($d['accessToken'] ?? $d['access_token'] ?? $d['token'] ?? '');
    if ($token === '') throw new NylonError('Nylon Pay did not return an access token.', 'auth');
    return $token;
}
// A call that needs the token; on an "auth" refusal get a new token and try once more (as the docs say).
function nylon(string $action, array $payload): array {
    try { return nylon_call($action, $payload, nylon_token()); }
    catch (NylonError $e) {
        if ($e->type !== 'auth') throw $e;
        return nylon_call($action, $payload, nylon_token(true));
    }
}

// "0772 123456" / "256772123456" / "+256772123456" -> "+256772123456", or null.
function pay_phone(string $p): ?string {
    $d = preg_replace('/\D+/', '', $p);
    if (preg_match('/^0(7\d{8})$/', $d, $m)) return '+256' . $m[1];
    if (preg_match('/^256(7\d{8})$/', $d, $m)) return '+256' . $m[1];
    if (preg_match('/^(7\d{8})$/', $d, $m)) return '+256' . $m[1];
    return null;
}

// What a facility may buy now, and the price. $kind: 'setup' (new plan / upgrade) or 'renewal'.
// Returns [package, amount, error].
function pay_price(array $fac, string $kind, string $package): array {
    $paidTier = (!$fac['license_trial'] && isset(PAY_PACKAGES[$fac['license_tier']])) ? $fac['license_tier'] : null;
    if ($kind === 'renewal') {
        if (!$paidTier) return [null, 0, 'Choose a plan first - there is no paid plan to renew yet.'];
        return [$paidTier, PAY_MONTHLY_FEE, null];
    }
    if (!isset(PAY_PACKAGES[$package])) return [null, 0, 'Unknown plan.'];
    if ($paidTier === $package) return [null, 0, 'You are already on this plan - use Renew.'];
    if ($paidTier === 'standard' && $package === 'starter') return [null, 0, 'To move to Starter, contact REALITY HEALTH SYSTEM.'];
    return [$package, PAY_PACKAGES[$package]['setup_fee'], null];
}

function uuid_v4(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40); $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}
function uganda_today(): string { return (new DateTime('now', new DateTimeZone('Africa/Kampala')))->format('Y-m-d'); }

function payment_row(string $id): ?array {
    $s = db()->prepare('SELECT * FROM payment_requests WHERE id = ?');
    $s->execute([$id]);
    return $s->fetch() ?: null;
}
function payment_update(string $id, array $cols): void {
    $cols['updated_at'] = now_ms();
    $set = implode(',', array_map(fn($c) => "`$c` = ?", array_keys($cols)));
    db()->prepare("UPDATE payment_requests SET $set WHERE id = ?")->execute([...array_values($cols), $id]);
}

// Ask Nylon Pay for the real status of a payment and act on it. Returns the payment row afterwards.
// $hintAmount: the amount in a verified webhook, used only when Nylon's status answer has none.
function payment_refresh(string $id, ?int $hintAmount = null): array {
    $pr = payment_row($id);
    if (!$pr || in_array($pr['status'], PAY_TERMINAL, true)) return $pr ?: [];
    try {
        $st = nylon('get-status', ['reference' => $id]);
        if (($st['reference'] ?? $id) !== $id) throw new NylonError('Nylon Pay answered about a different payment.', 'internal');
    } catch (NylonError $e) {
        if ($e->type === 'not_found' && strtotime($pr['created_at'] . ' UTC') < time() - 900) {
            payment_update($id, ['status' => 'failed', 'failure_reason' => 'Nylon Pay has no record of this payment.', 'last_checked_at' => now_ms()]);
        } else payment_update($id, ['last_checked_at' => now_ms(), 'last_error' => mb_substr($e->getMessage(), 0, 300)]);
        return payment_row($id);
    }
    $status = strtolower((string)($st['status'] ?? ''));
    if ($status === 'completed') $status = 'successful';
    if ($status === 'under_review') $status = 'on_hold';
    $cols = ['last_checked_at' => now_ms(), 'last_error' => ''];
    if (!empty($st['id'])) $cols['nylon_id'] = mb_substr((string)$st['id'], 0, 64);
    if (!empty($st['operatorTid'])) $cols['operator_tid'] = mb_substr((string)$st['operatorTid'], 0, 64);
    if (in_array($status, ['pending', 'processing', 'on_hold', 'failed', 'cancelled'], true)) {
        $cols['status'] = $status;
        if (in_array($status, ['failed', 'cancelled'], true)) $cols['failure_reason'] = mb_substr((string)($st['failureReason'] ?? $st['statusText'] ?? 'The payment was not completed.'), 0, 300);
    }
    payment_update($id, $cols);
    if ($status === 'successful') {
        // The amount Nylon reports (if it reports one) must be what we asked for.
        $amount = isset($st['amount']) && is_numeric($st['amount']) ? (int)round((float)$st['amount']) : $hintAmount;
        if ($amount !== null && $amount !== (int)$pr['amount']) {
            payment_update($id, ['status' => 'on_hold', 'failure_reason' => "Amount mismatch: paid $amount, expected {$pr['amount']}. RHS must check this payment."]);
            system_audit('payment.mismatch', $pr['facility_id'], $id, ['paid' => $amount, 'expected' => (int)$pr['amount']]);
        } else {
            payment_apply($id);
        }
    }
    return payment_row($id);
}

// The payment succeeded: renew the licence (once), record it for RHS. Safe to call many times.
function payment_apply(string $id): void {
    $pdo = db();
    $pdo->beginTransaction();
    try {
        lock_counter();
        $s = $pdo->prepare('SELECT * FROM payment_requests WHERE id = ? FOR UPDATE');
        $s->execute([$id]);
        $pr = $s->fetch();
        if (!$pr || (int)$pr['licence_applied'] === 1) { $pdo->commit(); return; }
        $f = $pdo->prepare('SELECT * FROM facilities WHERE id = ? FOR UPDATE');
        $f->execute([$pr['facility_id']]);
        $fac = $f->fetch();
        if (!$fac) throw new RuntimeException('facility missing for payment ' . $id);

        $today = uganda_today();
        // Paid time left is kept (renewing early or upgrading never loses days); a trial is not carried over.
        $from = (!$fac['license_trial'] && $fac['license_expiry'] && $fac['license_expiry'] > $today) ? $fac['license_expiry'] : $today;
        $until = (new DateTime($from))->modify('+' . (PAY_DAYS * max(1, (int)$pr['months'])) . ' days')->format('Y-m-d');
        $tier = $pr['package'];
        $now = now_ms();
        update_row('facilities', $fac['id'], [
            'license_expiry' => $until, 'license_trial' => 0, 'trial_used' => 1, 'license_tier' => $tier,
            'max_devices' => PAY_PACKAGES[$tier]['devices'], 'license_facility' => $fac['license_facility'] ?: $fac['name'],
            'license_updated_at' => $now, 'license_source' => 'nylonpay', 'license_code' => '',
        ]); // updated_at (the profile's time) is left alone, like the admin site does
        $pdo->prepare('UPDATE payment_requests SET status = ?, licence_applied = 1, licence_until = ?, paid_at = ?, updated_at = ? WHERE id = ?')
            ->execute(['successful', $until, $now, $now, $id]);
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }

    system_audit('licence.nylonpay', $fac['id'], (string)$fac['name'], ['from' => $fac['license_expiry'], 'to' => $until,
        'package' => PAY_PACKAGES[$tier]['label'], 'amount' => (int)$pr['amount'], 'reference' => $id, 'operator' => $pr['operator_tid']]);
    // The RHS payments ledger (left out if the admin site's tables are not installed).
    try {
        db()->prepare('INSERT INTO admin_payments (facility_id, amount, method, reference, paid_on, purpose, package, months, note, recorded_by, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)')
            ->execute([$fac['id'], (int)$pr['amount'], 'momo', mb_substr($pr['operator_tid'] ?: $pr['nylon_id'] ?: $id, 0, 100), uganda_today(),
                       $pr['kind'] === 'renewal' ? 'renewal' : 'setup', $tier, max(1, (int)$pr['months']),
                       mb_substr('Nylon Pay online payment from ' . $pr['phone'] . ' (ref ' . $id . ')', 0, 300), substr(now_ms(), 0, 19)]);
    } catch (Throwable $e) { error_log('RHB payment ledger: ' . $e->getMessage()); }
    try {
        activation_alert_after_reply($fac, ['license_source' => 'nylonpay', 'license_tier' => $tier, 'max_devices' => PAY_PACKAGES[$tier]['devices'], 'license_expiry' => $until]);
    } catch (Throwable $e) { error_log('RHB payment alert: ' . $e->getMessage()); }
}

// What the app is told about a payment.
function payment_json(array $pr): array {
    return ['reference' => $pr['id'], 'status' => $pr['status'], 'amount' => (int)$pr['amount'], 'package' => $pr['package'],
            'kind' => $pr['kind'], 'licence_until' => $pr['licence_until'], 'message' => $pr['failure_reason'] ?: null];
}

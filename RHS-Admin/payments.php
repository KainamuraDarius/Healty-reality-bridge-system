<?php
// Payments ledger: record money received from facilities (optionally renewing their licence in the
// same step), income per month, void mistakes (never delete), download as a spreadsheet (CSV).
require __DIR__ . '/app/bootstrap.php';
$me = require_login();
$today = today_local();

$pharmacies = db()->query('SELECT id, name, location, license_tier, license_expiry, license_trial, license_facility FROM facilities WHERE deleted = 0 ORDER BY name')->fetchAll();
$byId = array_column($pharmacies, null, 'id');

if (is_post()) {
    require_post_csrf();
    $do = post('do');
    if ($do === 'record') {
        $fid = post('facility_id'); $f = $byId[$fid] ?? null;
        $amount = (float)str_replace([',', ' '], '', post('amount'));
        $method = in_array(post('method'), ['momo', 'cash', 'bank', 'other'], true) ? post('method') : 'momo';
        $ref = mb_substr(post('reference'), 0, 100);
        $paidOn = post('paid_on');
        $purpose = in_array(post('purpose'), ['setup', 'renewal', 'other'], true) ? post('purpose') : 'renewal';
        $renew = post('renew') === '1';
        $months = $renew ? (int)post('months') : 0;
        $tier = array_key_exists(post('tier'), PACKAGES) ? post('tier') : '';
        $_SESSION['pay_form'] = $_POST; // keep what was typed if something is wrong
        $err = null;
        if (!$f) $err = 'Choose the facility.';
        elseif ($amount <= 0) $err = 'Enter the amount received.';
        elseif (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $paidOn) || $paidOn > $today) $err = 'Enter the date the money was received (not in the future).';
        elseif (in_array($method, ['momo', 'bank'], true) && $ref === '') $err = 'Enter the transaction ID / reference for Mobile Money and bank payments.';
        elseif ($renew && !isset(MONTH_DAYS[(string)$months])) $err = 'Choose how many months to renew.';
        elseif ($renew && $tier === '') $err = 'Choose the package to renew.';
        if (!$err && $ref !== '' && post('dup_ok') !== '1') {
            $dup = db()->prepare('SELECT p.paid_on, p.amount, f.name FROM admin_payments p LEFT JOIN facilities f ON f.id = p.facility_id WHERE p.method = ? AND p.reference = ? AND p.voided = 0 LIMIT 1');
            $dup->execute([$method, $ref]);
            if ($d = $dup->fetch()) $err = "Reference “$ref” was already recorded ({$d['name']}, " . money($d['amount']) . ', ' . show_date($d['paid_on']) . '). Tick “Record anyway” if this really is a different payment.';
        }
        if ($err) { flash('error', $err); redirect('payments.php?facility=' . urlencode($fid) . '#record'); }

        db()->prepare('INSERT INTO admin_payments (facility_id, amount, method, reference, paid_on, purpose, package, months, note, recorded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$fid, $amount, $method, $ref, $paidOn, $purpose, $renew ? $tier : '', $months, mb_substr(post('note'), 0, 300), $me['id'], now_utc()]);
        $payId = (int)db()->lastInsertId();
        audit('payment.record', $fid, $f['name'], ['amount' => money($amount), 'method' => payment_method_label($method), 'reference' => $ref, 'paid_on' => $paidOn, 'for' => payment_purpose_label($purpose)]);
        $msg = money($amount) . " from {$f['name']} recorded.";
        if ($renew) {
            $until = renew_licence(facility_by_id($fid), MONTH_DAYS[(string)$months], null, $tier, null, '', ['payment' => "#$payId"]);
            $msg .= ' Licence now runs until ' . show_date($until) . ' (their devices update on their next sync).';
        }
        unset($_SESSION['pay_form']);
        flash('success', $msg);
        redirect('payments.php');
    }
    if ($do === 'void') {
        $reason = mb_substr(post('reason'), 0, 300);
        $s = db()->prepare('SELECT p.*, f.name FROM admin_payments p LEFT JOIN facilities f ON f.id = p.facility_id WHERE p.id = ?');
        $s->execute([(int)post('pay_id')]); $p = $s->fetch();
        if (!$p || $p['voided']) flash('error', 'That payment was not found or is already voided.');
        elseif ($reason === '') flash('error', 'Write why this payment is being voided.');
        else {
            db()->prepare('UPDATE admin_payments SET voided = 1, void_reason = ?, voided_by = ?, voided_at = ? WHERE id = ?')->execute([$reason, $me['id'], now_utc(), $p['id']]);
            audit('payment.void', $p['facility_id'], (string)$p['name'], ['amount' => money($p['amount']), 'reference' => $p['reference'], 'reason' => $reason]);
            flash('success', 'Payment voided. It stays in the list (crossed out) but no longer counts in the totals. The licence was NOT changed — adjust it on the facility page if needed.');
        }
        redirect('payments.php?' . http_build_query(array_intersect_key($_GET, array_flip(['month', 'q', 'method', 'voided']))));
    }
}

// ---- filters for the list
$where = ['1=1']; $args = [];
$month = preg_match('/^\d{4}-\d{2}$/', get('month')) ? get('month') : '';
if ($month) { $where[] = "DATE_FORMAT(p.paid_on, '%Y-%m') = ?"; $args[] = $month; }
if (($q = get('q')) !== '') { $where[] = '(f.name LIKE ? OR p.reference LIKE ?)'; $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $q) . '%'; array_push($args, $like, $like); }
if (in_array(get('method'), ['momo', 'cash', 'bank', 'other'], true)) { $where[] = 'p.method = ?'; $args[] = get('method'); }
if (get('voided') !== '1') $where[] = 'p.voided = 0';
$w = implode(' AND ', $where);
$list = db()->prepare("SELECT p.*, f.name, a.full_name AS recorder FROM admin_payments p LEFT JOIN facilities f ON f.id = p.facility_id
                       LEFT JOIN admin_users a ON a.id = p.recorded_by WHERE $w ORDER BY p.paid_on DESC, p.id DESC LIMIT 500");
$list->execute($args); $rows = $list->fetchAll();

// ---- spreadsheet download (opens in Excel / Google Sheets)
if (get('export') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="rhs-payments-' . ($month ?: 'all') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // so Excel reads the text correctly
    $safe = fn($v) => preg_match('/^[=+\-@\t\r]/', (string)$v) ? "'" . $v : $v; // stop spreadsheet formulas
    fputcsv($out, ['Paid on', 'Facility', 'Amount (UGX)', 'Method', 'Reference', 'For', 'Package', 'Months', 'Note', 'Recorded by', 'Voided', 'Void reason']);
    foreach ($rows as $r) fputcsv($out, array_map($safe, [$r['paid_on'], $r['name'], (float)$r['amount'], payment_method_label($r['method']), $r['reference'],
        payment_purpose_label($r['purpose']), $r['package'] ? package_label($r['package']) : '', $r['months'], $r['note'], $r['recorder'], $r['voided'] ? 'yes' : '', $r['void_reason']]));
    audit('payment.export', null, 'payments CSV', ['rows' => count($rows), 'month' => $month ?: 'all']);
    exit;
}

// ---- income summary (voided payments never count)
$sum = function (string $cond, array $p = []) { $s = db()->prepare("SELECT COALESCE(SUM(amount),0) FROM admin_payments WHERE voided = 0 AND $cond"); $s->execute($p); return (float)$s->fetchColumn(); };
$thisMonth = substr($today, 0, 7);
$lastMonth = (new DateTime($today))->modify('first day of last month')->format('Y-m');
$incomeThis = $sum("DATE_FORMAT(paid_on, '%Y-%m') = ?", [$thisMonth]);
$incomeLast = $sum("DATE_FORMAT(paid_on, '%Y-%m') = ?", [$lastMonth]);
$incomeYear = $sum('YEAR(paid_on) = ?', [(int)substr($today, 0, 4)]);
$byMonth = db()->query("SELECT DATE_FORMAT(paid_on, '%Y-%m') AS ym, COUNT(*) AS n, SUM(amount) AS total,
        SUM(CASE WHEN purpose = 'setup' THEN amount ELSE 0 END) AS setup, SUM(CASE WHEN purpose = 'renewal' THEN amount ELSE 0 END) AS renewal
    FROM admin_payments WHERE voided = 0 AND paid_on >= (CURDATE() - INTERVAL 12 MONTH) GROUP BY ym ORDER BY ym DESC")->fetchAll();
$byMethod = db()->prepare("SELECT method, COUNT(*) AS n, SUM(amount) AS total FROM admin_payments WHERE voided = 0 AND YEAR(paid_on) = ? GROUP BY method ORDER BY total DESC");
$byMethod->execute([(int)substr($today, 0, 4)]); $byMethod = $byMethod->fetchAll();

$form = $_SESSION['pay_form'] ?? []; unset($_SESSION['pay_form']);
$fv = fn($k, $d = '') => h($form[$k] ?? $d);
$preFid = $form['facility_id'] ?? get('facility');
$pre = $byId[$preFid] ?? null;

// Online payments started in the app (Nylon Pay). Shown only after database update 4.
$online = null;
try {
    $onlineAll = get('online') === 'all';
    $onlineTotal = (int)db()->query("SELECT COUNT(*) FROM payment_requests")->fetchColumn();
    $online = db()->query("SELECT p.*, f.name FROM payment_requests p LEFT JOIN facilities f ON f.id = p.facility_id ORDER BY p.created_at DESC LIMIT " . ($onlineAll ? 300 : 10))->fetchAll();
} catch (Throwable $e) { $online = null; }
$onlineTone = ['successful' => 'success', 'failed' => 'danger', 'cancelled' => 'danger', 'on_hold' => 'warning'];

$openRecord = get('facility') !== '' || get('record') === '1' || !empty($form);
layout_start('Payments', 'payments.php', ['sub' => 'Money received from facilities. Online payments (Nylon Pay) are added here by themselves; record cash, bank and direct Mobile Money payments yourself.',
    'actions' => '<a class="btn cta" href="?record=1#record">' . icon('plus') . 'Record a payment</a>']);
?>
<div class="stats">
  <?= stat_card('Income this month', money($incomeThis), 'success', (new DateTime($today))->format('F Y')) ?>
  <?= stat_card('Last month', money($incomeLast), 'info', DateTime::createFromFormat('Y-m-d', $lastMonth . '-01')->format('F Y')) ?>
  <?= stat_card('This year', money($incomeYear), 'violet', substr($today, 0, 4)) ?>
</div>

<details class="panel fold" id="record" <?= $openRecord ? 'open' : '' ?>>
  <summary>Record a payment</summary>
  <p class="small muted">Prices: Starter setup <?= money(PACKAGES['starter']['setup_fee']) ?> · Standard setup <?= money(PACKAGES['standard']['setup_fee']) ?> (first month included) · renewal <?= money(MONTHLY_FEE) ?> per month.</p>
  <form method="post" autocomplete="off">
    <?= csrf_field() ?><input type="hidden" name="do" value="record">
    <div class="form-grid4">
      <div class="field span2"><label for="facility_id">Facility</label><select id="facility_id" name="facility_id" required>
        <option value="">— choose —</option>
        <?php foreach ($pharmacies as $p): ?><option value="<?= h($p['id']) ?>" <?= $preFid === $p['id'] ? 'selected' : '' ?>><?= h($p['name'] ?: '(no name)') ?><?= $p['location'] ? ' — ' . h($p['location']) : '' ?></option><?php endforeach; ?>
      </select></div>
      <div class="field"><label for="amount">Amount (UGX)</label><input type="text" id="amount" name="amount" inputmode="numeric" value="<?= $fv('amount') ?>" placeholder="e.g. 20000" required></div>
      <div class="field"><label for="paid_on">Received on</label><input type="date" id="paid_on" name="paid_on" max="<?= h($today) ?>" value="<?= $fv('paid_on', $today) ?>" required></div>
      <div class="field"><label for="method">Method</label><select id="method" name="method">
        <?php foreach (['momo', 'cash', 'bank', 'other'] as $m): ?><option value="<?= $m ?>" <?= ($form['method'] ?? 'momo') === $m ? 'selected' : '' ?>><?= h(payment_method_label($m)) ?></option><?php endforeach; ?></select></div>
      <div class="field"><label for="reference">Transaction ID / reference</label><input type="text" id="reference" name="reference" value="<?= $fv('reference') ?>" placeholder="MoMo ID, receipt no."></div>
      <div class="field"><label for="purpose">What for</label><select id="purpose" name="purpose">
        <?php foreach (['renewal', 'setup', 'other'] as $m): ?><option value="<?= $m ?>" <?= ($form['purpose'] ?? 'renewal') === $m ? 'selected' : '' ?>><?= h(payment_purpose_label($m)) ?></option><?php endforeach; ?></select></div>
      <div class="field"><label for="note">Note (optional)</label><input type="text" id="note" name="note" value="<?= $fv('note') ?>" maxlength="300"></div>
    </div>
    <fieldset class="renew-box">
      <label class="check"><input type="checkbox" name="renew" value="1" <?= (!$form || ($form['renew'] ?? '') === '1') ? 'checked' : '' ?>> Also renew this facility's licence now</label>
      <div class="row">
        <div class="field mb0"><label for="months">Months</label><select id="months" name="months">
          <?php foreach (MONTH_DAYS as $m => $days): ?><option value="<?= $m ?>" <?= (string)($form['months'] ?? '1') === (string)$m ? 'selected' : '' ?>><?= $m ?> month<?= (string)$m === '1' ? '' : 's' ?> (<?= $days ?> days)</option><?php endforeach; ?></select></div>
        <div class="field mb0"><label for="tier">Package</label><select id="tier" name="tier">
          <?php foreach (PACKAGES as $k => $p): ?><option value="<?= $k ?>" <?= ($form['tier'] ?? ($pre['license_tier'] ?? '') ?: 'standard') === $k ? 'selected' : '' ?>><?= h($p['label']) ?> (<?= $p['devices'] ?> devices)</option><?php endforeach; ?></select></div>
      </div>
      <p class="hint">Paid time still left is kept: the months are added from the current end date if it is in the future.</p>
    </fieldset>
    <label class="check"><input type="checkbox" name="dup_ok" value="1"> Record anyway if this reference was used before</label>
    <button class="btn cta mt" type="submit"><?= icon('check') ?>Record payment</button>
  </form>
</details>

<div class="cols">
<section class="panel">
  <h2>Income by month</h2>
  <?php if (!$byMonth): ?><div class="empty">No payments in the last 12 months.</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>Month</th><th class="num">Payments</th><th class="num">Setup</th><th class="num">Renewals</th><th class="num">Total</th></tr></thead><tbody>
  <?php foreach ($byMonth as $m): ?><tr><td><a href="?month=<?= h($m['ym']) ?>"><?= h(DateTime::createFromFormat('Y-m-d', $m['ym'] . '-01')->format('M Y')) ?></a></td>
    <td class="num"><?= (int)$m['n'] ?></td><td class="num"><?= money($m['setup']) ?></td><td class="num"><?= money($m['renewal']) ?></td><td class="num"><strong><?= money($m['total']) ?></strong></td></tr><?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
</section>
<section class="panel">
  <h2>This year by method</h2>
  <?php if (!$byMethod): ?><div class="empty">No payments this year.</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>Method</th><th class="num">Payments</th><th class="num">Total</th></tr></thead><tbody>
  <?php foreach ($byMethod as $m): ?><tr><td><?= h(payment_method_label($m['method'])) ?></td><td class="num"><?= (int)$m['n'] ?></td><td class="num"><?= money($m['total']) ?></td></tr><?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
</section>
</div>

<?php if ($online !== null): ?>
<section class="panel" id="online">
  <h2><?= icon('phone') ?>Online payments (Nylon Pay)</h2>
  <p class="small muted">Started by facilities in the app. When Nylon Pay confirms one, the server renews the licence and adds it to "All payments" below by itself. <strong>On hold</strong> = the amount did not match: check it in the Nylon Pay dashboard before renewing by hand.</p>
  <?php if (!$online): ?><div class="empty">No online payments yet.</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>Started</th><th>Facility</th><th class="num">Amount</th><th>For</th><th>Phone</th><th>Status</th></tr></thead><tbody>
  <?php foreach ($online as $o): ?><tr>
    <td class="nowrap"><?= show_time(substr($o['created_at'], 0, 19)) ?></td>
    <td><a href="pharmacy.php?id=<?= h(urlencode($o['facility_id'])) ?>"><?= h($o['name'] ?: '(removed)') ?></a><span class="sub ref" title="<?= h($o['id']) ?>">ref <?= h(substr($o['id'], 0, 8)) ?>…</span></td>
    <td class="num nowrap"><?= money($o['amount']) ?></td>
    <td><?= h(package_label($o['package'])) ?><span class="sub"><?= $o['kind'] === 'renewal' ? 'Renewal' : 'Setup / upgrade' ?></span></td>
    <td class="nowrap"><?= h($o['phone']) ?><?= $o['operator_tid'] ? '<span class="sub">' . h($o['operator_tid']) . '</span>' : '' ?></td>
    <td><?= badge(str_replace('_', ' ', $o['status']), $onlineTone[$o['status']] ?? 'info') ?>
      <?= $o['licence_until'] ? '<span class="sub">licence to ' . h(show_date($o['licence_until'])) . '</span>' : '' ?>
      <?= $o['failure_reason'] ? '<span class="sub">' . h($o['failure_reason']) . '</span>' : '' ?></td>
  </tr><?php endforeach; ?></tbody></table></div>
  <?php if ($onlineTotal > count($online)): ?><a class="see-all" href="?online=all#online">Show all <?= number_format($onlineTotal) ?> online payments <?= icon('arrow') ?></a>
  <?php elseif ($onlineAll && $onlineTotal > 10): ?><a class="see-all" href="payments.php#online">Show only the latest 10</a><?php endif; ?>
  <?php endif; ?>
</section>
<?php endif; ?>

<section class="panel">
  <div class="panel-head"><h2><?= icon('card') ?>All payments</h2>
    <a class="btn small secondary" href="?<?= h(http_build_query(array_merge(array_intersect_key($_GET, array_flip(['month', 'q', 'method', 'voided'])), ['export' => 'csv']))) ?>">Download for Excel (CSV)</a></div>
  <form class="filters" method="get">
    <div class="field grow"><label for="q">Facility or reference</label><input type="text" id="q" name="q" value="<?= h($q) ?>"></div>
    <div class="field"><label for="month">Month</label><input type="month" id="month" name="month" value="<?= h($month) ?>"></div>
    <div class="field"><label for="fmethod">Method</label><select id="fmethod" name="method"><option value="">All</option>
      <?php foreach (['momo', 'cash', 'bank', 'other'] as $m): ?><option value="<?= $m ?>" <?= get('method') === $m ? 'selected' : '' ?>><?= h(payment_method_label($m)) ?></option><?php endforeach; ?></select></div>
    <label class="check"><input type="checkbox" name="voided" value="1" <?= get('voided') === '1' ? 'checked' : '' ?>> Show voided</label>
    <button class="btn secondary" type="submit">Show</button>
  </form>
  <?php if (!$rows): ?><div class="empty">No payments match.</div><?php else: ?>
  <p class="small subtle"><?= count($rows) ?> payment<?= count($rows) === 1 ? '' : 's' ?> · total <?= money(array_sum(array_map(fn($r) => $r['voided'] ? 0 : $r['amount'], $rows))) ?></p>
  <div class="table-wrap"><table><thead><tr><th>Paid on</th><th>Facility</th><th class="num">Amount</th><th>Method</th><th>For</th><th>Recorded by</th><th></th></tr></thead><tbody>
  <?php foreach ($rows as $r): ?><tr class="<?= $r['voided'] ? 'voided' : '' ?>">
    <td class="nowrap"><?= show_date($r['paid_on']) ?></td>
    <td><a href="pharmacy.php?id=<?= h(urlencode($r['facility_id'])) ?>"><?= h($r['name'] ?: '(removed)') ?></a><?= $r['note'] ? '<span class="sub" title="' . h($r['note']) . '">' . h(str_starts_with((string)$r['note'], 'Nylon Pay') ? 'Paid online (Nylon Pay)' : $r['note']) . '</span>' : '' ?></td>
    <td class="num nowrap"><?= money($r['amount']) ?></td>
    <td><?= h(payment_method_label($r['method'])) ?><span class="sub"><?= h($r['reference']) ?></span></td>
    <td><?= h(payment_purpose_label($r['purpose'])) ?><?= $r['months'] ? '<span class="sub">' . (int)$r['months'] . ' mo · ' . h(package_label($r['package'])) . '</span>' : '' ?></td>
    <td><?= h($r['recorder'] ?: (str_starts_with((string)$r['note'], 'Nylon Pay') ? 'Nylon Pay (automatic)' : '—')) ?><span class="sub"><?= show_time($r['created_at']) ?></span></td>
    <td><?php if ($r['voided']): ?><?= badge('voided', 'danger') ?><span class="sub"><?= h($r['void_reason']) ?></span>
      <?php else: ?><details class="void-box"><summary>Void…</summary><form method="post" class="row" data-confirm="Void this payment of <?= h(money($r['amount'])) ?>? It stays visible but stops counting."><?= csrf_field() ?>
        <input type="hidden" name="do" value="void"><input type="hidden" name="pay_id" value="<?= (int)$r['id'] ?>">
        <input type="text" name="reason" class="pw-inline" placeholder="Reason" required><button class="btn small danger-soft" type="submit">Void</button></form></details><?php endif; ?></td>
  </tr><?php endforeach; ?></tbody></table></div><?php endif; ?>
</section>
<?php
layout_end();

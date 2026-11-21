<?php
// Reports for REALITY HEALTH SYSTEM staff: facilities, sign-ups, income, renewals due,
// facility activity, devices and admin activity. Each report can be printed (or saved as PDF)
// and downloaded for Excel (CSV).
//
// Facility business data is shown as SUMMARIES ONLY (counts and totals per facility) -
// never patient names, phone numbers or diagnoses.
require __DIR__ . '/app/bootstrap.php';
$me = require_login();
$today = today_local();
const LOCAL_TZ = '+03:00'; // Uganda; sale and sign-up times are stored in UTC

// A real calendar date "YYYY-MM-DD", or null (so 2026-99-99 is refused, not rolled into another year).
function valid_ymd(string $s): ?string {
    $d = DateTime::createFromFormat('!Y-m-d', $s);
    return $d && $d->format('Y-m-d') === $s ? $s : null;
}

// ---- period (for reports that use one)
$presets = [
    'this-month' => 'This month', 'last-month' => 'Last month', 'last-30' => 'Last 30 days', 'this-year' => 'This year',
    'last-year' => 'Last year', 'all' => 'All time', 'custom' => 'Choose dates…',
];
$preset = array_key_exists(get('preset'), $presets) ? get('preset') : 'this-month';
$t = new DateTime($today);
switch ($preset) {
    case 'last-month': $from = (clone $t)->modify('first day of last month')->format('Y-m-d'); $to = (clone $t)->modify('last day of last month')->format('Y-m-d'); break;
    case 'last-30':    $from = (clone $t)->modify('-29 days')->format('Y-m-d'); $to = $today; break;
    case 'this-year':  $from = $t->format('Y') . '-01-01'; $to = $t->format('Y') . '-12-31'; break;
    case 'last-year':  $y = (int)$t->format('Y') - 1; $from = "$y-01-01"; $to = "$y-12-31"; break;
    case 'all':        $from = '2020-01-01'; $to = $today; break;
    case 'custom':
        $from = valid_ymd(get('from')) ?? $t->format('Y-m-01');
        $to   = valid_ymd(get('to')) ?? $today;
        if ($from > $to) [$from, $to] = [$to, $from];
        break;
    default:           $from = $t->format('Y-m-01'); $to = $t->format('Y-m-t');
}
$days = in_array((int)get('days'), [7, 14, 30, 60, 90], true) ? (int)get('days') : 30;
$rangeText = $preset === 'all' ? 'All time' : ($from === $to ? show_date($from) : show_date($from) . ' – ' . show_date($to));

$q = function (string $sql, array $args = []) { $s = db()->prepare($sql); $s->execute($args); return $s->fetchAll(); };
$localDate = fn(string $col) => "DATE(CONVERT_TZ($col, '+00:00', '" . LOCAL_TZ . "'))";
$pct = fn($a, $b) => $b ? round($a / $b * 100, 1) . '%' : '—';
$daysLeft = fn(?string $d) => $d ? (int)floor((strtotime($d) - strtotime($today)) / 86400) : null;

// Each report: [title, group, description, uses period?, builder]
// A builder returns ['cols' => [[label, type]], 'rows' => [[values...]], 'total' => [values...]|null, 'summary' => [[label, value, sub]], 'empty' => text]
// Types: text | date | time (UTC datetime) | money | num | status ([label, tone]) | link ([text, url])
$REPORTS = [
'pharmacies' => ['Facility register', 'Facilities', 'Every facility with its licence, devices, logins and last sync. As of today.', false, function () use ($q) {
    $rows = $q("SELECT f.id, f.name, f.location, f.contact, f.email, f.created_at, f.license_expiry, f.license_trial, f.license_tier, f.max_devices, f.suspended,
        (SELECT COUNT(*) FROM devices d WHERE d.facility_id = f.id AND d.deleted = 0) AS devices,
        (SELECT COUNT(*) FROM users u WHERE u.facility_id = f.id AND u.deleted = 0) AS users,
        (SELECT MAX(d.last_seen_at) FROM devices d WHERE d.facility_id = f.id AND d.deleted = 0) AS last_seen
        FROM facilities f WHERE f.deleted = 0 ORDER BY f.name");
    $out = []; $counts = ['Active' => 0, 'Trial' => 0, 'Expired' => 0, 'none' => 0];
    foreach ($rows as $f) {
        [$lbl, $tone] = licence_status($f);
        if ($f['suspended']) [$lbl, $tone] = ['Suspended', 'danger'];
        $counts[str_starts_with($lbl, 'Active') ? 'Active' : (str_starts_with($lbl, 'Trial') ? 'Trial' : ($lbl === 'No licence' ? 'none' : 'Expired'))]++;
        $out[] = [[$f['name'] ?: '(no name)', 'pharmacy.php?id=' . urlencode($f['id'])], $f['location'], $f['contact'], $f['email'], $f['created_at'], [$lbl, $tone],
            $f['license_tier'] ? package_label($f['license_tier']) : ($f['license_trial'] ? 'Trial' : '—'), $f['license_expiry'], $f['devices'] . ' / ' . $f['max_devices'], (int)$f['users'], $f['last_seen'] ? time_ago($f['last_seen']) : 'never'];
    }
    return ['cols' => [['Facility', 'link'], ['Location', 'text'], ['Phone', 'text'], ['Email', 'text'], ['Registered', 'time'], ['Licence', 'status'], ['Package', 'text'], ['Ends', 'date'], ['Devices', 'text'], ['Logins', 'num'], ['Last sync', 'text']],
        'rows' => $out, 'total' => null,
        'summary' => [['Facilities', number_format(count($rows))], ['Paid & active', $counts['Active']], ['On trial', $counts['Trial']], ['Expired / locked', $counts['Expired'], $counts['none'] ? $counts['none'] . ' with no licence' : '']],
        'empty' => 'No facilities yet.'];
}],
'signups' => ['New sign-ups', 'Facilities', 'Facilities that registered in the period, and whether they have paid since.', true, function () use ($q, $from, $to, $localDate, $pct) {
    $rows = $q("SELECT f.id, f.name, f.location, f.contact, f.created_at, f.license_expiry, f.license_trial, f.suspended,
        (SELECT MIN(p.paid_on) FROM admin_payments p WHERE p.facility_id = f.id AND p.voided = 0) AS first_paid,
        (SELECT COALESCE(SUM(p.amount),0) FROM admin_payments p WHERE p.facility_id = f.id AND p.voided = 0) AS paid
        FROM facilities f WHERE f.deleted = 0 AND {$localDate('f.created_at')} BETWEEN ? AND ? ORDER BY f.created_at", [$from, $to]);
    $out = []; $paying = 0;
    foreach ($rows as $f) {
        [$lbl, $tone] = licence_status($f);
        if ($f['first_paid'] || !$f['license_trial'] && $f['license_expiry']) $paying++;
        $out[] = [$f['created_at'], [$f['name'] ?: '(no name)', 'pharmacy.php?id=' . urlencode($f['id'])], $f['location'], $f['contact'], [$lbl, $tone], $f['first_paid'], (float)$f['paid']];
    }
    return ['cols' => [['Registered', 'time'], ['Facility', 'link'], ['Location', 'text'], ['Phone', 'text'], ['Licence now', 'status'], ['First payment', 'date'], ['Paid so far', 'money']],
        'rows' => $out, 'total' => $out ? ['Total', '', '', '', '', '', array_sum(array_column($rows, 'paid'))] : null,
        'summary' => [['Sign-ups', count($rows)], ['Now paying', $paying, $pct($paying, count($rows)) . ' converted'], ['Still on trial / unpaid', count($rows) - $paying], ['Paid by them', money(array_sum(array_column($rows, 'paid')))]],
        'empty' => 'No facilities registered in this period.'];
}],
'income' => ['Subscription income', 'Money', 'Every payment received in the period (voided payments are left out).', true, function () use ($q, $from, $to) {
    $rows = $q("SELECT p.*, f.name, a.full_name AS recorder FROM admin_payments p LEFT JOIN facilities f ON f.id = p.facility_id LEFT JOIN admin_users a ON a.id = p.recorded_by
        WHERE p.voided = 0 AND p.paid_on BETWEEN ? AND ? ORDER BY p.paid_on, p.id", [$from, $to]);
    $out = []; $by = ['setup' => 0, 'renewal' => 0, 'other' => 0]; $methods = [];
    foreach ($rows as $r) {
        $by[$r['purpose']] = ($by[$r['purpose']] ?? 0) + $r['amount'];
        $methods[payment_method_label($r['method'])] = ($methods[payment_method_label($r['method'])] ?? 0) + $r['amount'];
        $out[] = [$r['paid_on'], [$r['name'] ?: '(removed)', 'pharmacy.php?id=' . urlencode($r['facility_id'])], (float)$r['amount'], payment_method_label($r['method']), $r['reference'],
            payment_purpose_label($r['purpose']), $r['months'] ? $r['months'] . ' mo · ' . package_label($r['package']) : '', $r['recorder'] ?: '—'];
    }
    arsort($methods); $top = array_key_first($methods);
    $total = array_sum(array_column($rows, 'amount'));
    return ['cols' => [['Paid on', 'date'], ['Facility', 'link'], ['Amount', 'money'], ['Method', 'text'], ['Reference', 'text'], ['For', 'text'], ['Renewal', 'text'], ['Recorded by', 'text']],
        'rows' => $out, 'total' => $out ? ['Total', '', $total, '', '', '', '', ''] : null,
        'summary' => [['Income', money($total), count($rows) . ' payment' . (count($rows) === 1 ? '' : 's')], ['Setup fees', money($by['setup'])], ['Renewals', money($by['renewal'])], ['Most used method', $top ?: '—', $top ? money($methods[$top]) : '']],
        'empty' => 'No payments were recorded in this period.'];
}],
'income-by-pharmacy' => ['Income by facility', 'Money', 'How much each facility paid in the period, and when their licence ends.', true, function () use ($q, $from, $to) {
    $rows = $q("SELECT f.id, f.name, f.location, f.license_tier, f.license_expiry, f.license_trial, COUNT(p.id) AS n, SUM(p.amount) AS total, MAX(p.paid_on) AS last
        FROM admin_payments p JOIN facilities f ON f.id = p.facility_id WHERE p.voided = 0 AND p.paid_on BETWEEN ? AND ?
        GROUP BY f.id, f.name, f.location, f.license_tier, f.license_expiry, f.license_trial ORDER BY total DESC", [$from, $to]);
    $out = [];
    foreach ($rows as $f) $out[] = [[$f['name'] ?: '(no name)', 'pharmacy.php?id=' . urlencode($f['id'])], $f['location'], (int)$f['n'], (float)$f['total'], $f['last'], package_label($f['license_tier']), $f['license_expiry']];
    $total = array_sum(array_column($rows, 'total'));
    return ['cols' => [['Facility', 'link'], ['Location', 'text'], ['Payments', 'num'], ['Total paid', 'money'], ['Last payment', 'date'], ['Package', 'text'], ['Licence ends', 'date']],
        'rows' => $out, 'total' => $out ? ['Total', '', array_sum(array_column($rows, 'n')), $total, '', '', ''] : null,
        'summary' => [['Paying facilities', count($rows)], ['Income', money($total)], ['Average per facility', $rows ? money($total / count($rows)) : '—'], ['Top payer', $rows ? ($rows[0]['name'] ?: '—') : '—', $rows ? money($rows[0]['total']) : '']],
        'empty' => 'No payments were recorded in this period.'];
}],
'renewals' => ['Renewals due', 'Money', 'Licences ending soon or already expired — who to call. As of today.', false, function () use ($q, $today, $days, $daysLeft) {
    $until = (new DateTime($today))->modify("+$days days")->format('Y-m-d');
    $rows = $q("SELECT f.id, f.name, f.contact, f.email, f.license_expiry, f.license_trial, f.license_tier, f.suspended,
        (SELECT MAX(p.paid_on) FROM admin_payments p WHERE p.facility_id = f.id AND p.voided = 0) AS last_paid
        FROM facilities f WHERE f.deleted = 0 AND f.license_expiry IS NOT NULL AND f.license_expiry <= ? ORDER BY f.license_expiry", [$until]);
    $out = []; $soon7 = 0; $grace = 0; $locked = 0; $paidDue = 0;
    foreach ($rows as $f) {
        $d = $daysLeft($f['license_expiry']);
        [$lbl, $tone] = licence_status($f);
        if ($d >= 0 && $d <= 7) $soon7++;
        if ($d < 0 && -$d <= GRACE_DAYS) $grace++;
        if ($d < 0 && -$d > GRACE_DAYS) $locked++;
        if (!$f['license_trial']) $paidDue++;
        $out[] = [[$f['name'] ?: '(no name)', 'pharmacy.php?id=' . urlencode($f['id'])], $f['contact'], $f['email'], $f['license_trial'] ? 'Trial' : package_label($f['license_tier']), $f['license_expiry'], $d, [$lbl, $tone], $f['last_paid']];
    }
    return ['cols' => [['Facility', 'link'], ['Phone', 'text'], ['Email', 'text'], ['Package', 'text'], ['Ends', 'date'], ['Days left', 'num'], ['Status', 'status'], ['Last payment', 'date']],
        'rows' => $out, 'total' => null,
        'summary' => [['Due within 7 days', $soon7], ['Expired, in grace', $grace], ['Locked', $locked], ['Paid licences due', $paidDue, 'about ' . money($paidDue * MONTHLY_FEE) . ' a month if all renew']],
        'empty' => "No licence ends within the next $days days."];
}],
'activity' => ['Facility activity', 'Usage', 'How much each facility used the app in the period: sales recorded, devices seen, last sync. Totals only.', true, function () use ($q, $from, $to, $localDate) {
    $rows = $q("SELECT f.id, f.name, f.location,
        (SELECT COUNT(*) FROM sales s WHERE s.facility_id = f.id AND s.deleted = 0 AND {$localDate('s.sale_date')} BETWEEN ? AND ?) AS n,
        (SELECT COALESCE(SUM(s.total),0) FROM sales s WHERE s.facility_id = f.id AND s.deleted = 0 AND {$localDate('s.sale_date')} BETWEEN ? AND ?) AS value,
        (SELECT COUNT(*) FROM products pr WHERE pr.facility_id = f.id AND pr.deleted = 0) AS products,
        (SELECT COUNT(*) FROM devices d WHERE d.facility_id = f.id AND d.deleted = 0 AND {$localDate('d.last_seen_at')} BETWEEN ? AND ?) AS seen,
        (SELECT MAX(d.last_seen_at) FROM devices d WHERE d.facility_id = f.id AND d.deleted = 0) AS last_seen
        FROM facilities f WHERE f.deleted = 0 ORDER BY n DESC, f.name", [$from, $to, $from, $to, $from, $to]);
    $out = []; $active = 0;
    foreach ($rows as $f) {
        if ($f['n'] > 0) $active++;
        $out[] = [[$f['name'] ?: '(no name)', 'pharmacy.php?id=' . urlencode($f['id'])], $f['location'], (int)$f['n'], (float)$f['value'], (int)$f['products'], (int)$f['seen'],
            $f['last_seen'] ? time_ago($f['last_seen']) : 'never', $f['n'] > 0 ? ['Using it', 'success'] : ['No sales', 'warning']];
    }
    return ['cols' => [['Facility', 'link'], ['Location', 'text'], ['Sales', 'num'], ['Sales value', 'money'], ['Products', 'num'], ['Devices seen', 'num'], ['Last sync', 'text'], ['Activity', 'status']],
        'rows' => $out, 'total' => $out ? ['Total', '', array_sum(array_column($rows, 'n')), array_sum(array_column($rows, 'value')), '', '', '', ''] : null,
        'summary' => [['Active facilities', $active, 'recorded at least one sale'], ['Inactive', count($rows) - $active, 'no sales in the period'], ['Sales recorded', number_format(array_sum(array_column($rows, 'n')))], ['Value through the app', money(array_sum(array_column($rows, 'value')))]],
        'empty' => 'No facilities yet.'];
}],
'devices' => ['Devices & app versions', 'Usage', 'Every phone and computer: app version, last sync and records waiting or refused. As of today.', false, function () use ($q) {
    $rows = $q("SELECT d.label, d.device_code, d.app_version, d.last_seen_at, d.pending_count, d.rejected_count, d.added_date, f.id AS fid, f.name
        FROM devices d JOIN facilities f ON f.id = d.facility_id WHERE d.deleted = 0 AND f.deleted = 0 ORDER BY f.name, d.label");
    $out = []; $versions = []; $quiet = 0; $problems = 0;
    foreach ($rows as $d) {
        $v = $d['app_version'] ?: 'unknown'; $versions[$v] = ($versions[$v] ?? 0) + 1;
        $isQuiet = !$d['last_seen_at'] || strtotime($d['last_seen_at'] . ' UTC') < time() - 7 * 86400;
        if ($isQuiet) $quiet++;
        if ($d['rejected_count'] > 0) $problems++;
        $state = $d['rejected_count'] > 0 ? ['Records refused', 'danger'] : ($isQuiet ? ['Not seen 7+ days', 'warning'] : ['OK', 'success']);
        $out[] = [[$d['name'] ?: '(no name)', 'pharmacy.php?id=' . urlencode($d['fid'])], $d['label'] ?: 'Device ' . $d['device_code'], $v, $d['last_seen_at'] ? time_ago($d['last_seen_at']) : 'never', (int)$d['pending_count'], (int)$d['rejected_count'], $state];
    }
    arsort($versions);
    return ['cols' => [['Facility', 'link'], ['Device', 'text'], ['App version', 'text'], ['Last sync', 'text'], ['Waiting', 'num'], ['Refused', 'num'], ['State', 'status']],
        'rows' => $out, 'total' => null,
        'summary' => [['Devices', count($rows)], ['Most common version', $versions ? array_key_first($versions) : '—', $versions ? reset($versions) . ' device(s)' : ''], ['Not seen for 7+ days', $quiet], ['With refused records', $problems]],
        'empty' => 'No devices yet.'];
}],
'admin-activity' => ['Admin team activity', 'Team', 'What each member of the admin team did in the period, from the audit log.', true, function () use ($q, $from, $to, $localDate) {
    $rows = $q("SELECT COALESCE(a.full_name, l.admin_email) AS who, l.admin_email, l.action, COUNT(*) AS n, MAX(l.created_at) AS last
        FROM admin_audit_log l LEFT JOIN admin_users a ON a.id = l.admin_id
        WHERE {$localDate('l.created_at')} BETWEEN ? AND ? GROUP BY who, l.admin_email, l.action ORDER BY who, n DESC", [$from, $to]);
    $out = []; $people = [];
    foreach ($rows as $r) { $people[$r['admin_email']] = true; $out[] = [$r['who'] ?: '(system)', $r['admin_email'], $r['action'], (int)$r['n'], $r['last']]; }
    $renewals = array_sum(array_map(fn($r) => str_starts_with($r['action'], 'licence.') ? $r['n'] : 0, $rows));
    $payments = array_sum(array_map(fn($r) => $r['action'] === 'payment.record' ? $r['n'] : 0, $rows));
    return ['cols' => [['Admin', 'text'], ['Email', 'text'], ['Action', 'text'], ['Times', 'num'], ['Last time', 'time']],
        'rows' => $out, 'total' => $out ? ['Total', '', '', array_sum(array_column($rows, 'n')), ''] : null,
        'summary' => [['Admins active', count($people)], ['Actions', number_format(array_sum(array_column($rows, 'n')))], ['Licence changes', $renewals], ['Payments recorded', $payments]],
        'empty' => 'No admin activity in this period.'];
}],
];
$groups = ['Facilities', 'Money', 'Usage', 'Team'];

$key = array_key_exists(get('r'), $REPORTS) ? get('r') : 'pharmacies';
[$title, $group, $desc, $usesPeriod, $build] = $REPORTS[$key];
$rep = $build();

$plain = function ($v, string $type) {
    if (is_array($v)) return $v[0];
    if ($type === 'money') return round((float)$v);
    if ($type === 'time') return $v ? show_time($v) : '';
    return $v;
};
$cell = function ($v, string $type) {
    if ($v === null || $v === '') return '<span class="subtle">—</span>';
    switch ($type) {
        case 'money':  return h(money($v));
        case 'num':    return is_numeric($v) ? number_format((float)$v) : h($v);
        case 'date':   return '<span class="nowrap">' . h(show_date($v)) . '</span>';
        case 'time':   return '<span class="nowrap">' . h(show_time($v)) . '</span>';
        case 'status': return badge($v[0], $v[1]);
        case 'link':   return '<a href="' . h($v[1]) . '"><strong>' . h($v[0]) . '</strong></a>';
        default:       return h($v);
    }
};
$isNum = fn(string $t) => in_array($t, ['money', 'num'], true);

// ---- Excel (CSV) download
if (get('export') === 'csv') {
    $name = 'rhs-' . $key . '-' . ($usesPeriod ? ($preset === 'all' ? 'all' : "$from-to-$to") : $today) . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    $safe = fn($v) => is_string($v) && preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v; // stop spreadsheet formulas
    fputcsv($out, ['REALITY HEALTH SYSTEM', $title]);
    fputcsv($out, [$usesPeriod ? "Period: $rangeText" : "As of $today"]);
    fputcsv($out, []);
    fputcsv($out, array_map(fn($c) => $c[1] === 'money' ? $c[0] . ' (UGX)' : $c[0], $rep['cols']));
    foreach ($rep['rows'] as $r) fputcsv($out, array_map($safe, array_map(fn($v, $c) => $plain($v, $c[1]), $r, $rep['cols'])));
    if ($rep['total']) fputcsv($out, array_map(fn($v, $c) => $plain($v, $c[1]), $rep['total'], $rep['cols']));
    audit('report.export', null, $title, ['rows' => count($rep['rows']), 'period' => $usesPeriod ? $rangeText : 'today']);
    exit;
}

$qs = fn(array $extra) => '?' . http_build_query(array_merge(['r' => $key, 'preset' => $preset, 'from' => $preset === 'custom' ? $from : null, 'to' => $preset === 'custom' ? $to : null, 'days' => $key === 'renewals' ? $days : null], $extra));

layout_start('Reports', 'reports.php', ['sub' => 'Facilities, money and usage over any period. Print, save as PDF or download for Excel.']);
?>
<div class="rep-layout">
  <nav class="panel rep-menu" aria-label="Choose a report">
    <?php foreach ($groups as $g): ?>
      <div class="rep-group"><span class="rep-group-label"><?= h($g) ?></span>
        <?php foreach ($REPORTS as $k => $r): if ($r[1] !== $g) continue; ?>
          <a href="?r=<?= h($k) ?>&amp;preset=<?= h($preset) ?><?= $preset === 'custom' ? '&amp;from=' . h($from) . '&amp;to=' . h($to) : '' ?>" class="<?= $k === $key ? 'active' : '' ?>" <?= $k === $key ? 'aria-current="page"' : '' ?>><?= h($r[0]) ?></a>
        <?php endforeach; ?>
      </div>
    <?php endforeach; ?>
  </nav>

  <section class="panel rep-main">
    <div class="rep-head">
      <div>
        <span class="rep-kicker"><?= h($group) ?> report</span>
        <h2><?= h($title) ?></h2>
        <p class="small muted"><?= h($desc) ?></p>
      </div>
      <div class="actions no-print">
        <button class="btn secondary" type="button" data-print>Print / PDF</button>
        <a class="btn" href="<?= h($qs(['export' => 'csv'])) ?>">Download for Excel (CSV)</a>
      </div>
    </div>

    <form class="filters no-print" method="get">
      <input type="hidden" name="r" value="<?= h($key) ?>">
      <?php if ($usesPeriod): ?>
        <div class="field"><label for="preset">Period</label><select id="preset" name="preset">
          <?php foreach ($presets as $k => $lbl): ?><option value="<?= h($k) ?>" <?= $k === $preset ? 'selected' : '' ?>><?= h($lbl) ?></option><?php endforeach; ?></select></div>
        <div class="field"><label for="from">From <span class="subtle">(choose dates)</span></label><input type="date" id="from" name="from" value="<?= h($from) ?>"></div>
        <div class="field"><label for="to">To</label><input type="date" id="to" name="to" value="<?= h($to) ?>"></div>
        <button class="btn secondary" type="submit">Show</button>
      <?php elseif ($key === 'renewals'): ?>
        <div class="field"><label for="days">Ending within</label><select id="days" name="days">
          <?php foreach ([7, 14, 30, 60, 90] as $d): ?><option value="<?= $d ?>" <?= $d === $days ? 'selected' : '' ?>><?= $d ?> days (and expired)</option><?php endforeach; ?></select></div>
        <button class="btn secondary" type="submit">Show</button>
      <?php endif; ?>
      <span class="rep-range"><?= $usesPeriod ? h($rangeText) : 'As of ' . h(show_date($today)) ?></span>
    </form>
    <p class="print-only rep-print-meta">REALITY HEALTH SYSTEM · <?= h($usesPeriod ? $rangeText : 'As of ' . show_date($today)) ?> · printed <?= h(show_time(now_utc())) ?> by <?= h($me['full_name'] ?: $me['email']) ?></p>

    <?php if ($rep['summary']): ?>
    <div class="rep-summary">
      <?php foreach ($rep['summary'] as $s): ?><div><span><?= h($s[0]) ?></span><strong><?= h((string)$s[1]) ?></strong><?php if (!empty($s[2])): ?><small><?= h($s[2]) ?></small><?php endif; ?></div><?php endforeach; ?>
    </div>
    <?php endif; ?>

    <?php if (!$rep['rows']): ?><div class="empty"><?= h($rep['empty']) ?></div><?php else: ?>
    <div class="table-wrap"><table class="rep-table">
      <thead><tr><?php foreach ($rep['cols'] as $c): ?><th class="<?= $isNum($c[1]) ? 'num' : '' ?>"><?= h($c[0]) ?></th><?php endforeach; ?></tr></thead>
      <tbody><?php foreach ($rep['rows'] as $r): ?><tr><?php foreach ($r as $i => $v): ?><td class="<?= $isNum($rep['cols'][$i][1]) ? 'num' : '' ?>"><?= $cell($v, $rep['cols'][$i][1]) ?></td><?php endforeach; ?></tr><?php endforeach; ?></tbody>
      <?php if ($rep['total']): ?><tfoot><tr><?php foreach ($rep['total'] as $i => $v): ?><td class="<?= $isNum($rep['cols'][$i][1]) ? 'num' : '' ?>"><?= $i === 0 ? '<strong>' . h($v) . '</strong>' : ($v === '' ? '' : $cell($v, $rep['cols'][$i][1])) ?></td><?php endforeach; ?></tr></tfoot><?php endif; ?>
    </table></div>
    <p class="small subtle"><?= number_format(count($rep['rows'])) ?> row<?= count($rep['rows']) === 1 ? '' : 's' ?></p>
    <?php endif; ?>
  </section>
</div>
<?php
layout_end();

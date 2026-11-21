<?php
// Dashboard: the whole system at a glance. Summaries only - no patient details.
require __DIR__ . '/app/bootstrap.php';
require_login();
handle_signups_seen('index.php');

$today = today_local();
$in7   = (new DateTime($today))->modify('+7 days')->format('Y-m-d');
$grace = (new DateTime($today))->modify('-' . GRACE_DAYS . ' days')->format('Y-m-d');

$q = function (string $sql, array $p = []) { $s = db()->prepare($sql); $s->execute($p); return $s; };
$one = fn(string $sql, array $p = []) => (int)$q($sql, $p)->fetchColumn();

$live = 'deleted = 0';
$total    = $one("SELECT COUNT(*) FROM facilities WHERE $live");
$trial    = $one("SELECT COUNT(*) FROM facilities WHERE $live AND license_trial = 1 AND license_expiry >= ?", [$today]);
$paid     = $one("SELECT COUNT(*) FROM facilities WHERE $live AND license_trial = 0 AND license_expiry >= ?", [$today]);
$expiring = $one("SELECT COUNT(*) FROM facilities WHERE $live AND license_expiry BETWEEN ? AND ?", [$today, $in7]);
$inGrace  = $one("SELECT COUNT(*) FROM facilities WHERE $live AND license_expiry < ? AND license_expiry >= ?", [$today, $grace]);
$locked   = $one("SELECT COUNT(*) FROM facilities WHERE $live AND license_expiry < ?", [$grace]);
$noLic    = $one("SELECT COUNT(*) FROM facilities WHERE $live AND license_expiry IS NULL");
$new7     = $one("SELECT COUNT(*) FROM facilities WHERE $live AND created_at >= (UTC_TIMESTAMP() - INTERVAL 7 DAY)");

$devices      = $one('SELECT COUNT(*) FROM devices WHERE deleted = 0');
$devicesQuiet = $one('SELECT COUNT(*) FROM devices WHERE deleted = 0 AND (last_seen_at IS NULL OR last_seen_at < (UTC_TIMESTAMP() - INTERVAL 7 DAY))');
$sales30      = $one('SELECT COUNT(*) FROM sales WHERE deleted = 0 AND sale_date >= (UTC_TIMESTAMP() - INTERVAL 30 DAY)');
$users        = $one('SELECT COUNT(*) FROM users WHERE deleted = 0');
$incomeMonth  = (float)$q("SELECT COALESCE(SUM(amount),0) FROM admin_payments WHERE voided = 0 AND DATE_FORMAT(paid_on, '%Y-%m') = ?", [substr($today, 0, 7)])->fetchColumn();
$attention    = $one('SELECT COUNT(*) FROM devices WHERE deleted = 0 AND (rejected_count > 0 OR (pending_count > 0 AND last_seen_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY)))')
              + $one("SELECT COUNT(*) FROM facilities WHERE deleted = 0 AND license_source IN ('momo','legacy')");

$newest = $q("SELECT id, name, location, email, contact, created_at, license_expiry, license_trial FROM facilities WHERE $live ORDER BY created_at DESC LIMIT 8")->fetchAll();
$soon   = $q("SELECT id, name, location, contact, license_expiry, license_trial FROM facilities WHERE $live AND license_expiry BETWEEN ? AND ? ORDER BY license_expiry LIMIT 10", [$grace, $in7])->fetchAll();
$quiet  = $q("SELECT f.name, d.label, d.device_code, d.last_seen_at FROM devices d JOIN facilities f ON f.id = d.facility_id
              WHERE d.deleted = 0 AND f.deleted = 0 AND (d.last_seen_at IS NULL OR d.last_seen_at < (UTC_TIMESTAMP() - INTERVAL 7 DAY))
              ORDER BY d.last_seen_at LIMIT 8")->fetchAll();

$me = current_admin();
$hour = (int)(new DateTime('now', new DateTimeZone(config()['timezone'] ?? 'Africa/Kampala')))->format('G');
$greet = $hour < 12 ? 'Good morning' : ($hour < 17 ? 'Good afternoon' : 'Good evening');
$first = explode(' ', trim($me['full_name'] ?: 'there'))[0];
$onlineWaiting = 0;
try { $onlineWaiting = $one("SELECT COUNT(*) FROM payment_requests WHERE status = 'on_hold'"); } catch (Throwable $e) {}
$ledger = [
    ['All facilities', $total, 't-info', $new7 . ' new this week', ''],
    ['On free trial', $trial, 't-violet', 'still deciding', 'trial'],
    ['Paid & active', $paid, 't-success', 'paying customers', 'active'],
    ['Ending in 7 days', $expiring, $expiring ? 't-warning' : '', 'call to renew', 'ending'],
    ['Expired, in grace', $inGrace, $inGrace ? 't-danger' : '', 'locks in ≤ ' . GRACE_DAYS . ' days', 'grace'],
    ['Locked', $locked, $locked ? 't-danger' : '', $noLic ? "$noLic without a licence" : 'app closed', 'locked'],
];

layout_start('Dashboard', 'index.php', ['sub' => 'Everything across all facilities. Summaries only — patients\' details never leave the facility.']);
echo signups_panel();
?>
<section class="hero">
  <div>
    <span class="hero-date"><?= h((new DateTime($today))->format('l j F Y')) ?></span>
    <h2><?= h($greet) ?>, <?= h($first) ?></h2>
    <p><?= number_format($total) ?> facilities on Reality Health Bridge · <?= number_format($paid) ?> paying · <?= number_format($devices) ?> devices in use</p>
    <div class="hero-actions">
      <a class="btn cta" href="payments.php#record"><?= icon('plus') ?>Record a payment</a>
      <a class="btn secondary" href="pharmacies.php"><?= icon('store') ?>All facilities</a>
      <a class="btn secondary" href="announcements.php#form"><?= icon('megaphone') ?>Send a message</a>
    </div>
  </div>
  <a class="hero-figure" href="payments.php">
    <span>Income · <?= h((new DateTime($today))->format('F')) ?></span>
    <strong><?= h(money($incomeMonth)) ?></strong>
    <em>payments recorded this month</em>
  </a>
</section>

<nav class="ledger" aria-label="Licences">
  <?php foreach ($ledger as [$label, $n, $tone, $sub, $status]): ?>
    <a class="<?= h($tone) ?>" href="pharmacies.php<?= $status ? '?status=' . h($status) : '' ?>"><i class="dot"></i><span><?= h($label) ?></span><strong><?= number_format($n) ?></strong><em><?= h($sub) ?></em></a>
  <?php endforeach; ?>
</nav>

<div class="stats">
  <?= stat_card('Devices in use', $devices, 'info', $devicesQuiet . ' not seen for 7+ days') ?>
  <?= stat_card('Facility logins', $users, 'violet', 'admins and staff') ?>
  <?= stat_card('Sales, last 30 days', number_format($sales30), 'success', 'all facilities') ?>
  <?= stat_card('Needs attention', $attention + $onlineWaiting, ($attention + $onlineWaiting) ? 'warning' : 'success', $onlineWaiting ? $onlineWaiting . ' online payment(s) on hold' : 'see Support', $onlineWaiting ? 'payments.php#online' : 'support.php') ?>
</div>

<div class="dash-grid">
  <section class="panel">
    <div class="panel-head"><h2><?= icon('clock') ?>Ending soon or just expired</h2><span class="small subtle">Call them about renewing</span></div>
    <?php if (!$soon): ?><div class="empty">Nothing ending in the next 7 days.</div><?php else: ?>
    <div class="table-wrap"><table>
      <thead><tr><th>Facility</th><th>Phone</th><th>Ends</th><th>Status</th></tr></thead>
      <tbody><?php foreach ($soon as $f): [$lbl, $tone] = licence_status($f); ?>
        <tr><td><a href="pharmacy.php?id=<?= h(urlencode($f['id'])) ?>"><strong><?= h($f['name']) ?></strong></a><span class="sub"><?= h($f['location']) ?></span></td>
            <td class="nowrap"><?= $f['contact'] ? '<a href="tel:' . h(preg_replace('/[^\d+]/', '', $f['contact'])) . '">' . h($f['contact']) . '</a>' : '—' ?></td>
            <td class="nowrap mono"><?= show_date($f['license_expiry']) ?></td><td><?= badge($lbl, $tone) ?></td></tr>
      <?php endforeach; ?></tbody>
    </table></div>
    <a class="see-all" href="pharmacies.php?status=ending">All ending soon <?= icon('arrow') ?></a><?php endif; ?>
  </section>

  <div>
    <section class="panel">
      <div class="panel-head"><h2><?= icon('store') ?>Newest facilities</h2></div>
      <?php if (!$newest): ?><div class="empty">No facilities yet. They appear here when they register in the app.</div><?php else: ?>
      <ul class="list"><?php foreach (array_slice($newest, 0, 6) as $f): [$lbl, $tone] = licence_status($f); ?>
        <li><span class="fac-mark"><?= h(admin_initials($f['name'] ?: '?')) ?></span>
          <a class="grow" href="pharmacy.php?id=<?= h(urlencode($f['id'])) ?>"><strong><?= h($f['name'] ?: '(no name yet)') ?></strong><small><?= h($f['location']) ?> · <?= badge($lbl, $tone) ?></small></a>
          <span class="when"><?= h(time_ago($f['created_at'])) ?></span></li>
      <?php endforeach; ?></ul>
      <a class="see-all" href="pharmacies.php">All facilities <?= icon('arrow') ?></a><?php endif; ?>
    </section>

    <section class="panel">
      <div class="panel-head"><h2><?= icon('device') ?>Quiet devices</h2><span class="small subtle">no sync for 7+ days</span></div>
      <?php if (!$quiet): ?><div class="empty">Every device synced in the last 7 days.</div><?php else: ?>
      <ul class="list"><?php foreach ($quiet as $d): ?>
        <li><span class="fac-mark"><?= h($d['device_code']) ?></span><span class="grow"><strong><?= h($d['name']) ?></strong><small><?= h($d['label']) ?></small></span><span class="when"><?= h(time_ago($d['last_seen_at'])) ?></span></li>
      <?php endforeach; ?></ul><?php endif; ?>
    </section>
  </div>
</div>
<?php
layout_end();

<?php
// All facilities (pharmacies, drug shops, clinics): search, filter by licence status. Summaries only.
require __DIR__ . '/app/bootstrap.php';
require_login();
handle_signups_seen('pharmacies.php');

$today = today_local();
$in7   = (new DateTime($today))->modify('+7 days')->format('Y-m-d');
$grace = (new DateTime($today))->modify('-' . GRACE_DAYS . ' days')->format('Y-m-d');

$filters = [
    ''           => ['All', '1=1', []],
    'trial'      => ['Free trial', 'f.license_trial = 1 AND f.license_expiry >= ?', [$today]],
    'active'     => ['Paid & active', 'f.license_trial = 0 AND f.license_expiry >= ?', [$today]],
    'ending'     => ['Ending in 7 days', 'f.license_expiry BETWEEN ? AND ?', [$today, $in7]],
    'grace'      => ['In grace', 'f.license_expiry < ? AND f.license_expiry >= ?', [$today, $grace]],
    'locked'     => ['Locked', 'f.license_expiry < ?', [$grace]],
    'none'       => ['No licence', 'f.license_expiry IS NULL', []],
    'suspended'  => ['Suspended', 'f.suspended = 1', []],
    'check'      => ['Licence to check', "f.license_source IN ('momo','legacy')", []],
];
$status = array_key_exists(get('status'), $filters) ? get('status') : '';
[$statusLabel, $where, $args] = $filters[$status];
$q = get('q');
if ($q !== '') {
    $where .= ' AND (f.name LIKE ? OR f.email LIKE ? OR f.contact LIKE ? OR f.location LIKE ?)';
    $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $q) . '%';
    array_push($args, $like, $like, $like, $like);
}
$sort = ['new' => 'f.created_at DESC', 'name' => 'f.name', 'expiry' => 'f.license_expiry IS NULL, f.license_expiry', 'seen' => 'last_seen IS NULL, last_seen DESC'];
$order = $sort[get('sort')] ?? $sort['new'];

const PER = 50;
$page = max(1, (int)get('page'));
$c = db()->prepare("SELECT COUNT(*) FROM facilities f WHERE f.deleted = 0 AND $where"); $c->execute($args); $total = (int)$c->fetchColumn();
$s = db()->prepare("SELECT f.id, f.name, f.location, f.email, f.contact, f.created_at, f.license_expiry, f.license_trial, f.license_tier,
        f.max_devices, f.license_source, f.suspended,
        (SELECT COUNT(*) FROM devices d WHERE d.facility_id = f.id AND d.deleted = 0) AS devices,
        (SELECT MAX(d.last_seen_at) FROM devices d WHERE d.facility_id = f.id AND d.deleted = 0) AS last_seen
    FROM facilities f WHERE f.deleted = 0 AND $where ORDER BY $order LIMIT " . PER . ' OFFSET ' . (($page - 1) * PER));
$s->execute($args);
$rows = $s->fetchAll();

// How many facilities each status chip has (search text not applied, so the chips stay steady).
$counts = [];
foreach ($filters as $k => [, $w, $a]) { $cq = db()->prepare("SELECT COUNT(*) FROM facilities f WHERE f.deleted = 0 AND $w"); $cq->execute($a); $counts[$k] = (int)$cq->fetchColumn(); }
$chipTone = ['ending' => 'warn', 'grace' => 'bad', 'locked' => 'bad', 'suspended' => 'bad', 'check' => 'warn', 'none' => 'warn'];
$link = function (array $change) { $qs = array_merge($_GET, $change); unset($qs['page']); $qs = array_filter($qs, fn($v) => $v !== '' && $v !== null); return 'pharmacies.php' . ($qs ? '?' . http_build_query($qs) : ''); };

layout_start('Facilities', 'pharmacies.php', ['sub' => 'Every pharmacy, drug shop and clinic using Reality Health Bridge. Open one to manage its licence, devices and logins.']);
echo signups_panel();
?>
<nav class="chips" aria-label="Filter by status">
  <?php foreach ($filters as $k => [$lbl]): if ($k !== '' && !$counts[$k] && $k !== $status) continue; ?>
    <a class="chip <?= $k === $status ? 'active' : '' ?> <?= $counts[$k] ? ($chipTone[$k] ?? '') : '' ?>" href="<?= h($link(['status' => $k])) ?>"><?= h($lbl) ?> <b><?= number_format($counts[$k]) ?></b></a>
  <?php endforeach; ?>
</nav>
<section class="panel">
  <form class="filters" method="get">
    <?php if ($status): ?><input type="hidden" name="status" value="<?= h($status) ?>"><?php endif; ?>
    <div class="field grow"><label for="q">Search</label><input type="search" id="q" name="q" value="<?= h($q) ?>" placeholder="Name, email, phone or place"></div>
    <div class="field"><label for="sort">Order</label><select id="sort" name="sort">
      <?php foreach (['new' => 'Newest first', 'name' => 'Name A–Z', 'expiry' => 'Licence ends soonest', 'seen' => 'Last sync'] as $k => $lbl): ?>
        <option value="<?= $k ?>" <?= get('sort') === $k ? 'selected' : '' ?>><?= $lbl ?></option><?php endforeach; ?></select></div>
    <button class="btn" type="submit"><?= icon('search') ?>Show</button>
  </form>
  <p class="small subtle"><?= number_format($total) ?> facilit<?= $total === 1 ? 'y' : 'ies' ?><?= $status ? ' · ' . h($statusLabel) : '' ?><?= $q !== '' ? ' · matching “' . h($q) . '” · <a href="' . h($link(['q' => ''])) . '">clear search</a>' : '' ?></p>
  <?php if (!$rows): ?><div class="empty">No facilities match.</div><?php else: ?>
  <div class="table-wrap"><table>
    <thead><tr><th>Facility</th><th>Contact</th><th>Licence</th><th class="num">Devices</th><th>Last sync</th><th>Registered</th></tr></thead>
    <tbody><?php foreach ($rows as $f): [$lbl, $tone] = licence_status($f); [$srcLbl, , $srcCheck] = licence_source_info($f['license_source']); ?>
      <tr>
        <td><a class="fac-cell" href="pharmacy.php?id=<?= h(urlencode($f['id'])) ?>"><span class="fac-mark"><?= h(admin_initials($f['name'] ?: '?')) ?></span><span><strong><?= h($f['name'] ?: '(no name yet)') ?></strong><span class="sub"><?= h($f['location']) ?></span></span></a></td>
        <td><?= h($f['contact']) ?><span class="sub"><?= h($f['email']) ?></span></td>
        <td><?= $f['suspended'] ? badge('Suspended', 'danger') . ' ' : '' ?><?= badge($lbl, $tone) ?>
            <span class="sub"><?= h($f['license_tier'] ? package_label($f['license_tier']) . ' · ' : ($f['license_trial'] ? 'Trial · ' : '')) ?><?= $f['license_expiry'] ? 'ends ' . show_date($f['license_expiry']) : '' ?></span>
            <?= $srcCheck ? '<span class="sub warn-text">' . h($srcLbl) . '</span>' : '' ?></td>
        <td class="num mono"><?= (int)$f['devices'] ?> / <?= (int)$f['max_devices'] ?></td>
        <td class="nowrap"><?= h(time_ago($f['last_seen'])) ?></td>
        <td class="nowrap mono"><?= show_time($f['created_at'], false) ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php $pages = (int)ceil($total / PER); if ($pages > 1): $qs = $_GET; ?>
    <div class="pager"><?php if ($page > 1): $qs['page'] = $page - 1; ?><a class="btn small secondary" href="?<?= h(http_build_query($qs)) ?>">← Previous</a><?php endif; ?>
      <span class="small subtle">Page <?= $page ?> of <?= $pages ?></span>
      <?php if ($page < $pages): $qs['page'] = $page + 1; ?><a class="btn small secondary" href="?<?= h(http_build_query($qs)) ?>">Next →</a><?php endif; ?></div>
  <?php endif; endif; ?>
</section>
<?php
layout_end();

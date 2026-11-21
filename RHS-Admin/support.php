<?php
// Support: everything across all facilities that may need a phone call or a fix.
require __DIR__ . '/app/bootstrap.php';
require_login();

$q = fn(string $sql, array $p = []) => (function () use ($sql, $p) { $s = db()->prepare($sql); $s->execute($p); return $s->fetchAll(); })();
$base = 'SELECT d.id, d.label, d.device_code, d.last_seen_at, d.pending_count, d.rejected_count, d.app_version, f.id AS fid, f.name, f.contact
         FROM devices d JOIN facilities f ON f.id = d.facility_id WHERE d.deleted = 0 AND f.deleted = 0';

$refused = $q("$base AND d.rejected_count > 0 ORDER BY d.rejected_count DESC LIMIT 50");
$waiting = $q("$base AND d.pending_count > 0 AND d.last_seen_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY) ORDER BY d.pending_count DESC LIMIT 50");
$quiet   = $q("$base AND (d.last_seen_at IS NULL OR d.last_seen_at < (UTC_TIMESTAMP() - INTERVAL 7 DAY)) ORDER BY d.last_seen_at LIMIT 50");
$latest  = (string)(db()->query("SELECT app_version FROM devices WHERE deleted = 0 AND app_version <> '' ORDER BY LENGTH(app_version) DESC, app_version DESC LIMIT 1")->fetchColumn() ?: '');
$old     = $latest ? $q("$base AND d.app_version <> '' AND d.app_version <> ? AND d.last_seen_at >= (UTC_TIMESTAMP() - INTERVAL 30 DAY) ORDER BY d.app_version LIMIT 50", [$latest]) : [];
$toCheck = $q("SELECT id, name, contact, license_source, license_expiry, license_tier FROM facilities WHERE deleted = 0 AND license_source IN ('momo','legacy') ORDER BY name LIMIT 50");
$fakes   = $q("SELECT l.created_at, l.facility_id, f.name, l.details FROM admin_audit_log l LEFT JOIN facilities f ON f.id = l.facility_id
               WHERE l.action = 'licence.refused' AND l.created_at >= (UTC_TIMESTAMP() - INTERVAL 30 DAY) ORDER BY l.id DESC LIMIT 50");

function device_rows(array $rows, string $extraHead, callable $extra): string {
    if (!$rows) return '<div class="empty">Nothing here. 👍</div>';
    $o = '<div class="table-wrap"><table><thead><tr><th>Facility</th><th>Device</th><th>Last sync</th><th>' . h($extraHead) . '</th></tr></thead><tbody>';
    foreach ($rows as $r) $o .= '<tr><td><a href="pharmacy.php?id=' . h(urlencode($r['fid'])) . '">' . h($r['name']) . '</a><span class="sub">' . h($r['contact']) . '</span></td><td>'
        . badge($r['device_code'], 'info') . ' ' . h($r['label']) . '</td><td class="nowrap">' . h(time_ago($r['last_seen_at'])) . '</td><td>' . $extra($r) . '</td></tr>';
    return $o . '</tbody></table></div>';
}

layout_start('Support', 'support.php', ['sub' => 'Devices that cannot sync, records the server refused, and licences to check.']);
?>
<div class="stats">
  <?= stat_card('Devices with refused records', count($refused), $refused ? 'danger' : 'success') ?>
  <?= stat_card('Records stuck on a device', count($waiting), $waiting ? 'warning' : 'success', 'not sent for 1+ day') ?>
  <?= stat_card('Devices silent 7+ days', count($quiet), $quiet ? 'warning' : 'success') ?>
  <?= stat_card('Licences to check', count($toCheck), $toCheck ? 'warning' : 'success') ?>
</div>

<section class="panel">
  <h2>Records refused by the server</h2>
  <p class="small muted">The device sent records the server could not accept (bad data). They stay on the device. Note the facility and contact the developer.</p>
  <?= device_rows($refused, 'Refused', fn($r) => badge($r['rejected_count'] . ' refused', 'danger')) ?>
</section>

<section class="panel">
  <h2>Records not sent for more than a day</h2>
  <p class="small muted">Usually no internet at the facility. Ask them to connect and tap the sync button at the top of the app.</p>
  <?= device_rows($waiting, 'Waiting', fn($r) => badge($r['pending_count'] . ' waiting', 'warning')) ?>
</section>

<section class="panel">
  <h2>Devices silent for 7+ days</h2>
  <p class="small muted">Offline for long, broken, lost or no longer used. A lost device can be removed on the facility's page to free its slot.</p>
  <?= device_rows($quiet, 'App version', fn($r) => h($r['app_version'] ?: '—')) ?>
</section>

<section class="panel">
  <h2>Devices on an older app version</h2>
  <p class="small muted">Newest version in use: <strong><?= h($latest ?: '—') ?></strong>. Older devices update when they open the app with internet.</p>
  <?= device_rows($old, 'Version', fn($r) => badge($r['app_version'], 'warning')) ?>
</section>

<section class="panel">
  <h2>Licences to check against payments</h2>
  <p class="small muted">These licences were set by the app itself (Mobile Money in the app, or carried over from the old app). Check you were paid, then use Renew on the facility page so it is marked as checked.</p>
  <?php if (!$toCheck): ?><div class="empty">Nothing to check. 👍</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>Facility</th><th>Licence</th><th>Came from</th></tr></thead><tbody>
  <?php foreach ($toCheck as $f): ?><tr><td><a href="pharmacy.php?id=<?= h(urlencode($f['id'])) ?>"><?= h($f['name']) ?></a><span class="sub"><?= h($f['contact']) ?></span></td>
    <td><?= h(package_label($f['license_tier'])) ?><span class="sub">ends <?= show_date($f['license_expiry']) ?></span></td><td><?= badge(licence_source_info($f['license_source'])[0], 'warning') ?></td></tr><?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
</section>

<section class="panel">
  <h2>Refused licence changes (last 30 days)</h2>
  <p class="small muted">A device tried to change its licence without a valid code. The server put the real licence back. Repeated attempts may mean someone is trying to cheat.</p>
  <?php if (!$fakes): ?><div class="empty">None. 👍</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>When</th><th>Facility</th><th>What it tried</th></tr></thead><tbody>
  <?php foreach ($fakes as $x): $d = json_decode((string)$x['details'], true) ?: []; ?><tr><td class="nowrap"><?= show_time($x['created_at']) ?></td>
    <td><a href="pharmacy.php?id=<?= h(urlencode((string)$x['facility_id'])) ?>"><?= h($x['name'] ?: '—') ?></a></td>
    <td class="small">until <?= h($d['expiry'] ?? '?') ?> · <?= h($d['devices'] ?? '?') ?> devices · code “<?= h($d['code'] ?? '') ?>”</td></tr><?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
</section>
<?php
layout_end();

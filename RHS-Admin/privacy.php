<?php
// Privacy: requests from facilities to delete their data, facilities past the time we promised to
// keep their data, and who has agreed to the privacy policy and terms. Super admins only.
// Erasing itself is done on the facility's page (pharmacy.php, "Erase this facility's data").
require __DIR__ . '/app/bootstrap.php';
$me = require_super();

$ready = privacy_ready();
if ($ready && is_post()) {
    require_post_csrf();
    $who = $me['full_name'] ?: $me['email'];
    if (post('do') === 'close') {
        $status = post('status') === 'cancelled' ? 'cancelled' : 'done';
        $note = mb_substr(post('note'), 0, 500);
        $s = db()->prepare("UPDATE data_requests SET status = ?, admin_note = ?, handled_by = ?, handled_at = ? WHERE id = ? AND status = 'open'");
        $s->execute([$status, $note, $who, now_ms_utc(), post('rid')]);
        if ($s->rowCount()) {
            $r = db()->prepare('SELECT facility_id, facility_name FROM data_requests WHERE id = ?'); $r->execute([post('rid')]); $r = $r->fetch();
            audit('privacy.request_' . $status, $r['facility_id'], $r['facility_name'], ['note' => $note]);
            flash('success', 'Request closed.');
        }
        redirect('privacy.php');
    }
}

$open = $closed = $expired = []; $agreed = $notAgreed = 0;
if ($ready) {
    $open = db()->query("SELECT r.*, f.id AS live_id FROM data_requests r LEFT JOIN facilities f ON f.id = r.facility_id AND f.deleted = 0
                         WHERE r.status = 'open' ORDER BY r.created_at")->fetchAll();
    $closed = db()->query("SELECT * FROM data_requests WHERE status <> 'open' ORDER BY handled_at DESC LIMIT 30")->fetchAll();
    $s = db()->prepare("SELECT terms_version = ? AS ok, COUNT(*) AS n FROM facilities WHERE deleted = 0 GROUP BY ok");
    $s->execute([TERMS_VERSION_CURRENT]);
    foreach ($s as $r) { if ((int)$r['ok']) $agreed = (int)$r['n']; else $notAgreed = (int)$r['n']; }
}
// Facilities whose trial or subscription ended more than KEEP_MONTHS_AFTER_END months ago.
$e = db()->prepare("SELECT id, name, location, contact, license_expiry, license_trial FROM facilities
                    WHERE deleted = 0 AND license_expiry IS NOT NULL AND license_expiry < (CURDATE() - INTERVAL " . KEEP_MONTHS_AFTER_END . " MONTH)
                    ORDER BY license_expiry LIMIT 200");
$e->execute(); $expired = $e->fetchAll();

layout_start('Privacy', 'privacy.php', [
    'sub' => 'Data deletion requests, facilities past the keep period, and agreement to the privacy policy and terms.',
]);
?>
<?php if (!$ready): ?>
  <p class="alert alert-warning">Run <strong>database/update-7-privacy.sql</strong> (in the app's database folder) on the database to turn this on.</p>
<?php endif; ?>

<div class="stats">
  <?= stat_card('Deletion requests', count($open), count($open) ? 'warning' : 'success', count($open) ? 'waiting for you' : 'none waiting') ?>
  <?= stat_card('Past the keep period', count($expired), count($expired) ? 'danger' : 'success', 'ended over ' . KEEP_MONTHS_AFTER_END . ' months ago') ?>
  <?= stat_card('Agreed to the terms', $agreed, 'success', 'current version ' . TERMS_VERSION_CURRENT) ?>
  <?= stat_card('Not agreed yet', $notAgreed, $notAgreed ? 'info' : 'success', 'asked when the super admin opens the app') ?>
</div>

<section class="panel">
  <h2><?= icon('trash') ?>Requests to delete data</h2>
  <p class="small subtle">Sent by a facility's super admin from the app (Settings → Privacy). What to do: <strong>1.</strong> call or email the contact to confirm it is really them and that they have a backup if they want one. <strong>2.</strong> open the facility and use <em>Erase this facility's data</em> at the bottom of its Overview. <strong>3.</strong> the request closes itself. Our policy promises this within <strong>30 days</strong>.</p>
  <?php if (!$open): ?><div class="empty">No requests waiting.</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>Facility</th><th>Asked by</th><th>Contact</th><th>Reason</th><th>Asked</th><th></th></tr></thead><tbody>
  <?php foreach ($open as $r): $days = (int)floor((time() - strtotime($r['created_at'] . ' UTC')) / 86400); ?>
    <tr>
      <td><?php if ($r['live_id']): ?><a href="pharmacy.php?id=<?= h(urlencode($r['facility_id'])) ?>#erase"><?= h($r['facility_name']) ?></a><?php else: ?><?= h($r['facility_name']) ?> <span class="subtle">(already erased)</span><?php endif; ?></td>
      <td><?= h($r['user_name'] ?: '—') ?></td>
      <td><?= h($r['contact']) ?></td>
      <td class="small"><?= $r['reason'] ? nl2br(h($r['reason'])) : '<span class="subtle">—</span>' ?></td>
      <td><?= h(time_ago($r['created_at'])) ?><?= $days >= 21 ? ' ' . badge(max(0, 30 - $days) . ' days left', 'danger') : '' ?></td>
      <td>
        <details class="edit-box"><summary>Close without erasing</summary>
          <form method="post" class="stack">
            <?= csrf_field() ?><input type="hidden" name="do" value="close"><input type="hidden" name="rid" value="<?= h($r['id']) ?>">
            <label class="check"><input type="radio" name="status" value="cancelled" checked> They changed their mind</label>
            <label class="check"><input type="radio" name="status" value="done"> Done another way</label>
            <input type="text" name="note" maxlength="500" placeholder="Note (who you spoke to, when)" required>
            <button class="btn small secondary" type="submit">Close request</button>
          </form>
        </details>
      </td>
    </tr>
  <?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
</section>

<section class="panel">
  <h2><?= icon('clock') ?>Past the keep period</h2>
  <p class="small subtle">Our privacy policy says a facility's data is deleted <?= KEEP_MONTHS_AFTER_END ?> months after its trial or subscription ends. Check this list once a month: if a facility has not come back, try to reach them once (they may want a backup), then erase it from its page.</p>
  <?php if (!$expired): ?><div class="empty">None. Every facility ended less than <?= KEEP_MONTHS_AFTER_END ?> months ago or is still active.</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>Facility</th><th>Phone</th><th>Ended</th><th></th></tr></thead><tbody>
  <?php foreach ($expired as $x): ?>
    <tr><td><a href="pharmacy.php?id=<?= h(urlencode($x['id'])) ?>"><?= h($x['name'] ?: '(no name)') ?></a><span class="sub small subtle"> <?= h($x['location']) ?></span></td>
      <td><?= h($x['contact'] ?: '—') ?></td>
      <td><?= h(show_date($x['license_expiry'])) ?> <span class="subtle small">(<?= $x['license_trial'] ? 'free trial' : 'paid' ?>)</span></td>
      <td><a class="btn small secondary" href="pharmacy.php?id=<?= h(urlencode($x['id'])) ?>#erase">Open</a></td></tr>
  <?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
</section>

<?php if ($closed): ?>
<section class="panel">
  <h2><?= icon('check') ?>Closed requests</h2>
  <div class="table-wrap"><table><thead><tr><th>Facility</th><th>Result</th><th>Note</th><th>By</th><th>When</th></tr></thead><tbody>
  <?php foreach ($closed as $r): ?>
    <tr><td><?= h($r['facility_name']) ?></td>
      <td><?= $r['status'] === 'done' ? badge('Done', 'success') : badge('Cancelled') ?></td>
      <td class="small"><?= h($r['admin_note']) ?></td>
      <td><?= h($r['handled_by']) ?></td>
      <td><?= $r['handled_at'] ? h(show_time($r['handled_at'])) : '—' ?></td></tr>
  <?php endforeach; ?>
  </tbody></table></div>
</section>
<?php endif; ?>

<section class="panel">
  <h2><?= icon('shield') ?>Our privacy policy and terms</h2>
  <p class="small">Public pages, shown in the app at registration and in Settings → Privacy:</p>
  <?php $app = rtrim((string)(config()['pharmacy_app_url'] ?? ''), '/'); ?>
  <ul class="small">
    <li>Privacy Policy: <?= $app ? '<a href="' . h($app) . '/privacy.html" target="_blank" rel="noopener">' . h($app) . '/privacy.html</a>' : '<code>privacy.html</code> on the app\'s website' ?></li>
    <li>Terms of Use: <?= $app ? '<a href="' . h($app) . '/terms.html" target="_blank" rel="noopener">' . h($app) . '/terms.html</a>' : '<code>terms.html</code> on the app\'s website' ?></li>
  </ul>
  <p class="small subtle">To change them, see MAINTENANCE.md → "Privacy policy and terms".</p>
</section>
<?php
layout_end();

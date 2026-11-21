<?php
// Audit log: every change made in the admin site, newest first. Read-only.
require __DIR__ . '/app/bootstrap.php';
require_login();

const PER_PAGE = 50;
$page = max(1, (int)get('page'));
$where = []; $args = [];
if (($act = get('action')) !== '') { $where[] = 'action LIKE ?'; $args[] = $act . '%'; }
if (($who = get('admin')) !== '')  { $where[] = 'admin_email = ?'; $args[] = $who; }
if (($from = get('from')) !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) { $where[] = 'created_at >= ?'; $args[] = $from . ' 00:00:00'; }
if (($to = get('to')) !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) { $where[] = 'created_at < ?'; $args[] = (new DateTime($to))->modify('+1 day')->format('Y-m-d') . ' 00:00:00'; }
$w = $where ? 'WHERE ' . implode(' AND ', $where) : '';

$c = db()->prepare("SELECT COUNT(*) FROM admin_audit_log $w"); $c->execute($args); $total = (int)$c->fetchColumn();
$s = db()->prepare("SELECT l.*, f.name AS facility_name FROM admin_audit_log l LEFT JOIN facilities f ON f.id = l.facility_id $w ORDER BY l.id DESC LIMIT " . PER_PAGE . ' OFFSET ' . (($page - 1) * PER_PAGE));
$s->execute($args); $rows = $s->fetchAll();
$admins = db()->query('SELECT DISTINCT admin_email FROM admin_audit_log WHERE admin_email <> "" ORDER BY admin_email')->fetchAll(PDO::FETCH_COLUMN);
$actions = db()->query('SELECT DISTINCT SUBSTRING_INDEX(action, ".", 1) FROM admin_audit_log ORDER BY 1')->fetchAll(PDO::FETCH_COLUMN);

function details_html(?string $json): string {
    $d = $json ? json_decode($json, true) : null;
    if (!is_array($d) || !$d) return '';
    $out = [];
    foreach ($d as $k => $v) $out[] = '<span class="subtle">' . h(str_replace('_', ' ', $k)) . ':</span> ' . h(is_scalar($v) || $v === null ? var_export_short($v) : json_encode($v, JSON_UNESCAPED_UNICODE));
    return implode(' · ', $out);
}
function var_export_short($v): string { return $v === null ? '—' : (is_bool($v) ? ($v ? 'yes' : 'no') : (string)$v); }

layout_start('Audit log', 'audit.php', ['sub' => 'Every change made in RHS Admin and every licence the server accepted or refused — who, when and what.']);
?>
<section class="panel">
  <form class="filters" method="get">
    <div class="field"><label for="action">Type</label><select id="action" name="action"><option value="">All</option>
      <?php foreach ($actions as $a): ?><option value="<?= h($a) ?>" <?= $act === $a ? 'selected' : '' ?>><?= h($a) ?></option><?php endforeach; ?></select></div>
    <div class="field"><label for="admin">Admin</label><select id="admin" name="admin"><option value="">Everyone</option>
      <?php foreach ($admins as $a): ?><option <?= $who === $a ? 'selected' : '' ?>><?= h($a) ?></option><?php endforeach; ?></select></div>
    <div class="field"><label for="from">From</label><input type="date" id="from" name="from" value="<?= h($from) ?>"></div>
    <div class="field"><label for="to">To</label><input type="date" id="to" name="to" value="<?= h($to) ?>"></div>
    <button class="btn secondary" type="submit">Filter</button>
  </form>
  <p class="small subtle"><?= number_format($total) ?> entr<?= $total === 1 ? 'y' : 'ies' ?> · times in Kampala time</p>
  <?php if (!$rows): ?><div class="empty">Nothing recorded yet.</div><?php else: ?>
  <div class="table-wrap"><table>
    <thead><tr><th>When</th><th>Who</th><th>What</th><th>Facility</th><th>Details</th></tr></thead>
    <tbody><?php foreach ($rows as $r): ?>
      <tr><td class="nowrap"><?= show_time($r['created_at']) ?></td>
          <td><?= h($r['admin_email'] ?: '—') ?><span class="sub"><?= h($r['ip']) ?></span></td>
          <td><?= badge($r['action'], str_starts_with($r['action'], 'login.locked') ? 'danger' : '') ?><span class="sub"><?= h($r['target']) ?></span></td>
          <td><?= h($r['facility_name'] ?? ($r['facility_id'] ? '(id ' . $r['facility_id'] . ')' : '—')) ?></td>
          <td class="small"><?= details_html($r['details']) ?></td></tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php $pages = (int)ceil($total / PER_PAGE); if ($pages > 1): $qs = $_GET; ?>
    <div class="actions mt"><?php if ($page > 1): $qs['page'] = $page - 1; ?><a class="btn small secondary" href="?<?= h(http_build_query($qs)) ?>">← Newer</a><?php endif; ?>
      <span class="small subtle center-self">Page <?= $page ?> of <?= $pages ?></span>
      <?php if ($page < $pages): $qs['page'] = $page + 1; ?><a class="btn small secondary" href="?<?= h(http_build_query($qs)) ?>">Older →</a><?php endif; ?></div>
  <?php endif; endif; ?>
</section>
<?php
layout_end();

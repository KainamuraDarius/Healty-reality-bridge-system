<?php
// Feedback and star ratings people sent from the app (Settings -> Feedback & rating). Super admins only.
require __DIR__ . '/app/bootstrap.php';
$me = require_super();

const PER_PAGE = 30;
const FB_TYPES = ['general' => 'General', 'idea' => 'Suggestion / idea', 'problem' => 'Problem', 'praise' => 'Praise'];
const FB_WORDS = [1 => 'Very poor', 2 => 'Poor', 3 => 'Okay', 4 => 'Good', 5 => 'Excellent'];

$ready = true;
try { db()->query('SELECT 1 FROM app_feedback LIMIT 1'); } catch (Throwable $e) { $ready = false; }

if ($ready && is_post()) {
    require_post_csrf();
    $back = 'feedback.php' . (post('back') !== '' && str_starts_with(post('back'), '?') ? post('back') : '');
    $who = $me['full_name'] ?: $me['email'];
    if (post('do') === 'mark') {
        $read = post('status') === 'read';
        db()->prepare('UPDATE app_feedback SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
            ->execute([$read ? 'read' : 'new', $read ? $who : '', $read ? now_utc() : null, post('fid')]);
        redirect($back);
    }
    if (post('do') === 'mark_all') {
        $n = db()->prepare("UPDATE app_feedback SET status = 'read', reviewed_by = ?, reviewed_at = ? WHERE status = 'new'");
        $n->execute([$who, now_utc()]);
        audit('feedback.mark_all_read', null, 'Feedback', ['count' => $n->rowCount()]);
        flash('success', $n->rowCount() . ' marked as read.');
        redirect($back);
    }
}

function fb_stars(int $n): string {
    return '<span class="fb-stars" role="img" aria-label="' . $n . ' out of 5 stars">' . str_repeat('<span class="on">★</span>', $n) . str_repeat('<span>★</span>', 5 - $n) . '</span>';
}

$rows = []; $total = 0; $stats = ['n' => 0, 'avg' => null, 'unread' => 0, 'n30' => 0, 'avg30' => null]; $dist = array_fill(1, 5, 0);
$rating = (int)get('rating'); $type = get('type'); $status = get('status'); $q = get('q');
$page = max(1, (int)get('page'));
if ($ready) {
    $st = db()->query("SELECT COUNT(*) AS n, AVG(rating) AS avg, SUM(status = 'new') AS unread,
                              SUM(created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS n30,
                              AVG(CASE WHEN created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY THEN rating END) AS avg30 FROM app_feedback")->fetch();
    $stats = array_merge($stats, array_filter($st, fn($v) => $v !== null));
    foreach (db()->query('SELECT rating, COUNT(*) AS c FROM app_feedback GROUP BY rating') as $r) $dist[(int)$r['rating']] = (int)$r['c'];

    $where = []; $args = [];
    if ($rating >= 1 && $rating <= 5) { $where[] = 'fb.rating = ?'; $args[] = $rating; }
    if (isset(FB_TYPES[$type])) { $where[] = 'fb.category = ?'; $args[] = $type; }
    if (in_array($status, ['new', 'read'], true)) { $where[] = 'fb.status = ?'; $args[] = $status; }
    if ($q !== '') { $where[] = '(f.name LIKE ? OR fb.user_name LIKE ? OR fb.message LIKE ?)'; array_push($args, "%$q%", "%$q%", "%$q%"); }
    $w = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $c = db()->prepare("SELECT COUNT(*) FROM app_feedback fb LEFT JOIN facilities f ON f.id = fb.facility_id $w"); $c->execute($args); $total = (int)$c->fetchColumn();
    $s = db()->prepare("SELECT fb.*, f.name AS facility_name, f.contact AS facility_contact FROM app_feedback fb LEFT JOIN facilities f ON f.id = fb.facility_id $w
                        ORDER BY fb.created_at DESC LIMIT " . PER_PAGE . ' OFFSET ' . (($page - 1) * PER_PAGE));
    $s->execute($args); $rows = $s->fetchAll();
}
$backQs = $_GET ? '?' . http_build_query($_GET) : '';
$avgText = fn($v) => $v === null ? '—' : number_format((float)$v, 1) . ' / 5';

layout_start('Feedback', 'feedback.php', [
    'sub' => 'Ratings and comments people send from the app (Settings → Feedback & rating).',
    'actions' => $ready && $stats['unread'] ? '<form method="post">' . csrf_field() . '<input type="hidden" name="do" value="mark_all"><input type="hidden" name="back" value="' . h($backQs) . '"><button class="btn secondary" type="submit">' . icon('check') . 'Mark all as read</button></form>' : '',
]);
?>
<?php if (!$ready): ?>
  <p class="alert alert-warning">Run <strong>database/update-5-feedback.sql</strong> (in the app's database folder) on the database to start collecting feedback.</p>
<?php else: ?>
<div class="stats">
  <?= stat_card('Average rating', $avgText($stats['avg']), (float)$stats['avg'] >= 4 ? 'success' : ((float)$stats['avg'] >= 3 || $stats['avg'] === null ? 'info' : 'warning'), number_format((int)$stats['n']) . ' ratings in all') ?>
  <?= stat_card('Last 30 days', $avgText($stats['avg30']), 'violet', number_format((int)$stats['n30']) . ' ratings') ?>
  <?= stat_card('Unread', (int)$stats['unread'], $stats['unread'] ? 'warning' : 'success', 'not marked as read yet', $stats['unread'] ? 'feedback.php?status=new' : '') ?>
  <?= stat_card('Problems reported', (int)db()->query("SELECT COUNT(*) FROM app_feedback WHERE category = 'problem' AND status = 'new'")->fetchColumn(), 'danger', 'unread', 'feedback.php?type=problem&status=new') ?>
</div>

<div class="cols fb-top">
<section class="panel">
  <h2><?= icon('star') ?>Ratings</h2>
  <?php $max = max($dist) ?: 1; for ($i = 5; $i >= 1; $i--): ?>
    <a class="fb-bar" href="feedback.php?rating=<?= $i ?>" title="Show <?= $i ?>-star feedback">
      <span class="fb-bar-label"><?= $i ?> ★</span>
      <span class="fb-bar-track"><span style="width:<?= round($dist[$i] / $max * 100) ?>%"></span></span>
      <span class="fb-bar-n"><?= number_format($dist[$i]) ?></span>
    </a>
  <?php endfor; ?>
</section>
<section class="panel">
  <h2><?= icon('search') ?>Find feedback</h2>
  <form class="filters" method="get">
    <div class="field grow"><label for="q">Facility, person or words</label><input type="search" id="q" name="q" value="<?= h($q) ?>"></div>
    <div class="field"><label for="rating">Stars</label><select id="rating" name="rating"><option value="">Any</option>
      <?php for ($i = 5; $i >= 1; $i--): ?><option value="<?= $i ?>" <?= $rating === $i ? 'selected' : '' ?>><?= $i ?> — <?= FB_WORDS[$i] ?></option><?php endfor; ?></select></div>
    <div class="field"><label for="type">Type</label><select id="type" name="type"><option value="">All</option>
      <?php foreach (FB_TYPES as $k => $l): ?><option value="<?= $k ?>" <?= $type === $k ? 'selected' : '' ?>><?= h($l) ?></option><?php endforeach; ?></select></div>
    <div class="field"><label for="status">Status</label><select id="status" name="status"><option value="">All</option>
      <option value="new" <?= $status === 'new' ? 'selected' : '' ?>>Unread</option><option value="read" <?= $status === 'read' ? 'selected' : '' ?>>Read</option></select></div>
    <button class="btn secondary" type="submit">Filter</button>
    <?php if ($_GET): ?><a class="btn secondary" href="feedback.php">Clear</a><?php endif; ?>
  </form>
</section>
</div>

<section class="panel">
  <p class="small subtle"><?= number_format($total) ?> message<?= $total === 1 ? '' : 's' ?> · newest first · times in Kampala time</p>
  <?php if (!$rows): ?><div class="empty"><?= $stats['n'] ? 'No feedback matches these filters.' : 'No feedback yet. It appears here as soon as someone sends it from the app.' ?></div><?php else: ?>
  <ul class="fb-items">
  <?php foreach ($rows as $r): $new = $r['status'] === 'new'; ?>
    <li class="fb-item <?= $new ? 'is-new' : '' ?>">
      <div class="fb-item-head">
        <?= fb_stars((int)$r['rating']) ?>
        <strong><?= FB_WORDS[(int)$r['rating']] ?? '' ?></strong>
        <?= badge(FB_TYPES[$r['category']] ?? 'General', $r['category'] === 'problem' ? 'danger' : ($r['category'] === 'praise' ? 'success' : ($r['category'] === 'idea' ? 'info' : ''))) ?>
        <?php if ($new): ?><?= badge('New', 'warning') ?><?php endif; ?>
        <span class="small subtle fb-when" title="<?= h(show_time($r['created_at'])) ?>"><?= h(time_ago($r['created_at'])) ?></span>
      </div>
      <?php if ($r['message'] !== null && $r['message'] !== ''): ?><p class="fb-msg"><?= nl2br(h($r['message'])) ?></p><?php else: ?><p class="fb-msg subtle">(rating only, no message)</p><?php endif; ?>
      <div class="fb-item-foot small">
        <span><?= h($r['user_name'] ?: 'Someone') ?> <span class="subtle">· <?= h($r['user_role']) ?></span></span>
        <span>at <?php if ($r['facility_name'] !== null): ?><a href="pharmacy.php?id=<?= h(urlencode($r['facility_id'])) ?>"><?= h($r['facility_name']) ?></a><?php else: ?><span class="subtle">(deleted facility)</span><?php endif; ?>
          <?= $r['facility_contact'] ? '<span class="subtle">· ' . h($r['facility_contact']) . '</span>' : '' ?></span>
        <?php if ($r['app_version']): ?><span class="subtle">App <?= h($r['app_version']) ?></span><?php endif; ?>
        <?php if (!$new && $r['reviewed_by']): ?><span class="subtle">Read by <?= h($r['reviewed_by']) ?></span><?php endif; ?>
        <form method="post" class="inline fb-mark">
          <?= csrf_field() ?><input type="hidden" name="do" value="mark"><input type="hidden" name="fid" value="<?= h($r['id']) ?>">
          <input type="hidden" name="status" value="<?= $new ? 'read' : 'new' ?>"><input type="hidden" name="back" value="<?= h($backQs) ?>">
          <button class="btn small <?= $new ? '' : 'secondary' ?>" type="submit"><?= $new ? icon('check') . 'Mark as read' : 'Mark as unread' ?></button>
        </form>
      </div>
    </li>
  <?php endforeach; ?>
  </ul>
  <?php $pages = (int)ceil($total / PER_PAGE); if ($pages > 1): $qs = $_GET; ?>
    <div class="actions mt"><?php if ($page > 1): $qs['page'] = $page - 1; ?><a class="btn small secondary" href="?<?= h(http_build_query($qs)) ?>">← Newer</a><?php endif; ?>
      <span class="small subtle center-self">Page <?= $page ?> of <?= $pages ?></span>
      <?php if ($page < $pages): $qs['page'] = $page + 1; ?><a class="btn small secondary" href="?<?= h(http_build_query($qs)) ?>">Older →</a><?php endif; ?></div>
  <?php endif; endif; ?>
</section>
<?php endif; ?>
<?php
layout_end();

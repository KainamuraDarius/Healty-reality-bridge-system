<?php
// Messages to facilities: a banner inside the app, for all facilities or chosen ones.
// Devices receive it on their next sync (usually within minutes when online) and keep it offline.
require __DIR__ . '/app/bootstrap.php';
$me = require_login();

$pharmacies = db()->query('SELECT id, name, location FROM facilities WHERE deleted = 0 ORDER BY name')->fetchAll();
$byId = array_column($pharmacies, null, 'id');
$load = function (int $id) { $s = db()->prepare('SELECT * FROM announcements WHERE id = ?'); $s->execute([$id]); return $s->fetch() ?: null; };

if (is_post()) {
    require_post_csrf();
    $do = post('do');
    if ($do === 'save') {
        $id = (int)post('id');
        $old = $id ? $load($id) : null;
        if ($id && !$old) { flash('error', 'That message was not found.'); redirect('announcements.php'); }
        $title = mb_substr(preg_replace('/\s+/', ' ', post('title')), 0, 120);
        $body = mb_substr(str_replace("\r\n", "\n", post('body')), 0, 1000);
        $level = array_key_exists(post('level'), ANN_LEVELS) ? post('level') : 'info';
        $who = array_key_exists(post('who'), ANN_WHO) ? post('who') : 'all';
        $audience = post('audience') === 'selected' ? 'selected' : 'all';
        $targets = array_values(array_unique(array_filter((array)($_POST['targets'] ?? []), fn($t) => is_string($t) && isset($byId[$t]))));
        $starts = post('starts') === '' ? now_utc() : local_to_utc(post('starts'));
        $ends = post('ends') === '' ? null : local_to_utc(post('ends'));
        $dismissible = post('dismissible') === '1' ? 1 : 0;
        $_SESSION['ann_form'] = $_POST;
        $err = null;
        if ($title === '') $err = 'Write a short title.';
        elseif ($starts === null) $err = 'The start time is not valid.';
        elseif (post('ends') !== '' && $ends === null) $err = 'The end time is not valid.';
        elseif ($ends !== null && $ends <= max($starts, now_utc())) $err = 'The end time must be in the future and after the start.';
        elseif ($audience === 'selected' && !$targets) $err = 'Choose at least one facility, or send it to all facilities.';
        if ($err) { flash('error', $err); redirect('announcements.php?' . ($id ? 'edit=' . $id : 'new=1') . '#form'); }

        $now = now_utc();
        $pdo = db();
        $pdo->beginTransaction();
        if ($old) {
            $shown = post('reshow') === '1' ? $now : $old['shown_at'];
            $pdo->prepare('UPDATE announcements SET title=?, body=?, level=?, who=?, audience=?, dismissible=?, starts_at=?, ends_at=?, shown_at=?, active=1, updated_at=? WHERE id=?')
                ->execute([$title, $body, $level, $who, $audience, $dismissible, $starts, $ends, $shown, $now, $id]);
            $pdo->prepare('DELETE FROM announcement_targets WHERE announcement_id = ?')->execute([$id]);
        } else {
            $pdo->prepare('INSERT INTO announcements (title, body, level, who, audience, dismissible, starts_at, ends_at, active, shown_at, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?)')
                ->execute([$title, $body, $level, $who, $audience, $dismissible, $starts, $ends, $now, $me['id'], $now, $now]);
            $id = (int)$pdo->lastInsertId();
        }
        if ($audience === 'selected') {
            $ins = $pdo->prepare('INSERT INTO announcement_targets (announcement_id, facility_id) VALUES (?, ?)');
            foreach ($targets as $t) $ins->execute([$id, $t]);
        }
        $pdo->commit();
        $to = $audience === 'all' ? 'all facilities' : (count($targets) === 1 ? $byId[$targets[0]]['name'] : count($targets) . ' facilities');
        audit($old ? 'message.edit' : 'message.create', count($targets) === 1 ? $targets[0] : null, $title,
            ['to' => $to, 'level' => ANN_LEVELS[$level], 'who' => ANN_WHO[$who], 'ends' => $ends ? show_time($ends) : 'until stopped', 'shown_again' => $old && post('reshow') === '1']);
        unset($_SESSION['ann_form']);
        flash('success', ($old ? 'Message updated' : 'Message published') . " for $to. Devices get it on their next sync.");
        redirect('announcements.php');
    }
    if ($do === 'stop' || $do === 'restart') {
        $a = $load((int)post('id'));
        if (!$a) { flash('error', 'That message was not found.'); redirect('announcements.php'); }
        if ($do === 'restart' && $a['ends_at'] && $a['ends_at'] <= now_utc()) { flash('error', 'This message has already ended. Edit it and choose a new end time.'); redirect('announcements.php?edit=' . $a['id'] . '#form'); }
        db()->prepare('UPDATE announcements SET active = ?, updated_at = ? WHERE id = ?')->execute([$do === 'stop' ? 0 : 1, now_utc(), $a['id']]);
        audit($do === 'stop' ? 'message.stop' : 'message.restart', null, $a['title']);
        flash('success', $do === 'stop' ? 'Message stopped. It disappears from devices on their next sync.' : 'Message is showing again.');
        redirect('announcements.php');
    }
    redirect('announcements.php');
}

// ---------- page
$edit = get('edit') !== '' ? $load((int)get('edit')) : null;
$form = $_SESSION['ann_form'] ?? null; unset($_SESSION['ann_form']);
$showForm = $edit || get('new') !== '' || get('to') !== '' || $form;
if ($form) {
    $v = $form;
} elseif ($edit) {
    $v = ['id' => $edit['id'], 'title' => $edit['title'], 'body' => $edit['body'], 'level' => $edit['level'], 'who' => $edit['who'], 'audience' => $edit['audience'],
          'targets' => announcement_targets((int)$edit['id']), 'starts' => utc_to_local_input($edit['starts_at']), 'ends' => utc_to_local_input($edit['ends_at']), 'dismissible' => $edit['dismissible'] ? '1' : ''];
} else {
    $to = get('to');
    $v = ['id' => '', 'title' => '', 'body' => '', 'level' => 'info', 'who' => 'all', 'audience' => isset($byId[$to]) ? 'selected' : 'all',
          'targets' => isset($byId[$to]) ? [$to] : [], 'starts' => '', 'ends' => '', 'dismissible' => '1'];
}
$fv = fn($k) => h($v[$k] ?? '');
$isEdit = !empty($v['id']);
$selTargets = (array)($v['targets'] ?? []);

$all = db()->query('SELECT a.*, u.full_name AS by_name, u.email AS by_email FROM announcements a LEFT JOIN admin_users u ON u.id = a.created_by ORDER BY a.active DESC, a.id DESC LIMIT 100')->fetchAll();
$live = array_filter($all, fn($a) => announcement_state($a)[0] === 'Showing now');

layout_start('Messages to facilities', 'announcements.php', ['sub' => 'A banner at the top of the app for all facilities or chosen ones, e.g. planned updates or holiday hours.']);
?>
<p class="muted">A message shows as a banner at the top of the app. Devices receive it on their next sync (within minutes when they are online) and keep showing it offline.</p>

<?php if ($showForm): ?>
<section class="panel" id="form">
  <div class="panel-head"><h2><?= $isEdit ? 'Edit message' : 'New message' ?></h2><a class="small" href="announcements.php">Cancel</a></div>
  <form method="post" autocomplete="off">
    <?= csrf_field() ?><input type="hidden" name="do" value="save"><input type="hidden" name="id" value="<?= $fv('id') ?>">
    <div class="form-grid4">
      <div class="field span4"><label for="title">Title</label><input type="text" id="title" name="title" maxlength="120" value="<?= $fv('title') ?>" placeholder="e.g. New version of the app" required></div>
      <div class="field span4"><label for="body">Message</label><textarea id="body" name="body" maxlength="1000" placeholder="What the facility needs to know or do."><?= $fv('body') ?></textarea>
        <div class="hint">Plain text, up to 1000 characters. Never put a password here.</div></div>
      <div class="field"><label for="level">Type</label><select id="level" name="level">
        <?php foreach (ANN_LEVELS as $k => $l): ?><option value="<?= $k ?>" <?= ($v['level'] ?? '') === $k ? 'selected' : '' ?>><?= h($l) ?></option><?php endforeach; ?></select>
        <div class="hint">Blue, orange or red banner.</div></div>
      <div class="field"><label for="who">Who sees it</label><select id="who" name="who">
        <?php foreach (ANN_WHO as $k => $l): ?><option value="<?= $k ?>" <?= ($v['who'] ?? '') === $k ? 'selected' : '' ?>><?= h($l) ?></option><?php endforeach; ?></select></div>
      <div class="field"><label for="starts">Start showing</label><input type="datetime-local" id="starts" name="starts" value="<?= $fv('starts') ?>"><div class="hint">Empty = now. Kampala time.</div></div>
      <div class="field"><label for="ends">Stop showing</label><input type="datetime-local" id="ends" name="ends" value="<?= $fv('ends') ?>"><div class="hint">Empty = until you stop it.</div></div>
      <div class="field span4"><span class="label">Send to</span>
        <div class="radio-row">
          <label><input type="radio" name="audience" value="all" <?= ($v['audience'] ?? 'all') !== 'selected' ? 'checked' : '' ?>> All facilities</label>
          <label><input type="radio" name="audience" value="selected" <?= ($v['audience'] ?? '') === 'selected' ? 'checked' : '' ?>> Only the facilities I choose</label>
        </div></div>
      <div class="field span4" data-show-when="audience=selected"><label for="targets">Facilities</label>
        <select id="targets" name="targets[]" multiple>
          <?php foreach ($pharmacies as $p): ?><option value="<?= h($p['id']) ?>" <?= in_array($p['id'], $selTargets, true) ? 'selected' : '' ?>><?= h($p['name'] ?: '(no name)') ?><?= $p['location'] ? ' — ' . h($p['location']) : '' ?></option><?php endforeach; ?>
        </select><div class="hint">Hold Ctrl (or ⌘ on Mac) to choose several.</div></div>
    </div>
    <label class="check"><input type="checkbox" name="dismissible" value="1" <?= ($v['dismissible'] ?? '') === '1' ? 'checked' : '' ?>> People can close it with ×</label>
    <?php if ($isEdit): ?><label class="check"><input type="checkbox" name="reshow" value="1" <?= ($v['reshow'] ?? '') === '1' ? 'checked' : '' ?>> Show it again to people who already closed it</label><?php endif; ?>
    <button class="btn" type="submit"><?= icon('megaphone') ?><?= $isEdit ? 'Save changes' : 'Publish message' ?></button>
  </form>
</section>
<?php endif; ?>

<section class="panel">
  <div class="panel-head"><h2>All messages</h2><?php if (!$showForm): ?><a class="btn small" href="announcements.php?new=1#form"><?= icon('plus') ?>New message</a><?php endif; ?></div>
  <p class="small subtle"><?= count($live) ?> showing now.</p>
  <?php if (!$all): ?><div class="empty">No messages yet.</div><?php else: ?>
  <div class="ann-list">
  <?php foreach ($all as $a): [$st, $stTone] = announcement_state($a); [$devTotal, $devGot] = announcement_reach($a);
        $tg = $a['audience'] === 'selected' ? announcement_targets((int)$a['id']) : []; ?>
    <div class="ann-item">
      <div>
        <div class="ann-preview <?= h($a['level']) ?>"><strong><?= h($a['title']) ?></strong><?php if ($a['body'] !== ''): ?><div class="ann-body"><?= h($a['body']) ?></div><?php endif; ?></div>
        <div class="ann-meta">
          <?= badge($st, $stTone) ?>
          <span><?= $a['audience'] === 'all' ? 'All facilities' : (count($tg) === 1 && isset($byId[$tg[0]]) ? h($byId[$tg[0]]['name']) : count($tg) . ' facilities') ?> · <?= h(ANN_WHO[$a['who']]) ?></span>
          <span><?= show_time($a['starts_at']) ?> → <?= $a['ends_at'] ? show_time($a['ends_at']) : 'until stopped' ?></span>
          <?php if ($st === 'Showing now'): ?><span title="Devices that have synced since the message was published">received by <?= $devGot ?> of <?= $devTotal ?> devices</span><?php endif; ?>
          <span><?= $a['dismissible'] ? 'can be closed' : 'cannot be closed' ?></span>
          <span>by <?= h($a['by_name'] ?: ($a['by_email'] ?: '—')) ?></span>
        </div>
      </div>
      <div class="ann-actions">
        <a class="btn small secondary" href="announcements.php?edit=<?= (int)$a['id'] ?>#form">Edit</a>
        <?php if ($a['active'] && $st !== 'Ended'): ?>
          <form method="post" data-confirm="Stop showing “<?= h($a['title']) ?>”?"><?= csrf_field() ?><input type="hidden" name="do" value="stop"><input type="hidden" name="id" value="<?= (int)$a['id'] ?>"><button class="btn small danger-soft" type="submit">Stop</button></form>
        <?php elseif (!$a['active'] && $st !== 'Ended'): ?>
          <form method="post"><?= csrf_field() ?><input type="hidden" name="do" value="restart"><input type="hidden" name="id" value="<?= (int)$a['id'] ?>"><button class="btn small secondary" type="submit">Show again</button></form>
        <?php endif; ?>
      </div>
    </div>
  <?php endforeach; ?>
  </div><?php endif; ?>
</section>
<?php
layout_end();

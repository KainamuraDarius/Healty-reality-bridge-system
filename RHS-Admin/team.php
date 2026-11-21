<?php
// Admin team (super admins only): add staff, change role, deactivate, reset password.
require __DIR__ . '/app/bootstrap.php';
$me = require_super();

function admin_by_id(int $id): ?array {
    $s = db()->prepare('SELECT * FROM admin_users WHERE id = ?'); $s->execute([$id]); return $s->fetch() ?: null;
}
function active_supers(): int { return (int)db()->query("SELECT COUNT(*) FROM admin_users WHERE role = 'super' AND active = 1")->fetchColumn(); }

if (is_post()) {
    require_post_csrf();
    $do = post('do');
    $now = now_utc();

    if ($do === 'add') {
        $name = post('full_name'); $email = strtolower(post('email')); $role = post('role') === 'super' ? 'super' : 'support';
        $pw = (string)($_POST['password'] ?? '');
        $exists = db()->prepare('SELECT 1 FROM admin_users WHERE email = ?'); $exists->execute([$email]);
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) flash('error', 'Enter a full name and a valid email.');
        elseif ($exists->fetch()) flash('error', 'An admin with that email already exists.');
        elseif ($p = password_problem($pw, $email)) flash('error', $p);
        else {
            db()->prepare('INSERT INTO admin_users (email, full_name, role, password_hash, active, must_change_password, created_by, created_at, updated_at) VALUES (?,?,?,?,1,1,?,?,?)')
                ->execute([$email, $name, $role, password_hash($pw, PASSWORD_DEFAULT), $me['id'], $now, $now]);
            audit('admin.create', null, "$name <$email>", ['email' => $email, 'role' => $role]);
            flash('success', "$name can now log in with the temporary password you set. They will be asked to choose their own.");
        }
        redirect('team.php');
    }

    $target = admin_by_id((int)post('id'));
    if (!$target) { flash('error', 'That admin was not found.'); redirect('team.php'); }
    $who = $target['full_name'] . ' <' . $target['email'] . '>';
    $isSelf = (int)$target['id'] === (int)$me['id'];

    if ($do === 'role') {
        $role = post('role') === 'super' ? 'super' : 'support';
        if ($isSelf) flash('error', 'You cannot change your own role.');
        elseif ($target['role'] === 'super' && $role !== 'super' && $target['active'] && active_supers() <= 1) flash('error', 'There must always be at least one active super admin.');
        elseif ($role !== $target['role']) {
            db()->prepare('UPDATE admin_users SET role = ?, updated_at = ? WHERE id = ?')->execute([$role, $now, $target['id']]);
            audit('admin.role', null, $who, ['from' => $target['role'], 'to' => $role]);
            flash('success', "Role changed for {$target['full_name']}.");
        }
    } elseif ($do === 'active') {
        $active = post('active') === '1' ? 1 : 0;
        if ($isSelf) flash('error', 'You cannot deactivate yourself.');
        elseif (!$active && $target['role'] === 'super' && active_supers() <= 1) flash('error', 'There must always be at least one active super admin.');
        else {
            db()->prepare('UPDATE admin_users SET active = ?, updated_at = ? WHERE id = ?')->execute([$active, $now, $target['id']]);
            audit($active ? 'admin.activate' : 'admin.deactivate', null, $who);
            flash('success', $active ? "{$target['full_name']} can log in again." : "{$target['full_name']} can no longer log in (logged out at once).");
        }
    } elseif ($do === 'reset') {
        $pw = (string)($_POST['password'] ?? '');
        if ($isSelf) flash('error', 'Change your own password on the My account page.');
        elseif ($p = password_problem($pw, $target['email'])) flash('error', $p);
        else {
            db()->prepare('UPDATE admin_users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?')
                ->execute([password_hash($pw, PASSWORD_DEFAULT), $now, $target['id']]);
            audit('admin.reset_password', null, $who);
            flash('success', "Temporary password set for {$target['full_name']}. Tell it to them directly; they must change it when they log in.");
        }
    }
    redirect('team.php');
}

$admins = db()->query('SELECT * FROM admin_users ORDER BY active DESC, role, full_name')->fetchAll();
layout_start('Admin team', 'team.php', ['sub' => 'REALITY HEALTH SYSTEM staff who can log in here.']);
?>
<section class="panel">
  <div class="panel-head"><h2>People who can log in here</h2></div>
  <p class="small muted mb0"><strong>Super admin</strong>: everything, including this page. <strong>Support staff</strong>: everything except managing the admin team.</p>
  <div class="table-wrap mt"><table>
    <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
    <tbody>
    <?php foreach ($admins as $a): $self = (int)$a['id'] === (int)$me['id']; ?>
      <tr>
        <td><strong><?= h($a['full_name']) ?></strong><?= $self ? ' ' . badge('you', 'info') : '' ?><span class="sub"><?= h($a['email']) ?></span></td>
        <td><?= $a['role'] === 'super' ? badge('Super admin', 'violet') : badge('Support staff') ?></td>
        <td><?= $a['active'] ? ($a['must_change_password'] ? badge('Must set password', 'warning') : badge('Active', 'success')) : badge('Deactivated', 'danger') ?></td>
        <td class="nowrap"><?= h(time_ago($a['last_login_at'])) ?></td>
        <td>
          <?php if (!$self): ?>
          <div class="actions">
            <form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="do" value="role"><input type="hidden" name="id" value="<?= (int)$a['id'] ?>">
              <input type="hidden" name="role" value="<?= $a['role'] === 'super' ? 'support' : 'super' ?>">
              <button class="btn small secondary" type="submit" data-confirm="Change <?= h($a['full_name']) ?>'s role?"><?= $a['role'] === 'super' ? 'Make support staff' : 'Make super admin' ?></button></form>
            <form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="do" value="active"><input type="hidden" name="id" value="<?= (int)$a['id'] ?>">
              <input type="hidden" name="active" value="<?= $a['active'] ? '0' : '1' ?>">
              <button class="btn small <?= $a['active'] ? 'danger-soft' : 'secondary' ?>" type="submit" <?= $a['active'] ? 'data-confirm="Stop ' . h($a['full_name']) . ' from logging in?"' : '' ?>><?= $a['active'] ? 'Deactivate' : 'Reactivate' ?></button></form>
          </div>
          <form method="post" class="row mt8"><?= csrf_field() ?><input type="hidden" name="do" value="reset"><input type="hidden" name="id" value="<?= (int)$a['id'] ?>">
            <input type="password" name="password" placeholder="New temporary password" autocomplete="new-password" class="pw-inline" required>
            <button class="btn small secondary" type="submit">Reset password</button></form>
          <?php else: ?><span class="small subtle">Use My account</span><?php endif; ?>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
</section>

<section class="panel">
  <h2>Add a team member</h2>
  <form method="post" autocomplete="off">
    <?= csrf_field() ?><input type="hidden" name="do" value="add">
    <div class="grid2">
      <div class="field"><label for="full_name">Full name</label><input type="text" id="full_name" name="full_name" required></div>
      <div class="field"><label for="email">Email (used to log in)</label><input type="email" id="email" name="email" required></div>
      <div class="field"><label for="role">Role</label><select id="role" name="role"><option value="support">Support staff</option><option value="super">Super admin</option></select></div>
      <div class="field"><label for="password">Temporary password</label><input type="password" id="password" name="password" autocomplete="new-password" required>
        <div class="hint">At least <?= ADMIN_MIN_PASSWORD ?> characters. Tell it to them directly; they choose their own at first login.</div></div>
    </div>
    <button class="btn" type="submit"><?= icon('plus') ?>Add team member</button>
  </form>
</section>
<?php
layout_end();

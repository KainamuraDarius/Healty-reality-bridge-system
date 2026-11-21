<?php
// My account: change my own password.
require __DIR__ . '/app/bootstrap.php';
$me = require_login();

if (is_post()) {
    require_post_csrf();
    $cur = (string)($_POST['current'] ?? ''); $new = (string)($_POST['new'] ?? ''); $new2 = (string)($_POST['new2'] ?? '');
    $s = db()->prepare('SELECT password_hash FROM admin_users WHERE id = ?'); $s->execute([$me['id']]);
    if (!password_verify($cur, (string)$s->fetchColumn())) flash('error', 'Your current password is not correct.');
    elseif ($p = password_problem($new, $me['email'])) flash('error', $p);
    elseif ($new !== $new2) flash('error', 'The two new passwords do not match.');
    elseif (hash_equals($cur, $new)) flash('error', 'Choose a password different from the current one.');
    else {
        db()->prepare('UPDATE admin_users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), now_utc(), $me['id']]);
        session_regenerate_id(true);
        audit('account.password', null, $me['email']);
        flash('success', 'Your password has been changed.');
        redirect('index.php');
    }
    redirect('account.php');
}

layout_start('My account', 'account.php', ['sub' => 'Your RHS Admin login: name and password.']);
?>
<section class="panel narrow">
  <h2><?= h($me['full_name']) ?></h2>
  <p class="muted"><?= h($me['email']) ?> · <?= $me['role'] === 'super' ? 'Super admin' : 'Support staff' ?></p>
  <h3 class="mt">Change my password</h3>
  <form method="post">
    <?= csrf_field() ?>
    <div class="field"><label for="current">Current password</label><input type="password" id="current" name="current" autocomplete="current-password" required></div>
    <div class="field"><label for="new">New password</label><input type="password" id="new" name="new" autocomplete="new-password" required>
      <div class="hint">At least <?= ADMIN_MIN_PASSWORD ?> characters.</div></div>
    <div class="field"><label for="new2">Repeat new password</label><input type="password" id="new2" name="new2" autocomplete="new-password" required></div>
    <button class="btn" type="submit"><?= icon('key') ?>Change password</button>
  </form>
</section>
<?php
layout_end();

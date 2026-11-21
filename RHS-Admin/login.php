<?php
require __DIR__ . '/app/bootstrap.php';

if (current_admin()) redirect('index.php');
if ((int)db()->query('SELECT COUNT(*) FROM admin_users')->fetchColumn() === 0) redirect('setup.php');

$error = null;
if (is_post()) {
    require_post_csrf();
    $error = attempt_login(post('email'), (string)($_POST['password'] ?? ''));
    if ($error === null) redirect('index.php');
}

layout_start('Log in', '');
?>
<h2>Log in</h2>
<p class="muted">For REALITY HEALTH SYSTEM staff only.</p>
<?php if ($error): ?><div class="alert alert-error"><?= h($error) ?></div><?php endif; ?>
<form method="post">
  <?= csrf_field() ?>
  <div class="field"><label for="email">Email</label><input type="email" id="email" name="email" value="<?= h(post('email')) ?>" autocomplete="username" required autofocus></div>
  <div class="field"><label for="password">Password</label><input type="password" id="password" name="password" autocomplete="current-password" required></div>
  <button class="btn" type="submit">Log in</button>
</form>
<p class="small subtle mt">Forgot your password? Ask a super admin to reset it from the Admin team page.</p>
<?php
layout_end();

<?php
// One-time page: creates the FIRST super admin. Stops working as soon as any admin exists.
require __DIR__ . '/app/bootstrap.php';

$count = (int)db()->query('SELECT COUNT(*) FROM admin_users')->fetchColumn();
if ($count > 0) { flash('info', 'Setup is already done. Log in instead.'); redirect('login.php'); }

$key = (string)(config()['setup_key'] ?? '');
$keyIsDefault = $key === '' || $key === 'CHANGE_ME_TO_A_LONG_SECRET' || strlen($key) < 12;
$error = null;

if (is_post() && !$keyIsDefault) {
    require_post_csrf();
    $name = post('full_name'); $email = strtolower(post('email')); $pw = (string)($_POST['password'] ?? ''); $pw2 = (string)($_POST['password2'] ?? '');
    if (!hash_equals($key, (string)($_POST['setup_key'] ?? ''))) $error = 'The setup key is not correct.';
    elseif ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) $error = 'Enter your full name and a valid email.';
    elseif ($p = password_problem($pw, $email)) $error = $p;
    elseif ($pw !== $pw2) $error = 'The two passwords do not match.';
    else {
        $now = now_utc();
        db()->prepare('INSERT INTO admin_users (email, full_name, role, password_hash, active, created_at, updated_at) VALUES (?,?,?,?,1,?,?)')
            ->execute([$email, $name, 'super', password_hash($pw, PASSWORD_DEFAULT), $now, $now]);
        audit('setup.first_admin', null, $email, ['email' => $email]);
        flash('success', 'Your super admin account is ready. Log in now.');
        redirect('login.php');
    }
}

layout_start('First-time setup', '');
?>
<h2>First-time setup</h2>
<?php if ($keyIsDefault): ?>
  <div class="alert alert-warning">Before you can continue, open <strong>app/config.php</strong> on the server and change
  <code>setup_key</code> to a long secret only you know (at least 12 characters). Then reload this page.</div>
<?php else: ?>
  <p class="muted">Create the first <strong>super admin</strong> (you). You can add the rest of your team after logging in.</p>
  <?php if ($error): ?><div class="alert alert-error"><?= h($error) ?></div><?php endif; ?>
  <form method="post" autocomplete="off">
    <?= csrf_field() ?>
    <div class="field"><label for="setup_key">Setup key (from app/config.php)</label><input type="password" id="setup_key" name="setup_key" required></div>
    <div class="field"><label for="full_name">Your full name</label><input type="text" id="full_name" name="full_name" value="<?= h(post('full_name')) ?>" required></div>
    <div class="field"><label for="email">Your email</label><input type="email" id="email" name="email" value="<?= h(post('email')) ?>" required></div>
    <div class="field"><label for="password">Password</label><input type="password" id="password" name="password" autocomplete="new-password" required>
      <div class="hint">At least <?= ADMIN_MIN_PASSWORD ?> characters.</div></div>
    <div class="field"><label for="password2">Repeat password</label><input type="password" id="password2" name="password2" autocomplete="new-password" required></div>
    <button class="btn" type="submit">Create super admin</button>
  </form>
<?php endif;
layout_end();

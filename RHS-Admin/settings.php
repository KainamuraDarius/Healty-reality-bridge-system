<?php
// Settings (super admins): support contacts shown in the app, who gets email alerts and
// for what, and the free-trial length for new facilities.
require __DIR__ . '/app/bootstrap.php';
$me = require_super();

$back = fn(string $anchor) => redirect('settings.php#' . $anchor);

if (is_post()) {
    require_post_csrf();
    $do = post('do');

    // ---- support contacts
    if ($do === 'contacts') {
        $rows = $_POST['c'] ?? [];
        $list = [];
        $errors = [];
        if (is_array($rows)) foreach ($rows as $i => $r) {
            if (!is_array($r) || !empty($r['remove'])) continue;
            $t = fn($k, $max) => mb_substr(trim(preg_replace('/\s+/', ' ', (string)($r[$k] ?? ''))), 0, $max);
            $c = ['name' => $t('name', 80), 'role' => $t('role', 80), 'phone' => $t('phone', 30), 'email' => $t('email', 120),
                  'whatsapp' => !empty($r['whatsapp']), 'order' => (int)($r['order'] ?? 0)];
            if ($c['name'] === '' && $c['role'] === '' && $c['phone'] === '' && $c['email'] === '') continue; // empty row
            $label = $c['name'] !== '' ? $c['name'] : 'Row ' . ((int)$i + 1);
            if ($c['name'] === '') $errors[] = "$label: enter a name.";
            if ($c['phone'] === '' && $c['email'] === '') $errors[] = "$label: enter a phone number or an email.";
            if ($c['phone'] !== '' && !preg_match('/^\+?[0-9 ()-]{7,20}$/', $c['phone'])) $errors[] = "$label: “{$c['phone']}” is not a phone number.";
            if ($c['email'] !== '' && !filter_var($c['email'], FILTER_VALIDATE_EMAIL)) $errors[] = "$label: “{$c['email']}” is not an email address.";
            if ($c['phone'] === '') $c['whatsapp'] = false;
            $list[] = $c;
        }
        if ($errors) { flash('error', implode(' ', $errors)); $back('contacts'); }
        if (!$list) { flash('error', 'Keep at least one contact, so facilities can reach you.'); $back('contacts'); }
        if (count($list) > SUPPORT_CONTACTS_MAX) { flash('error', 'At most ' . SUPPORT_CONTACTS_MAX . ' contacts.'); $back('contacts'); }
        usort($list, fn($a, $b) => $a['order'] <=> $b['order']);
        $list = array_map(function ($c) { unset($c['order']); return $c; }, $list);
        save_setting('support_contacts', json_encode($list, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        audit('settings.contacts', null, 'Support contacts', ['contacts' => implode('; ', array_map(fn($c) => trim($c['name'] . ' ' . $c['phone'] . ' ' . $c['email']), $list))]);
        flash('success', 'Saved. The app shows the new contacts the next time it is opened online.');
        $back('contacts');
    }

    // ---- email alerts: recipients
    if ($do === 'add_email') {
        $email = mb_strtolower(post('email'));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { flash('error', 'That is not a valid email address.'); $back('alerts'); }
        $list = email_list(setting('signup_emails'));
        if (in_array($email, array_map('mb_strtolower', $list), true)) { flash('error', "$email already gets the alerts."); $back('alerts'); }
        if (count($list) >= 20) { flash('error', 'At most 20 people can get the alerts.'); $back('alerts'); }
        $list[] = $email;
        save_setting('signup_emails', implode(', ', $list));
        save_setting('admin_url', site_url());   // so the email can link straight to the facility here
        audit('settings.alerts_add', null, 'Email alerts', ['email' => $email]);
        flash('success', "$email will now get the email alerts.");
        $back('alerts');
    }
    if ($do === 'remove_email') {
        $email = mb_strtolower(post('email'));
        $list = array_values(array_filter(email_list(setting('signup_emails')), fn($e) => mb_strtolower($e) !== $email));
        save_setting('signup_emails', implode(', ', $list));
        audit('settings.alerts_remove', null, 'Email alerts', ['email' => $email]);
        flash('success', "$email will no longer get the email alerts.");
        $back('alerts');
    }
    // ---- email alerts: which events + sender
    if ($do === 'alert_options') {
        $from = post('mail_from');
        if ($from !== '' && !filter_var($from, FILTER_VALIDATE_EMAIL)) { flash('error', '“Send from” must be an email address, e.g. no-reply@truehome.com.ug'); $back('alerts'); }
        $signups = post('alert_signups') === '1' ? '1' : '0';
        $acts = post('alert_activations') === '1' ? '1' : '0';
        save_setting('alert_signups', $signups);
        save_setting('alert_activations', $acts);
        save_setting('mail_from', $from);
        save_setting('admin_url', site_url());
        audit('settings.alerts', null, 'Email alerts', ['signups' => $signups === '1', 'subscriptions' => $acts === '1', 'from' => $from]);
        flash('success', 'Saved.');
        $back('alerts');
    }
    if ($do === 'test') {
        $to = email_list(setting('signup_emails'));
        if (!$to) { flash('error', 'Add at least one email address first.'); $back('alerts'); }
        $ok = send_mail($to, 'Test from RHS Admin', "This is a test email from RHS Admin.\r\n\r\nIf you can read this, the email alerts will reach you.\r\nSent " . show_time(now_utc()) . ' by ' . $me['email'] . '.');
        audit('settings.test_email', null, 'Test email', ['to' => implode(', ', $to), 'accepted' => $ok]);
        flash($ok ? 'success' : 'error', $ok ? 'Test email handed to the mail server for ' . implode(', ', $to) . '. Check the inbox (and the spam folder) in a few minutes.'
                                           : 'The server refused to send email. Check the “Send from” address exists in cPanel → Email Accounts.');
        $back('alerts');
    }

    // ---- free trial
    if ($do === 'trial') {
        $days = (int)post('trial_days');
        if ($days < 1 || $days > 365) { flash('error', 'Free trial length must be between 1 and 365 days.'); $back('trial'); }
        $old = (int)setting('trial_days', (string)TRIAL_DAYS_DEFAULT);
        save_setting('trial_days', (string)$days);
        audit('settings.trial_days', null, 'Free trial length', ['from' => $old, 'to' => $days]);
        flash('success', "Saved. New facilities now get a $days-day free trial.");
        $back('trial');
    }
    // ---- Google Drive one-tap backups
    if ($do === 'google') {
        $gid = trim(post('google_client_id'));
        if ($gid !== '' && !preg_match('/^[0-9]{6,20}-[a-z0-9]{10,64}\.apps\.googleusercontent\.com$/', $gid)) {
            flash('error', 'That does not look like a Google OAuth Web Client ID (it ends with .apps.googleusercontent.com).'); $back('google');
        }
        $old = setting('google_client_id');
        save_setting('google_client_id', $gid);
        audit('settings.google_client_id', null, 'Google Drive backups', ['from' => $old ? 'set' : 'empty', 'to' => $gid ? 'set' : 'empty']);
        flash('success', $gid ? 'Saved. Facilities get one-tap Google Drive backups the next time their app is online.' : 'Removed. Facilities send backups to Google Drive through their phone instead.');
        $back('google');
    }
    redirect('settings.php');
}

$googleId = setting('google_client_id');
$contacts = support_contacts();
$contactsSaved = setting('support_contacts') !== '';
$recipients = email_list(setting('signup_emails'));
$alertSignups = setting('alert_signups', '1') === '1';
$alertActs = setting('alert_activations', '1') === '1';
$from = setting('mail_from');
$host = preg_replace('/^[^.]+\./', '', preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'example.com'));
$trialDays = (int)setting('trial_days', (string)TRIAL_DAYS_DEFAULT);
$blank = ['name' => '', 'role' => '', 'phone' => '', 'email' => '', 'whatsapp' => false];
$rows = array_merge($contacts, array_fill(0, max(1, min(3, SUPPORT_CONTACTS_MAX - count($contacts))), $blank));

layout_start('Settings', 'settings.php', ['sub' => 'Support contacts shown in the app, email alerts, free-trial length and backup options.']);
?>
<p class="small jump-links"><a href="#contacts">Support contacts</a> <a href="#alerts">Email alerts</a> <a href="#trial">Free trial</a> <a href="#google">Google Drive backups</a></p>

<section class="panel" id="contacts">
  <h2>Support contacts shown in the app</h2>
  <p class="muted">Facilities see these on the app's home page, on the System page and when their app is locked. Put the main contact first.</p>
  <?php if (!$contactsSaved): ?><p class="small warn-text">Not saved yet. The app is showing its built-in contacts, which are the ones below.</p><?php endif; ?>
  <form method="post" autocomplete="off" data-confirm="Save these contacts? Every facility will see them.">
    <?= csrf_field() ?><input type="hidden" name="do" value="contacts">
    <div class="table-wrap"><table class="edit-table">
      <thead><tr><th>Order</th><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>WhatsApp</th><th>Remove</th></tr></thead>
      <tbody>
      <?php foreach ($rows as $i => $c): $n = "c[$i]"; ?>
        <tr>
          <td><input type="number" name="<?= $n ?>[order]" value="<?= $i + 1 ?>" min="0" max="99" class="num-input" aria-label="Order"></td>
          <td><input type="text" name="<?= $n ?>[name]" value="<?= h($c['name'] ?? '') ?>" maxlength="80" placeholder="e.g. Support desk" aria-label="Name"></td>
          <td><input type="text" name="<?= $n ?>[role]" value="<?= h($c['role'] ?? '') ?>" maxlength="80" placeholder="e.g. Payments" aria-label="Role"></td>
          <td><input type="tel" name="<?= $n ?>[phone]" value="<?= h($c['phone'] ?? '') ?>" maxlength="30" placeholder="+256 7XX XXX XXX" aria-label="Phone"></td>
          <td><input type="email" name="<?= $n ?>[email]" value="<?= h($c['email'] ?? '') ?>" maxlength="120" placeholder="name@example.com" aria-label="Email"></td>
          <td class="center"><input type="checkbox" name="<?= $n ?>[whatsapp]" value="1" <?= !empty($c['whatsapp']) ? 'checked' : '' ?> aria-label="Also on WhatsApp"></td>
          <td class="center"><?php if (($c['name'] ?? '') !== ''): ?><input type="checkbox" name="<?= $n ?>[remove]" value="1" aria-label="Remove this contact"><?php endif; ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>
    <p class="hint">Fill an empty row to add a contact. Need more rows? Save, and new empty rows appear. Up to <?= SUPPORT_CONTACTS_MAX ?> contacts.</p>
    <button class="btn" type="submit"><?= icon('check') ?>Save contacts</button>
  </form>
</section>

<section class="panel" id="alerts">
  <h2>Email alerts</h2>
  <p class="muted">Everyone on this list gets an email when something below happens. New sign-ups also show on the dashboard and as a “new” badge next to Facilities.</p>

  <h3 class="subhead">Who gets them</h3>
  <?php if (!$recipients): ?><div class="empty">Nobody yet. Add an email address below.</div><?php else: ?>
  <ul class="recipient-list">
    <?php foreach ($recipients as $e): ?>
    <li><span><?= h($e) ?></span>
      <form method="post" class="inline" data-confirm="Stop sending alerts to <?= h($e) ?>?"><?= csrf_field() ?><input type="hidden" name="do" value="remove_email"><input type="hidden" name="email" value="<?= h($e) ?>">
        <button class="btn small danger-soft" type="submit">Remove</button></form></li>
    <?php endforeach; ?>
  </ul>
  <?php endif; ?>
  <form method="post" class="row mt" autocomplete="off">
    <?= csrf_field() ?><input type="hidden" name="do" value="add_email">
    <div class="field grow mb0"><label for="add_email">Add a person</label><input type="email" id="add_email" name="email" placeholder="colleague@example.com" required></div>
    <button class="btn" type="submit"><?= icon('plus') ?>Add</button>
  </form>

  <h3 class="subhead">What they get emailed about</h3>
  <form method="post" autocomplete="off">
    <?= csrf_field() ?><input type="hidden" name="do" value="alert_options">
    <label class="check"><input type="checkbox" name="alert_signups" value="1" <?= $alertSignups ? 'checked' : '' ?>> A new facility registers</label>
    <label class="check"><input type="checkbox" name="alert_activations" value="1" <?= $alertActs ? 'checked' : '' ?>> A facility subscribes or renews in the app (activation code or Mobile Money)</label>
    <div class="field narrow"><label for="mail_from">Send from</label><input type="email" id="mail_from" name="mail_from" value="<?= h($from) ?>" placeholder="no-reply@<?= h($host) ?>">
      <div class="hint">An address on your own domain (create it in cPanel → Email Accounts). Emails from other domains often land in spam.</div></div>
    <div class="row">
      <button class="btn" type="submit"><?= icon('check') ?>Save</button>
      <?php if ($recipients): ?><button class="btn secondary" type="submit" form="testMail">Send a test email</button><?php endif; ?>
    </div>
  </form>
  <form method="post" id="testMail"><?= csrf_field() ?><input type="hidden" name="do" value="test"></form>
  <p class="hint">Renewals you make here in the admin site are not emailed — they are in the audit log.</p>
</section>

<section class="panel" id="trial">
  <h2>Free trial for new facilities</h2>
  <p class="muted">How many days a newly registered facility can use the app for free. It is set when the facility first connects to the server. To give one facility more time, open it under Facilities and use <strong>Extend free trial</strong>.</p>
  <form method="post" class="row" autocomplete="off">
    <?= csrf_field() ?><input type="hidden" name="do" value="trial">
    <div class="field mb0"><label for="trial_days">Trial length (days)</label><input type="number" id="trial_days" name="trial_days" min="1" max="365" value="<?= $trialDays ?>" required></div>
    <button class="btn" type="submit"><?= icon('check') ?>Save</button>
  </form>
  <p class="hint">The app itself starts with <?= TRIAL_DAYS_DEFAULT ?> days. Within a minute of connecting, the facility's devices switch to this length.</p>
</section>
<section class="panel" id="google">
  <h2>Google Drive backups</h2>
  <p class="muted">Without this, facilities still back up to Google Drive: phones send the file to the Drive app, computers download it and open Drive. With a Google sign-in key, admins get a one-tap <strong>Upload to Google Drive</strong> that saves straight into their own Drive.</p>
  <ol class="small muted">
    <li>Open <strong>console.cloud.google.com</strong> → create a project → <em>APIs &amp; Services</em> → enable <strong>Google Drive API</strong>.</li>
    <li><em>OAuth consent screen</em>: External, add the app name and your email; add the scope <code>.../auth/drive.file</code> (only files the app creates).</li>
    <li><em>Credentials</em> → <strong>Create OAuth client ID</strong> → Web application → Authorised JavaScript origin: <code><?= h(config()['pharmacy_app_url'] ?? 'https://hrb.truehome.com.ug') ?></code></li>
    <li>Copy the <strong>Client ID</strong> here. (Not the client secret — that is never needed.)</li>
  </ol>
  <form method="post" class="row" autocomplete="off">
    <?= csrf_field() ?><input type="hidden" name="do" value="google">
    <div class="field mb0 grow"><label for="google_client_id">OAuth Web Client ID</label><input type="text" id="google_client_id" name="google_client_id" value="<?= h($googleId) ?>" placeholder="123456789012-abc….apps.googleusercontent.com" spellcheck="false"></div>
    <button class="btn" type="submit"><?= icon('check') ?>Save</button>
  </form>
  <p class="hint"><?= $googleId ? 'One-tap Google Drive backups are switched ON.' : 'Not set — facilities use the phone share / download way.' ?> Leave the box empty and save to switch it off.</p>
</section>
<?php
layout_end();

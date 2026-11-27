<?php
// One facility: profile, licence (renew / change package / suspend / offline code), devices, users,
// and business summaries. Never shows patient names, phone numbers or diagnoses.
require __DIR__ . '/app/bootstrap.php';
require_login();

$id = get('id') !== '' ? get('id') : post('id');
$f = $id !== '' ? facility_by_id($id) : null;
if (!$f) { http_response_code(404); layout_start('Not found', 'pharmacies.php'); echo '<div class="panel"><h2>Facility not found.</h2><a href="pharmacies.php">Back to all facilities</a></div>'; layout_end(); exit; }
$self = 'pharmacy.php?id=' . urlencode($f['id']);
$name = $f['name'] ?: '(no name)';
$today = today_local();
$generatedCode = null;
$tab = get('tab');
// After an action, show the tab it belongs to.
const ACTION_TAB = ['profile' => 'overview', 'stamp' => 'docs', 'doc_add' => 'docs', 'doc_delete' => 'docs', 'renew' => 'licence',
    'trial' => 'licence', 'package' => 'licence', 'suspend' => 'licence', 'unsuspend' => 'licence', 'code' => 'licence',
    'remove_device' => 'devices', 'reset_user' => 'devices'];

if (is_post()) {
    require_post_csrf();
    $do = post('do');
    $tab = ACTION_TAB[$do] ?? 'overview';
    if ($tab !== 'overview') $self .= '&tab=' . $tab;

    // ---- facility profile: owned by the facility's super admin (in the app); RHS edits it here only
    //      as a fallback (e.g. the super admin lost access or typed a wrong email)
    if ($do === 'profile') {
        $cols = [];
        foreach (['name' => 200, 'slogan' => 300, 'location' => 300, 'contact' => 100, 'email' => 191] as $k => $max) $cols[$k] = mb_substr(post($k), 0, $max);
        $err = null;
        if ($cols['name'] === '' || $cols['location'] === '' || $cols['contact'] === '' || $cols['email'] === '') $err = 'Name, location, phone and email are required.';
        elseif (!filter_var($cols['email'], FILTER_VALIDATE_EMAIL)) $err = 'Enter a valid email address.';
        elseif (!preg_match('/^\+?[0-9 ()-]{7,20}$/', $cols['contact'])) $err = 'Enter a valid phone number.';
        if (!$err) {
            $dup = db()->prepare('SELECT name FROM facilities WHERE LOWER(email) = LOWER(?) AND id <> ? AND deleted = 0 LIMIT 1');
            $dup->execute([$cols['email'], $f['id']]);
            if ($d = $dup->fetch()) $err = "Another facility ({$d['name']}) already uses that email. Each facility needs its own email to log in new devices.";
        }
        // logo: remove, keep, or a new picture (shrunk when the server can, else small files only)
        if (!$err && post('logo_remove') === '1') $cols['logo'] = null;
        elseif (!$err && !empty($_FILES['logo']['tmp_name']) && is_uploaded_file($_FILES['logo']['tmp_name'])) {
            $tmp = $_FILES['logo']['tmp_name'];
            $info = @getimagesize($tmp);
            $types = [IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png', IMAGETYPE_WEBP => 'image/webp'];
            if (!$info || !isset($types[$info[2]])) $err = 'The logo must be a JPG, PNG or WebP picture.';
            elseif (function_exists('imagecreatefromstring') && ($img = @imagecreatefromstring(file_get_contents($tmp)))) {
                $w = imagesx($img); $hgt = imagesy($img); $scale = min(1, 240 / max($w, $hgt));
                $nw = max(1, (int)round($w * $scale)); $nh = max(1, (int)round($hgt * $scale));
                $out = imagecreatetruecolor($nw, $nh);
                imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255)); // flatten transparency to white, like the app
                imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $w, $hgt);
                ob_start(); imagejpeg($out, null, 85); $jpg = ob_get_clean();
                $cols['logo'] = 'data:image/jpeg;base64,' . base64_encode($jpg);
            } elseif (filesize($tmp) > 150 * 1024) $err = 'That picture is too large (over 150 KB). Make it smaller and try again.';
            else $cols['logo'] = 'data:' . $types[$info[2]] . ';base64,' . base64_encode(file_get_contents($tmp));
        }
        if ($err) { flash('error', $err); redirect($self . '#profile'); }
        $changed = [];
        foreach ($cols as $k => $v) if ((string)$v !== (string)($f[$k] ?? '')) $changed[$k] = $k === 'logo' ? ($v ? 'new picture' : 'removed') : $v;
        if (!$changed) { flash('success', 'Nothing changed.'); redirect($self . '#profile'); }
        if (array_key_exists('profile_updated_at', $f)) $cols['profile_updated_at'] = now_ms_utc(); // newest profile wins on devices too
        change_facility($f['id'], $cols, false);
        audit('pharmacy.profile', $f['id'], $cols['name'], ['changed' => $changed]);
        $note = isset($changed['name']) || isset($changed['email']) ? ' Their recovery password changed too — they can see the new one in the app under Settings → Facility profile → Show.' : '';
        flash('success', "Profile saved. The facility's devices update on their next sync." . $note);
        redirect($self . '#profile');
    }

    // ---- erase all the facility's data (privacy request). Super admins only; cannot be undone.
    if ($do === 'erase') {
        if (!is_super()) { flash('error', 'Only RHS super admins can erase a facility.'); redirect($self); }
        if (mb_strtolower(trim(post('confirm_name'))) !== mb_strtolower(trim((string)$f['name']))) {
            flash('error', 'The name you typed does not match. Nothing was deleted.'); redirect($self . '#erase');
        }
        $by = current_admin()['full_name'] ?? '' ?: (current_admin()['email'] ?? 'RHS');
        $counts = erase_facility($f, $by);
        audit('privacy.facility_erased', $f['id'], $name, ['deleted' => array_filter($counts), 'note' => mb_substr(post('note'), 0, 300)]);
        flash('success', "All of $name's data was deleted from the server. Its phones can no longer sync or log in.");
        redirect('privacy.php');
    }

    if ($do === 'renew') {
        $tier = array_key_exists(post('tier'), PACKAGES) ? post('tier') : ($f['license_tier'] ?: 'standard');
        $devices = post('devices') !== '' ? max(1, min(50, (int)post('devices'))) : null;
        $until = null;
        if (post('until') !== '') {
            $until = post('until');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $until) || $until < $today) { flash('error', 'Choose an end date from today onwards.'); redirect($self); }
        }
        $until = renew_licence($f, MONTH_DAYS[post('months')] ?? 30, $until, $tier, $devices, post('note'));
        flash('success', "Licence for $name now runs until " . show_date($until) . '. Their devices update on their next sync.');
        redirect($self);
    }
    if ($do === 'trial') {
        if ($f['license_expiry'] && !$f['license_trial']) { flash('error', "$name is on a paid licence. Use Renew instead."); redirect($self); }
        $until = null;
        if (post('until') !== '') {
            $until = post('until');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $until) || $until < $today) { flash('error', 'Choose an end date from today onwards.'); redirect($self); }
        }
        $days = in_array((int)post('days'), TRIAL_EXTEND_DAYS, true) ? (int)post('days') : 14;
        $until = extend_trial($f, $days, $until, post('note'));
        flash('success', "Free trial for $name now runs until " . show_date($until) . '. Their devices update on their next sync.');
        redirect($self);
    }
    if ($do === 'package') {
        $tier = array_key_exists(post('tier'), PACKAGES) ? post('tier') : 'standard';
        $devices = post('devices') !== '' ? max(1, min(50, (int)post('devices'))) : PACKAGES[$tier]['devices'];
        if (!$f['license_expiry']) { flash('error', 'This facility has no licence yet. Use Renew to give it one.'); redirect($self); }
        $before = change_facility($f['id'], ['license_tier' => $tier, 'max_devices' => $devices], true);
        audit('licence.package', $f['id'], $name, ['from' => package_label($before['license_tier']) . ' / ' . $before['max_devices'] . ' devices', 'to' => package_label($tier) . " / $devices devices"]);
        flash('success', "$name is now on " . package_label($tier) . " ($devices devices).");
        redirect($self);
    }
    if ($do === 'suspend') {
        $reason = mb_substr(post('reason'), 0, 300);
        if ($reason === '') { flash('error', 'Write a short reason. The facility sees it on their screen.'); redirect($self); }
        change_facility($f['id'], ['suspended' => 1, 'suspended_reason' => $reason], false);
        audit('pharmacy.suspend', $f['id'], $name, ['reason' => $reason]);
        flash('success', "$name is suspended. Their devices lock on their next sync.");
        redirect($self);
    }
    if ($do === 'unsuspend') {
        change_facility($f['id'], ['suspended' => 0, 'suspended_reason' => ''], false);
        audit('pharmacy.unsuspend', $f['id'], $name);
        flash('success', "$name can use the app again (on their next sync).");
        redirect($self);
    }
    if ($do === 'remove_device') {
        try {
            $d = remove_device($f['id'], post('device_id'));
            audit('support.remove_device', $f['id'], $name, ['device' => $d['label'], 'code' => $d['device_code']]);
            flash('success', "Device “{$d['label']}” removed and logged out. Its slot is free.");
        } catch (RuntimeException $e) { flash('error', 'That device was not found (maybe already removed).'); }
        redirect($self);
    }
    if ($do === 'reset_user') {
        $pw = (string)($_POST['password'] ?? '');
        if (mb_strlen($pw) < 6) { flash('error', 'The new password must be at least 6 characters.'); redirect($self); }
        try {
            $u = reset_pharmacy_password($f['id'], post('user_id'), $pw);
            audit('support.reset_password', $f['id'], $name, ['login' => '@' . $u['username']]);
            flash('success', "New password set for @{$u['username']}. Tell it to them directly. It works on their devices after their next sync (and on a new device straight away).");
        } catch (RuntimeException $e) { flash('error', 'That login was not found.'); }
        redirect($self);
    }
    // ---- digital stamp (printed on the facility's receipts and reports)
    if ($do === 'stamp') {
        if (post('stamp_remove') === '1') {
            change_facility($f['id'], ['stamp' => null, 'stamp_updated_at' => now_ms_utc()], false);
            audit('facility.stamp', $f['id'], $name, ['change' => 'removed']);
            flash('success', 'Stamp removed. The facility\'s devices update on their next sync.');
            redirect($self . '#docs');
        }
        $tmp = upload_ok('stamp');
        if (!$tmp) { flash('error', 'Choose a picture of the stamp.'); redirect($self . '#docs'); }
        [$data, $err] = stamp_from_upload($tmp);
        if ($err) { flash('error', $err); redirect($self . '#docs'); }
        change_facility($f['id'], ['stamp' => $data, 'stamp_updated_at' => now_ms_utc()], false);
        audit('facility.stamp', $f['id'], $name, ['change' => 'new stamp']);
        flash('success', 'Stamp saved. It prints on the facility\'s receipts and reports after their next sync.');
        redirect($self . '#docs');
    }
    // ---- operational certificates
    if ($do === 'doc_add') {
        $tmp = upload_ok('doc');
        $mime = $tmp ? uploaded_mime($tmp) : null;
        $err = !$tmp ? 'Choose the certificate file.' : (!$mime ? 'The certificate must be a PDF or a JPG / PNG / WebP picture.'
             : (filesize($tmp) > ADMIN_DOC_MAX_BYTES ? 'That file is over 2 MB. Scan it at a lower quality and try again.' : null));
        if (!$err && count(facility_documents($f['id']) ?? []) >= 10) $err = 'This facility already has 10 certificates. Remove an old one first.';
        if ($err) { flash('error', $err); redirect($self . '#docs'); }
        $orig = mb_substr(basename((string)($_FILES['doc']['name'] ?? 'certificate')), 0, 200);
        $title = mb_substr(post('title') !== '' ? post('title') : (preg_replace('/\.[A-Za-z0-9]+$/', '', $orig) ?: 'Certificate'), 0, 200);
        $valid = preg_match('/^\d{4}-\d{2}-\d{2}$/', post('valid_until')) ? post('valid_until') : null;
        $now = now_ms_utc();
        save_facility_document(['id' => new_uuid(), 'facility_id' => $f['id'], 'device_id' => 'rhs-admin', 'kind' => 'certificate',
            'title' => $title, 'file_name' => $orig, 'mime' => $mime, 'size_bytes' => (int)filesize($tmp),
            'data' => 'data:' . $mime . ';base64,' . base64_encode((string)file_get_contents($tmp)), 'valid_until' => $valid,
            'uploaded_by' => 'RHS: ' . (current_admin()['email'] ?? ''), 'created_at' => $now, 'updated_at' => $now, 'deleted' => 0]);
        audit('facility.certificate_add', $f['id'], $name, ['title' => $title]);
        flash('success', 'Certificate added. The facility sees it on their next sync.');
        redirect($self . '#docs');
    }
    if ($do === 'doc_delete') {
        $doc = facility_document($f['id'], post('doc_id'));
        if (!$doc) { flash('error', 'Certificate not found.'); redirect($self . '#docs'); }
        save_facility_document(['_update' => 1, 'id' => $doc['id'], 'deleted' => 1, 'updated_at' => now_ms_utc(), 'device_id' => 'rhs-admin']);
        audit('facility.certificate_remove', $f['id'], $name, ['title' => $doc['title']]);
        flash('success', 'Certificate removed.');
        redirect($self . '#docs');
    }

    if ($do === 'code') {
        $tier = array_key_exists(post('tier'), PACKAGES) ? post('tier') : 'standard';
        $until = post('until');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $until)) { flash('error', 'Choose the end date for the code.'); redirect($self); }
        $licName = $f['license_facility'] ?: $f['name'];
        $generatedCode = ['code' => licence_code_for($licName, $until, PACKAGES[$tier]['devices']), 'tier' => $tier, 'until' => $until, 'name' => $licName];
        audit('licence.code_made', $f['id'], $name, ['package' => package_label($tier), 'until' => $until]);
        // shown below, not stored
    }
}

// ---- summaries (no patient details)
$one = function (string $sql, array $p) { $s = db()->prepare($sql); $s->execute($p); return $s->fetchColumn(); };
$fid = [$f['id']];
$products = (int)$one('SELECT COUNT(*) FROM products WHERE facility_id = ? AND deleted = 0', $fid);
$batches  = (int)$one('SELECT COUNT(*) FROM stock_batches WHERE facility_id = ? AND deleted = 0', $fid);
$salesAll = (int)$one('SELECT COUNT(*) FROM sales WHERE facility_id = ? AND deleted = 0', $fid);
$lastSale = $one('SELECT MAX(sale_date) FROM sales WHERE facility_id = ? AND deleted = 0', $fid);
$m = db()->prepare("SELECT DATE_FORMAT(CONVERT_TZ(sale_date, '+00:00', '+03:00'), '%Y-%m') AS ym, COUNT(*) AS n, SUM(total) AS total
                    FROM sales WHERE facility_id = ? AND deleted = 0 AND sale_date >= (UTC_TIMESTAMP() - INTERVAL 6 MONTH)
                    GROUP BY ym ORDER BY ym DESC");
$m->execute($fid); $months = $m->fetchAll();
$d = db()->prepare('SELECT id, label, device_code, added_date, last_seen_at, pending_count, rejected_count, app_version, deleted FROM devices WHERE facility_id = ? ORDER BY deleted, device_code');
$d->execute($fid); $devices = $d->fetchAll();
$u = db()->prepare('SELECT * FROM users WHERE facility_id = ? ORDER BY deleted, is_primary DESC, role, username'); // * : "position" exists only after database update 3
$u->execute($fid); $users = $u->fetchAll();
$pm = db()->prepare('SELECT * FROM admin_payments WHERE facility_id = ? ORDER BY paid_on DESC, id DESC LIMIT 10');
$pm->execute($fid); $payments = $pm->fetchAll();
$paidTotal = (float)$one('SELECT COALESCE(SUM(amount),0) FROM admin_payments WHERE facility_id = ? AND voided = 0', $fid);
$a = db()->prepare('SELECT * FROM admin_audit_log WHERE facility_id = ? ORDER BY id DESC LIMIT 20');
$a->execute($fid); $history = $a->fetchAll();

[$lbl, $tone] = licence_status($f);
[$srcLbl, $srcTone] = licence_source_info($f['license_source']);
$activeDevices = count(array_filter($devices, fn($x) => !$x['deleted']));
$docCount = count(facility_documents($f['id']) ?? []);
$userCount = count(array_filter($users, fn($x) => !$x['deleted']));
$tabs = [
    'overview' => ['Overview', 'grid', null],
    'licence'  => ['Licence & billing', 'card', null],
    'docs'     => ['Stamp & certificates', 'stamp', $docCount],
    'devices'  => ['Devices & logins', 'device', null],
    'history'  => ['History', 'history', null],
];
if (!isset($tabs[$tab])) $tab = 'overview';
$tabUrl = fn(string $t) => 'pharmacy.php?id=' . urlencode($f['id']) . ($t === 'overview' ? '' : '&tab=' . $t);
$phone = preg_replace('/[^\d+]/', '', (string)$f['contact']);

layout_start($name, 'pharmacies.php', ['back' => ['All facilities', 'pharmacies.php'], 'no_title' => true]);
?>
<?php if ($f['suspended']): ?><div class="alert alert-danger"><strong>Suspended:</strong> <?= h($f['suspended_reason']) ?></div><?php endif; ?>
<?php if ($dataReq = open_data_request($f['id'])): ?><div class="alert alert-warning"><strong>Data deletion requested</strong> by <?= h($dataReq['user_name'] ?: 'the super admin') ?> on <?= h(show_time($dataReq['created_at'])) ?>. Confirm with them on <strong><?= h($dataReq['contact']) ?></strong>, then <?= is_super() ? '<a href="#erase">erase the facility</a>' : 'ask an RHS super admin to erase it' ?>. See <a href="privacy.php">Privacy</a>.</div><?php endif; ?>

<section class="panel fac-head">
  <span class="fac-mark"><?php if (!empty($f['logo']) && str_starts_with($f['logo'], 'data:image/')): ?><img src="<?= h($f['logo']) ?>" alt=""><?php else: ?><?= h(admin_initials($name)) ?><?php endif; ?></span>
  <div>
    <h1 class="fac-name"><?= h($name) ?></h1>
    <p><?= h($f['location'] ?: '—') ?><?= $f['contact'] ? ' · ' . h($f['contact']) : '' ?><?= $f['email'] ? ' · ' . h($f['email']) : '' ?></p>
    <div class="badges"><?= badge($lbl, $tone) ?><?= $f['license_tier'] ? badge(package_label($f['license_tier']) . ' · ' . (int)$f['max_devices'] . ' devices', 'info') : '' ?><?= $f['license_expiry'] ? badge(($f['license_expiry'] < $today ? 'ended ' : 'ends ') . show_date($f['license_expiry'])) : '' ?><?= $f['suspended'] ? badge('Suspended', 'danger') : '' ?></div>
  </div>
  <div class="page-actions">
    <?php if ($phone): ?><a class="btn secondary" href="tel:<?= h($phone) ?>"><?= icon('phone') ?>Call</a><?php endif; ?>
    <a class="btn secondary" href="announcements.php?to=<?= h(urlencode($f['id'])) ?>#form"><?= icon('megaphone') ?>Message</a>
    <a class="btn cta" href="<?= h($tabUrl('licence')) ?>#renew"><?= icon('refresh') ?>Renew licence</a>
  </div>
</section>
<nav class="tabs-bar" aria-label="Facility sections">
  <?php foreach ($tabs as $k => [$label, $ic, $n]): ?>
    <a href="<?= h($tabUrl($k)) ?>" class="<?= $k === $tab ? 'active' : '' ?>" <?= $k === $tab ? 'aria-current="page"' : '' ?>><?= icon($ic) ?><?= h($label) ?><?= $n !== null && $n !== '' ? '<span class="tab-n">' . h((string)$n) . '</span>' : '' ?></a>
  <?php endforeach; ?>
</nav>

<?php if ($generatedCode): ?>
<section class="panel code-box">
  <h2><?= icon('key') ?>Activation code</h2>
  <p class="muted">Give this to <strong><?= h($name) ?></strong>. In the app: <em>System → Subscription → enter code</em>, with exactly these details:</p>
  <div class="code"><?= h($generatedCode['code']) ?></div>
  <p class="small">Facility name: <strong><?= h($generatedCode['name']) ?></strong> · Package: <strong><?= h(package_label($generatedCode['tier'])) ?></strong> · End date: <strong><?= h($generatedCode['until']) ?></strong></p>
  <p class="small subtle">Only use a code when the facility cannot get online. Otherwise, use Renew — no typing needed on their side.</p>
</section>
<?php endif; ?>

<?php if ($tab === 'overview'): ?>
<div class="stats">
  <?= stat_card('Licence', $lbl, $tone === 'success' ? 'success' : ($tone === 'danger' ? 'danger' : ($tone === 'warning' ? 'warning' : 'violet')), $f['license_expiry'] ? 'ends ' . show_date($f['license_expiry']) : 'none yet', $tabUrl('licence')) ?>
  <?= stat_card('Devices', $activeDevices . ' / ' . (int)$f['max_devices'], 'info', ($f['license_tier'] && !$f['license_trial'] ? package_label($f['license_tier']) . ' package' : 'free trial') . ' · ' . $userCount . ' logins', $tabUrl('devices')) ?>
  <?= stat_card('Sales recorded', number_format($salesAll), 'success', $lastSale ? 'last ' . time_ago($lastSale) : 'none yet') ?>
  <?= stat_card('Products', number_format($products), '', number_format($batches) . ' stock entries') ?>
</div>
<div class="cols">
<section class="panel" id="profile">
  <h2><?= icon('store') ?>Profile</h2>
  <?php if (!empty($f['logo']) && str_starts_with($f['logo'], 'data:image/')): ?><img class="fac-logo" src="<?= h($f['logo']) ?>" alt="Logo"><?php endif; ?>
  <dl class="facts">
    <dt>Name</dt><dd><?= h($name) ?><?= $f['slogan'] ? '<span class="sub">' . h($f['slogan']) . '</span>' : '' ?></dd>
    <dt>Location</dt><dd><?= h($f['location'] ?: '—') ?></dd>
    <dt>Phone</dt><dd><?= h($f['contact'] ?: '—') ?></dd>
    <dt>Email</dt><dd><?= h($f['email'] ?: '—') ?></dd>
    <dt>Registered</dt><dd><?= show_time($f['created_at']) ?></dd>
    <?php if (privacy_ready()): ?><dt>Privacy &amp; terms</dt><dd><?php if ($f['terms_version'] !== ''): ?><?= badge($f['terms_version'] === TERMS_VERSION_CURRENT ? 'Agreed' : 'Agreed to an older version', $f['terms_version'] === TERMS_VERSION_CURRENT ? 'success' : 'warning') ?><span class="sub"><?= h($f['terms_accepted_by'] ?: '—') ?> · <?= $f['terms_accepted_at'] ? h(show_time($f['terms_accepted_at'])) : '' ?> · version <?= h($f['terms_version']) ?></span><?php else: ?><?= badge('Not agreed yet', 'warning') ?><span class="sub">The super admin is asked in the app.</span><?php endif; ?></dd><?php endif; ?>
    <dt>Facility ID</dt><dd class="small subtle"><?= h($f['id']) ?></dd>
  </dl>
  <details class="edit-box">
    <summary>Edit profile (fallback)</summary>
    <p class="hint">The facility's <strong>super admin</strong> normally changes the profile in the app (Settings → Facility profile). Use this only as a fallback, e.g. when they lost access or typed a wrong email. It shows on their receipts and reports; their devices update on the next sync.</p>
    <form method="post" enctype="multipart/form-data" autocomplete="off">
      <?= csrf_field() ?><input type="hidden" name="do" value="profile"><input type="hidden" name="id" value="<?= h($f['id']) ?>">
      <div class="field"><label for="p_name">Facility name</label><input type="text" id="p_name" name="name" maxlength="200" value="<?= h($f['name']) ?>" required></div>
      <div class="field"><label for="p_slogan">Slogan <span class="subtle">(optional)</span></label><input type="text" id="p_slogan" name="slogan" maxlength="300" value="<?= h($f['slogan']) ?>"></div>
      <div class="field"><label for="p_location">Location</label><input type="text" id="p_location" name="location" maxlength="300" value="<?= h($f['location']) ?>" required></div>
      <div class="field"><label for="p_contact">Phone</label><input type="tel" id="p_contact" name="contact" maxlength="100" value="<?= h($f['contact']) ?>" required></div>
      <div class="field"><label for="p_email">Facility email</label><input type="email" id="p_email" name="email" maxlength="191" value="<?= h($f['email']) ?>" required></div>
      <div class="field"><label for="p_logo">New logo <span class="subtle">(JPG / PNG / WebP)</span></label><input type="file" id="p_logo" name="logo" accept="image/jpeg,image/png,image/webp"></div>
      <?php if (!empty($f['logo'])): ?><label class="check"><input type="checkbox" name="logo_remove" value="1"> Remove the current logo</label><?php endif; ?>
      <p class="hint">Changing the <strong>name</strong> or <strong>email</strong> also changes the facility's recovery password.</p>
      <button class="btn" type="submit"><?= icon('check') ?>Save profile</button>
    </form>
  </details>
</section>
<section class="panel">
  <h2><?= icon('shield') ?>Licence</h2>
  <dl class="facts">
    <dt>Status</dt><dd><?= badge($lbl, $tone) ?></dd>
    <dt>Ends</dt><dd><?= show_date($f['license_expiry']) ?></dd>
    <dt>Type</dt><dd><?= $f['license_expiry'] ? ($f['license_trial'] ? 'Free trial' : 'Paid') : '—' ?></dd>
    <dt>Licence name</dt><dd><?= h($f['license_facility'] ?: '—') ?></dd>
    <dt>Last change</dt><dd><?= $f['license_updated_at'] ? show_time($f['license_updated_at']) : '—' ?><span class="sub"><?= $srcTone ? badge($srcLbl, $srcTone) : h($srcLbl) ?></span></dd>
  </dl>
</section>
</div>
<section class="panel">
  <h2><?= icon('trend') ?>Sales by month</h2>
  <p class="small subtle">Totals only — patient details are never shown here.</p>
  <?php if (!$months): ?><div class="empty">No sales in the last 6 months.</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>Month</th><th class="num">Sales</th><th class="num">Value</th></tr></thead><tbody>
  <?php foreach ($months as $x): ?><tr><td><?= h(DateTime::createFromFormat('Y-m-d', $x['ym'] . '-01')->format('F Y')) ?></td><td class="num"><?= number_format((int)$x['n']) ?></td><td class="num"><?= money($x['total']) ?></td></tr><?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
</section>
<?php if (is_super()): ?>
<section class="panel danger-zone" id="erase">
  <h2><?= icon('trash') ?>Erase this facility's data</h2>
  <p class="small">Only when the facility asked for it (Privacy page) and you confirmed with them, or when it ended more than <?= KEEP_MONTHS_AFTER_END ?> months ago. <strong>This cannot be undone.</strong></p>
  <ul class="small">
    <li>Deleted from the server: profile, logins, devices, stock, sales and patient details, certificates, feedback.</li>
    <li>Kept: payments to RHS (tax records, without the phone number), the audit log, and the request.</li>
    <li>The facility's phones are logged out and can never upload this data again. Records still on those phones stay there.</li>
  </ul>
  <details class="edit-box">
    <summary>Erase <?= h($name) ?>…</summary>
    <form method="post" autocomplete="off" data-confirm="Permanently delete ALL of <?= h($name) ?>'s data? This cannot be undone.">
      <?= csrf_field() ?><input type="hidden" name="do" value="erase"><input type="hidden" name="id" value="<?= h($f['id']) ?>">
      <div class="field"><label for="confirm_name">Type the facility name to confirm: <strong><?= h($f['name']) ?></strong></label><input type="text" id="confirm_name" name="confirm_name" required></div>
      <div class="field"><label for="erase_note">Note for the audit log</label><input type="text" id="erase_note" name="note" maxlength="300" placeholder="e.g. Confirmed by phone with Jane on 2 Dec"></div>
      <button class="btn danger" type="submit"><?= icon('trash') ?>Erase all data</button>
    </form>
  </details>
</section>
<?php endif; ?>
<?php elseif ($tab === 'licence'): ?>
<section class="panel" id="renew">
  <h2><?= icon('refresh') ?>Renew or extend</h2>
  <form method="post" class="form-grid4" data-confirm="Change the licence for <?= h($name) ?>?">
    <?= csrf_field() ?><input type="hidden" name="do" value="renew"><input type="hidden" name="id" value="<?= h($f['id']) ?>">
    <div class="field"><label for="months">Add</label><select id="months" name="months">
      <option value="1">1 month (30 days)</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option></select>
      <div class="hint">From <?= (!$f['license_trial'] && $f['license_expiry'] > $today) ? 'the current end date' : 'today' ?>.</div></div>
    <div class="field"><label for="until">…or until this date</label><input type="date" id="until" name="until" min="<?= h($today) ?>"></div>
    <div class="field"><label for="tier">Package</label><select id="tier" name="tier">
      <?php foreach (PACKAGES as $k => $p): ?><option value="<?= $k ?>" <?= ($f['license_tier'] ?: 'standard') === $k ? 'selected' : '' ?>><?= h($p['label']) ?> (<?= $p['devices'] ?> devices)</option><?php endforeach; ?></select></div>
    <div class="field"><label for="devices">Devices allowed</label><input type="number" id="devices" name="devices" min="1" max="50" placeholder="package default">
      <div class="hint">Leave empty for the package's number.</div></div>
    <div class="field span2"><label for="note">Note for the audit log (optional)</label><input type="text" id="note" name="note" placeholder="e.g. Paid UGX 20,000 by MoMo, ref 12345"></div>
    <div class="field btn-cell"><button class="btn cta" type="submit"><?= icon('check') ?>Save licence</button></div>
  </form>
</section>
<?php if (!$f['license_expiry'] || $f['license_trial']): ?>
<section class="panel">
  <h2><?= icon('clock') ?>Extend free trial</h2>
  <p class="small muted">Keeps it a free trial. To turn it into a paid licence, use Renew above.</p>
  <form method="post" class="form-grid4" data-confirm="Extend the free trial for <?= h($name) ?>?">
    <?= csrf_field() ?><input type="hidden" name="do" value="trial"><input type="hidden" name="id" value="<?= h($f['id']) ?>">
    <div class="field"><label for="tdays">Add</label><select id="tdays" name="days">
      <?php foreach (TRIAL_EXTEND_DAYS as $n): ?><option value="<?= $n ?>" <?= $n === 14 ? 'selected' : '' ?>><?= $n ?> days</option><?php endforeach; ?></select>
      <div class="hint">From <?= ($f['license_trial'] && $f['license_expiry'] > $today) ? 'the current end date' : 'today' ?>.</div></div>
    <div class="field"><label for="tuntil">…or until this date</label><input type="date" id="tuntil" name="until" min="<?= h($today) ?>"></div>
    <div class="field span2"><label for="tnote">Note for the audit log (optional)</label><input type="text" id="tnote" name="note" placeholder="e.g. Testing the system with us"></div>
    <div class="field btn-cell"><button class="btn" type="submit"><?= icon('check') ?>Extend trial</button></div>
  </form>
</section>
<?php endif; ?>
<div class="cols">
<section class="panel">
  <h2><?= icon('card') ?>Change package only</h2>
  <form method="post" class="row" data-confirm="Change the package for <?= h($name) ?>?">
    <?= csrf_field() ?><input type="hidden" name="do" value="package"><input type="hidden" name="id" value="<?= h($f['id']) ?>">
    <div class="field grow mb0"><label for="tier2">Package</label><select id="tier2" name="tier">
      <?php foreach (PACKAGES as $k => $p): ?><option value="<?= $k ?>" <?= $f['license_tier'] === $k ? 'selected' : '' ?>><?= h($p['label']) ?> (<?= $p['devices'] ?> devices)</option><?php endforeach; ?></select></div>
    <div class="field mb0"><label for="devices2">Devices</label><input type="number" id="devices2" name="devices" min="1" max="50" placeholder="default"></div>
    <button class="btn secondary" type="submit">Change</button>
  </form>
  <p class="hint">The end date stays the same.</p>
</section>
<section class="panel">
  <h2><?= icon('key') ?>Offline activation code</h2>
  <p class="small muted">Only for a facility that cannot get online for a long time. Otherwise use Renew above.</p>
  <form method="post" class="row"><?= csrf_field() ?><input type="hidden" name="do" value="code"><input type="hidden" name="id" value="<?= h($f['id']) ?>">
    <div class="field mb0"><label for="ctier">Package</label><select id="ctier" name="tier"><?php foreach (PACKAGES as $k => $p): ?><option value="<?= $k ?>" <?= ($f['license_tier'] ?: 'standard') === $k ? 'selected' : '' ?>><?= h($p['label']) ?></option><?php endforeach; ?></select></div>
    <div class="field mb0"><label for="cuntil">End date</label><input type="date" id="cuntil" name="until" min="<?= h($today) ?>" required></div>
    <button class="btn secondary" type="submit"><?= icon('key') ?>Make code</button>
  </form>
</section>
</div>
<section class="panel">
  <div class="panel-head"><h2><?= icon('card') ?>Payments to RHS</h2><a class="btn small cta" href="payments.php?facility=<?= h(urlencode($f['id'])) ?>#record"><?= icon('plus') ?>Record a payment</a></div>
  <p class="small subtle">Total received: <strong><?= money($paidTotal) ?></strong></p>
  <?php if (!$payments): ?><div class="empty">No payments recorded yet.</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>Paid on</th><th class="num">Amount</th><th>Method</th><th>For</th></tr></thead><tbody>
  <?php foreach ($payments as $x): ?><tr class="<?= $x['voided'] ? 'voided' : '' ?>"><td class="nowrap"><?= show_date($x['paid_on']) ?></td><td class="num"><?= money($x['amount']) ?></td>
    <td><?= h(payment_method_label($x['method'])) ?><span class="sub"><?= h($x['reference']) ?></span></td>
    <td><?= h(payment_purpose_label($x['purpose'])) ?><?= $x['months'] ? ' · ' . (int)$x['months'] . ' mo' : '' ?><?= $x['voided'] ? ' ' . badge('voided', 'danger') : '' ?></td></tr><?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
</section>
<section class="panel danger-zone">
  <h2><?= icon('lock') ?><?= $f['suspended'] ? 'Lift suspension' : 'Suspend this facility' ?></h2>
  <?php if ($f['suspended']): ?>
    <form method="post" data-confirm="Let <?= h($name) ?> use the app again?"><?= csrf_field() ?><input type="hidden" name="do" value="unsuspend"><input type="hidden" name="id" value="<?= h($f['id']) ?>">
      <p class="small muted">Reason given: <?= h($f['suspended_reason']) ?></p>
      <button class="btn" type="submit">Lift suspension</button></form>
  <?php else: ?>
    <form method="post" data-confirm="Suspend <?= h($name) ?>? All their devices lock on their next sync."><?= csrf_field() ?><input type="hidden" name="do" value="suspend"><input type="hidden" name="id" value="<?= h($f['id']) ?>">
      <div class="field"><label for="reason">Reason (the facility sees this)</label><input type="text" id="reason" name="reason" maxlength="300" placeholder="e.g. Unpaid balance — call 0789 511736" required></div>
      <button class="btn danger" type="submit">Suspend facility</button></form>
    <p class="hint">Their records stay safe. The app opens again as soon as you lift it.</p>
  <?php endif; ?>
</section>
<?php elseif ($tab === 'docs'): ?>
<section class="panel" id="docs">
  <h2><?= icon('stamp') ?>Stamp &amp; certificates</h2>
  <?php $docs = facility_documents($f['id']); ?>
  <?php if ($docs === null || !array_key_exists('stamp', $f)): ?>
    <p class="alert alert-warning">Run <strong>database/update-3-stamp-certificates.sql</strong> on the database to see stamps and certificates.</p>
  <?php else: ?>
  <div class="stamp-box">
    <div class="stamp-paper"><?php if (!empty($f['stamp']) && str_starts_with($f['stamp'], 'data:image/')): ?><img src="<?= h($f['stamp']) ?>" alt="Stamp"><?php else: ?><span class="subtle small">No stamp</span><?php endif; ?></div>
    <div>
      <p class="small muted">Printed on the facility's receipts and reports. Their super admin can change it in the app (Settings → Stamp &amp; certificates).<?= !empty($f['stamp_updated_at']) ? ' Last changed ' . h(show_time($f['stamp_updated_at'])) . '.' : '' ?></p>
      <form method="post" enctype="multipart/form-data" class="inline-upload">
        <?= csrf_field() ?><input type="hidden" name="do" value="stamp"><input type="hidden" name="id" value="<?= h($f['id']) ?>">
        <input type="file" name="stamp" accept="image/jpeg,image/png,image/webp" aria-label="Stamp picture">
        <button class="btn small" type="submit"><?= icon('check') ?><?= empty($f['stamp']) ? 'Upload stamp' : 'Replace' ?></button>
      </form>
      <?php if (!empty($f['stamp'])): ?>
      <form method="post" data-confirm="Remove the stamp of <?= h($name) ?>?">
        <?= csrf_field() ?><input type="hidden" name="do" value="stamp"><input type="hidden" name="id" value="<?= h($f['id']) ?>"><input type="hidden" name="stamp_remove" value="1">
        <button class="btn small secondary" type="submit">Remove stamp</button>
      </form>
      <?php endif; ?>
    </div>
  </div>

  <div class="panel-head mt">
    <h3 class="mb0">Operational certificates <span class="subtle small">(<?= count($docs) ?>)</span></h3>
    <?php if (count($docs) > 1 && class_exists('ZipArchive')): ?>
      <a class="btn small secondary" href="document.php?f=<?= h(urlencode($f['id'])) ?>&amp;all=1" download><?= icon('download') ?>Download all (.zip)</a>
    <?php endif; ?>
  </div>
  <?php if (!$docs): ?><p class="small muted">None uploaded yet.</p><?php else: ?>
  <div class="table-wrap"><table>
    <thead><tr><th>Certificate</th><th>Valid until</th><th>Added</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($docs as $d): $over = $d['valid_until'] && $d['valid_until'] < $today; ?>
      <tr>
        <td><strong><?= h($d['title'] ?: $d['file_name']) ?></strong><span class="sub small subtle"><?= $d['mime'] === 'application/pdf' ? 'PDF' : 'Picture' ?> · <?= h(file_size_text((int)$d['size_bytes'])) ?><?= $d['uploaded_by'] ? ' · by ' . h($d['uploaded_by']) : '' ?></span></td>
        <td><?= $d['valid_until'] ? ($over ? badge('Expired ' . show_date($d['valid_until']), 'danger') : h(show_date($d['valid_until']))) : '<span class="subtle">—</span>' ?></td>
        <td class="small"><?= h(show_time($d['created_at'], false)) ?></td>
        <td class="nowrap">
          <a class="btn small secondary" href="document.php?f=<?= h(urlencode($f['id'])) ?>&amp;d=<?= h(urlencode($d['id'])) ?>" target="_blank" rel="noopener">Open</a>
          <a class="btn small secondary" href="document.php?f=<?= h(urlencode($f['id'])) ?>&amp;d=<?= h(urlencode($d['id'])) ?>&amp;download=1" download><?= icon('download') ?>Download</a>
          <form method="post" class="inline" data-confirm="Remove this certificate?">
            <?= csrf_field() ?><input type="hidden" name="do" value="doc_delete"><input type="hidden" name="id" value="<?= h($f['id']) ?>"><input type="hidden" name="doc_id" value="<?= h($d['id']) ?>">
            <button class="btn small danger" type="submit">Remove</button>
          </form>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <?php endif; ?>
  <details class="edit-box">
    <summary>Add a certificate</summary>
    <form method="post" enctype="multipart/form-data" class="form-grid4">
      <?= csrf_field() ?><input type="hidden" name="do" value="doc_add"><input type="hidden" name="id" value="<?= h($f['id']) ?>">
      <div class="field span2"><label for="d_file">File <span class="subtle">(PDF or picture, up to 2 MB)</span></label><input type="file" id="d_file" name="doc" accept="application/pdf,image/jpeg,image/png,image/webp" required></div>
      <div class="field"><label for="d_title">Name <span class="subtle">(optional)</span></label><input type="text" id="d_title" name="title" maxlength="200" placeholder="e.g. NDA licence 2026"></div>
      <div class="field"><label for="d_valid">Valid until <span class="subtle">(optional)</span></label><input type="date" id="d_valid" name="valid_until"></div>
      <div class="field btn-cell"><button class="btn" type="submit"><?= icon('check') ?>Add certificate</button></div>
    </form>
  </details>
  <?php endif; ?>
</section>
<?php elseif ($tab === 'devices'): ?>
<div class="cols">
<section class="panel">
  <h2><?= icon('device') ?>Devices</h2>
  <?php if (!$devices): ?><div class="empty">No devices yet.</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>Device</th><th>Last sync</th><th>Health</th><th></th></tr></thead><tbody>
  <?php foreach ($devices as $x): ?><tr><td><?= badge($x['device_code'], 'info') ?> <?= h($x['label']) ?><?= $x['deleted'] ? ' ' . badge('removed') : '' ?>
      <span class="sub">added <?= show_date($x['added_date']) ?><?= $x['app_version'] ? ' · app ' . h($x['app_version']) : '' ?></span></td>
    <td class="nowrap"><?= h(time_ago($x['last_seen_at'])) ?></td>
    <td><?= $x['deleted'] ? '' : ((int)$x['rejected_count'] ? badge($x['rejected_count'] . ' refused', 'danger') . ' ' : '') . ((int)$x['pending_count'] ? badge($x['pending_count'] . ' waiting', 'warning') : ((int)$x['rejected_count'] ? '' : badge('OK', 'success'))) ?></td>
    <td><?php if (!$x['deleted']): ?><form method="post" data-confirm="Remove “<?= h($x['label']) ?>”? It is logged out at once and its slot is freed. Records it has not sent yet stay on that device."><?= csrf_field() ?>
      <input type="hidden" name="do" value="remove_device"><input type="hidden" name="id" value="<?= h($f['id']) ?>"><input type="hidden" name="device_id" value="<?= h($x['id']) ?>">
      <button class="btn small danger-soft" type="submit">Remove</button></form><?php endif; ?></td></tr><?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
  <p class="hint">“Waiting” = records still on the device, not yet sent. “Refused” = records the server could not accept (contact the developer).</p>
</section>

<section class="panel">
  <h2><?= icon('users') ?>Logins</h2>
  <?php if (!$users): ?><div class="empty">No logins yet.</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>Name</th><th>Reset forgotten password</th></tr></thead><tbody>
  <?php foreach ($users as $x): ?><tr><td><?= h($x['full_name'] ?: $x['username']) ?> <?= $x['role'] === 'owner' ? badge($x['is_primary'] ? 'Super admin' : 'Admin', 'violet') : badge('Staff') ?><?= $x['deleted'] ? ' ' . badge('removed') : '' ?>
      <span class="sub">@<?= h($x['username']) ?><?= $x['contact'] ? ' · ' . h($x['contact']) : '' ?></span>
      <?php $job = array_filter([$x['position'] ?? '', $x['cadre'] ?? '']); if ($job): ?><span class="sub"><?= h(implode(' · ', $job)) ?></span><?php endif; ?>
      <?php if ($x['role'] === 'owner' && !$x['is_primary'] && array_key_exists('permissions', $x)): ?><span class="sub">Allowed: <?= h($x['permissions'] !== '' ? str_replace(',', ', ', $x['permissions']) : 'basic access only') ?></span><?php endif; ?></td>
    <td><?php if (!$x['deleted']): ?><form method="post" class="row" data-confirm="Set a new password for @<?= h($x['username']) ?>?"><?= csrf_field() ?>
      <input type="hidden" name="do" value="reset_user"><input type="hidden" name="id" value="<?= h($f['id']) ?>"><input type="hidden" name="user_id" value="<?= h($x['id']) ?>">
      <input type="text" name="password" class="pw-inline" placeholder="New password" minlength="6" autocomplete="off" required>
      <button class="btn small secondary" type="submit">Set</button></form><?php endif; ?></td></tr><?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
</section>
</div>
<?php else: ?>
<section class="panel">
  <h2><?= icon('history') ?>History</h2>
  <?php if (!$history): ?><div class="empty">No admin actions for this facility yet.</div><?php else: ?>
  <div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>
  <?php foreach ($history as $x): $det = $x['details'] ? json_decode($x['details'], true) : []; ?>
    <tr><td class="nowrap"><?= show_time($x['created_at']) ?></td><td><?= h($x['admin_email']) ?></td>
      <td><?= badge($x['action'], str_contains($x['action'], 'refused') ? 'danger' : '') ?>
        <span class="sub"><?= h(implode(' · ', array_map(fn($k, $v) => str_replace('_', ' ', $k) . ': ' . (is_scalar($v) ? $v : json_encode($v)), array_keys($det ?: []), $det ?: []))) ?></span></td></tr>
  <?php endforeach; ?></tbody></table></div><?php endif; ?>
  <p class="small"><a href="audit.php">Full audit log →</a></p>
</section>
<?php endif; ?>
<?php
layout_end();

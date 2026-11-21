<?php
// Page frame: sidebar menu, top bar, flash messages. Pages call layout_start() ... layout_end().
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }

// Menu groups: [group label, [[file, label, icon, super-only], ...]]
function nav_groups(): array {
    return [
        ['Overview',    [['index.php', 'Dashboard', 'grid', false]]],
        ['Facilities',  [['pharmacies.php', 'Facilities', 'store', false],
                         ['payments.php', 'Payments', 'card', false],
                         ['reports.php', 'Reports', 'report', false]]],
        ['Help & news', [['support.php', 'Support', 'alert', false],
                         ['announcements.php', 'Messages', 'megaphone', false]]],
        ['RHS',         [['team.php', 'Admin team', 'users', true],
                         ['settings.php', 'Settings', 'gear', true],
                         ['audit.php', 'Audit log', 'list', false]]],
    ];
}
// Kept for older callers: every menu item in one list.
function nav_items(): array {
    $all = [];
    foreach (nav_groups() as [, $items]) foreach ($items as $i) $all[] = $i;
    $all[] = ['account.php', 'My account', 'user', false];
    return $all;
}

function icon(string $name): string {
    $p = [
        'grid'  => '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        'users' => '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        'list'  => '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
        'user'  => '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 16 0v1"/>',
        'logout'=> '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
        'menu'  => '<path d="M3 6h18M3 12h18M3 18h18"/>',
        'store' => '<path d="M3 9 4.5 4h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M9 20v-6h6v6"/>',
        'alert' => '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
        'phone' => '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
        'clock' => '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        'check' => '<path d="M20 6 9 17l-5-5"/>',
        'plus'  => '<path d="M12 5v14M5 12h14"/>',
        'key'   => '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
        'megaphone' => '<path d="m3 11 15-6v14L3 13z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
        'gear'  => '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
        'chart' => '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
        'search'=> '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
        'card'  => '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
        'arrow' => '<path d="M5 12h14M13 6l6 6-6 6"/>',
        'back'  => '<path d="M19 12H5M11 18l-6-6 6-6"/>',
        'mail'  => '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
        'cal'   => '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
        'stamp' => '<path d="M5 22h14"/><path d="M19.3 13.7A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.7-.3-1.3-.7-1.8Z"/><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"/>',
        'shield'=> '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        'refresh'=> '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
        'lock'  => '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        'trend' => '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
        'device'=> '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
        'history'=> '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
        'report'=> '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h2M8 17h2M14 13h2M14 17h2"/>',
    ][$name] ?? '';
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $p . '</svg>';
}

// $opts: 'sub' => line under the title, 'actions' => HTML buttons on the right of the title,
//        'back' => [label, href] link above the title, 'no_title' => the page shows its own heading.
function layout_start(string $title, string $active, array $opts = []): void {
    $a = current_admin();
    $self = basename($_SERVER['SCRIPT_NAME'] ?? '');
    $newSignups = $a ? new_signups_count($a) : 0;
    $today = (new DateTime('now', new DateTimeZone(config()['timezone'] ?? 'Africa/Kampala')))->format('D j M Y');
    ?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#071A45">
<title><?= h($title) ?> · RHS Admin</title>
<link rel="icon" href="assets/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/admin.css?v=5">
<script src="assets/admin.js?v=5" defer></script>
</head>
<body class="<?= $a ? 'signed-in' : 'signed-out' ?>">
<?php if ($a): ?>
<input type="checkbox" id="navToggle" class="nav-toggle" aria-hidden="true">
<div class="shell">
  <aside class="sidebar">
    <a class="brand" href="index.php"><img src="assets/logo.png" alt=""><div><strong>RHS Admin</strong><span>Reality Health Bridge</span></div></a>
    <nav class="nav" aria-label="Main menu">
      <?php foreach (nav_groups() as [$group, $items]):
        $items = array_filter($items, fn($i) => !$i[3] || $a['role'] === 'super');
        if (!$items) continue; ?>
        <div class="nav-group"><span class="nav-label"><?= h($group) ?></span>
        <?php foreach ($items as [$file, $label, $ic]): $on = $file === $self || $file === $active; ?>
          <a href="<?= h($file) ?>" class="<?= $on ? 'active' : '' ?>" <?= $on ? 'aria-current="page"' : '' ?>><?= icon($ic) ?><span><?= h($label) ?></span><?php if ($file === 'pharmacies.php' && $newSignups): ?><span class="nav-count" title="New sign-ups"><?= $newSignups ?> new</span><?php endif; ?></a>
        <?php endforeach; ?></div>
      <?php endforeach; ?>
    </nav>
    <div class="side-user">
      <a class="who <?= $self === 'account.php' ? 'active' : '' ?>" href="account.php" title="My account">
        <span class="avatar"><?= h(admin_initials($a['full_name'] ?: $a['email'])) ?></span>
        <span class="who-txt"><strong><?= h($a['full_name'] ?: $a['email']) ?></strong><span class="role-chip <?= $a['role'] === 'super' ? 'super' : '' ?>"><?= $a['role'] === 'super' ? 'Super admin' : 'Support staff' ?></span></span>
      </a>
      <form method="post" action="logout.php"><?= csrf_field() ?><button class="side-btn" type="submit"><?= icon('logout') ?>Log out</button></form>
    </div>
  </aside>
  <label for="navToggle" class="nav-scrim" aria-hidden="true"></label>
  <div class="main">
    <header class="topbar">
      <label for="navToggle" class="menu-btn" aria-label="Open menu"><?= icon('menu') ?></label>
      <form class="top-search" method="get" action="pharmacies.php" role="search">
        <?= icon('search') ?><input type="search" name="q" placeholder="Find a facility — name, phone, email, place" aria-label="Find a facility" value="<?= $self === 'pharmacies.php' ? h(get('q')) : '' ?>">
      </form>
      <span class="top-date"><?= h($today) ?></span>
    </header>
    <main class="content">
      <div class="page-head <?= !empty($opts['no_title']) ? 'slim' : '' ?>">
        <div class="page-head-txt">
          <?php if (!empty($opts['back'])): ?><a class="back-link" href="<?= h($opts['back'][1]) ?>"><?= icon('back') ?><?= h($opts['back'][0]) ?></a><?php endif; ?>
          <?php if (empty($opts['no_title'])): ?><h1><?= h($title) ?></h1><?php endif; ?>
          <?php if (!empty($opts['sub'])): ?><p><?= $opts['sub'] ?></p><?php endif; ?>
        </div>
        <?php if (!empty($opts['actions'])): ?><div class="page-actions"><?= $opts['actions'] ?></div><?php endif; ?>
      </div>
<?php else: ?>
<div class="auth-wrap"><main class="auth-card">
  <div class="brand auth-brand"><img src="assets/logo.png" alt=""><div><strong>RHS Admin</strong><span>Reality Health Bridge · REALITY HEALTH SYSTEM</span></div></div>
<?php endif;
    foreach (take_flashes() as [$type, $msg]) echo '<div class="alert alert-' . h($type) . '" role="status">' . h($msg) . '</div>';
}
function admin_initials(string $name): string {
    $parts = preg_split('/[\s@.]+/', trim($name), -1, PREG_SPLIT_NO_EMPTY) ?: ['?'];
    return mb_strtoupper(mb_substr($parts[0], 0, 1) . (count($parts) > 1 ? mb_substr(end($parts), 0, 1) : ''));
}

function layout_end(): void {
    if (current_admin()) echo "    </main>\n  </div>\n</div>\n";
    else echo "</main></div>\n";
    echo "</body>\n</html>\n";
}

// Small building blocks
function stat_card(string $label, $value, string $tone = '', string $sub = '', string $href = ''): string {
    $isText = !preg_match('/^[\d,.\s]+$/', (string)$value);
    $inner = '<div class="stat-label">' . h($label) . '</div><div class="stat-value' . ($isText ? ' text' : '') . '">' . h($value) . '</div>' . ($sub !== '' ? '<div class="stat-sub">' . h($sub) . '</div>' : '');
    return $href ? '<a class="stat ' . h($tone) . '" href="' . h($href) . '">' . $inner . '</a>' : '<div class="stat ' . h($tone) . '">' . $inner . '</div>';
}
function badge(string $text, string $tone = ''): string { return '<span class="badge ' . h($tone) . '">' . h($text) . '</span>'; }

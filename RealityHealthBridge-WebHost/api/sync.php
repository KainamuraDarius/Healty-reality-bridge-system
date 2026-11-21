<?php
// POST /api/sync.php   (needs the token: header "Authorization: Bearer <token>")
//
// One call does both directions:
//  1) PUSH - "changes" holds this device's records that are waiting to upload (synced = 0).
//     Each one is saved by id: new id -> inserted; known id -> updated only if the incoming
//     updated_at is newer. Sending the same record twice never makes a duplicate.
//     "saved" lists every id the device may now mark synced = 1 (this includes records the
//     server already had a newer copy of - the newer copy comes back in "changes").
//     "rejected" lists records that can never be saved (bad data / another pharmacy), with why.
//  2) PULL - "since" is the highest server_seq this device has. The reply has every row of
//     this pharmacy with a higher server_seq (from all devices), at most 500 per call.
//     Store "server_seq" from the reply and send it as "since" next time. If "more" is true,
//     call again straight away.
//
// Request:  { since: 0, changes: { products: [ {...}, ... ], sales: [...], ... } }
//           users rows may include "login_key" when the password was set or changed.
// Response: { ok, saved: {table: [ids]}, rejected: {table: [{id, reason}]},
//             changes: {table: [rows]}, server_seq, more, server_time }
require_once __DIR__ . '/lib.php';

$body = start_request();
$auth = require_auth();
$facilityId = $auth['facility_id'];
$tokenDevice = $auth['device_id'];
// WHO made a change to people, the profile, the stamp or certificates. A phone is often shared,
// so the device's own login says nothing about who used it: each such row carries act_by (user id)
// + act_key (made from that person's password like the login key), checked here against the
// stored password_hash. A users row may instead prove itself with its own login_key.
$actorCache = [];
$pendingKeys = []; // user id => new login keys sent in this same request (password just changed)
function find_actor(string $facilityId, $userId, $key): ?array {
    global $actorCache, $pendingKeys;
    if (!is_string($userId) || !valid_login_key($key)) return null;
    $k = $userId . '|' . $key;
    if (array_key_exists($k, $actorCache)) return $actorCache[$k];
    $s = db()->prepare('SELECT * FROM users WHERE id = ? AND facility_id = ? AND deleted = 0');
    $s->execute([$userId, $facilityId]);
    $u = $s->fetch() ?: null;
    $okKey = $u && (($u['password_hash'] && password_verify($key, $u['password_hash'])) || in_array($key, $pendingKeys[$userId] ?? [], true));
    return $actorCache[$k] = $okKey ? $u : null;
}
function actor_of_row(string $facilityId, string $table, array $row): ?array {
    $a = find_actor($facilityId, $row['act_by'] ?? null, $row['act_key'] ?? null);
    if (!$a && $table === 'users') $a = find_actor($facilityId, $row['id'] ?? null, $row['login_key'] ?? null);
    return $a;
}
// A person who changes their own password and then, offline, something else: the later rows carry
// the NEW key. Accept it when this request also holds their (verified) password change.
foreach (($body['changes']['users'] ?? []) as $r) {
    if (!is_array($r) || !valid_login_key($r['login_key'] ?? null) || !is_string($r['id'] ?? null)) continue;
    $a = find_actor($facilityId, $r['act_by'] ?? null, $r['act_key'] ?? null);
    if ($a && ($a['id'] === $r['id'] || (int)$a['is_primary'] === 1)) $pendingKeys[$r['id']][] = $r['login_key'];
}
$tables = sync_tables();

// How this device is doing (shown on the RHS admin site's Support page). Never blocks the sync.
$st = $body['device_status'] ?? null;
if (is_array($st)) {
    try {
        db()->prepare('UPDATE devices SET pending_count = ?, rejected_count = ?, app_version = ? WHERE id = ? AND facility_id = ?')
            ->execute([max(0, (int)($st['pending'] ?? 0)), max(0, (int)($st['rejected'] ?? 0)), mb_substr((string)($st['app_version'] ?? ''), 0, 20), $tokenDevice, $facilityId]);
    } catch (Throwable $e) { /* database update 2 not run yet: ignore */ }
}

$since = $body['since'] ?? 0;
if (!is_numeric($since) || $since < 0) fail(400, 'bad_since', '"since" must be a number.');
$since = (int)$since;

$changes = $body['changes'] ?? [];
if (!is_array($changes)) fail(400, 'bad_changes', '"changes" must be an object.');
$total = 0;
foreach ($changes as $t => $rows) {
    if (!isset($tables[$t])) fail(400, 'bad_table', "Unknown table: $t");
    if (!is_array($rows)) fail(400, 'bad_changes', "\"$t\" must be a list.");
    $total += count($rows);
}
if ($total > MAX_ROWS_PER_PUSH) fail(413, 'too_many_rows', 'Send at most ' . MAX_ROWS_PER_PUSH . ' records per call.');

$pdo = db();
$saved = [];
$rejected = [];

// ---------------------------- PUSH ----------------------------
if ($total > 0) {
    $pdo->beginTransaction();
    lock_counter();
    foreach ($tables as $table => $_spec) {
        foreach ($changes[$table] ?? [] as $row) {
            $id = is_array($row) && is_string($row['id'] ?? null) ? $row['id'] : null;
            [$cols, $err] = normalize_row($table, $row, $facilityId, $tokenDevice);
            if (!$cols) { $rejected[$table][] = ['id' => $id, 'reason' => $err]; continue; }

            if ($table === 'facilities' && $cols['id'] !== $facilityId) {
                $rejected[$table][] = ['id' => $id, 'reason' => 'another facility']; continue;
            }

            $s = $pdo->prepare("SELECT " . (in_array($table, ['facilities', 'users'], true) ? '*' : 'facility_id, updated_at') . " FROM `$table` WHERE id = ? FOR UPDATE");
            $s->execute([$cols['id']]);
            $existing = $s->fetch();

            if ($existing && $existing['facility_id'] !== $facilityId) {
                $rejected[$table][] = ['id' => $id, 'reason' => 'another facility']; continue;
            }

            if ($table === 'devices') {
                // Devices are only created by login/register. Here a device may rename or remove one.
                if (!$existing) { $rejected[$table][] = ['id' => $id, 'reason' => 'unknown device']; continue; }
                $cols = array_intersect_key($cols, array_flip(['label', 'deleted', 'updated_at', 'device_id']));
                if ($cols['updated_at'] > $existing['updated_at']) {
                    update_row('devices', $id, $cols);
                    if ($cols['deleted']) {
                        $pdo->prepare('UPDATE api_tokens SET revoked = 1 WHERE device_id = ? AND facility_id = ?')->execute([$id, $facilityId]);
                    }
                }
                $saved[$table][] = $id;
                continue;
            }

            if ($table === 'users') {
                // An older app version does not send these columns: keep what the server has.
                foreach (['position', 'permissions'] as $c) if ($existing && !array_key_exists($c, $row)) $cols[$c] = $existing[$c];
                $actor = actor_of_row($facilityId, 'users', $row);
                if (!$actor) { $rejected[$table][] = ['id' => $id, 'reason' => 'log in again to change people']; continue; }
                [$cols, $why] = check_user_change($actor, $existing ?: null, $cols);
                if (!$cols) { $rejected[$table][] = ['id' => $id, 'reason' => $why]; continue; }
                if (valid_login_key($row['login_key'] ?? null)) $cols['password_hash'] = password_hash($row['login_key'], PASSWORD_DEFAULT);
            }

            if ($table === 'facilities') {
                // Profile and licence are merged separately (see merge_facility in lib.php).
                $actor = actor_of_row($facilityId, 'facilities', $row);
                $merged = merge_facility($existing, $cols, $actor && (int)$actor['is_primary'] === 1);
                if ($merged) update_row('facilities', $cols['id'], $merged);
                $saved[$table][] = $cols['id'];
                continue;
            }

            if ($table === 'facility_documents') {
                $actor = actor_of_row($facilityId, $table, $row);
                if (!$actor || (int)$actor['is_primary'] !== 1) { $rejected[$table][] = ['id' => $id, 'reason' => 'only the super admin can change certificates']; continue; }
            }

            if (!$existing) {
                insert_row($table, $cols);
            } elseif ($cols['updated_at'] > $existing['updated_at']) {
                update_row($table, $cols['id'], $cols);
            }
            // else: the server already has a newer copy. Still "saved" - the device gets
            // the newer copy in the pull below.
            $saved[$table][] = $cols['id'];
        }
    }
    $pdo->commit();
}

// ---------------------------- PULL ----------------------------
$all = [];
$cutoff = null; // a table with big rows (certificates) that had more waiting: stop the reply at its last row
foreach ($tables as $table => $_spec) {
    $limit = PULL_LIMITS[$table] ?? PULL_LIMIT;
    $s = $pdo->prepare("SELECT * FROM `$table` WHERE facility_id = ? AND server_seq > ? ORDER BY server_seq LIMIT " . ($limit + 1));
    $s->execute([$facilityId, $since]);
    $rows = $s->fetchAll();
    if (count($rows) > $limit && $limit < PULL_LIMIT) {
        $rows = array_slice($rows, 0, $limit);
        $last = (int)$rows[$limit - 1]['server_seq'];
        $cutoff = $cutoff === null ? $last : min($cutoff, $last);
    }
    foreach ($rows as $r) $all[] = [(int)$r['server_seq'], $table, $r];
}
usort($all, fn($a, $b) => $a[0] <=> $b[0]);
$more = count($all) > PULL_LIMIT;
if ($cutoff !== null) {
    // rows after the cut are sent next time, so nothing between them is skipped
    $all = array_values(array_filter($all, fn($x) => $x[0] <= $cutoff));
    $more = true;
}
$all = array_slice($all, 0, PULL_LIMIT);

$out = [];
$cursor = $since;
foreach ($all as [$seq, $table, $r]) {
    $out[$table][] = row_to_json($table, $r);
    $cursor = $seq;
}

$reply = [
    'ok' => true,
    'saved' => (object)$saved,
    'rejected' => (object)$rejected,
    'changes' => (object)$out,
    'server_seq' => $cursor,
    'more' => $more,
    'server_time' => to_iso(now_ms()),
];
// Messages from RHS for this pharmacy (left out if the admin site is not installed yet).
if ($GLOBALS['sync_notices']) $reply['notices'] = array_values(array_unique($GLOBALS['sync_notices']));
$news = announcements_for($facilityId);
if ($news !== null) $reply['announcements'] = $news;
send_json(200, $reply);

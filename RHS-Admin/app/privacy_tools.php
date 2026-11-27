<?php
// Privacy: which facilities agreed to the privacy policy and terms, requests to delete a facility's
// data (sent by the facility's super admin from the app: Settings -> Privacy), and erasing a facility.
// The policy promises: delete within 30 days of confirming a request, and delete facilities
// 12 months after their subscription or trial ended (privacy.html section 9).
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }

const TERMS_VERSION_CURRENT = '2026-11-27'; // must match TERMS_VERSION in the app's api/lib.php
const KEEP_MONTHS_AFTER_END = 12;           // privacy.html: kept 12 months after the subscription ends

// True once the app's database update 7 was run.
function privacy_ready(): bool {
    static $ok = null;
    if ($ok === null) {
        try { db()->query('SELECT terms_version FROM facilities LIMIT 0'); db()->query('SELECT 1 FROM data_requests LIMIT 0'); $ok = true; }
        catch (Throwable $e) { $ok = false; }
    }
    return $ok;
}
function open_privacy_count(): int {
    if (!privacy_ready()) return 0;
    try { return (int)db()->query("SELECT COUNT(*) FROM data_requests WHERE status = 'open'")->fetchColumn(); }
    catch (Throwable $e) { return 0; }
}
function open_data_request(string $facilityId): ?array {
    if (!privacy_ready()) return null;
    $s = db()->prepare("SELECT * FROM data_requests WHERE facility_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1");
    $s->execute([$facilityId]);
    return $s->fetch() ?: null;
}

// Permanently erase a facility's data from the server. Cannot be undone.
//  - Deleted: profile details, logins, devices and their keys, stock, sales (with patient details),
//    payments recorded on sales, certificates, feedback, targeted messages.
//  - Kept: a blank "erased" row with the same id, so the facility's old phones cannot upload the
//    data again (registering that id is refused); payments to RHS (tax law), with the phone number
//    removed; the audit log; the deletion request itself, as proof it was done.
// Returns how many rows were deleted per table.
function erase_facility(array $f, string $by): array {
    $id = $f['id'];
    $pdo = db();
    $counts = [];
    $pdo->beginTransaction();
    try {
        $pdo->query('SELECT value FROM sync_counter WHERE id = 1 FOR UPDATE')->fetch();
        foreach (['sale_items', 'sale_payments', 'sales', 'adjustments', 'stock_batches', 'products',
                  'facility_documents', 'api_tokens', 'devices', 'users'] as $t) {
            $s = $pdo->prepare("DELETE FROM `$t` WHERE facility_id = ?");
            $s->execute([$id]);
            $counts[$t] = $s->rowCount();
        }
        // Tables that exist only after later database updates.
        foreach (['app_feedback' => 'DELETE FROM app_feedback WHERE facility_id = ?',
                  'announcement_targets' => 'DELETE FROM announcement_targets WHERE facility_id = ?',
                  'payment_requests' => "UPDATE payment_requests SET phone = '' WHERE facility_id = ?"] as $t => $sql) {
            if (!$pdo->query("SHOW TABLES LIKE " . $pdo->quote($t))->fetch()) continue;
            $s = $pdo->prepare($sql);
            $s->execute([$id]);
            $counts[$t] = $s->rowCount();
        }
        $pdo->exec('UPDATE sync_counter SET value = LAST_INSERT_ID(value + 1) WHERE id = 1');
        $seq = (int)$pdo->lastInsertId();
        $cols = ['name' => 'Erased facility', 'slogan' => '', 'location' => '', 'contact' => '', 'email' => '', 'logo' => null,
                 'license_facility' => '', 'license_code' => '', 'suspended' => 1,
                 'suspended_reason' => "This facility's data was deleted at its request.", 'deleted' => 1,
                 'updated_at' => now_ms_utc(), 'server_seq' => $seq];
        if (array_key_exists('stamp', $f)) $cols['stamp'] = null;
        if (array_key_exists('terms_accepted_by', $f)) $cols['terms_accepted_by'] = '';
        $set = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($cols)));
        $pdo->prepare("UPDATE facilities SET $set WHERE id = ?")->execute([...array_values($cols), $id]);
        if (privacy_ready()) {
            $pdo->prepare("UPDATE data_requests SET status = 'done', handled_by = ?, handled_at = ?, admin_note = 'Data erased' WHERE facility_id = ? AND status = 'open'")
                ->execute([$by, now_ms_utc(), $id]);
        }
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    return $counts;
}

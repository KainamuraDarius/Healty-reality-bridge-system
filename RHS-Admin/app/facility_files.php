<?php
// A facility's digital stamp and operational certificates (uploaded from the app, or here by RHS).
// Limits must match the app's api/lib.php: certificate files up to 2 MB, stamp up to 400 KB.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }

const ADMIN_DOC_MAX_BYTES   = 2 * 1024 * 1024;
const ADMIN_STAMP_MAX_BYTES = 400 * 1024;
const ADMIN_DOC_TYPES       = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// The real type of an uploaded file, from its contents (never from the name the browser sent).
function uploaded_mime(string $tmp): ?string {
    $head = (string)file_get_contents($tmp, false, null, 0, 8);
    if (str_starts_with($head, '%PDF-')) return 'application/pdf';
    $info = @getimagesize($tmp);
    $map = [IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png', IMAGETYPE_WEBP => 'image/webp'];
    return $info && isset($map[$info[2]]) ? $map[$info[2]] : null;
}
function upload_ok(string $field): ?string {
    $f = $_FILES[$field] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) return null;
    return $f['tmp_name'];
}

// Stamp picture -> [dataUrl, error]. With GD: shrunk to 420 px, white paper made see-through
// (like the app does). Without GD: a PNG / JPG / WebP up to 400 KB is kept as it is.
function stamp_from_upload(string $tmp): array {
    $mime = uploaded_mime($tmp);
    if (!$mime || $mime === 'application/pdf') return [null, 'The stamp must be a JPG, PNG or WebP picture.'];
    if (function_exists('imagecreatefromstring') && ($img = @imagecreatefromstring((string)file_get_contents($tmp)))) {
        $w = imagesx($img); $hgt = imagesy($img); $k = min(1, 420 / max($w, $hgt));
        $nw = max(1, (int)round($w * $k)); $nh = max(1, (int)round($hgt * $k));
        $out = imagecreatetruecolor($nw, $nh);
        imagealphablending($out, false); imagesavealpha($out, true);
        imagefill($out, 0, 0, imagecolorallocatealpha($out, 255, 255, 255, 127));
        imagealphablending($out, true);
        imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $w, $hgt);
        imagealphablending($out, false);
        for ($y = 0; $y < $nh; $y++) for ($x = 0; $x < $nw; $x++) {
            $c = imagecolorat($out, $x, $y);
            $a = ($c >> 24) & 0x7F; $r = ($c >> 16) & 0xFF; $g = ($c >> 8) & 0xFF; $b = $c & 0xFF;
            $light = ($r + $g + $b) / 3; $spread = max($r, $g, $b) - min($r, $g, $b);
            if ($spread < 40 && $light > 200) {
                $na = $light > 235 ? 127 : max($a, (int)round(127 - (235 - $light) / 35 * 127));
                imagesetpixel($out, $x, $y, imagecolorallocatealpha($out, $r, $g, $b, $na));
            }
        }
        ob_start(); imagepng($out, null, 9); $png = ob_get_clean();
        if (strlen($png) > ADMIN_STAMP_MAX_BYTES) return [null, 'That stamp picture is too detailed. Crop it to just the stamp and try again.'];
        return ['data:image/png;base64,' . base64_encode($png), null];
    }
    if (filesize($tmp) > ADMIN_STAMP_MAX_BYTES) return [null, 'That picture is too large (over 400 KB). Crop it to just the stamp and try again.'];
    return ['data:' . $mime . ';base64,' . base64_encode((string)file_get_contents($tmp)), null];
}

// Certificates of a facility, newest first. null when database update 3 has not been run yet.
function facility_documents(string $facilityId, bool $withData = false): ?array {
    try {
        $s = db()->prepare('SELECT id, title, file_name, mime, size_bytes, valid_until, uploaded_by, created_at, updated_at'
            . ($withData ? ', data' : '') . " FROM facility_documents WHERE facility_id = ? AND deleted = 0 AND kind = 'certificate' ORDER BY created_at DESC");
        $s->execute([$facilityId]);
        return $s->fetchAll();
    } catch (Throwable $e) { return null; }
}
function facility_document(string $facilityId, string $id): ?array {
    $s = db()->prepare("SELECT * FROM facility_documents WHERE id = ? AND facility_id = ? AND deleted = 0");
    $s->execute([$id, $facilityId]);
    return $s->fetch() ?: null;
}

// Save a certificate row (new or deleted) with a fresh server_seq so the facility's devices get it.
function save_facility_document(array $cols): void {
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->query('SELECT value FROM sync_counter WHERE id = 1 FOR UPDATE')->fetch();
        $pdo->exec('UPDATE sync_counter SET value = LAST_INSERT_ID(value + 1) WHERE id = 1');
        $cols['server_seq'] = (int)$pdo->lastInsertId();
        if (!empty($cols['_update'])) {
            unset($cols['_update']);
            $id = $cols['id']; unset($cols['id']);
            $set = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($cols)));
            $pdo->prepare("UPDATE facility_documents SET $set WHERE id = ?")->execute([...array_values($cols), $id]);
        } else {
            $names = array_keys($cols);
            $pdo->prepare('INSERT INTO facility_documents (`' . implode('`,`', $names) . '`) VALUES (' . implode(',', array_fill(0, count($names), '?')) . ')')
                ->execute(array_values($cols));
        }
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
}
function new_uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40); $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}
function file_size_text(int $n): string { return $n >= 1048576 ? number_format($n / 1048576, 1) . ' MB' : max(1, (int)round($n / 1024)) . ' KB'; }

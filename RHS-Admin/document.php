<?php
// Opens or downloads the operational certificates of a facility (PDF or picture).
//   ?f=<facility>&d=<certificate>             open it in the browser
//   ?f=<facility>&d=<certificate>&download=1  download it
//   ?f=<facility>&all=1                       download all of them as one .zip
// Only for logged-in RHS admins. The file type was checked when it was uploaded and is
// sent with nosniff, so the browser never treats it as anything else.
require __DIR__ . '/app/bootstrap.php';
require_login();

const DOC_EXT = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

function not_found(): void { http_response_code(404); echo 'Not found.'; exit; }
// The file inside a stored data URL, or null when it is damaged / not an allowed type.
function doc_bytes(array $d): ?string {
    if (!isset(DOC_EXT[$d['mime']]) || !preg_match('#^data:[a-z/.+-]+;base64,#', (string)$d['data'])) return null;
    $bin = base64_decode(substr($d['data'], strpos($d['data'], ',') + 1), true);
    return $bin === false ? null : $bin;
}
function safe_name(string $s, string $fallback): string {
    return trim(preg_replace('/\s+/', ' ', preg_replace('/[^A-Za-z0-9 ._()-]+/', ' ', $s)), ' .') ?: $fallback;
}
// "Kisugu Pharmacy - NDA licence 2026.pdf"
function doc_file_name(array $f, array $d): string {
    $title = safe_name((string)($d['title'] ?: preg_replace('/\.[A-Za-z0-9]+$/', '', (string)$d['file_name'])), 'certificate');
    return mb_substr(safe_name((string)$f['name'], 'Facility') . ' - ' . $title, 0, 150) . '.' . DOC_EXT[$d['mime']];
}
function send_file_headers(string $mime, int $len, string $name, bool $attach): void {
    header_remove('Content-Security-Policy'); // the browser's own PDF viewer must be allowed to run
    header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'");
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . $len);
    header('Cache-Control: private, no-store');
    header('Content-Disposition: ' . ($attach ? 'attachment' : 'inline') . '; filename="' . $name . '"');
}

$f = facility_by_id(get('f'));
if (!$f) not_found();

// ---- every certificate of the facility, as one zip
if (get('all') === '1') {
    $docs = facility_documents($f['id'], true);
    if (!$docs || !class_exists('ZipArchive')) not_found();
    $tmp = tempnam(sys_get_temp_dir(), 'rhbzip');
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) not_found();
    $used = [];
    foreach ($docs as $d) {
        if (($bin = doc_bytes($d)) === null) continue;
        $name = $base = doc_file_name($f, $d);
        for ($n = 2; isset($used[strtolower($name)]); $n++) $name = preg_replace('/(\.\w+)$/', " ($n)$1", $base);
        $used[strtolower($name)] = true;
        $zip->addFromString($name, $bin);
    }
    $zip->close();
    if (!$used) { @unlink($tmp); not_found(); }
    audit('facility.certificates_download', $f['id'], $f['name'], ['count' => count($used)]);
    send_file_headers('application/zip', filesize($tmp), safe_name((string)$f['name'], 'Facility') . ' - certificates.zip', true);
    readfile($tmp);
    @unlink($tmp);
    exit;
}

// ---- one certificate
$d = facility_document($f['id'], get('d'));
$bin = $d ? doc_bytes($d) : null;
if ($bin === null) not_found();
$download = get('download') === '1';
if ($download) audit('facility.certificate_download', $f['id'], $f['name'], ['title' => $d['title']]);
send_file_headers($d['mime'], strlen($bin), doc_file_name($f, $d), $download);
echo $bin;

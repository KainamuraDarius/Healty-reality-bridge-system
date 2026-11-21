<?php
// Opens one operational certificate of a facility (PDF or picture) in the browser.
// Only for logged-in RHS admins. The file type was checked when it was uploaded and is
// sent with nosniff, so the browser never treats it as anything else.
require __DIR__ . '/app/bootstrap.php';
require_login();

$f = facility_by_id(get('f'));
$d = $f ? facility_document($f['id'], get('d')) : null;
if (!$d || !in_array($d['mime'], ADMIN_DOC_TYPES, true) || !preg_match('#^data:[a-z/.+-]+;base64,#', (string)$d['data'])) {
    http_response_code(404); echo 'Not found.'; exit;
}
$bin = base64_decode(substr($d['data'], strpos($d['data'], ',') + 1), true);
if ($bin === false) { http_response_code(404); echo 'Not found.'; exit; }

$ext = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$d['mime']];
$name = preg_replace('/[^A-Za-z0-9 ._-]+/', '', (string)($d['title'] ?: 'certificate')) ?: 'certificate';
header_remove('Content-Security-Policy'); // the browser's own PDF viewer must be allowed to run
header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'");
header('Content-Type: ' . $d['mime']);
header('Content-Length: ' . strlen($bin));
header('Content-Disposition: ' . (get('download') === '1' ? 'attachment' : 'inline') . '; filename="' . $name . '.' . $ext . '"');
echo $bin;

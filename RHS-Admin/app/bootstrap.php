<?php
// Loaded at the top of every page: settings, database, secure session, helpers, login checks.
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/layout.php';
require_once __DIR__ . '/licence.php';
require_once __DIR__ . '/support_actions.php';
require_once __DIR__ . '/messaging.php';
require_once __DIR__ . '/facility_files.php';

function config(): array {
    static $cfg = null;
    if ($cfg === null) $cfg = require __DIR__ . '/config.php';
    return $cfg;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $c = config();
        $pdo = new PDO("mysql:host={$c['db_host']};port=" . ($c['db_port'] ?? 3306) . ";dbname={$c['db_name']};charset=utf8mb4",
            $c['db_user'], $c['db_pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        $pdo->exec("SET time_zone = '+00:00'"); // everything is stored in UTC
    }
    return $pdo;
}

date_default_timezone_set('UTC');

set_exception_handler(function (Throwable $e) {
    error_log('RHS Admin error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    echo '<!doctype html><meta charset="utf-8"><title>Error</title><body>'
       . '<h1>Something went wrong</h1><p>The error was written to the error_log file. Please try again or contact the developer.</p>';
    exit;
});

// --- https only
if (!empty(config()['require_https'])) {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
          || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') || (($_SERVER['SERVER_PORT'] ?? '') == 443);
    if (!$https) { header('Location: https://' . ($_SERVER['HTTP_HOST'] ?? '') . ($_SERVER['REQUEST_URI'] ?? '/'), true, 301); exit; }
}

// --- security headers: no framing, no caching of admin pages, only our own scripts
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

// --- session: cookie only over https, not readable by scripts, not sent from other sites
session_name('RHSADMIN');
session_cache_limiter(''); // keep our own Cache-Control: no-store
session_set_cookie_params([
    'lifetime' => 0, 'path' => '/', 'secure' => !empty(config()['require_https']),
    'httponly' => true, 'samesite' => 'Strict',
]);
session_start();

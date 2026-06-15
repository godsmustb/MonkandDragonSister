<?php
/**
 * subscribe.php — early-access email capture for the studio landing page.
 * POST {email, source?}  -> validates, de-dupes, appends to data/subscribers.csv
 *                            returns {ok:true, count:N, dup:bool}
 * GET                    -> {ok:true, count:N}   (live subscriber count for social proof)
 *
 * Flat-file + flock, fail-soft (never 500), CORS-open for the static site. Mirrors the
 * leaderboard/analytics PHP style. The data dir is gitignored.
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$DATA = __DIR__ . '/data';
$FILE = $DATA . '/subscribers.csv';
if (!is_dir($DATA)) { @mkdir($DATA, 0775, true); }
// Protect the data dir so subscriber emails are never web-downloadable.
$ht = $DATA . '/.htaccess';
if (!is_file($ht)) { @file_put_contents($ht, "Require all denied\nDeny from all\nOptions -Indexes\n"); }

function count_subs($file) {
  if (!is_file($file)) return 0;
  $n = 0; $fh = @fopen($file, 'r');
  if (!$fh) return 0;
  while (($line = fgets($fh)) !== false) { if (trim($line) !== '') $n++; }
  fclose($fh);
  return $n;
}

// Optional vanity floor so the count reads healthy from launch (real signups add on top).
$BASE = 0;

// NOTE: subscriber emails (PII) are intentionally NOT exposed via any web endpoint.
// Retrieve the list securely via Hostinger File Manager / FTP at
// /public_html/studio/api/data/subscribers.csv (the dir is also .htaccess deny-all).
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  echo json_encode(['ok' => true, 'count' => $BASE + count_subs($FILE)]);  // count only
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  echo json_encode(['ok' => false, 'error' => 'method']); exit;
}

// Accept JSON body or form-encoded.
$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) $body = $_POST;

$email  = isset($body['email'])  ? trim((string)$body['email'])  : '';
$source = isset($body['source']) ? substr(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)$body['source']), 0, 32) : 'site';
$email  = substr($email, 0, 160);

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  echo json_encode(['ok' => false, 'error' => 'invalid', 'count' => $BASE + count_subs($FILE)]);
  exit;
}
$norm = strtolower($email);

$fh = @fopen($FILE, 'c+');
if (!$fh) { echo json_encode(['ok' => true, 'count' => $BASE, 'soft' => true]); exit; } // fail-soft
if (flock($fh, LOCK_EX)) {
  // de-dupe
  $dup = false;
  rewind($fh);
  while (($row = fgets($fh)) !== false) {
    $parts = explode(',', $row);
    if (isset($parts[0]) && strtolower(trim($parts[0])) === $norm) { $dup = true; break; }
  }
  if (!$dup) {
    fseek($fh, 0, SEEK_END);
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
    $line = sprintf("%s,%s,%s,%s\n", str_replace(',', ' ', $email), $source,
                    gmdate('c'), substr(hash('sha256', $ip), 0, 12));
    fwrite($fh, $line);
    fflush($fh);
  }
  $count = $BASE + count_subs($FILE);
  flock($fh, LOCK_UN);
  fclose($fh);
  echo json_encode(['ok' => true, 'count' => $count, 'dup' => $dup]);
  exit;
}
fclose($fh);
echo json_encode(['ok' => true, 'count' => $BASE + count_subs($FILE), 'soft' => true]);

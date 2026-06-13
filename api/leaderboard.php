<?php
// api/leaderboard.php — flat-file leaderboard API
// PHP 7+ compatible, dependency-free, ~80 lines.
// GET  ?stage=N  → top 15 for that stage (or all stages if omitted)
// POST {stage,name,score} → validate, append, return top 15 for that stage

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('DATA_FILE', __DIR__ . '/data/scores.json');
define('MAX_PER_STAGE', 50);
define('RETURN_COUNT', 15);

// ── Load / save helpers ──────────────────────────────────────────────────────

function loadData() {
    if (!file_exists(DATA_FILE)) return [];
    $fp = fopen(DATA_FILE, 'r');
    if (!$fp) return [];
    $raw = fread($fp, 2 * 1024 * 1024); // 2 MB cap
    fclose($fp);
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function saveData(array $data, $fp) {
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data));
}

function topForStage(array $data, $stage) {
    $list = isset($data[$stage]) ? $data[$stage] : [];
    usort($list, function($a, $b) { return $b['score'] - $a['score']; });
    return array_slice($list, 0, RETURN_COUNT);
}

function sanitizeName($name) {
    $name = trim((string)$name);
    // Keep letters, digits, space, dash, underscore, dot — strip everything else
    $name = preg_replace('/[^\p{L}\p{N} \-_\.]/u', '', $name);
    $name = trim($name);
    if (strlen($name) < 1) $name = 'Anonymous';
    return substr($name, 0, 16);
}

// ── GET ──────────────────────────────────────────────────────────────────────

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $data = loadData();
        if (isset($_GET['stage'])) {
            $stage = (int)$_GET['stage'];
            if ($stage < 1 || $stage > 9) { echo json_encode([]); exit; }
            echo json_encode(topForStage($data, $stage));
        } else {
            $out = [];
            foreach (range(1, 9) as $s) {
                $out[$s] = topForStage($data, $s);
            }
            echo json_encode($out);
        }
    } catch (Exception $e) {
        echo json_encode([]);
    }
    exit;
}

// ── POST ─────────────────────────────────────────────────────────────────────

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $body = json_decode(file_get_contents('php://input'), true);
        if (!is_array($body)) { echo json_encode([]); exit; }

        $stage = isset($body['stage']) ? (int)$body['stage'] : 0;
        $score = isset($body['score']) ? (int)$body['score'] : 0;
        $name  = sanitizeName(isset($body['name']) ? $body['name'] : 'Anonymous');

        if ($stage < 1 || $stage > 9 || $score < 0 || $score > 10000000) {
            echo json_encode([]); exit;
        }

        // Ensure data dir exists
        $dir = dirname(DATA_FILE);
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        // Exclusive write lock
        $fp = fopen(DATA_FILE, file_exists(DATA_FILE) ? 'r+' : 'w+');
        if (!$fp) { echo json_encode([]); exit; }
        flock($fp, LOCK_EX);

        $raw = '';
        rewind($fp);
        while (!feof($fp)) $raw .= fread($fp, 8192);
        $data = json_decode($raw, true);
        if (!is_array($data)) $data = [];

        if (!isset($data[$stage])) $data[$stage] = [];
        $data[$stage][] = [
            'name'  => $name,
            'score' => $score,
            'date'  => date('Y-m-d'),
        ];
        // Keep only top MAX_PER_STAGE
        usort($data[$stage], function($a, $b) { return $b['score'] - $a['score']; });
        $data[$stage] = array_slice($data[$stage], 0, MAX_PER_STAGE);

        saveData($data, $fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        echo json_encode(topForStage($data, $stage));
    } catch (Exception $e) {
        echo json_encode([]);
    }
    exit;
}

// Unsupported method
http_response_code(405);
echo json_encode([]);

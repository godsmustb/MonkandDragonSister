<?php
// api/analytics.php — anonymous gameplay analytics (flat-file, append-only)
// PHP 7+ compatible, dependency-free.
//
// POST {deviceId, events:[{type, t, ...props}]}
//   → validate, append each event as one JSON line to api/data/analytics.jsonl
//   → returns {"ok":true} (or {"ok":false} on any error — never 500)
//
// GET ?summary=1&key=KEY
//   → if KEY matches SUMMARY_KEY, return aggregated JSON report
//   → else 403 {"error":"unauthorized"}

define('SUMMARY_KEY',  'mds_a7f3_report_k9');
define('DATA_FILE',    __DIR__ . '/data/analytics.jsonl');
define('MAX_FILE_BYTES', 4 * 1024 * 1024); // 4 MB cap — ignore writes beyond

// ── Allowed event types (whitelist) ──────────────────────────────────────────
const ALLOWED_TYPES = [
    'session_start',
    'wave_reached',
    'player_death',
    'level_complete',
    'game_over',
    'session_end',
];

// ── CORS + preflight ──────────────────────────────────────────────────────────
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Ensure data directory exists ──────────────────────────────────────────────
function ensureDataDir() {
    $dir = dirname(DATA_FILE);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
}

// ── Sanitize a device ID: 32 hex chars max ────────────────────────────────────
function sanitizeDeviceId($raw) {
    $s = preg_replace('/[^a-f0-9]/i', '', (string)$raw);
    return substr($s, 0, 32);
}

// ── Sanitize a string prop: truncate to 120 chars, strip control chars ────────
function sanitizeString($raw, $maxLen = 120) {
    $s = preg_replace('/[\x00-\x1f\x7f]/u', '', (string)$raw);
    return substr($s, 0, $maxLen);
}

// ── POST — record events ──────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $body = json_decode(file_get_contents('php://input'), true);
        if (!is_array($body)) { echo json_encode(['ok' => false]); exit; }

        $deviceId = sanitizeDeviceId(isset($body['deviceId']) ? $body['deviceId'] : '');
        if (strlen($deviceId) === 0) { echo json_encode(['ok' => false]); exit; }

        $events = isset($body['events']) && is_array($body['events']) ? $body['events'] : [];
        if (count($events) === 0) { echo json_encode(['ok' => true]); exit; }

        ensureDataDir();

        // Check file size before opening
        $currentSize = file_exists(DATA_FILE) ? filesize(DATA_FILE) : 0;
        if ($currentSize >= MAX_FILE_BYTES) {
            // Soft cap — acknowledge but don't write
            echo json_encode(['ok' => true]);
            exit;
        }

        $fp = fopen(DATA_FILE, 'a');
        if (!$fp) { echo json_encode(['ok' => false]); exit; }
        flock($fp, LOCK_EX);

        foreach ($events as $ev) {
            if (!is_array($ev)) continue;

            $type = isset($ev['type']) ? (string)$ev['type'] : '';
            if (!in_array($type, ALLOWED_TYPES, true)) continue;

            $t = isset($ev['t']) ? (int)$ev['t'] : 0;

            // Build sanitized event record
            $record = [
                'deviceId' => $deviceId,
                'type'     => $type,
                't'        => $t,
            ];

            // Numeric props (cast to int)
            foreach (['stage', 'wave', 'score', 'w', 'h'] as $key) {
                if (isset($ev[$key])) {
                    $record[$key] = (int)$ev[$key];
                }
            }

            // Boolean props
            foreach (['touch', 'endless'] as $key) {
                if (isset($ev[$key])) {
                    $record[$key] = (bool)$ev[$key];
                }
            }

            // String props (truncated)
            foreach (['ua', 'mode'] as $key) {
                if (isset($ev[$key])) {
                    $record[$key] = sanitizeString($ev[$key]);
                }
            }

            fwrite($fp, json_encode($record) . "\n");
        }

        flock($fp, LOCK_UN);
        fclose($fp);

        echo json_encode(['ok' => true]);
    } catch (Exception $e) {
        echo json_encode(['ok' => false]);
    }
    exit;
}

// ── GET ?summary=1&key=KEY — aggregated report ────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $wantSummary = isset($_GET['summary']) && $_GET['summary'] === '1';
        $key = isset($_GET['key']) ? (string)$_GET['key'] : '';

        if (!$wantSummary) {
            echo json_encode(['ok' => true, 'msg' => 'analytics endpoint']);
            exit;
        }

        if ($key !== SUMMARY_KEY) {
            http_response_code(403);
            echo json_encode(['error' => 'unauthorized']);
            exit;
        }

        // ── Parse the jsonl file ──────────────────────────────────────────
        if (!file_exists(DATA_FILE)) {
            echo json_encode([
                'total_sessions' => 0,
                'unique_devices' => 0,
                'funnel' => [],
                'deaths' => [],
                'level_completions' => [],
                'game_overs' => [],
                'device_breakdown' => ['touch' => 0, 'desktop' => 0],
                'avg_session_duration_s' => 0,
            ]);
            exit;
        }

        $fp = fopen(DATA_FILE, 'r');
        if (!$fp) { echo json_encode(['error' => 'read_error']); exit; }

        $sessions       = []; // deviceId => [start_t, end_t]
        $funnel         = []; // "stage:wave" => count of sessions that reached it
        $deaths         = []; // "stage:wave" => count
        $levelComplete  = []; // stage => count
        $gameOvers      = []; // "stage:wave" => count
        $touchCount     = 0;
        $desktopCount   = 0;

        while (($line = fgets($fp)) !== false) {
            $ev = json_decode(trim($line), true);
            if (!is_array($ev)) continue;

            $type     = isset($ev['type']) ? $ev['type'] : '';
            $deviceId = isset($ev['deviceId']) ? $ev['deviceId'] : '';
            $t        = isset($ev['t']) ? (int)$ev['t'] : 0;
            $stage    = isset($ev['stage']) ? (int)$ev['stage'] : 0;
            $wave     = isset($ev['wave']) ? (int)$ev['wave'] : 0;

            switch ($type) {
                case 'session_start':
                    if ($deviceId) {
                        if (!isset($sessions[$deviceId])) {
                            $sessions[$deviceId] = ['start' => $t, 'end' => $t];
                        } else {
                            // New session for same device — only bump start if later
                            $sessions[$deviceId]['start'] = $t;
                        }
                        $isTouch = isset($ev['touch']) ? (bool)$ev['touch'] : false;
                        if ($isTouch) $touchCount++; else $desktopCount++;
                    }
                    break;

                case 'session_end':
                    if ($deviceId && isset($sessions[$deviceId])) {
                        $sessions[$deviceId]['end'] = $t;
                    }
                    break;

                case 'wave_reached':
                    if ($stage > 0 && $wave > 0) {
                        $key2 = "{$stage}:{$wave}";
                        $funnel[$key2] = ($funnel[$key2] ?? 0) + 1;
                    }
                    break;

                case 'player_death':
                    if ($stage > 0 && $wave > 0) {
                        $key2 = "{$stage}:{$wave}";
                        $deaths[$key2] = ($deaths[$key2] ?? 0) + 1;
                    }
                    break;

                case 'level_complete':
                    if ($stage > 0) {
                        $levelComplete[$stage] = ($levelComplete[$stage] ?? 0) + 1;
                    }
                    break;

                case 'game_over':
                    if ($stage > 0 && $wave > 0) {
                        $key2 = "{$stage}:{$wave}";
                        $gameOvers[$key2] = ($gameOvers[$key2] ?? 0) + 1;
                    }
                    break;
            }
        }
        fclose($fp);

        // Compute avg session duration (ms → s, exclude zeros)
        $durations = [];
        foreach ($sessions as $s) {
            if ($s['end'] > $s['start']) {
                $durations[] = ($s['end'] - $s['start']) / 1000.0;
            }
        }
        $avgDuration = count($durations) > 0
            ? round(array_sum($durations) / count($durations), 1)
            : 0;

        // Sort funnel and deaths by key
        ksort($funnel);
        ksort($deaths);
        ksort($levelComplete);
        ksort($gameOvers);

        echo json_encode([
            'total_sessions'        => count($sessions),
            'unique_devices'        => count(array_unique(array_keys($sessions))),
            'funnel'                => $funnel,
            'deaths'                => $deaths,
            'level_completions'     => $levelComplete,
            'game_overs'            => $gameOvers,
            'device_breakdown'      => ['touch' => $touchCount, 'desktop' => $desktopCount],
            'avg_session_duration_s' => $avgDuration,
        ]);
    } catch (Exception $e) {
        echo json_encode(['error' => 'summary_error']);
    }
    exit;
}

// Unsupported method
http_response_code(405);
echo json_encode(['ok' => false]);

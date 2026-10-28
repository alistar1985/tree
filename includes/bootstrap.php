<?php
/**
 * نقطة الإقلاع: الاتصال بقاعدة البيانات، الجلسة، الإعدادات، الصلاحيات والأدوات العامة.
 */
declare(strict_types=1);

const APP_VERSION = '1.0.0';
define('APP_ROOT', dirname(__DIR__));
define('DATA_DIR', APP_ROOT . DIRECTORY_SEPARATOR . 'data');
define('DB_FILE', DATA_DIR . DIRECTORY_SEPARATOR . 'clan.sqlite');

mb_internal_encoding('UTF-8');
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', DATA_DIR . DIRECTORY_SEPARATOR . 'php-errors.log');

require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/names.php';
require_once __DIR__ . '/people.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/tracker.php';
require_once __DIR__ . '/icons.php';

/* ───────────── قاعدة البيانات ───────────── */

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        if (!is_dir(DATA_DIR)) {
            mkdir(DATA_DIR, 0775, true);
        }
        $pdo = new PDO('sqlite:' . DB_FILE, null, null, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('PRAGMA foreign_keys = ON');
        schema_ensure($pdo);
    }
    return $pdo;
}

function db_one(string $sql, array $params = []): ?array
{
    $st = db()->prepare($sql);
    $st->execute($params);
    $row = $st->fetch();
    return $row ?: null;
}

function db_all(string $sql, array $params = []): array
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->fetchAll();
}

function db_val(string $sql, array $params = [])
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->fetchColumn();
}

function db_exec(string $sql, array $params = []): int
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->rowCount();
}

/* ───────────── الإعدادات ───────────── */

function settings_all(bool $refresh = false): array
{
    static $cache = null;
    if ($cache === null || $refresh) {
        $cache = settings_defaults();
        foreach (db_all('SELECT k, v FROM settings') as $r) {
            $cache[$r['k']] = $r['v'];
        }
    }
    return $cache;
}

function setting(string $key, $default = '')
{
    $all = settings_all();
    return array_key_exists($key, $all) ? $all[$key] : $default;
}

function setting_set(string $key, $value): void
{
    db_exec('INSERT INTO settings(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', [$key, (string)$value]);
    settings_all(true);
}

function setting_json(string $key): array
{
    $v = json_decode((string)setting($key, '[]'), true);
    return is_array($v) ? $v : [];
}

/** سلسلة الانتماء: القبيلة › العشيرة › الفخذ ... (المستويات غير الفارغة فقط) */
function clan_hierarchy(): array
{
    return array_values(array_filter(setting_json('hierarchy'), fn($l) => trim((string)($l['value'] ?? '')) !== ''));
}

function laqab_list(): array
{
    $parts = preg_split('/[،,\n]+/u', (string)setting('laqab'));
    return array_values(array_filter(array_map('trim', $parts), fn($x) => $x !== ''));
}

/* ───────────── أدوات عامة ───────────── */

function e($s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function now(): string
{
    return date('Y-m-d H:i:s');
}

function base_path(): string
{
    static $b = null;
    if ($b === null) {
        $dir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
        if (preg_match('~/admin$~', $dir)) {
            $dir = substr($dir, 0, -6);
        }
        $b = rtrim($dir, '/');
    }
    return $b;
}

function url(string $path = ''): string
{
    return base_path() . '/' . ltrim($path, '/');
}

function asset(string $path): string
{
    $file = APP_ROOT . '/assets/' . $path;
    $v = is_file($file) ? filemtime($file) : APP_VERSION;
    return url('assets/' . $path) . '?v=' . $v;
}

function full_url(string $path = ''): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return ($https ? 'https' : 'http') . '://' . $host . url($path);
}

function redirect(string $to): void
{
    header('Location: ' . $to);
    exit;
}

function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function client_ip(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    if (setting('anonymize_ip') === '1') {
        if (strpos($ip, ':') !== false) {
            $ip = preg_replace('/:[0-9a-f]*:[0-9a-f]*$/i', ':0:0', $ip);
        } else {
            $ip = preg_replace('/\.\d+$/', '.0', $ip);
        }
    }
    return (string)$ip;
}

function user_agent(): string
{
    return mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 400);
}

/** تحويل الأرقام العربية-الهندية والفارسية إلى أرقام لاتينية */
function latin_digits(string $s): string
{
    return strtr($s, [
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
    ]);
}

function fmt_dt(?string $dt, bool $withTime = true): string
{
    if (!$dt) {
        return '—';
    }
    $t = strtotime($dt);
    return $t ? date($withTime ? 'Y/m/d H:i' : 'Y/m/d', $t) : '—';
}

function ar_count(int $n, string $one, string $two, string $few, string $many): string
{
    if ($n === 1) return $one;
    if ($n === 2) return $two;
    if ($n >= 3 && $n <= 10) return $n . ' ' . $few;
    return $n . ' ' . $many;
}

function time_ago(?string $dt): string
{
    if (!$dt) {
        return '—';
    }
    $diff = time() - (int)strtotime($dt);
    if ($diff < 60) return 'الآن';
    $m = intdiv($diff, 60);
    if ($m < 60) return 'منذ ' . ar_count($m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
    $h = intdiv($m, 60);
    if ($h < 24) return 'منذ ' . ar_count($h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    $d = intdiv($h, 24);
    if ($d < 30) return 'منذ ' . ar_count($d, 'يوم', 'يومين', 'أيام', 'يوماً');
    return fmt_dt($dt, false);
}

function gen_ordinal(int $n): string
{
    $names = [1 => 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
        'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون'];
    return $names[$n] ?? (string)$n;
}

function random_token(int $bytes = 16): string
{
    return bin2hex(random_bytes($bytes));
}

/* ───────────── الجلسة والحماية ───────────── */

function session_boot(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_name('clan_sid');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => base_path() === '' ? '/' : base_path() . '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        ]);
        session_start();
    }
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = random_token(20);
    }
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(csrf_token()) . '">';
}

function csrf_valid(): bool
{
    $t = $_POST['_csrf'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    return is_string($t) && $t !== '' && hash_equals($_SESSION['csrf'] ?? '', $t);
}

/** يسمح بعدد محدد من المحاولات خلال نافذة زمنية — يعيد false عند التجاوز */
function rate_limit(string $key, int $max, int $windowSeconds): bool
{
    $now = time();
    $row = db_one('SELECT hits, window_start FROM rate_limits WHERE rkey = ?', [$key]);
    if (!$row || $now - (int)$row['window_start'] >= $windowSeconds) {
        db_exec('INSERT INTO rate_limits(rkey, hits, window_start) VALUES(?, 1, ?) ON CONFLICT(rkey) DO UPDATE SET hits = 1, window_start = excluded.window_start', [$key, $now]);
        return true;
    }
    if ((int)$row['hits'] >= $max) {
        return false;
    }
    db_exec('UPDATE rate_limits SET hits = hits + 1 WHERE rkey = ?', [$key]);
    return true;
}

function flash(string $type, string $msg): void
{
    $_SESSION['flash'][] = ['type' => $type, 'msg' => $msg];
}

function flashes(): array
{
    $f = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $f;
}

/* ───────────── الهوية والصلاحيات ───────────── */

function installed(): bool
{
    try {
        return (int)db_val('SELECT COUNT(*) FROM admins') > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function current_admin(): ?array
{
    static $cached = false;
    if ($cached === false) {
        $cached = null;
        $id = $_SESSION['admin_id'] ?? null;
        if ($id) {
            $cached = db_one('SELECT * FROM admins WHERE id = ? AND is_active = 1', [(int)$id]);
            if (!$cached) {
                unset($_SESSION['admin_id']);
            }
        }
    }
    return $cached;
}

function code_is_usable(array $c): bool
{
    if (!(int)$c['is_active']) return false;
    if (!empty($c['expires_at']) && strtotime($c['expires_at']) < time()) return false;
    return true;
}

function current_code(): ?array
{
    static $cached = false;
    if ($cached === false) {
        $cached = null;
        $id = $_SESSION['code_id'] ?? null;
        if ($id) {
            $c = db_one('SELECT * FROM codes WHERE id = ?', [(int)$id]);
            if ($c && code_is_usable($c)) {
                $cached = $c;
            } else {
                unset($_SESSION['code_id']);
            }
        }
    }
    return $cached;
}

function actor(): array
{
    if ($a = current_admin()) {
        return ['type' => 'admin', 'id' => (int)$a['id'], 'label' => 'المشرف: ' . ($a['display_name'] ?: $a['username'])];
    }
    if ($c = current_code()) {
        return ['type' => 'code', 'id' => (int)$c['id'], 'label' => 'رمز: ' . $c['holder_name']];
    }
    return ['type' => 'public', 'id' => null, 'label' => 'زائر'];
}

const ROLE_PERMS = [
    'owner'  => ['*'],
    'admin'  => ['review', 'people', 'houses', 'codes', 'log', 'visitors', 'settings', 'export'],
    'editor' => ['review', 'people', 'houses', 'log'],
];

const ROLE_LABELS = ['owner' => 'المالك', 'admin' => 'مشرف عام', 'editor' => 'محرر'];

function admin_can(string $perm): bool
{
    $a = current_admin();
    if (!$a) return false;
    $perms = ROLE_PERMS[$a['role']] ?? [];
    return in_array('*', $perms, true) || in_array($perm, $perms, true);
}

/**
 * هل يملك المستخدم الحالي صلاحية ($perm: add|edit|delete|approve|move|merge) على هذا الشخص؟
 * المشرف: كل شيء. صاحب الرمز: داخل نطاق بيته فقط وحسب صلاحيات رمزه.
 */
function can_on_person(string $perm, ?int $personId): bool
{
    if (current_admin()) {
        return true;
    }
    $c = current_code();
    if (!$c || $personId === null) {
        return false;
    }
    $map = [
        'add' => 'can_add', 'edit' => 'can_edit', 'move' => 'can_edit', 'reorder' => 'can_edit',
        'delete' => 'can_delete', 'approve' => 'can_approve',
    ];
    if (!isset($map[$perm]) || !(int)$c[$map[$perm]]) {
        return false;
    }
    $scope = $c['scope_person_id'] !== null ? (int)$c['scope_person_id'] : null;
    if (!in_scope($personId, $scope, people_map(true))) {
        return false;
    }
    // لا يُسمح لصاحب الرمز بحذف أو نقل رأس نطاقه
    if (in_array($perm, ['delete', 'move'], true) && $scope !== null && $personId === $scope) {
        return false;
    }
    return true;
}

function code_additions_left(array $c): ?int
{
    if ($c['max_additions'] === null || $c['max_additions'] === '') {
        return null;
    }
    $used = (int)db_val("SELECT COUNT(*) FROM persons WHERE created_by_type = 'code' AND created_by_id = ? AND status != 'rejected'", [(int)$c['id']]);
    return max(0, (int)$c['max_additions'] - $used);
}

/* ───────────── التهيئة ───────────── */

session_boot();
date_default_timezone_set((string)(setting('timezone') ?: 'Asia/Baghdad'));

if (!defined('SKIP_INSTALL_CHECK') && !installed()) {
    $script = basename($_SERVER['SCRIPT_NAME'] ?? '');
    if ($script !== 'install.php') {
        if ($script === 'api.php') {
            json_out(['ok' => false, 'error' => 'الموقع غير مُهيأ بعد'], 503);
        }
        redirect(url('install.php'));
    }
}

<?php
/**
 * إحصاءات الزوار: معرّف الزائر، تحليل نوع الجهاز والنظام والمتصفح، وتسجيل الزيارات.
 */

const DEVICE_LABELS = ['mobile' => 'هاتف', 'tablet' => 'لوحي', 'desktop' => 'حاسبة', 'bot' => 'روبوت'];

function visitor_id(): string
{
    static $vid = null;
    if ($vid === null) {
        $vid = $_COOKIE['clan_vid'] ?? '';
        if (!preg_match('/^[a-f0-9]{16}$/', $vid)) {
            $vid = random_token(8);
            $GLOBALS['__new_visitor'] = true;
            if (!headers_sent()) {
                setcookie('clan_vid', $vid, [
                    'expires' => time() + 86400 * 365 * 2, 'path' => base_path() === '' ? '/' : base_path() . '/',
                    'httponly' => true, 'samesite' => 'Lax',
                ]);
            }
        }
    }
    return $vid;
}

function ua_parse(string $ua): array
{
    $isBot = (bool)preg_match('/bot|crawl|spider|slurp|facebookexternalhit|WhatsApp|TelegramBot|Twitterbot|preview|curl|wget|python|Go-http|HeadlessChrome|Lighthouse/i', $ua);

    if ($isBot) {
        $device = 'bot';
    } elseif (preg_match('/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i', $ua)) {
        $device = 'tablet';
    } elseif (preg_match('/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|Opera Mini/i', $ua)) {
        $device = 'mobile';
    } else {
        $device = 'desktop';
    }

    $os = 'غير معروف';
    if (preg_match('/Android\s?([\d.]+)?/i', $ua, $m)) {
        $os = 'Android' . (!empty($m[1]) ? ' ' . explode('.', $m[1])[0] : '');
    } elseif (preg_match('/(iPhone|iPad|iPod).*?OS (\d+)/i', $ua, $m)) {
        $os = 'iOS ' . $m[2];
    } elseif (preg_match('/Windows NT ([\d.]+)/i', $ua, $m)) {
        $os = ['10.0' => 'Windows 10/11', '6.3' => 'Windows 8.1', '6.2' => 'Windows 8', '6.1' => 'Windows 7'][$m[1]] ?? 'Windows';
    } elseif (preg_match('/Mac OS X/i', $ua)) {
        $os = 'macOS';
    } elseif (preg_match('/CrOS/i', $ua)) {
        $os = 'ChromeOS';
    } elseif (preg_match('/Linux/i', $ua)) {
        $os = 'Linux';
    }

    $browser = 'غير معروف';
    $rules = [
        'FBAN|FBAV|FB_IAB' => 'Facebook', 'Instagram' => 'Instagram', 'Snapchat' => 'Snapchat', 'TikTok|musical_ly' => 'TikTok',
        'Telegram' => 'Telegram', 'Edg(A|iOS)?\/' => 'Edge', 'OPR\/|Opera' => 'Opera', 'SamsungBrowser' => 'Samsung Internet',
        'UCBrowser' => 'UC Browser', 'YaBrowser' => 'Yandex', 'Firefox|FxiOS' => 'Firefox', 'CriOS|Chrome' => 'Chrome', 'Safari' => 'Safari',
    ];
    foreach ($rules as $re => $name) {
        if (preg_match('/' . $re . '/i', $ua)) {
            $browser = $name;
            break;
        }
    }

    $model = null;
    if (preg_match('/Android [\d.]+; ([^;)]+?)(?: Build|\))/i', $ua, $m) && trim($m[1]) !== 'K') {
        $model = trim($m[1]);
    } elseif (preg_match('/(iPhone|iPad)/', $ua, $m)) {
        $model = $m[1];
    }

    return ['device' => $device, 'os' => $os, 'browser' => $browser, 'model' => $model, 'bot' => $isBot];
}

/** تسجيل زيارة صفحة عامة؛ يعيد رقم الزيارة لاستخدامه في إرسال قياس الشاشة */
function track_visit(string $page): ?int
{
    if (setting('track_visits') !== '1') {
        return null;
    }
    $ua = user_agent();
    $info = ua_parse($ua);
    $vid = visitor_id();
    $ref = (string)($_SERVER['HTTP_REFERER'] ?? '');
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($ref !== '' && $host !== '' && parse_url($ref, PHP_URL_HOST) === parse_url('http://' . $host, PHP_URL_HOST)) {
        $ref = ''; // تنقل داخلي
    }
    $code = current_code();
    $admin = current_admin();
    db_exec('INSERT INTO visits (visitor_id, ip, user_agent, device, os, browser, model, page, query, referrer, lang, code_id, admin_id, is_new, is_bot, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        $vid, client_ip(), $ua, $info['device'], $info['os'], $info['browser'], $info['model'], $page,
        mb_substr((string)($_SERVER['QUERY_STRING'] ?? ''), 0, 200), mb_substr($ref, 0, 300),
        mb_substr((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''), 0, 20),
        $code ? (int)$code['id'] : null, $admin ? (int)$admin['id'] : null,
        !empty($GLOBALS['__new_visitor']) ? 1 : 0, $info['bot'] ? 1 : 0, now(),
    ]);
    $id = (int)db()->lastInsertId();
    $_SESSION['last_visit_id'] = $id;
    return $id;
}

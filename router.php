<?php
// موجّه خادم PHP المدمج (للتشغيل المحلي بـ run.bat): يحجب ملفات النظام ويخدم الملفات الثابتة.
$path = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('~^/(data|includes)(/|$)|/\.|\.(sqlite|log|md|bat)$~i', $path)) {
    http_response_code(403);
    exit('403');
}
if ($path === '/' ) {
    $_SERVER['SCRIPT_NAME'] = '/index.php';
    require __DIR__ . '/index.php';
    return true;
}
return false;

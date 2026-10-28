<?php
require_once dirname(__DIR__) . '/includes/bootstrap.php';

if (($a = current_admin()) && hash_equals($_SESSION['csrf'] ?? '', (string)($_GET['t'] ?? ''))) {
    audit('logout', 'admin', (int)$a['id'], 'تسجيل خروج «' . ($a['display_name'] ?: $a['username']) . '»');
    unset($_SESSION['admin_id']);
    session_regenerate_id(true);
}
redirect(url('admin/login.php'));

<?php
require_once dirname(__DIR__) . '/includes/bootstrap.php';

$next = (string)($_GET['next'] ?? '');
if (!preg_match('~^/[^/\\\\]~', $next) || strpos($next, 'login.php') !== false) {
    $next = url('admin/index.php');
}
if (current_admin()) {
    redirect($next);
}

$err = null;
$username = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $username = trim((string)($_POST['username'] ?? ''));
    $pass = (string)($_POST['password'] ?? '');
    if (!csrf_valid()) {
        $err = 'انتهت صلاحية النموذج، أعد المحاولة.';
    } elseif (!rate_limit('login:' . client_ip(), 8, 900)) {
        $err = 'محاولات كثيرة خاطئة. انتظر 15 دقيقة.';
    } else {
        $a = db_one('SELECT * FROM admins WHERE username = ? AND is_active = 1', [$username]);
        if ($a && password_verify($pass, $a['password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['admin_id'] = (int)$a['id'];
            db_exec('UPDATE admins SET last_login_at = ?, last_login_ip = ? WHERE id = ?', [now(), client_ip(), (int)$a['id']]);
            if (password_needs_rehash($a['password_hash'], PASSWORD_DEFAULT)) {
                db_exec('UPDATE admins SET password_hash = ? WHERE id = ?', [password_hash($pass, PASSWORD_DEFAULT), (int)$a['id']]);
            }
            audit('login', 'admin', (int)$a['id'], 'تسجيل دخول «' . ($a['display_name'] ?: $a['username']) . '»', null, null,
                ['type' => 'admin', 'id' => (int)$a['id'], 'label' => 'المشرف: ' . ($a['display_name'] ?: $a['username'])]);
            redirect($next);
        }
        audit('login_failed', 'admin', $a ? (int)$a['id'] : null, 'محاولة دخول فاشلة باسم المستخدم «' . mb_substr($username, 0, 30) . '»');
        $err = 'اسم المستخدم أو كلمة المرور غير صحيحة.';
    }
}
?><!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>دخول لوحة التحكم — <?= e(setting('site_title')) ?></title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="<?= e(asset('css/main.css')) ?>">
<link rel="icon" href="<?= e(url('assets/img/favicon.svg')) ?>" type="image/svg+xml">
<script>try{var t=localStorage.getItem('clan-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>
</head>
<body class="auth-page">
<?= icon_sprite() ?>
<main class="auth-wrap">
  <form class="auth-card" method="post">
    <?= csrf_field() ?>
    <div class="auth-head">
      <?= logo_svg(64) ?>
      <h1>لوحة التحكم</h1>
      <p><?= e(setting('site_title')) ?></p>
    </div>
    <?php if ($err): ?><div class="alert alert-danger"><?= icon('alert') ?><?= e($err) ?></div><?php endif; ?>
    <label class="field"><span>اسم المستخدم</span><input name="username" dir="ltr" value="<?= e($username) ?>" autocomplete="username" required autofocus></label>
    <label class="field"><span>كلمة المرور</span><input type="password" name="password" dir="ltr" autocomplete="current-password" required></label>
    <button class="btn btn-primary btn-lg btn-block" type="submit"><?= icon('lock') ?>دخول</button>
    <p class="hint" style="justify-content:center;margin-top:16px"><a href="<?= e(url('index.php')) ?>"><?= icon('arrow-r') ?> العودة إلى الموقع</a></p>
  </form>
</main>
</body>
</html>

<?php
/**
 * معالج التهيئة الأولى: بيانات العشيرة، الجد الأكبر، وحساب المالك.
 */
require __DIR__ . '/includes/bootstrap.php';
require __DIR__ . '/includes/demo.php';

if (installed()) {
    redirect(url('index.php'));
}

$err = null;
$v = [
    'site_title' => 'شجرة عشيرة الحلاف', 'tribe' => 'بني مخزوم', 'clan' => 'الحلاف', 'fakhdh' => '',
    'laqab' => 'الحلفي، الحلافي', 'root' => 'حلاف', 'username' => 'admin', 'display_name' => '', 'demo' => '1',
];

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    foreach ($v as $k => $_) {
        $v[$k] = trim((string)($_POST[$k] ?? ($k === 'demo' ? '' : $v[$k])));
    }
    $pass = (string)($_POST['password'] ?? '');
    try {
        if (!csrf_valid()) throw new InvalidArgumentException('انتهت صلاحية النموذج، أعد المحاولة');
        if ($v['site_title'] === '' || $v['clan'] === '') throw new InvalidArgumentException('اسم الموقع واسم العشيرة مطلوبان');
        if (!preg_match('/^[a-zA-Z0-9_.-]{3,30}$/', $v['username'])) throw new InvalidArgumentException('اسم المستخدم بالأحرف الإنجليزية والأرقام (3 أحرف فأكثر)');
        if (mb_strlen($pass) < 8) throw new InvalidArgumentException('كلمة المرور 8 أحرف على الأقل');
        if ($pass !== (string)($_POST['password2'] ?? '')) throw new InvalidArgumentException('كلمتا المرور غير متطابقتين');
        $root = name_clean($v['root']);
        if ($e = name_error($root)) throw new InvalidArgumentException('اسم الجد الأكبر: ' . $e);

        db()->beginTransaction();
        setting_set('site_title', $v['site_title']);
        setting_set('clan_name', 'عشيرة ' . preg_replace('/^عشيرة\s+/u', '', $v['clan']));
        setting_set('hierarchy', json_encode([
            ['label' => 'القبيلة', 'value' => $v['tribe']],
            ['label' => 'العشيرة', 'value' => $v['clan']],
            ['label' => 'الفخذ', 'value' => $v['fakhdh']],
        ], JSON_UNESCAPED_UNICODE));
        setting_set('laqab', $v['laqab']);
        db_exec('INSERT INTO admins (username, password_hash, display_name, role, created_at) VALUES (?,?,?,?,?)', [
            $v['username'], password_hash($pass, PASSWORD_DEFAULT), $v['display_name'] ?: $v['username'], 'owner', now(),
        ]);
        $adminId = (int)db()->lastInsertId();
        $sys = ['type' => 'admin', 'id' => $adminId, 'label' => 'المشرف: ' . ($v['display_name'] ?: $v['username'])];
        $rootId = person_insert(null, ['name' => $root, 'is_head' => 0], $sys);
        $n = $v['demo'] === '1' ? demo_seed($rootId, $sys) : 0;
        db()->commit();

        session_regenerate_id(true);
        $_SESSION['admin_id'] = $adminId;
        audit('install', 'settings', null, 'تهيئة الموقع' . ($n ? ' مع ' . $n . ' فرداً من البيانات التجريبية' : ''), null, null, $sys);
        flash('ok', 'تمت تهيئة الموقع بنجاح. مرحباً بك في لوحة التحكم.');
        redirect(url('admin/index.php'));
    } catch (Throwable $ex) {
        if (db()->inTransaction()) db()->rollBack();
        $err = $ex instanceof InvalidArgumentException ? $ex->getMessage() : 'تعذرت التهيئة: ' . $ex->getMessage();
    }
}
?><!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>تهيئة شجرة العشيرة</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="<?= e(asset('css/main.css')) ?>">
<link rel="icon" href="<?= e(url('assets/img/favicon.svg')) ?>" type="image/svg+xml">
</head>
<body class="auth-page">
<?= icon_sprite() ?>
<main class="auth-wrap wide">
  <form class="auth-card" method="post" autocomplete="off">
    <?= csrf_field() ?>
    <div class="auth-head">
      <?= logo_svg(64) ?>
      <h1>تهيئة شجرة العشيرة</h1>
      <p>خطوة واحدة لإعداد موقعك. يمكن تغيير كل شيء لاحقاً من لوحة التحكم.</p>
    </div>
    <?php if ($err): ?><div class="alert alert-danger"><?= icon('alert') ?><?= e($err) ?></div><?php endif; ?>

    <fieldset class="fs">
      <legend><?= icon('tree') ?>بيانات العشيرة</legend>
      <div class="grid-2">
        <label class="field"><span>عنوان الموقع</span><input name="site_title" value="<?= e($v['site_title']) ?>" required></label>
        <label class="field"><span>اسم الجد الأكبر (جذر الشجرة)</span><input name="root" value="<?= e($v['root']) ?>" required></label>
        <label class="field"><span>القبيلة</span><input name="tribe" value="<?= e($v['tribe']) ?>"></label>
        <label class="field"><span>العشيرة</span><input name="clan" value="<?= e($v['clan']) ?>" required></label>
        <label class="field"><span>الفخذ (اختياري)</span><input name="fakhdh" value="<?= e($v['fakhdh']) ?>"></label>
        <label class="field"><span>ألقاب العشيرة (تُحذف تلقائياً من آخر الاسم)</span><input name="laqab" value="<?= e($v['laqab']) ?>"></label>
      </div>
      <label class="check"><input type="checkbox" name="demo" value="1" <?= $v['demo'] === '1' ? 'checked' : '' ?>><span>إضافة بيانات تجريبية (حوالي 100 اسم) لاستعراض الشجرة — تُحذف لاحقاً من الإعدادات</span></label>
    </fieldset>

    <fieldset class="fs">
      <legend><?= icon('shield') ?>حساب المالك</legend>
      <div class="grid-2">
        <label class="field"><span>اسم المستخدم</span><input name="username" dir="ltr" value="<?= e($v['username']) ?>" required></label>
        <label class="field"><span>الاسم الظاهر</span><input name="display_name" value="<?= e($v['display_name']) ?>" placeholder="مثال: أبو علي"></label>
        <label class="field"><span>كلمة المرور</span><input type="password" name="password" dir="ltr" minlength="8" required></label>
        <label class="field"><span>تأكيد كلمة المرور</span><input type="password" name="password2" dir="ltr" minlength="8" required></label>
      </div>
    </fieldset>

    <button class="btn btn-primary btn-lg btn-block" type="submit"><?= icon('check') ?>تهيئة الموقع</button>
  </form>
</main>
</body>
</html>

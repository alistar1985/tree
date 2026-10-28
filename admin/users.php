<?php
/**
 * المشرفون وحسابي: إضافة مشرفين بأدوار، تعطيلهم، وتغيير كلمات المرور.
 */
require __DIR__ . '/_layout.php';
$me = admin_require();
$owner = admin_can('*');

if (admin_post()) {
    $act = (string)($_POST['act'] ?? '');
    try {
        if ($act === 'me') {
            $name = trim((string)$_POST['display_name']);
            db_exec('UPDATE admins SET display_name = ? WHERE id = ?', [$name ?: $me['username'], (int)$me['id']]);
            $new = (string)($_POST['new_password'] ?? '');
            if ($new !== '') {
                if (!password_verify((string)$_POST['current_password'], $me['password_hash'])) throw new InvalidArgumentException('كلمة المرور الحالية غير صحيحة');
                if (mb_strlen($new) < 8) throw new InvalidArgumentException('كلمة المرور الجديدة 8 أحرف على الأقل');
                db_exec('UPDATE admins SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), (int)$me['id']]);
                audit('admin_update', 'admin', (int)$me['id'], 'غيّر كلمة مروره');
            }
            flash('ok', 'تم حفظ حسابك.');
        } elseif ($owner && $act === 'create') {
            $u = trim((string)$_POST['username']);
            if (!preg_match('/^[a-zA-Z0-9_.-]{3,30}$/', $u)) throw new InvalidArgumentException('اسم المستخدم بالأحرف الإنجليزية والأرقام (3 أحرف فأكثر)');
            if (db_val('SELECT 1 FROM admins WHERE username = ?', [$u])) throw new InvalidArgumentException('اسم المستخدم مستخدم مسبقاً');
            $pw = (string)$_POST['password'];
            if (mb_strlen($pw) < 8) throw new InvalidArgumentException('كلمة المرور 8 أحرف على الأقل');
            $role = isset(ROLE_PERMS[$_POST['role'] ?? '']) ? $_POST['role'] : 'editor';
            db_exec('INSERT INTO admins (username, password_hash, display_name, role, created_at) VALUES (?,?,?,?,?)', [$u, password_hash($pw, PASSWORD_DEFAULT), trim((string)$_POST['display_name']) ?: $u, $role, now()]);
            audit('admin_create', 'admin', (int)db()->lastInsertId(), 'أضاف المشرف «' . $u . '» بدور ' . ROLE_LABELS[$role]);
            flash('ok', 'تمت إضافة المشرف.');
        } elseif ($owner && in_array($act, ['role', 'toggle', 'reset'], true)) {
            $id = (int)$_POST['id'];
            if ($id === (int)$me['id']) throw new InvalidArgumentException('لا يمكنك تعديل صلاحيات حسابك من هنا');
            $a = db_one('SELECT * FROM admins WHERE id = ?', [$id]);
            if (!$a) throw new InvalidArgumentException('المشرف غير موجود');
            if ($act === 'role') {
                $role = isset(ROLE_PERMS[$_POST['role'] ?? '']) ? $_POST['role'] : 'editor';
                db_exec('UPDATE admins SET role = ? WHERE id = ?', [$role, $id]);
                audit('admin_update', 'admin', $id, 'غيّر دور «' . $a['username'] . '» إلى ' . ROLE_LABELS[$role]);
            } elseif ($act === 'toggle') {
                db_exec('UPDATE admins SET is_active = 1 - is_active WHERE id = ?', [$id]);
                audit('admin_update', 'admin', $id, ((int)$a['is_active'] ? 'عطّل' : 'فعّل') . ' حساب «' . $a['username'] . '»');
            } else {
                $pw = (string)$_POST['password'];
                if (mb_strlen($pw) < 8) throw new InvalidArgumentException('كلمة المرور 8 أحرف على الأقل');
                db_exec('UPDATE admins SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $id]);
                audit('admin_update', 'admin', $id, 'أعاد تعيين كلمة مرور «' . $a['username'] . '»');
            }
            flash('ok', 'تم الحفظ.');
        }
    } catch (InvalidArgumentException $e) {
        flash('danger', $e->getMessage());
    }
    back();
}

$admins = $owner ? db_all('SELECT * FROM admins ORDER BY id') : [];
admin_head($owner ? 'المشرفون' : 'حسابي', 'users', ['icon' => 'shield']);
?>
<div class="grid-panels <?= $owner ? 'c2' : '' ?>">
  <?php if ($owner): ?>
  <section class="panel">
    <div class="panel-head"><div><h2><?= icon('shield') ?>فريق الإدارة</h2><p>المالك: كل شيء · المشرف العام: كل شيء عدا المشرفين · المحرر: الطلبات والأفراد والبيوت والسجل.</p></div></div>
    <div class="table-wrap"><table class="t">
      <thead><tr><th>المشرف</th><th>الدور</th><th>آخر دخول</th><th>الحالة</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($admins as $a): $self = (int)$a['id'] === (int)$me['id']; ?>
        <tr>
          <td class="nm"><b><?= e($a['display_name']) ?><?= $self ? ' (أنت)' : '' ?></b><small class="mono"><?= e($a['username']) ?></small></td>
          <td><?php if ($self): ?><span class="badge badge-gold"><?= e(ROLE_LABELS[$a['role']]) ?></span><?php else: ?>
            <form method="post"><?= csrf_field() ?><input type="hidden" name="act" value="role"><input type="hidden" name="id" value="<?= (int)$a['id'] ?>">
              <select name="role" onchange="this.form.submit()" style="min-height:32px;width:auto;font-size:.84rem"><?php foreach (ROLE_LABELS as $rk => $rl): ?><option value="<?= $rk ?>" <?= $a['role'] === $rk ? 'selected' : '' ?>><?= e($rl) ?></option><?php endforeach; ?></select></form><?php endif; ?></td>
          <td><small><?= e(time_ago($a['last_login_at'])) ?><?= $a['last_login_ip'] ? '<br><span class="mono">' . e($a['last_login_ip']) . '</span>' : '' ?></small></td>
          <td><?= (int)$a['is_active'] ? '<span class="badge badge-ok">فعال</span>' : '<span class="badge badge-muted">معطّل</span>' ?></td>
          <td><?php if (!$self): ?><div class="acts">
            <form method="post"><?= csrf_field() ?><input type="hidden" name="act" value="toggle"><input type="hidden" name="id" value="<?= (int)$a['id'] ?>"><button class="btn btn-xs btn-outline"><?= (int)$a['is_active'] ? 'تعطيل' : 'تفعيل' ?></button></form>
            <form method="post" style="display:flex;gap:4px"><?= csrf_field() ?><input type="hidden" name="act" value="reset"><input type="hidden" name="id" value="<?= (int)$a['id'] ?>"><input type="password" name="password" placeholder="كلمة مرور جديدة" style="min-height:30px;width:140px;font-size:.8rem" dir="ltr"><button class="btn btn-xs btn-ghost"><?= icon('key') ?></button></form>
            <a class="btn btn-xs btn-ghost" href="<?= e(url('admin/log.php?actor=admin:' . (int)$a['id'])) ?>" title="سجل عملياته"><?= icon('history') ?></a>
          </div><?php endif; ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>
    <form method="post" class="panel-body form-grid" style="border-top:1px solid var(--line)">
      <?= csrf_field() ?><input type="hidden" name="act" value="create">
      <label class="field"><span>اسم المستخدم</span><input name="username" dir="ltr" required></label>
      <label class="field"><span>الاسم الظاهر</span><input name="display_name"></label>
      <label class="field"><span>الدور</span><select name="role"><?php foreach (ROLE_LABELS as $rk => $rl): ?><option value="<?= $rk ?>" <?= $rk === 'editor' ? 'selected' : '' ?>><?= e($rl) ?></option><?php endforeach; ?></select></label>
      <label class="field"><span>كلمة المرور</span><input type="password" name="password" dir="ltr" minlength="8" required></label>
      <div class="full"><button class="btn btn-primary btn-sm" type="submit"><?= icon('plus') ?>إضافة مشرف</button></div>
    </form>
  </section>
  <?php endif; ?>

  <form class="panel" method="post">
    <?= csrf_field() ?><input type="hidden" name="act" value="me">
    <div class="panel-head"><h2><?= icon('user') ?>حسابي</h2></div>
    <div class="panel-body">
      <label class="field"><span>اسم المستخدم</span><input value="<?= e($me['username']) ?>" dir="ltr" disabled></label>
      <label class="field"><span>الاسم الظاهر</span><input name="display_name" value="<?= e($me['display_name']) ?>"></label>
      <label class="field"><span>كلمة المرور الحالية</span><input type="password" name="current_password" dir="ltr" autocomplete="current-password"></label>
      <label class="field"><span>كلمة المرور الجديدة (اتركها فارغة إن لم ترد التغيير)</span><input type="password" name="new_password" dir="ltr" minlength="8" autocomplete="new-password"></label>
    </div>
    <div class="save-bar"><button class="btn btn-primary" type="submit"><?= icon('check') ?>حفظ</button></div>
  </form>
</div>
<?php admin_foot(); ?>

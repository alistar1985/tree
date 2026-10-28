<?php
/**
 * رموز الصلاحية: رمز بيت لرأس البيت ضمن نطاقه، أو رمز مشرف للشجرة كاملة دون لوحة التحكم، مع تتبع كامل للاستخدام.
 */
require __DIR__ . '/_layout.php';
admin_require('codes');

function new_code(): string
{
    do {
        $c = sprintf('%04d-%04d', random_int(1000, 9999), random_int(0, 9999));
    } while (db_val('SELECT 1 FROM codes WHERE code = ?', [$c]));
    return $c;
}

if (admin_post()) {
    $act = (string)($_POST['act'] ?? '');
    $id = (int)($_POST['id'] ?? 0);
    try {
        if ($act === 'create' || $act === 'update') {
            $holder = trim((string)$_POST['holder_name']);
            if ($holder === '') throw new InvalidArgumentException('اسم صاحب الرمز مطلوب');
            // رمز المشرف: الشجرة كاملة وكل الصلاحيات، بدون حساب في لوحة التحكم
            $supervisor = ($_POST['code_type'] ?? '') === 'supervisor';
            $scope = $supervisor ? null : (($_POST['scope_person'] ?? '') !== '' ? (int)$_POST['scope_person'] : (($_POST['scope_house'] ?? '') !== '' ? (int)$_POST['scope_house'] : null));
            if ($scope !== null && !person_row($scope)) throw new InvalidArgumentException('نطاق الرمز غير موجود');
            $exp = trim((string)($_POST['expires_at'] ?? ''));
            $perm = fn($k) => $supervisor || isset($_POST[$k]) ? 1 : 0;
            $vals = [
                $holder, preg_replace('/[^\d+]/', '', latin_digits((string)$_POST['holder_phone'])) ?: null, trim((string)$_POST['note']) ?: null, $scope,
                $perm('can_add'), $perm('can_edit'), $perm('can_delete'), $perm('can_approve'),
                ($_POST['max_additions'] ?? '') !== '' ? max(0, (int)$_POST['max_additions']) : null, $exp !== '' ? date('Y-m-d 23:59:59', strtotime($exp)) : null,
            ];
            if ($act === 'create') {
                $code = new_code();
                db_exec('INSERT INTO codes (holder_name, holder_phone, note, scope_person_id, can_add, can_edit, can_delete, can_approve, max_additions, expires_at, code, created_by, created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [...$vals, $code, (int)current_admin()['id'], now()]);
                $cid = (int)db()->lastInsertId();
                audit('code_create', 'code', $cid, 'أنشأ رمزاً لـ «' . $holder . '»');
                $_SESSION['new_code'] = $cid;
            } else {
                db_exec('UPDATE codes SET holder_name=?, holder_phone=?, note=?, scope_person_id=?, can_add=?, can_edit=?, can_delete=?, can_approve=?, max_additions=?, expires_at=? WHERE id = ?', [...$vals, $id]);
                audit('code_update', 'code', $id, 'عدّل رمز «' . $holder . '»');
                flash('ok', 'تم حفظ الرمز.');
            }
        } elseif ($act === 'toggle') {
            $c = db_one('SELECT * FROM codes WHERE id = ?', [$id]);
            db_exec('UPDATE codes SET is_active = 1 - is_active WHERE id = ?', [$id]);
            audit('code_update', 'code', $id, ((int)$c['is_active'] ? 'عطّل' : 'فعّل') . ' رمز «' . $c['holder_name'] . '»');
            flash('ok', (int)$c['is_active'] ? 'تم تعطيل الرمز.' : 'تم تفعيل الرمز.');
        } elseif ($act === 'regen') {
            $c = db_one('SELECT * FROM codes WHERE id = ?', [$id]);
            db_exec('UPDATE codes SET code = ? WHERE id = ?', [new_code(), $id]);
            audit('code_update', 'code', $id, 'جدّد رمز «' . $c['holder_name'] . '» (الرمز القديم لم يعد يعمل)');
            $_SESSION['new_code'] = $id;
        } elseif ($act === 'delete') {
            $c = db_one('SELECT * FROM codes WHERE id = ?', [$id]);
            db_exec('DELETE FROM codes WHERE id = ?', [$id]);
            audit('code_delete', 'code', $id, 'حذف رمز «' . $c['holder_name'] . '»', $c);
            flash('ok', 'تم حذف الرمز. تبقى عملياته محفوظة في السجل.');
        }
    } catch (InvalidArgumentException $e) {
        flash('danger', $e->getMessage());
    }
    back(url('admin/codes.php'));
}

$map = people_map(true);
$houses = array_filter($map, fn($p) => (int)$p['is_head']);
$codes = db_all('SELECT * FROM codes ORDER BY is_active DESC, id DESC');
$adds = [];
foreach (db_all("SELECT created_by_id i, COUNT(*) c FROM persons WHERE created_by_type = 'code' AND status != 'rejected' GROUP BY created_by_id") as $r) $adds[(int)$r['i']] = (int)$r['c'];
$edits = [];
foreach (db_all("SELECT actor_id i, COUNT(*) c FROM audit_log WHERE actor_type = 'code' AND action IN ('update','move','delete','reorder','approve','reject') GROUP BY actor_id") as $r) $edits[(int)$r['i']] = (int)$r['c'];

$newCode = null;
if (!empty($_SESSION['new_code'])) {
    $newCode = db_one('SELECT * FROM codes WHERE id = ?', [(int)$_SESSION['new_code']]);
    unset($_SESSION['new_code']);
}
$edit = isset($_GET['edit']) ? db_one('SELECT * FROM codes WHERE id = ?', [(int)$_GET['edit']]) : null;
$preScope = $edit ? $edit['scope_person_id'] : (isset($_GET['scope']) ? (int)$_GET['scope'] : null);
$scopeName = function ($sid) use ($map) {
    if ($sid === null || $sid === '') return 'الشجرة كاملة';
    $sid = (int)$sid;
    if (!isset($map[$sid])) return 'غير موجود';
    return (int)$map[$sid]['is_head'] ? ($map[$sid]['house_name'] ?: 'بيت ' . $map[$sid]['name']) : 'فرع ' . nasab($sid, $map, 3);
};

admin_head('رموز الصلاحية', 'codes', ['icon' => 'key']);
?>
<?php if ($newCode):
    $msg = "السلام عليكم\nهذا رمز صلاحيتك " . ($newCode['scope_person_id'] === null ? '(مشرف على الشجرة كاملة)' : '(' . $scopeName($newCode['scope_person_id']) . ')') . ' في ' . setting('site_title') . ":\n" . $newCode['code']
        . "\n\nلإضافة الأسماء: افتح " . full_url('add.php') . "\nثم اضغط على أيقونة المفتاح 🔑 وأدخل الرمز.\nكل إضافة تُسجَّل باسمك."; ?>
  <section class="panel" style="border-color:var(--primary)">
    <div class="panel-head"><div><h2><?= icon('check') ?>رمز «<?= e($newCode['holder_name']) ?>» جاهز</h2><p>أرسله لصاحبه فقط. لا يُعرض لأي شخص آخر.</p></div></div>
    <div class="panel-body" style="display:grid;gap:12px;justify-items:center">
      <div class="code-big"><?= e($newCode['code']) ?></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
        <button class="btn btn-outline" type="button" data-copy="<?= e($newCode['code']) ?>"><?= icon('copy') ?>نسخ الرمز</button>
        <button class="btn btn-outline" type="button" data-copy="<?= e($msg) ?>"><?= icon('copy') ?>نسخ رسالة كاملة</button>
        <a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/<?= e(preg_replace('/^0/', '964', (string)$newCode['holder_phone'])) ?>?text=<?= e(rawurlencode($msg)) ?>"><?= icon('whatsapp') ?>إرسال عبر واتساب</a>
      </div>
    </div>
  </section>
<?php endif; ?>

<section class="panel">
  <div class="panel-head"><div><h2><?= icon($edit ? 'edit' : 'plus') ?><?= $edit ? 'تعديل رمز ' . e($edit['holder_name']) : 'إنشاء رمز جديد' ?></h2>
    <p>يُمنح الرمز عادة لرأس البيت؛ يستطيع به إضافة أبناء البيت وتعديلهم فقط ضمن نطاقه، وتُنشر إضافاته مباشرة<?= setting('code_auto_approve') === '1' ? '' : ' بعد المراجعة' ?>.</p></div></div>
  <form method="post" class="panel-body form-grid">
    <?= csrf_field() ?><input type="hidden" name="act" value="<?= $edit ? 'update' : 'create' ?>"><?php if ($edit): ?><input type="hidden" name="id" value="<?= (int)$edit['id'] ?>"><?php endif; ?>
    <?php $isSup = $edit ? ($edit['scope_person_id'] === null && (int)$edit['can_approve'] && (int)$edit['can_delete']) : (($_GET['type'] ?? '') === 'supervisor'); ?>
    <div class="field full"><span>نوع الرمز</span>
      <div class="radio-cards" style="margin:0">
        <label class="radio-card"><input type="radio" name="code_type" value="house" <?= $isSup ? '' : 'checked' ?>><span><b><?= icon('house') ?> رمز بيت</b><small>لرأس البيت: يضيف أفراد بيته ويعدّلهم فقط، حسب الصلاحيات التي تختارها.</small></span></label>
        <label class="radio-card"><input type="radio" name="code_type" value="supervisor" <?= $isSup ? 'checked' : '' ?>><span><b><?= icon('shield') ?> رمز مشرف</b><small>للمشرفين دون لوحة تحكم: يدخل الرمز من أيقونة المفتاح في الموقع فيضيف ويعدّل ويحذف ويعتمد الطلبات في الشجرة كاملة.</small></span></label>
      </div></div>
    <label class="field"><span>اسم صاحب الرمز</span><input name="holder_name" value="<?= e($edit['holder_name'] ?? '') ?>" placeholder="مثال: أبو علي — جعفر محمد" required></label>
    <label class="field"><span>هاتفه (لإرسال الرمز عبر واتساب)</span><input name="holder_phone" dir="ltr" inputmode="tel" value="<?= e($edit['holder_phone'] ?? '') ?>" placeholder="07xxxxxxxxx"></label>
    <label class="field"><span>نطاق الرمز (البيت)</span>
      <select name="scope_house">
        <option value="">الشجرة كاملة (صلاحية واسعة)</option>
        <?php foreach ($houses as $h): ?><option value="<?= $h['id'] ?>" <?= (int)$preScope === $h['id'] ? 'selected' : '' ?>><?= e($h['house_name'] ?: 'بيت ' . $h['name']) ?> — <?= e(nasab($h['id'], $map, 3)) ?></option><?php endforeach; ?>
      </select></label>
    <label class="field"><span>أو فرع محدد (اختياري — يتقدم على البيت)</span><?= person_picker('scope_person', 'ابحث عن رأس الفرع…', $preScope && !isset($houses[(int)$preScope]) ? (int)$preScope : null) ?></label>
    <div class="field full"><span>الصلاحيات</span>
      <div style="display:flex;gap:18px;flex-wrap:wrap">
        <label class="check"><input type="checkbox" name="can_add" <?= !$edit || (int)$edit['can_add'] ? 'checked' : '' ?>><span>إضافة أبناء</span></label>
        <label class="check"><input type="checkbox" name="can_edit" <?= !$edit || (int)$edit['can_edit'] ? 'checked' : '' ?>><span>تعديل ونقل وترتيب</span></label>
        <label class="check"><input type="checkbox" name="can_delete" <?= $edit && (int)$edit['can_delete'] ? 'checked' : '' ?>><span>حذف</span></label>
        <label class="check"><input type="checkbox" name="can_approve" <?= $edit && (int)$edit['can_approve'] ? 'checked' : '' ?>><span>اعتماد طلبات البيت</span></label>
      </div></div>
    <label class="field"><span>الحد الأقصى للإضافات (فارغ = بلا حد)</span><input type="number" min="0" name="max_additions" value="<?= e($edit['max_additions'] ?? '') ?>"></label>
    <label class="field"><span>تاريخ الانتهاء (اختياري)</span><input type="date" name="expires_at" value="<?= e(!empty($edit['expires_at']) ? substr($edit['expires_at'], 0, 10) : '') ?>"></label>
    <label class="field full"><span>ملاحظة داخلية</span><input name="note" value="<?= e($edit['note'] ?? '') ?>"></label>
    <div class="full" style="display:flex;gap:8px"><button class="btn btn-primary" type="submit"><?= icon($edit ? 'check' : 'key') ?><?= $edit ? 'حفظ' : 'إنشاء الرمز' ?></button><?php if ($edit): ?><a class="btn btn-ghost" href="codes.php">إلغاء</a><?php endif; ?></div>
  </form>
</section>

<section class="panel">
  <div class="panel-head"><h2><?= icon('key') ?>الرموز (<?= count($codes) ?>)</h2></div>
  <div class="table-wrap"><table class="t">
    <thead><tr><th>صاحب الرمز</th><th>الرمز</th><th>النطاق</th><th>الصلاحيات</th><th>الاستخدام</th><th>آخر استخدام</th><th>الحالة</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($codes as $c):
        $usable = code_is_usable($c);
        $cid = (int)$c['id']; ?>
      <tr>
        <td class="nm"><b><?= e($c['holder_name']) ?><?= $c['scope_person_id'] === null && (int)$c['can_approve'] ? ' <span class="badge badge-info">مشرف</span>' : '' ?></b><small><?= e($c['holder_phone'] ?: '') ?><?= $c['note'] ? ' · ' . e($c['note']) : '' ?></small></td>
        <td><span class="code-mask" data-reveal="<?= e($c['code']) ?>">••••-<?= e(substr($c['code'], -4)) ?></span> <button class="btn btn-xs btn-ghost" type="button" data-copy="<?= e($c['code']) ?>" title="نسخ"><?= icon('copy') ?></button></td>
        <td><small><?= e($scopeName($c['scope_person_id'])) ?></small></td>
        <td><div class="perm-badges">
          <?= (int)$c['can_add'] ? '<span class="badge badge-ok">إضافة</span>' : '' ?><?= (int)$c['can_edit'] ? '<span class="badge badge-info">تعديل</span>' : '' ?>
          <?= (int)$c['can_delete'] ? '<span class="badge badge-danger">حذف</span>' : '' ?><?= (int)$c['can_approve'] ? '<span class="badge badge-gold">اعتماد</span>' : '' ?></div></td>
        <td class="num"><small><?= (int)$c['login_count'] ?> دخول · <a href="<?= e(url('admin/people.php?by=' . rawurlencode('رمز: ' . $c['holder_name']))) ?>"><?= $adds[$cid] ?? 0 ?> إضافة</a> · <?= $edits[$cid] ?? 0 ?> تعديل<?= $c['max_additions'] !== null ? ' / الحد ' . (int)$c['max_additions'] : '' ?></small></td>
        <td><small><?= e(time_ago($c['last_used_at'])) ?><?= $c['last_used_ip'] ? '<br><span class="mono">' . e($c['last_used_ip']) . '</span>' : '' ?></small></td>
        <td><?= $usable ? '<span class="badge badge-ok">فعال</span>' : (!(int)$c['is_active'] ? '<span class="badge badge-muted">معطّل</span>' : '<span class="badge badge-danger">منتهي</span>') ?>
          <?= $c['expires_at'] ? '<br><small class="muted">حتى ' . e(fmt_dt($c['expires_at'], false)) . '</small>' : '' ?></td>
        <td><div class="acts">
          <a class="btn btn-xs btn-ghost" href="<?= e(url('admin/log.php?actor=code:' . $cid)) ?>" title="سجل الرمز"><?= icon('history') ?></a>
          <a class="btn btn-xs btn-ghost" href="?edit=<?= $cid ?>" title="تعديل"><?= icon('edit') ?></a>
          <form method="post"><?= csrf_field() ?><input type="hidden" name="act" value="toggle"><input type="hidden" name="id" value="<?= $cid ?>"><button class="btn btn-xs btn-outline"><?= (int)$c['is_active'] ? 'تعطيل' : 'تفعيل' ?></button></form>
          <form method="post" data-confirm="سيتوقف الرمز الحالي عن العمل ويُنشأ رمز جديد. متابعة؟"><?= csrf_field() ?><input type="hidden" name="act" value="regen"><input type="hidden" name="id" value="<?= $cid ?>"><button class="btn btn-xs btn-ghost" title="تجديد الرمز"><?= icon('refresh') ?></button></form>
          <form method="post" data-confirm="حذف الرمز نهائياً؟"><?= csrf_field() ?><input type="hidden" name="act" value="delete"><input type="hidden" name="id" value="<?= $cid ?>"><button class="btn btn-xs btn-ghost" title="حذف"><?= icon('trash') ?></button></form>
        </div></td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$codes): ?><tr><td colspan="8" class="empty"><?= icon('key') ?>لا توجد رموز بعد</td></tr><?php endif; ?>
    </tbody>
  </table></div>
</section>
<?php admin_foot(); ?>

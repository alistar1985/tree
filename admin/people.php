<?php
/**
 * إدارة الأفراد: بحث وتصفية، إضافة، تعديل كامل، نقل، دمج، حذف، وسجل كل شخص.
 */
require __DIR__ . '/_layout.php';
admin_require('people');

if (admin_post()) {
    $act = (string)($_POST['act'] ?? '');
    $id = (int)($_POST['id'] ?? 0);
    try {
        if ($act === 'add') {
            $parent = ($_POST['parent_id'] ?? '') !== '' ? (int)$_POST['parent_id'] : null;
            if ($parent === null && people_map(true)) {
                $roots = array_keys(array_filter(people_map(true), fn($p) => $p['parent_id'] === null));
                if (count($roots) !== 1) throw new InvalidArgumentException('اختر الأب من الشجرة');
                $parent = $roots[0]; // بدون اختيار: الأبناء تحت الجد الأكبر
            }
            $names = array_filter(array_map('trim', preg_split('/[،,\n]+/u', (string)$_POST['names'])));
            $n = 0;
            foreach ($names as $nm) { person_add($parent, ['name' => $nm], actor()); $n++; }
            flash('ok', "تمت إضافة " . ar_count($n, "اسم واحد", "اسمين", "أسماء", "اسماً") . ".");
        } elseif ($act === 'add_ancestor') {
            // جد أعلى من الجذر الحالي: يصبح الجذر الجديد ويُنقل الجذر القديم تحته
            $name = name_clean((string)$_POST['name']);
            $oldRoots = db_all("SELECT id, name FROM persons WHERE parent_id IS NULL AND deleted_at IS NULL AND status = 'approved'");
            $newId = person_insert(null, ['name' => $name], actor());
            foreach ($oldRoots as $r) {
                db_exec('UPDATE persons SET parent_id = ? WHERE id = ?', [$newId, (int)$r['id']]);
            }
            people_refresh();
            audit('create', 'person', $newId, 'أضاف «' . $name . '» جداً أعلى فوق «' . implode('، ', array_column($oldRoots, 'name')) . '»');
            flash('ok', 'أصبح «' . $name . '» الجد الأكبر للشجرة.');
        } elseif ($act === 'update') {
            $f = array_intersect_key($_POST, array_flip(PERSON_EDITABLE));
            $f['is_head'] = isset($_POST['is_head']) ? 1 : 0;
            $f['is_deceased'] = isset($_POST['is_deceased']) ? 1 : 0;
            $ch = person_update($id, $f, actor());
            flash('ok', $ch ? 'تم حفظ التعديلات.' : 'لا توجد تغييرات.');
        } elseif ($act === 'move') {
            person_move($id, (int)$_POST['parent_id'], actor());
            flash('ok', 'تم النقل.');
        } elseif ($act === 'merge') {
            $target = (int)$_POST['target_id'];
            person_merge($id, $target, actor());
            flash('ok', 'تم الدمج.');
            redirect(url('admin/people.php?edit=' . $target));
        } elseif ($act === 'delete') {
            $n = person_delete($id, isset($_POST['with_desc']), actor());
            flash('ok', "تم حذف " . ar_count($n, "فرد واحد", "فردين", "أفراد", "فرداً") . " (يمكن الاستعادة من سجل العمليات).");
            redirect(url('admin/people.php'));
        } elseif ($act === 'approve_person') {
            $p = person_row($id);
            if ($p && $p['submission_id']) submission_approve((int)$p['submission_id'], actor());
            flash('ok', 'تم الاعتماد.');
        }
    } catch (InvalidArgumentException $e) {
        flash('danger', $e->getMessage());
    }
    back();
}

$map = people_map(true);
$kids = children_index($map);

/* ───────────── صفحة تعديل شخص ───────────── */
if (isset($_GET['edit'])) {
    $id = (int)$_GET['edit'];
    $p = person_row($id);
    if (!$p) { flash('danger', 'الشخص غير موجود أو محذوف.'); redirect(url('admin/people.php')); }
    $history = db_all("SELECT * FROM audit_log WHERE entity = 'person' AND entity_id = ? ORDER BY id DESC LIMIT 30", [$id]);
    $children = $kids[$id] ?? [];
    $desc = descendant_ids($id, $kids);
    admin_head('تعديل: ' . $p['name'], 'people', ['icon' => 'edit', 'actions' => '<a class="btn btn-sm btn-outline" href="' . e(url('tree.php?focus=' . $id)) . '" target="_blank">' . icon('tree') . 'في الشجرة</a>']);
    ?>
    <div class="panel"><div class="panel-body" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <div class="nasab-chain">
        <?php foreach (lineage_ids($id, $map) as $i => $x): ?><?= $i ? '<i>‹</i>' : '' ?><a class="badge <?= $i ? '' : 'badge-ok' ?>" href="?edit=<?= $x ?>"><?= e($map[$x]['name']) ?></a><?php endforeach; ?>
      </div>
      <span class="badge badge-muted">الجيل <?= e(gen_ordinal(depth_of($id, $map))) ?></span>
      <span class="badge badge-muted"><?= count($children) ?> أبناء · <?= count($desc) ?> ذرية</span>
      <?php if ($p['status'] === 'pending'): ?>
        <form method="post"><?= csrf_field() ?><input type="hidden" name="act" value="approve_person"><input type="hidden" name="id" value="<?= $id ?>"><button class="btn btn-xs btn-ok-soft"><?= icon('check') ?>اعتماد طلبه</button></form>
      <?php endif; ?>
    </div></div>

    <div class="grid-panels c2">
      <form class="panel" method="post">
        <?= csrf_field() ?><input type="hidden" name="act" value="update"><input type="hidden" name="id" value="<?= $id ?>">
        <div class="panel-head"><h2><?= icon('user') ?>البيانات</h2></div>
        <div class="panel-body form-grid">
          <label class="field"><span>الاسم</span><input name="name" value="<?= e($p['name']) ?>" required></label>
          <label class="field"><span>الكنية / اللقب</span><input name="nickname" value="<?= e($p['nickname']) ?>"></label>
          <label class="field"><span>سنة الميلاد</span><input name="birth_year" inputmode="numeric" value="<?= e($p['birth_year']) ?>"></label>
          <label class="field"><span>سنة الوفاة</span><input name="death_year" inputmode="numeric" value="<?= e($p['death_year']) ?>"></label>
          <label class="field"><span>الجنس</span><select name="gender"><option value="m" <?= $p['gender'] === 'm' ? 'selected' : '' ?>>ذكر</option><option value="f" <?= $p['gender'] === 'f' ? 'selected' : '' ?>>أنثى</option></select></label>
          <label class="field"><span>الترتيب بين الإخوة</span><input type="number" name="sort_order" value="<?= (int)$p['sort_order'] ?>"></label>
          <label class="field"><span>الهاتف (خاص)</span><input name="phone" dir="ltr" value="<?= e($p['phone']) ?>"></label>
          <div class="field"><span>&nbsp;</span><label class="check"><input type="checkbox" name="is_deceased" <?= (int)$p['is_deceased'] ? 'checked' : '' ?>><span>متوفى (رحمه الله)</span></label></div>
          <div class="full" style="border:1px dashed var(--line-strong);border-radius:14px;padding:12px 14px 2px;margin-bottom:14px">
            <label class="check"><input type="checkbox" name="is_head" <?= (int)$p['is_head'] ? 'checked' : '' ?>><span><b>رأس بيت</b> — يظهر في قائمة البيوت وله شجرة خاصة ويمكن منحه رمزاً</span></label>
            <div class="form-grid">
              <label class="field"><span>اسم البيت</span><input name="house_name" value="<?= e($p['house_name']) ?>" placeholder="بيت <?= e($p['name']) ?>"></label>
              <label class="field"><span>لون البيت</span><input type="color" name="house_color" value="<?= e($p['house_color'] ?: '#c0392b') ?>"></label>
            </div>
          </div>
          <label class="field full"><span>نبذة</span><textarea name="bio" rows="3"><?= e($p['bio']) ?></textarea></label>
          <div class="full sub-meta">
            <span><?= icon('user-plus') ?>أضافه: <?= e($p['created_by_label']) ?> · <?= e(fmt_dt($p['created_at'])) ?></span>
            <?php if ($p['updated_by_label']): ?><span><?= icon('edit') ?>آخر تعديل: <?= e($p['updated_by_label']) ?> · <?= e(fmt_dt($p['updated_at'])) ?></span><?php endif; ?>
          </div>
        </div>
        <div class="save-bar"><button class="btn btn-primary" type="submit"><?= icon('check') ?>حفظ التعديلات</button></div>
      </form>

      <div style="display:grid;gap:18px;align-content:start">
        <section class="panel">
          <div class="panel-head"><h2><?= icon('users') ?>الأبناء</h2></div>
          <div class="panel-body">
            <div class="kids" style="margin-bottom:12px"><?php foreach ($children as $c): ?><a class="badge" href="?edit=<?= $c ?>"><?= (int)$map[$c]['is_head'] ? icon('crown') : '' ?><?= e($map[$c]['name']) ?></a><?php endforeach; ?><?= $children ? '' : '<span class="muted">لا يوجد أبناء</span>' ?></div>
            <form method="post" style="display:flex;gap:8px"><?= csrf_field() ?><input type="hidden" name="act" value="add"><input type="hidden" name="parent_id" value="<?= $id ?>">
              <input name="names" placeholder="أسماء الأبناء مفصولة بفاصلة" required><button class="btn btn-sm btn-primary" type="submit"><?= icon('plus') ?>إضافة</button></form>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2><?= icon('move') ?>نقل ودمج</h2></div>
          <div class="panel-body">
            <?php if ($p['parent_id'] !== null): ?>
            <form method="post" style="margin-bottom:14px"><?= csrf_field() ?><input type="hidden" name="act" value="move"><input type="hidden" name="id" value="<?= $id ?>">
              <label class="field"><span>نقل مع ذريته تحت أب آخر</span><?= person_picker('parent_id', 'ابحث عن الأب الجديد…', null, true) ?></label>
              <button class="btn btn-sm btn-outline" type="submit"><?= icon('move') ?>نقل</button></form>
            <?php endif; ?>
            <form method="post" data-confirm="سيُحذف هذا الشخص وتنتقل ذريته إلى الشخص المختار. متابعة؟"><?= csrf_field() ?><input type="hidden" name="act" value="merge"><input type="hidden" name="id" value="<?= $id ?>">
              <label class="field"><span>دمج هذا الشخص (المكرر) في الشخص الصحيح</span><?= person_picker('target_id', 'ابحث عن الشخص الصحيح…', null, true) ?></label>
              <button class="btn btn-sm btn-outline" type="submit"><?= icon('merge') ?>دمج</button></form>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2><?= icon('trash') ?>حذف</h2></div>
          <div class="panel-body">
            <form method="post" class="danger-zone" data-confirm="تأكيد الحذف؟ يمكن الاستعادة لاحقاً من سجل العمليات."><?= csrf_field() ?><input type="hidden" name="act" value="delete"><input type="hidden" name="id" value="<?= $id ?>">
              <?php if ($desc): ?><label class="check"><input type="checkbox" name="with_desc" required><span>أفهم أن الحذف يشمل <?= count($desc) ?> من ذريته</span></label><?php endif; ?>
              <button class="btn btn-sm btn-danger" type="submit"><?= icon('trash') ?>حذف «<?= e($p['name']) ?>»</button></form>
          </div>
        </section>
      </div>
    </div>

    <section class="panel">
      <div class="panel-head"><h2><?= icon('history') ?>سجل هذا الشخص</h2></div>
      <div class="feed">
        <?php foreach ($history as $h): ?>
          <div class="feed-item"><span class="feed-dot <?= e(ACTION_LABELS[$h['action']][1] ?? '') ?>"><?= icon('history') ?></span>
            <div><p><?= action_badge($h['action']) ?> <?= e($h['summary']) ?></p><small><?= e($h['actor_label']) ?> · <?= e(fmt_dt($h['created_at'])) ?> · <?= e($h['device']) ?> · <span class="mono"><?= e($h['ip']) ?></span></small></div></div>
        <?php endforeach; ?>
        <?php if (!$history): ?><div class="empty">لا توجد عمليات مسجلة</div><?php endif; ?>
      </div>
    </section>
    <?php
    admin_foot();
    exit;
}

/* ───────────── القائمة ───────────── */
$q = trim((string)($_GET['q'] ?? ''));
$house = ($_GET['house'] ?? '') !== '' ? (int)$_GET['house'] : null;
$status = $_GET['status'] ?? '';
$by = $_GET['by'] ?? '';
$sort = $_GET['sort'] ?? 'recent';

$ids = array_keys($map);
if ($q !== '') {
    $ids = array_column(people_search($q, 5000, true), 'id');
}
$rows = [];
foreach ($ids as $id) {
    $p = $map[$id];
    if ($status && $p['status'] !== $status) continue;
    if ($house && !in_scope($id, $house, $map)) continue;
    $rows[] = $id;
}
if ($by !== '') {
    $set = array_flip(array_map('intval', array_column(db_all('SELECT id FROM persons WHERE created_by_label = ?', [$by]), 'id')));
    $rows = array_values(array_filter($rows, fn($id) => isset($set[$id])));
}
if ($q === '' || $sort !== 'recent') {
    usort($rows, function ($a, $b) use ($sort, $map) {
        if ($sort === 'name') return strcmp($map[$a]['name_key'], $map[$b]['name_key']);
        if ($sort === 'gen') return depth_of($a, $map) <=> depth_of($b, $map) ?: $a <=> $b;
        return $b <=> $a;
    });
}
$per = 50;
$page = max(1, (int)($_GET['page'] ?? 1));
$total = count($rows);
$slice = array_slice($rows, ($page - 1) * $per, $per);
$details = [];
if ($slice) {
    $ph = implode(',', array_fill(0, count($slice), '?'));
    foreach (db_all("SELECT id, created_by_label, created_at FROM persons WHERE id IN ($ph)", $slice) as $r) $details[(int)$r['id']] = $r;
}
$houses = array_filter($map, fn($p) => (int)$p['is_head']);

admin_head('الأفراد', 'people', ['icon' => 'users', 'actions' => '<a class="btn btn-sm btn-outline" href="' . e(url('admin/export.php?type=csv')) . '">' . icon('download') . 'CSV</a>']);
?>
<section class="panel">
  <div class="panel-head"><div><h2><?= icon('user-plus') ?>إضافة أفراد</h2><p>اختر الأب ثم اكتب أسماء الأبناء مفصولة بفاصلة.</p></div></div>
  <form method="post" class="panel-body form-grid">
    <?= csrf_field() ?><input type="hidden" name="act" value="add">
    <label class="field"><span>الأب</span><?= person_picker('parent_id', 'ابحث عن الأب…') ?><small>إن تركته فارغاً يُضاف الأبناء تحت الجد الأكبر.</small></label>
    <label class="field"><span>الأسماء</span><input name="names" placeholder="مثال: علي، حسن، محمد" required></label>
    <div class="full"><button class="btn btn-primary btn-sm" type="submit"><?= icon('plus') ?>إضافة</button></div>
  </form>
  <?php $roots = array_filter($map, fn($p) => $p['parent_id'] === null && $p['status'] === 'approved'); ?>
  <form method="post" class="panel-body" style="border-top:1px dashed var(--line);display:flex;gap:8px;flex-wrap:wrap;align-items:end" data-confirm="سيصبح هذا الاسم الجد الأكبر، وينتقل الجد الحالي وكل الشجرة تحته. متابعة؟">
    <?= csrf_field() ?><input type="hidden" name="act" value="add_ancestor">
    <label class="field" style="margin:0;flex:1;min-width:220px"><span>إضافة جد أعلى فوق «<?= e(implode('، ', array_column($roots, 'name'))) ?>» (لإكمال سلسلة الأجداد للأعلى)</span><input name="name" placeholder="اسم أبي الجد الأكبر الحالي" required></label>
    <button class="btn btn-outline btn-sm" type="submit"><?= icon('arrow-up') ?>إضافة جد أعلى</button>
  </form>
</section>

<section class="panel">
  <form class="filters" method="get">
    <label class="field" style="flex:1"><span>بحث (الاسم ثم الأب ثم الجد)</span><input type="search" name="q" value="<?= e($q) ?>" placeholder="مثال: علي عبد الحليم"></label>
    <label class="field"><span>البيت</span><select name="house"><option value="">كل البيوت</option><?php foreach ($houses as $h): ?><option value="<?= $h['id'] ?>" <?= $house === $h['id'] ? 'selected' : '' ?>><?= e($h['house_name'] ?: 'بيت ' . $h['name']) ?></option><?php endforeach; ?></select></label>
    <label class="field"><span>الحالة</span><select name="status"><option value="">الكل</option><option value="approved" <?= $status === 'approved' ? 'selected' : '' ?>>معتمد</option><option value="pending" <?= $status === 'pending' ? 'selected' : '' ?>>بانتظار المراجعة</option></select></label>
    <label class="field"><span>الترتيب</span><select name="sort"><option value="recent">الأحدث</option><option value="name" <?= $sort === 'name' ? 'selected' : '' ?>>الاسم</option><option value="gen" <?= $sort === 'gen' ? 'selected' : '' ?>>الجيل</option></select></label>
    <?php if ($by !== ''): ?><input type="hidden" name="by" value="<?= e($by) ?>"><span class="badge badge-info">أضافه: <?= e($by) ?> <a href="<?= e(qs(['by' => null])) ?>"><?= icon('x') ?></a></span><?php endif; ?>
    <button class="btn btn-sm btn-primary" type="submit"><?= icon('filter') ?>تصفية</button>
  </form>
  <div class="table-wrap"><table class="t">
    <thead><tr><th>الاسم والنسب</th><th>الجيل</th><th>البيت</th><th>الأبناء</th><th>أضافه</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($slice as $id): $p = $map[$id]; $h = house_of($id, $map); $d = $details[$id] ?? []; ?>
      <tr>
        <td class="nm"><b><?= (int)$p['is_head'] ? icon('crown') . ' ' : '' ?><?= e($p['name']) ?></b><small><?= e(nasab($id, $map, 6)) ?></small></td>
        <td class="num"><?= depth_of($id, $map) ?></td>
        <td><?= $h ? '<span class="swatch" style="background:' . e($map[$h]['house_color'] ?: '#d9ae22') . '"></span> ' . e($map[$h]['house_name'] ?: 'بيت ' . $map[$h]['name']) : '—' ?></td>
        <td class="num"><?= count($kids[$id] ?? []) ?></td>
        <td><small><?= e($d['created_by_label'] ?? '') ?></small></td>
        <td class="num"><small><?= e(fmt_dt($d['created_at'] ?? null, false)) ?></small></td>
        <td><?= $p['status'] === 'pending' ? '<span class="badge badge-warn">بانتظار</span>' : '<span class="badge badge-ok">معتمد</span>' ?></td>
        <td><div class="acts"><a class="btn btn-xs btn-outline" href="?edit=<?= $id ?>"><?= icon('edit') ?>تعديل</a><a class="btn btn-xs btn-ghost" href="<?= e(url('tree.php?focus=' . $id)) ?>" target="_blank" title="في الشجرة"><?= icon('tree') ?></a></div></td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$slice): ?><tr><td colspan="8" class="empty"><?= icon('search') ?>لا توجد نتائج</td></tr><?php endif; ?>
    </tbody>
  </table></div>
  <?= pager($total, $page, $per) ?>
</section>
<?php admin_foot(); ?>

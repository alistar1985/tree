<?php
/**
 * إدارة البيوت: تعيين رؤوس البيوت، أسماؤها وألوانها، إحصاءاتها، ورموزها.
 */
require __DIR__ . '/_layout.php';
admin_require('houses');

if (admin_post()) {
    $act = (string)($_POST['act'] ?? '');
    try {
        $id = (int)($_POST['person_id'] ?? 0);
        if ($act === 'save') {
            $newName = name_clean((string)($_POST['new_name'] ?? ''));
            $houseName = trim((string)($_POST['house_name'] ?? ''));
            $color = (string)($_POST['house_color'] ?? '');
            if (!$id && $newName !== '') {
                // رأس بيت جديد: يُضاف تحت الأب المختار، أو تحت الجد الأكبر إن لم يُختر أب
                $parent = (int)($_POST['parent_id'] ?? 0);
                if (!$parent) {
                    $roots = array_keys(array_filter(people_map(true), fn($p) => $p['parent_id'] === null));
                    if (count($roots) !== 1) throw new InvalidArgumentException('اختر الأب الذي يتفرع منه البيت');
                    $parent = $roots[0];
                }
                $twin = sibling_with_key($parent, name_key($newName));
                $id = $twin ? (int)$twin['id'] : person_add($parent, ['name' => $newName], actor());
            }
            if (!$id) throw new InvalidArgumentException('اكتب اسم رأس البيت أو اختر شخصاً موجوداً في الشجرة');
            $p = person_row($id);
            if (!$p) throw new InvalidArgumentException('الشخص غير موجود');
            person_update($id, ['is_head' => 1, 'house_name' => $houseName ?: 'بيت ' . $p['name'], 'house_color' => $color], actor());
            flash('ok', 'تم حفظ «' . ($houseName ?: 'بيت ' . $p['name']) . '». أضف أبناءه من الشجرة أو من صفحة الأفراد.');
        } elseif ($act === 'remove') {
            person_update($id, ['is_head' => 0], actor());
            flash('ok', 'أُزيلت صفة البيت (لم يُحذف أي فرد).');
        }
    } catch (InvalidArgumentException $e) {
        flash('danger', $e->getMessage());
    }
    back();
}

$map = people_map(true);
$kids = children_index($map);
$codeCounts = [];
foreach (db_all('SELECT scope_person_id s, COUNT(*) c, SUM(is_active) a FROM codes WHERE scope_person_id IS NOT NULL GROUP BY scope_person_id') as $r) {
    $codeCounts[(int)$r['s']] = $r;
}
$dm = depth_map($map);
$houses = [];
foreach ($map as $id => $p) {
    if (!(int)$p['is_head']) continue;
    $desc = descendant_ids($id, $kids);
    $base = $dm[$id];
    $maxD = 0;
    $pending = 0;
    foreach ($desc as $d) {
        $maxD = max($maxD, $dm[$d] - $base);
        if ($map[$d]['status'] === 'pending') $pending++;
    }
    $parentHouse = $p['parent_id'] !== null ? house_of((int)$p['parent_id'], $map) : null;
    $houses[] = ['p' => $p, 'members' => count($desc) + 1, 'gens' => $maxD + 1, 'gen' => $base, 'pending' => $pending, 'kids' => count($kids[$id] ?? []),
        'parent' => $parentHouse ? ($map[$parentHouse]['house_name'] ?: 'بيت ' . $map[$parentHouse]['name']) : null];
}
usort($houses, fn($a, $b) => $a['gen'] <=> $b['gen'] ?: $b['members'] <=> $a['members']);
$edit = isset($_GET['edit']) ? person_row((int)$_GET['edit']) : null;

// الفروع التلقائية التي يمكن تحويلها إلى بيوت: من الجد الجامع نزولاً ثلاثة أجيال
$crown = auto_crown_id($map, $kids);
$rootIds = array_keys(array_filter($map, fn($p) => $p['parent_id'] === null));
$suggest = [];
if ($crown !== null) {
    $level = $kids[$crown] ?? [];
    for ($g = 1; $g <= 3 && $level; $g++) {
        $next = [];
        foreach ($level as $c) {
            $n = count(descendant_ids($c, $kids));
            if ($n >= 2 && !(int)$map[$c]['is_head'] && $map[$c]['status'] === 'approved') $suggest[] = ['id' => $c, 'members' => $n + 1, 'g' => $g];
            foreach ($kids[$c] ?? [] as $k) $next[] = $k;
        }
        $level = $next;
    }
    usort($suggest, fn($a, $b) => $a['g'] <=> $b['g'] ?: $b['members'] <=> $a['members']);
    $suggest = array_slice($suggest, 0, 24);
}

admin_head('البيوت', 'houses', ['icon' => 'house']);
?>
<section class="panel">
  <div class="panel-head"><div><h2><?= icon($edit ? 'edit' : 'plus') ?><?= $edit ? 'تعديل ' . e($edit['house_name'] ?: 'بيت ' . $edit['name']) : 'إنشاء بيت جديد' ?></h2>
    <p>البيت = رأس بيت وكل ذريته. يظهر في القائمة الجانبية للشجرة، وله صفحة شجرة خاصة، ويمكن منحه رمزاً للإضافة. حتى بدون بيوت، تتفرع الشجرة تلقائياً من كل جد حسب نسبه.</p></div></div>
  <form method="post" class="panel-body form-grid">
    <?= csrf_field() ?><input type="hidden" name="act" value="save">
    <?php if ($edit): ?>
      <input type="hidden" name="person_id" value="<?= (int)$edit['id'] ?>">
      <div class="field"><span>رأس البيت</span><b style="padding:.5em 0"><?= e(nasab((int)$edit['id'], $map, 6)) ?></b></div>
    <?php else: ?>
      <label class="field"><span>اسم رأس البيت</span><input name="new_name" placeholder="مثال: محمد"><small>يُضاف تلقائياً إلى الشجرة إن لم يكن موجوداً.</small></label>
      <label class="field"><span>ابن مَن؟ (أبوه في الشجرة)</span><?= person_picker('parent_id', 'ابحث عن الأب…', count($rootIds) === 1 ? $rootIds[0] : null) ?><small>الافتراضي: الجد الأكبر.</small></label>
      <label class="field full"><span>أو اختر شخصاً موجوداً في الشجرة ليصبح رأس بيت</span><?= person_picker('person_id', 'ابحث عن شخص موجود…') ?></label>
    <?php endif; ?>
    <label class="field"><span>اسم البيت</span><input name="house_name" value="<?= e($edit['house_name'] ?? '') ?>" placeholder="مثال: بيت محمد الموسى"></label>
    <label class="field"><span>لون البيت</span><input type="color" name="house_color" value="<?= e(($edit['house_color'] ?? '') ?: '#c0392b') ?>"></label>
    <div class="field"><span>&nbsp;</span><div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" type="submit"><?= icon('check') ?>حفظ</button><?php if ($edit): ?><a class="btn btn-ghost btn-sm" href="houses.php">إلغاء</a><?php endif; ?></div></div>
  </form>
</section>

<?php if ($suggest && !$edit): ?>
<section class="panel">
  <div class="panel-head"><div><h2><?= icon('branch') ?>فروع تلقائية من الجد «<?= e($map[$crown]['name']) ?>»</h2><p>هذه الفروع تظهر في الشجرة تلقائياً. اضغط «اجعله بيتاً» لتسميته وإعطائه رمزاً.</p></div></div>
  <div class="table-wrap"><table class="t">
    <thead><tr><th>الفرع</th><th>الجيل من الجد الجامع</th><th>الأفراد</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($suggest as $s): ?>
      <tr>
        <td class="nm"><b><?= e($map[$s['id']]['name']) ?></b><small><?= e(nasab($s['id'], $map, 5)) ?></small></td>
        <td class="num"><?= e(gen_ordinal($s['g'])) ?></td>
        <td class="num"><?= number_format($s['members']) ?></td>
        <td><div class="acts">
          <a class="btn btn-xs btn-ghost" href="<?= e(url('tree.php?root=' . $s['id'])) ?>" target="_blank"><?= icon('tree') ?></a>
          <form method="post"><?= csrf_field() ?><input type="hidden" name="act" value="save"><input type="hidden" name="person_id" value="<?= $s['id'] ?>"><input type="hidden" name="house_name" value=""><input type="hidden" name="house_color" value="">
            <button class="btn btn-xs btn-gold" type="submit"><?= icon('crown') ?>اجعله بيتاً</button></form>
        </div></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
</section>
<?php endif; ?>

<section class="panel">
  <div class="panel-head"><h2><?= icon('house') ?>بيوت العشيرة (<?= count($houses) ?>)</h2></div>
  <div class="table-wrap"><table class="t">
    <thead><tr><th>البيت</th><th>ضمن</th><th>الجيل</th><th>الأفراد</th><th>الأجيال</th><th>بانتظار</th><th>الرموز</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($houses as $h): $p = $h['p']; $id = $p['id']; $cc = $codeCounts[$id] ?? null; ?>
      <tr>
        <td class="nm"><b><span class="swatch" style="background:<?= e($p['house_color'] ?: '#d9ae22') ?>"></span> <?= e($p['house_name'] ?: 'بيت ' . $p['name']) ?></b><small><?= e(nasab($id, $map, 5)) ?></small></td>
        <td><small><?= e($h['parent'] ?? '—') ?></small></td>
        <td class="num"><?= $h['gen'] ?></td>
        <td class="num"><b><?= number_format($h['members']) ?></b></td>
        <td class="num"><?= $h['gens'] ?></td>
        <td><?= $h['pending'] ? '<span class="badge badge-warn">' . $h['pending'] . '</span>' : '—' ?></td>
        <td><?= $cc ? '<span class="badge badge-gold">' . (int)$cc['a'] . ' فعال / ' . (int)$cc['c'] . '</span>' : '<span class="muted">—</span>' ?></td>
        <td><div class="acts">
          <a class="btn btn-xs btn-outline" href="<?= e(url('tree.php?root=' . $id)) ?>" target="_blank"><?= icon('tree') ?>الشجرة</a>
          <a class="btn btn-xs btn-gold" href="<?= e(url('admin/codes.php?scope=' . $id)) ?>"><?= icon('key') ?>رمز</a>
          <a class="btn btn-xs btn-ghost" href="?edit=<?= $id ?>"><?= icon('edit') ?></a>
          <form method="post" data-confirm="إزالة صفة البيت عن «<?= e($p['name']) ?>»؟ لن يُحذف أي فرد."><?= csrf_field() ?><input type="hidden" name="act" value="remove"><input type="hidden" name="person_id" value="<?= $id ?>"><button class="btn btn-xs btn-ghost" title="إزالة البيت"><?= icon('x') ?></button></form>
        </div></td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$houses): ?><tr><td colspan="8" class="empty"><?= icon('house') ?>لم تُحدَّد بيوت بعد — أنشئ أول بيت من النموذج أعلاه</td></tr><?php endif; ?>
    </tbody>
  </table></div>
</section>
<?php admin_foot(); ?>

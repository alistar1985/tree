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
            if (!$id) throw new InvalidArgumentException('اختر رأس البيت من الشجرة');
            $p = person_row($id);
            if (!$p) throw new InvalidArgumentException('الشخص غير موجود');
            person_update($id, ['is_head' => 1, 'house_name' => trim((string)$_POST['house_name']) ?: 'بيت ' . $p['name'], 'house_color' => (string)($_POST['house_color'] ?? '')], actor());
            flash('ok', 'تم حفظ البيت.');
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

admin_head('البيوت', 'houses', ['icon' => 'house']);
?>
<section class="panel">
  <div class="panel-head"><div><h2><?= icon($edit ? 'edit' : 'plus') ?><?= $edit ? 'تعديل ' . e($edit['house_name'] ?: 'بيت ' . $edit['name']) : 'إنشاء بيت جديد' ?></h2>
    <p>البيت = رأس بيت وكل ذريته. يظهر في القائمة الجانبية للشجرة، وله صفحة شجرة خاصة، ويمكن منحه رمزاً للإضافة.</p></div></div>
  <form method="post" class="panel-body form-grid">
    <?= csrf_field() ?><input type="hidden" name="act" value="save">
    <label class="field"><span>رأس البيت</span><?= person_picker('person_id', 'ابحث عن رأس البيت…', $edit ? (int)$edit['id'] : null, true) ?></label>
    <label class="field"><span>اسم البيت</span><input name="house_name" value="<?= e($edit['house_name'] ?? '') ?>" placeholder="مثال: بيت محمد الموسى"></label>
    <label class="field"><span>لون البيت</span><input type="color" name="house_color" value="<?= e(($edit['house_color'] ?? '') ?: '#c0392b') ?>"></label>
    <div class="field"><span>&nbsp;</span><div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" type="submit"><?= icon('check') ?>حفظ</button><?php if ($edit): ?><a class="btn btn-ghost btn-sm" href="houses.php">إلغاء</a><?php endif; ?></div></div>
  </form>
</section>

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

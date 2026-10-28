<?php
/**
 * مراجعة طلبات الإضافة واقتراحات التصحيح.
 */
require __DIR__ . '/_layout.php';
admin_require('review');

if (admin_post()) {
    $act = (string)($_POST['act'] ?? '');
    try {
        if ($act === 'approve') {
            $anchor = ($_POST['anchor_id'] ?? '') !== '' ? (int)$_POST['anchor_id'] : null;
            $r = submission_approve((int)$_POST['id'], actor(), $anchor, $anchor !== null ? (int)($_POST['anchor_index'] ?? 1) : null);
            flash('ok', 'تم اعتماد الطلب' . ($r['merged'] ? ' ودُمج تلقائياً مع الموجود: ' . implode('، ', $r['merged']) : '') . '.');
        } elseif ($act === 'reject') {
            submission_reject((int)$_POST['id'], actor(), trim((string)($_POST['note'] ?? '')));
            flash('ok', 'تم رفض الطلب.');
        } elseif ($act === 'approve_all') {
            $n = 0;
            foreach (db_all("SELECT id FROM submissions WHERE status = 'pending' AND anchor_id IS NOT NULL ORDER BY id") as $s) {
                submission_approve((int)$s['id'], actor());
                $n++;
            }
            flash('ok', "تم اعتماد " . ar_count($n, "طلب واحد", "طلبين", "طلبات", "طلباً") . ".");
        } elseif ($act === 'suggestion') {
            $st = $_POST['status'] === 'done' ? 'done' : 'dismissed';
            db_exec('UPDATE suggestions SET status = ?, reviewed_by_label = ?, reviewed_at = ? WHERE id = ?', [$st, actor()['label'], now(), (int)$_POST['id']]);
            flash('ok', $st === 'done' ? 'تم تعليم الاقتراح كمنجز.' : 'تم تجاهل الاقتراح.');
        }
    } catch (InvalidArgumentException $e) {
        flash('danger', $e->getMessage());
    }
    back();
}

$tab = in_array($_GET['tab'] ?? '', ['subs', 'sugg', 'archive'], true) ? $_GET['tab'] : 'subs';
$pendingCount = (int)db_val("SELECT COUNT(*) FROM submissions WHERE status = 'pending'");
$suggCount = (int)db_val("SELECT COUNT(*) FROM suggestions WHERE status = 'open'");
$mapAll = people_map(true);

admin_head('الطلبات والاقتراحات', 'review', ['icon' => 'inbox']);
?>
<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
  <nav class="tabs">
    <a href="?tab=subs" class="<?= $tab === 'subs' ? 'on' : '' ?>"><?= icon('user-plus') ?>طلبات الإضافة<?php if ($pendingCount): ?><span class="count"><?= $pendingCount ?></span><?php endif; ?></a>
    <a href="?tab=sugg" class="<?= $tab === 'sugg' ? 'on' : '' ?>"><?= icon('alert') ?>اقتراحات التصحيح<?php if ($suggCount): ?><span class="count"><?= $suggCount ?></span><?php endif; ?></a>
    <a href="?tab=archive" class="<?= $tab === 'archive' ? 'on' : '' ?>"><?= icon('history') ?>الأرشيف</a>
  </nav>
  <?php if ($tab === 'subs' && $pendingCount): ?>
    <form method="post" data-confirm="اعتماد جميع الطلبات المربوطة تلقائياً؟ الطلبات غير المربوطة تبقى للمراجعة اليدوية.">
      <?= csrf_field() ?><input type="hidden" name="act" value="approve_all">
      <button class="btn btn-ok-soft btn-sm" type="submit"><?= icon('check') ?>اعتماد كل المربوطة</button>
    </form>
  <?php endif; ?>
</div>

<?php if ($tab === 'subs'): $subs = db_all("SELECT s.*, c.holder_name FROM submissions s LEFT JOIN codes c ON c.id = s.code_id WHERE s.status = 'pending' ORDER BY s.id DESC LIMIT 100"); ?>
  <?php if (!$subs): ?><div class="panel"><div class="empty"><?= icon('check') ?>لا توجد طلبات بانتظار المراجعة</div></div><?php endif; ?>
  <?php foreach ($subs as $s):
      $names = json_decode($s['chain_json'], true) ?: [];
      $sons = json_decode($s['sons_json'] ?? '[]', true) ?: [];
      $persons = db_all("SELECT * FROM persons WHERE submission_id = ? AND status = 'pending' AND deleted_at IS NULL ORDER BY id", [(int)$s['id']]);
      $anchor = $s['anchor_id'] ? (int)$s['anchor_id'] : null;
  ?>
    <article class="sub-card">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div class="chain-viz">
            <?php foreach ($names as $i => $nm): ?><span class="n <?= $i === 0 ? 'anchor' : 'old' ?>" title="<?= e(i_role($i)) ?>"><?= e($nm) ?></span><?php if ($i < count($names) - 1): ?><span class="arrow">›</span><?php endif; ?><?php endforeach; ?>
          </div>
        </div>
        <span class="badge <?= $anchor ? 'badge-info' : 'badge-warn' ?>"><?= $anchor ? icon('link') . 'مربوط تلقائياً' : icon('alert') . 'بدون ربط' ?></span>
      </div>
      <?php if ($anchor && isset($mapAll[$anchor])): ?>
        <div style="font-size:.92rem">نقطة الربط: <a href="<?= e(url('tree.php?focus=' . $anchor)) ?>" target="_blank"><b><?= e(nasab($anchor, $mapAll, 8)) ?></b></a>
          <?php if ($persons): ?> — يُضاف تحته: <?php foreach ($persons as $p): ?><span class="badge badge-gold"><?= icon('plus') ?><?= e($p['name']) ?></span> <?php endforeach; ?><?php endif; ?>
        </div>
        <?php foreach ($persons as $p):
            $twin = sibling_with_key($p['parent_id'] !== null ? (int)$p['parent_id'] : null, $p['name_key'], (int)$p['id'], true);
            if ($twin): ?><div class="sub-warn"><?= icon('merge') ?>«<?= e($p['name']) ?>» موجود مسبقاً تحت الأب نفسه — سيُدمج تلقائياً عند الاعتماد</div><?php endif;
        endforeach; ?>
      <?php endif; ?>
      <?php if ($sons): ?><div style="font-size:.88rem">الأبناء: <?= e(implode('، ', $sons)) ?></div><?php endif; ?>
      <?php if ($s['note']): ?><div class="alert alert-info" style="margin:0"><?= icon('info') ?><?= e($s['note']) ?></div><?php endif; ?>
      <div class="sub-meta">
        <span><?= icon('clock') ?><?= e(time_ago($s['created_at'])) ?></span>
        <?php if ($s['phone']): ?><span><?= icon('phone') ?><a class="mono" href="https://wa.me/<?= e(preg_replace('/^0/', '964', preg_replace('/\D/', '', $s['phone']))) ?>" target="_blank" rel="noopener"><?= e($s['phone']) ?></a></span><?php endif; ?>
        <span><?= icon('desktop') ?><?= e($s['device']) ?></span>
        <span class="mono"><?= e($s['ip']) ?></span>
        <?php if ($s['holder_name']): ?><span><?= icon('key') ?>برمز: <?= e($s['holder_name']) ?></span><?php endif; ?>
      </div>
      <div class="sub-actions">
        <?php if ($anchor): ?>
          <form method="post"><?= csrf_field() ?><input type="hidden" name="act" value="approve"><input type="hidden" name="id" value="<?= (int)$s['id'] ?>">
            <button class="btn btn-sm btn-primary" type="submit"><?= icon('check') ?>اعتماد</button></form>
          <?php if ($s['self_person_id']): ?><a class="btn btn-sm btn-outline" href="<?= e(url('tree.php?focus=' . (int)$s['self_person_id'])) ?>" target="_blank"><?= icon('tree') ?>معاينة في الشجرة</a><?php endif; ?>
        <?php endif; ?>
        <details class="more" style="flex-basis:100%" <?= $anchor ? '' : 'open' ?>>
          <summary><?= $anchor ? 'تغيير نقطة الربط ثم الاعتماد' : 'حدد نقطة الربط لاعتماد الطلب' ?></summary>
          <form method="post" class="form-grid" style="margin-top:10px">
            <?= csrf_field() ?><input type="hidden" name="act" value="approve"><input type="hidden" name="id" value="<?= (int)$s['id'] ?>">
            <label class="field"><span>الشخص الموجود في الشجرة</span><?= person_picker('anchor_id', 'ابحث عن الجد…', null, true) ?></label>
            <label class="field"><span>هذا الشخص هو في سلسلة الطالب</span>
              <select name="anchor_index"><?php foreach ($names as $i => $nm): if ($i === 0) continue; ?><option value="<?= $i ?>"><?= e($nm) ?> (<?= e(i_role($i)) ?>)</option><?php endforeach; ?></select></label>
            <div><button class="btn btn-sm btn-primary" type="submit"><?= icon('link') ?>ربط واعتماد</button></div>
          </form>
        </details>
        <form method="post" style="display:flex;gap:6px;flex:1;min-width:240px">
          <?= csrf_field() ?><input type="hidden" name="act" value="reject"><input type="hidden" name="id" value="<?= (int)$s['id'] ?>">
          <input name="note" placeholder="سبب الرفض (يظهر لصاحب الطلب)" style="min-height:34px;font-size:.86rem">
          <button class="btn btn-sm btn-danger-soft" type="submit"><?= icon('x') ?>رفض</button>
        </form>
      </div>
    </article>
  <?php endforeach; ?>

<?php elseif ($tab === 'sugg'): $list = db_all("SELECT * FROM suggestions ORDER BY status = 'open' DESC, id DESC LIMIT 100"); ?>
  <section class="panel">
    <?php if (!$list): ?><div class="empty"><?= icon('check') ?>لا توجد اقتراحات</div><?php endif; ?>
    <div class="feed">
      <?php foreach ($list as $g): $pid = $g['person_id'] ? (int)$g['person_id'] : null; ?>
        <div class="feed-item">
          <span class="feed-dot <?= $g['status'] === 'open' ? 'warn' : 'ok' ?>"><?= icon($g['status'] === 'open' ? 'alert' : 'check') ?></span>
          <div style="flex:1;min-width:0">
            <p><?php if ($pid && isset($mapAll[$pid])): ?><a href="<?= e(url('admin/people.php?edit=' . $pid)) ?>"><b><?= e(nasab($pid, $mapAll, 5)) ?></b></a> — <?php endif; ?><?= e($g['message']) ?></p>
            <small><?= e(time_ago($g['created_at'])) ?><?= $g['contact'] ? ' · ' . e($g['contact']) : '' ?> · <span class="mono"><?= e($g['ip']) ?></span>
              <?= $g['status'] !== 'open' ? ' · ' . ($g['status'] === 'done' ? 'منجز' : 'متجاهل') . ' بواسطة ' . e($g['reviewed_by_label']) : '' ?></small>
          </div>
          <?php if ($g['status'] === 'open'): ?>
            <form method="post" style="display:flex;gap:6px"><?= csrf_field() ?><input type="hidden" name="act" value="suggestion"><input type="hidden" name="id" value="<?= (int)$g['id'] ?>">
              <button class="btn btn-xs btn-ok-soft" name="status" value="done"><?= icon('check') ?>تم التصحيح</button>
              <button class="btn btn-xs btn-ghost" name="status" value="dismissed">تجاهل</button></form>
          <?php endif; ?>
        </div>
      <?php endforeach; ?>
    </div>
  </section>

<?php else: $list = db_all("SELECT * FROM submissions WHERE status != 'pending' ORDER BY reviewed_at DESC, id DESC LIMIT 150"); ?>
  <section class="panel">
    <div class="table-wrap"><table class="t">
      <thead><tr><th>النسب المرسل</th><th>الحالة</th><th>المراجع</th><th>التاريخ</th><th>الجهاز</th></tr></thead>
      <tbody>
      <?php foreach ($list as $s): ?>
        <tr>
          <td class="nm"><b><?= e(implode(' ', json_decode($s['chain_json'], true) ?: [])) ?></b><?php if ($s['review_note']): ?><small><?= e($s['review_note']) ?></small><?php endif; ?></td>
          <td><?= $s['status'] === 'approved' ? '<span class="badge badge-ok">معتمد</span>' : '<span class="badge badge-danger">مرفوض</span>' ?></td>
          <td><?= e($s['reviewed_by_label']) ?></td>
          <td class="num"><?= e(fmt_dt($s['reviewed_at'] ?: $s['created_at'])) ?></td>
          <td><small><?= e($s['device']) ?></small></td>
        </tr>
      <?php endforeach; ?>
      <?php if (!$list): ?><tr><td colspan="5" class="empty">لا يوجد أرشيف بعد</td></tr><?php endif; ?>
      </tbody>
    </table></div>
  </section>
<?php endif; ?>
<?php
function i_role(int $i): string
{
    return [0 => 'صاحب الطلب', 1 => 'الأب', 2 => 'الجد'][$i] ?? ('الجد ' . gen_ordinal($i - 1));
}
admin_foot();

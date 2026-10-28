<?php
/**
 * سجل العمليات: من أضاف ومن عدّل ومن حذف ومتى ومن أي جهاز، مع الاستعادة والتراجع.
 */
require __DIR__ . '/_layout.php';
admin_require('log');

if (admin_post()) {
    $act = (string)($_POST['act'] ?? '');
    try {
        $row = db_one('SELECT * FROM audit_log WHERE id = ?', [(int)($_POST['id'] ?? 0)]);
        if (!$row) throw new InvalidArgumentException('العملية غير موجودة');
        if ($act === 'restore' && $row['action'] === 'delete') {
            $b = json_decode((string)$row['before_json'], true);
            $n = restore_batch((string)($b['batch'] ?? ''), actor());
            flash('ok', "تمت استعادة " . ar_count($n, "فرد واحد", "فردين", "أفراد", "فرداً") . ".");
        } elseif ($act === 'revert' && $row['action'] === 'update' && $row['entity'] === 'person') {
            $b = json_decode((string)$row['before_json'], true) ?: [];
            person_update((int)$row['entity_id'], $b, actor());
            audit('revert', 'person', (int)$row['entity_id'], 'تراجع عن تعديل سابق (#' . $row['id'] . ')');
            flash('ok', 'تم التراجع عن التعديل.');
        } elseif ($act === 'revert' && $row['action'] === 'move') {
            $b = json_decode((string)$row['before_json'], true) ?: [];
            if (empty($b['parent_id'])) throw new InvalidArgumentException('لا يمكن التراجع عن هذا النقل');
            person_move((int)$row['entity_id'], (int)$b['parent_id'], actor());
            flash('ok', 'تمت إعادة الشخص إلى أبيه السابق.');
        }
    } catch (InvalidArgumentException $e) {
        flash('danger', $e->getMessage());
    }
    back();
}

$where = [];
$params = [];
$type = $_GET['type'] ?? '';
if (in_array($type, ['admin', 'code', 'public'], true)) { $where[] = 'actor_type = ?'; $params[] = $type; }
$action = $_GET['action'] ?? '';
if ($action !== '' && isset(ACTION_LABELS[$action])) { $where[] = 'action = ?'; $params[] = $action; }
if (preg_match('/^(admin|code|public):(\d+)$/', $_GET['actor'] ?? '', $m)) { $where[] = 'actor_type = ? AND actor_id = ?'; $params[] = $m[1]; $params[] = (int)$m[2]; }
if (($q = trim((string)($_GET['q'] ?? ''))) !== '') { $where[] = '(summary LIKE ? OR actor_label LIKE ? OR ip LIKE ?)'; array_push($params, "%$q%", "%$q%", "%$q%"); }
if (($from = $_GET['from'] ?? '') !== '') { $where[] = 'created_at >= ?'; $params[] = $from . ' 00:00:00'; }
if (($to = $_GET['to'] ?? '') !== '') { $where[] = 'created_at <= ?'; $params[] = $to . ' 23:59:59'; }
$sqlWhere = $where ? 'WHERE ' . implode(' AND ', $where) : '';
$per = 50;
$page = max(1, (int)($_GET['page'] ?? 1));
$total = (int)db_val("SELECT COUNT(*) FROM audit_log $sqlWhere", $params);
$rows = db_all("SELECT * FROM audit_log $sqlWhere ORDER BY id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $params);
$restored = [];
foreach (db_all("SELECT after_json FROM audit_log WHERE action = 'restore'") as $r) {
    $a = json_decode((string)$r['after_json'], true);
    if (!empty($a['batch'])) $restored[$a['batch']] = true;
}

function diff_table(?string $before, ?string $after): string
{
    $b = $before ? json_decode($before, true) : null;
    $a = $after ? json_decode($after, true) : null;
    if (!is_array($b) && !is_array($a)) return '';
    $flat = function ($v) { return is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : (string)$v; };
    $keys = array_unique(array_merge(array_keys($b ?: []), array_keys($a ?: [])));
    $out = '<table class="diff"><tr><th>الحقل</th>' . (is_array($b) ? '<th>قبل</th>' : '') . (is_array($a) ? '<th>بعد</th>' : '') . '</tr>';
    foreach ($keys as $k) {
        if (in_array($k, ['name_key', 'password_hash'], true)) continue;
        $out .= '<tr><th>' . e(FIELD_LABELS[$k] ?? $k) . '</th>'
            . (is_array($b) ? '<td class="old">' . e(mb_substr($flat($b[$k] ?? ''), 0, 300)) . '</td>' : '')
            . (is_array($a) ? '<td class="new">' . e(mb_substr($flat($a[$k] ?? ''), 0, 300)) . '</td>' : '') . '</tr>';
    }
    return $out . '</table>';
}

admin_head('سجل العمليات', 'log', ['icon' => 'history']);
?>
<section class="panel">
  <form class="filters" method="get">
    <label class="field" style="flex:1;min-width:200px"><span>بحث</span><input type="search" name="q" value="<?= e($q) ?>" placeholder="اسم، فاعل، عنوان IP…"></label>
    <label class="field"><span>الفاعل</span><select name="type"><option value="">الكل</option><?php foreach (['admin', 'code', 'public'] as $t): ?><option value="<?= $t ?>" <?= $type === $t ? 'selected' : '' ?>><?= e(ACTOR_LABELS[$t]) ?></option><?php endforeach; ?></select></label>
    <label class="field"><span>العملية</span><select name="action"><option value="">الكل</option><?php foreach (ACTION_LABELS as $k => [$l]): ?><option value="<?= $k ?>" <?= $action === $k ? 'selected' : '' ?>><?= e($l) ?></option><?php endforeach; ?></select></label>
    <label class="field"><span>من</span><input type="date" name="from" value="<?= e($from) ?>"></label>
    <label class="field"><span>إلى</span><input type="date" name="to" value="<?= e($to) ?>"></label>
    <?php if (!empty($_GET['actor'])): ?><input type="hidden" name="actor" value="<?= e($_GET['actor']) ?>"><?php endif; ?>
    <button class="btn btn-sm btn-primary" type="submit"><?= icon('filter') ?>تصفية</button>
    <?php if ($where): ?><a class="btn btn-sm btn-ghost" href="log.php">مسح</a><?php endif; ?>
  </form>
  <div class="table-wrap"><table class="t">
    <thead><tr><th>الوقت</th><th>الفاعل</th><th>العملية</th><th>التفاصيل</th><th>الجهاز والعنوان</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($rows as $r):
        $b = $r['before_json'] ? json_decode($r['before_json'], true) : null;
        $canRestore = $r['action'] === 'delete' && !empty($b['batch']) && empty($restored[$b['batch']]);
        $canRevert = ($r['action'] === 'update' && $r['entity'] === 'person') || ($r['action'] === 'move' && !empty($b['parent_id']));
        $diff = in_array($r['action'], ['update', 'move', 'merge', 'delete', 'code_delete', 'submit', 'create'], true) ? diff_table($r['before_json'], $r['after_json']) : ''; ?>
      <tr>
        <td class="num" style="white-space:nowrap"><small><?= e(fmt_dt($r['created_at'])) ?><br><span class="muted"><?= e(time_ago($r['created_at'])) ?></span></small></td>
        <td class="nm"><b><?= e($r['actor_label']) ?></b><small><?= e(ACTOR_LABELS[$r['actor_type']] ?? $r['actor_type']) ?></small></td>
        <td><?= action_badge($r['action']) ?></td>
        <td style="min-width:260px"><?= e($r['summary']) ?>
          <?php if ($diff): ?><details class="more"><summary>عرض البيانات</summary><?= $diff ?></details><?php endif; ?></td>
        <td><small><?= e($r['device']) ?><br><span class="mono"><?= e($r['ip']) ?></span></small></td>
        <td><div class="acts">
          <?php if ($canRestore): ?><form method="post" data-confirm="استعادة المحذوف؟"><?= csrf_field() ?><input type="hidden" name="act" value="restore"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>"><button class="btn btn-xs btn-ok-soft"><?= icon('undo') ?>استعادة</button></form><?php endif; ?>
          <?php if ($canRevert): ?><form method="post" data-confirm="التراجع عن هذه العملية؟"><?= csrf_field() ?><input type="hidden" name="act" value="revert"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>"><button class="btn btn-xs btn-outline"><?= icon('undo') ?>تراجع</button></form><?php endif; ?>
          <?php if ($r['entity'] === 'person' && $r['entity_id']): ?><a class="btn btn-xs btn-ghost" href="<?= e(url('admin/people.php?edit=' . (int)$r['entity_id'])) ?>" title="الشخص"><?= icon('user') ?></a><?php endif; ?>
        </div></td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$rows): ?><tr><td colspan="6" class="empty"><?= icon('history') ?>لا توجد عمليات مطابقة</td></tr><?php endif; ?>
    </tbody>
  </table></div>
  <?= pager($total, $page, $per) ?>
</section>
<?php admin_foot(); ?>

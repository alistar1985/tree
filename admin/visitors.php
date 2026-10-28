<?php
/**
 * الزوار والأجهزة: من دخل، كم عددهم، أجهزتهم وأنظمتهم ومتصفحاتهم، والصفحات والمصادر.
 */
require __DIR__ . '/_layout.php';
admin_require('visitors');

if (admin_post() && ($_POST['act'] ?? '') === 'clear' && admin_can('settings')) {
    $days = max(0, (int)($_POST['days'] ?? 90));
    $n = db_exec('DELETE FROM visits WHERE created_at < ?', [date('Y-m-d H:i:s', strtotime("-$days days"))]);
    audit('settings', 'visits', null, "حذف $n زيارة أقدم من $days يوماً");
    flash('ok', "تم حذف $n سجل زيارة.");
    back();
}

$range = in_array((int)($_GET['range'] ?? 30), [7, 30, 90, 365], true) ? (int)($_GET['range'] ?? 30) : 30;
$since = date('Y-m-d 00:00:00', strtotime('-' . ($range - 1) . ' days'));
$nb = 'is_bot = 0 AND created_at >= ?';

$k = [
    'online' => (int)db_val('SELECT COUNT(DISTINCT visitor_id) FROM visits WHERE is_bot = 0 AND created_at >= ?', [date('Y-m-d H:i:s', strtotime('-5 minutes'))]),
    'today'  => (int)db_val('SELECT COUNT(DISTINCT visitor_id) FROM visits WHERE is_bot = 0 AND created_at >= ?', [date('Y-m-d 00:00:00')]),
    'unique' => (int)db_val("SELECT COUNT(DISTINCT visitor_id) FROM visits WHERE $nb", [$since]),
    'views'  => (int)db_val("SELECT COUNT(*) FROM visits WHERE $nb", [$since]),
    'new'    => (int)db_val("SELECT COUNT(*) FROM visits WHERE $nb AND is_new = 1", [$since]),
    'bots'   => (int)db_val('SELECT COUNT(*) FROM visits WHERE is_bot = 1 AND created_at >= ?', [$since]),
    'coded'  => (int)db_val("SELECT COUNT(DISTINCT visitor_id) FROM visits WHERE $nb AND code_id IS NOT NULL", [$since]),
];

$daily = [];
foreach (db_all("SELECT substr(created_at, 1, 10) d, COUNT(DISTINCT visitor_id) u, COUNT(*) v FROM visits WHERE $nb GROUP BY d", [$since]) as $r) $daily[$r['d']] = $r;
$dayRows = [];
for ($i = $range - 1; $i >= 0; $i--) {
    $d = date('Y-m-d', strtotime("-$i days"));
    $u = (int)($daily[$d]['u'] ?? 0);
    $dayRows[] = [date('d/m', strtotime($d)), $u, date('Y/m/d', strtotime($d)) . ' — ' . $u . ' زائر · ' . (int)($daily[$d]['v'] ?? 0) . ' مشاهدة'];
}
$hours = array_fill(0, 24, 0);
foreach (db_all("SELECT CAST(substr(created_at, 12, 2) AS INTEGER) h, COUNT(*) c FROM visits WHERE $nb GROUP BY h", [$since]) as $r) $hours[(int)$r['h']] = (int)$r['c'];
$hourRows = array_map(fn($h, $c) => [sprintf('%02d', $h), $c, sprintf('%02d:00', $h) . ' — ' . $c . ' مشاهدة'], array_keys($hours), $hours);

$group = function (string $col, int $limit = 8) use ($nb, $since) {
    return db_all("SELECT COALESCE($col, 'غير معروف') l, COUNT(DISTINCT visitor_id) c FROM visits WHERE $nb GROUP BY l ORDER BY c DESC LIMIT $limit", [$since]);
};
$devIcons = ['mobile' => 'mobile', 'desktop' => 'desktop', 'tablet' => 'tablet'];
$devices = array_map(fn($r) => [DEVICE_LABELS[$r['l']] ?? $r['l'], (int)$r['c'], $devIcons[$r['l']] ?? null], $group('device'));
$oses = array_map(fn($r) => [$r['l'], (int)$r['c'], null], $group('os'));
$browsers = array_map(fn($r) => [$r['l'], (int)$r['c'], null], $group('browser'));
$models = array_map(fn($r) => [$r['l'], (int)$r['c'], 'mobile'], array_filter($group('model', 10), fn($r) => $r['l'] !== 'غير معروف'));
$pageNames = ['home' => 'الرئيسية', 'tree' => 'الشجرة', 'add' => 'أضف نسبك'];
$pages = array_map(fn($r) => [$pageNames[$r['l']] ?? $r['l'], (int)$r['c'], null], db_all("SELECT page l, COUNT(*) c FROM visits WHERE $nb GROUP BY page ORDER BY c DESC", [$since]));
$refs = array_map(function ($r) {
    $h = parse_url($r['l'], PHP_URL_HOST) ?: $r['l'];
    return [preg_replace('/^(www\.|m\.|l\.|lm\.)/', '', $h), (int)$r['c'], 'link'];
}, db_all("SELECT referrer l, COUNT(*) c FROM visits WHERE $nb AND referrer != '' GROUP BY referrer ORDER BY c DESC LIMIT 8", [$since]));

// قائمة الزيارات
$fd = $_GET['device'] ?? '';
$bots = isset($_GET['bots']);
$w = ['v.created_at >= ?'];
$p = [$since];
if (!$bots) $w[] = 'v.is_bot = 0';
if (isset(DEVICE_LABELS[$fd])) { $w[] = 'v.device = ?'; $p[] = $fd; }
if (($vid = $_GET['vid'] ?? '') !== '') { $w[] = 'v.visitor_id = ?'; $p[] = $vid; }
$sw = 'WHERE ' . implode(' AND ', $w);
$per = 40;
$page = max(1, (int)($_GET['page'] ?? 1));
$total = (int)db_val("SELECT COUNT(*) FROM visits v $sw", $p);
$list = db_all("SELECT v.*, c.holder_name, a.display_name admin_name FROM visits v LEFT JOIN codes c ON c.id = v.code_id LEFT JOIN admins a ON a.id = v.admin_id $sw ORDER BY v.id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $p);
$visitCounts = [];
if ($list) {
    $vids = array_values(array_unique(array_column($list, 'visitor_id')));
    $ph = implode(',', array_fill(0, count($vids), '?'));
    foreach (db_all("SELECT visitor_id, COUNT(*) c, MIN(created_at) f FROM visits WHERE visitor_id IN ($ph) GROUP BY visitor_id", $vids) as $r) $visitCounts[$r['visitor_id']] = $r;
}

admin_head('الزوار والأجهزة', 'visitors', ['icon' => 'eye']);
?>
<nav class="tabs">
  <?php foreach ([7 => '7 أيام', 30 => '30 يوماً', 90 => '3 أشهر', 365 => 'سنة'] as $r => $l): ?>
    <a href="<?= e(qs(['range' => $r, 'page' => null])) ?>" class="<?= $range === $r ? 'on' : '' ?>"><?= $l ?></a>
  <?php endforeach; ?>
</nav>

<section class="kpis">
  <div class="kpi"><span class="k-ic"><?= icon('globe') ?></span><span>متصل الآن</span><b><?= $k['online'] ?></b><small>آخر 5 دقائق</small></div>
  <div class="kpi info"><span class="k-ic"><?= icon('eye') ?></span><span>زوار اليوم</span><b><?= number_format($k['today']) ?></b><small>زائر فريد</small></div>
  <div class="kpi gold"><span class="k-ic"><?= icon('users') ?></span><span>زوار الفترة</span><b><?= number_format($k['unique']) ?></b><small><?= number_format($k['views']) ?> مشاهدة · <?= number_format($k['new']) ?> زائر جديد</small></div>
  <div class="kpi warn"><span class="k-ic"><?= icon('key') ?></span><span>دخلوا برمز بيت</span><b><?= number_format($k['coded']) ?></b><small><?= number_format($k['bots']) ?> زيارة روبوتات مستبعدة</small></div>
</section>

<div class="grid-panels c2">
  <section class="panel"><div class="panel-head"><h2><?= icon('chart') ?>الزوار الفريدون يومياً</h2></div><div class="panel-body"><?= col_chart($dayRows, 'زائر') ?></div></section>
  <section class="panel"><div class="panel-head"><h2><?= icon('clock') ?>أوقات الزيارة خلال اليوم</h2></div><div class="panel-body"><?= col_chart($hourRows, 'مشاهدة') ?></div></section>
</div>

<div class="grid-panels c3">
  <section class="panel"><div class="panel-head"><h2><?= icon('mobile') ?>نوع الجهاز</h2></div><div class="panel-body"><?= hbars($devices) ?></div></section>
  <section class="panel"><div class="panel-head"><h2><?= icon('desktop') ?>نظام التشغيل</h2></div><div class="panel-body"><?= hbars($oses) ?></div></section>
  <section class="panel"><div class="panel-head"><h2><?= icon('globe') ?>المتصفح والتطبيق</h2></div><div class="panel-body"><?= hbars($browsers) ?></div></section>
  <section class="panel"><div class="panel-head"><h2><?= icon('layers') ?>الصفحات</h2></div><div class="panel-body"><?= hbars($pages) ?></div></section>
  <section class="panel"><div class="panel-head"><h2><?= icon('link') ?>مصادر الزيارات</h2><p>من أين جاء الزوار (واتساب، فيسبوك…)</p></div><div class="panel-body"><?= hbars($refs) ?></div></section>
  <section class="panel"><div class="panel-head"><h2><?= icon('mobile') ?>طرازات الهواتف</h2></div><div class="panel-body"><?= hbars(array_values($models)) ?></div></section>
</div>

<section class="panel">
  <div class="panel-head"><h2><?= icon('eye') ?>سجل الزيارات</h2>
    <?php if (admin_can('settings')): ?>
      <form method="post" style="display:flex;gap:6px;align-items:center" data-confirm="حذف سجلات الزيارات القديمة؟"><?= csrf_field() ?><input type="hidden" name="act" value="clear">
        <select name="days" style="min-height:34px;width:auto;font-size:.84rem"><option value="90">أقدم من 90 يوماً</option><option value="30">أقدم من 30 يوماً</option><option value="0">الكل</option></select>
        <button class="btn btn-xs btn-ghost"><?= icon('trash') ?>تفريغ</button></form>
    <?php endif; ?>
  </div>
  <form class="filters" method="get">
    <input type="hidden" name="range" value="<?= $range ?>">
    <label class="field"><span>الجهاز</span><select name="device"><option value="">الكل</option><?php foreach (DEVICE_LABELS as $dk => $dl): ?><option value="<?= $dk ?>" <?= $fd === $dk ? 'selected' : '' ?>><?= $dl ?></option><?php endforeach; ?></select></label>
    <label class="check" style="margin:0 0 8px"><input type="checkbox" name="bots" <?= $bots ? 'checked' : '' ?>><span>إظهار الروبوتات</span></label>
    <?php if ($vid !== ''): ?><span class="badge badge-info">زائر <?= e(substr($vid, 0, 6)) ?> <a href="<?= e(qs(['vid' => null])) ?>"><?= icon('x') ?></a></span><input type="hidden" name="vid" value="<?= e($vid) ?>"><?php endif; ?>
    <button class="btn btn-sm btn-primary" type="submit"><?= icon('filter') ?>تصفية</button>
  </form>
  <div class="table-wrap"><table class="t">
    <thead><tr><th>الوقت</th><th>الزائر</th><th>الجهاز</th><th>النظام والمتصفح</th><th>الشاشة</th><th>الصفحة</th><th>المصدر</th><th>العنوان</th></tr></thead>
    <tbody>
    <?php foreach ($list as $v): $vc = $visitCounts[$v['visitor_id']] ?? null; ?>
      <tr>
        <td class="num" style="white-space:nowrap"><small><?= e(fmt_dt($v['created_at'])) ?></small></td>
        <td class="nm"><a href="<?= e(qs(['vid' => $v['visitor_id'], 'page' => null])) ?>" class="mono"><?= e(substr((string)$v['visitor_id'], 0, 6)) ?></a>
          <small><?= $v['holder_name'] ? icon('key') . ' ' . e($v['holder_name']) : ($v['admin_name'] ? icon('shield') . ' ' . e($v['admin_name']) : ($v['is_new'] ? 'زائر جديد' : ($vc ? (int)$vc['c'] . ' زيارة منذ ' . e(fmt_dt($vc['f'], false)) : ''))) ?></small></td>
        <td><span class="dev-ic"><?= device_icon($v['device']) ?><?= e(DEVICE_LABELS[$v['device']] ?? $v['device']) ?></span><?= $v['model'] ? '<br><small class="muted">' . e($v['model']) . '</small>' : '' ?></td>
        <td><small><?= e($v['os']) ?> · <?= e($v['browser']) ?></small></td>
        <td class="num"><small><?= e($v['screen'] ?: '—') ?></small></td>
        <td><small><?= e($pageNames[$v['page']] ?? $v['page']) ?><?= $v['query'] ? '<br><span class="mono muted">' . e(mb_substr($v['query'], 0, 30)) . '</span>' : '' ?></small></td>
        <td class="ellipsis" style="max-width:160px"><small><?= $v['referrer'] ? e(parse_url($v['referrer'], PHP_URL_HOST) ?: $v['referrer']) : '—' ?></small></td>
        <td><span class="mono"><?= e($v['ip']) ?></span></td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$list): ?><tr><td colspan="8" class="empty"><?= icon('eye') ?>لا توجد زيارات في هذه الفترة</td></tr><?php endif; ?>
    </tbody>
  </table></div>
  <?= pager($total, $page, $per) ?>
</section>
<?php admin_foot(); ?>

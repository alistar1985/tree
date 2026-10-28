<?php
/**
 * لوحة المعلومات: مؤشرات الشجرة والزوار، آخر العمليات، الطلبات المعلقة، وأكثر المساهمين.
 */
require __DIR__ . '/_layout.php';
$me = admin_require();

$stats = tree_stats();
$today = date('Y-m-d 00:00:00');
$d7 = date('Y-m-d H:i:s', strtotime('-7 days'));
$d30 = date('Y-m-d 00:00:00', strtotime('-29 days'));

$addedWeek = (int)db_val("SELECT COUNT(*) FROM persons WHERE status = 'approved' AND deleted_at IS NULL AND created_at >= ?", [$d7]);
$visToday = (int)db_val('SELECT COUNT(DISTINCT visitor_id) FROM visits WHERE is_bot = 0 AND created_at >= ?', [$today]);
$vis30 = (int)db_val('SELECT COUNT(DISTINCT visitor_id) FROM visits WHERE is_bot = 0 AND created_at >= ?', [$d30]);
$views30 = (int)db_val('SELECT COUNT(*) FROM visits WHERE is_bot = 0 AND created_at >= ?', [$d30]);
$activeCodes = (int)db_val("SELECT COUNT(*) FROM codes WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?)", [now()]);
$openSugg = (int)db_val("SELECT COUNT(*) FROM suggestions WHERE status = 'open'");
$online = (int)db_val('SELECT COUNT(DISTINCT visitor_id) FROM visits WHERE is_bot = 0 AND created_at >= ?', [date('Y-m-d H:i:s', strtotime('-5 minutes'))]);

$daily = [];
foreach (db_all('SELECT substr(created_at, 1, 10) d, COUNT(DISTINCT visitor_id) u, COUNT(*) v FROM visits WHERE is_bot = 0 AND created_at >= ? GROUP BY d', [$d30]) as $r) {
    $daily[$r['d']] = $r;
}
$rows = [];
for ($i = 29; $i >= 0; $i--) {
    $d = date('Y-m-d', strtotime("-$i days"));
    $u = (int)($daily[$d]['u'] ?? 0);
    $v = (int)($daily[$d]['v'] ?? 0);
    $rows[] = [date('d/m', strtotime($d)), $u, date('Y/m/d', strtotime($d)) . ' — ' . $u . ' زائر · ' . $v . ' مشاهدة'];
}

$devices = array_map(fn($r) => [DEVICE_LABELS[$r['device']] ?? $r['device'], (int)$r['c'], ['mobile' => 'mobile', 'desktop' => 'desktop', 'tablet' => 'tablet'][$r['device']] ?? null],
    db_all('SELECT device, COUNT(DISTINCT visitor_id) c FROM visits WHERE is_bot = 0 AND created_at >= ? GROUP BY device ORDER BY c DESC', [$d30]));

$feed = db_all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 12');
$pending = db_all("SELECT * FROM submissions WHERE status = 'pending' ORDER BY id DESC LIMIT 5");
$contrib = db_all("SELECT created_by_label l, created_by_type t, COUNT(*) c FROM persons WHERE deleted_at IS NULL AND status = 'approved' GROUP BY created_by_label ORDER BY c DESC LIMIT 6");

$map = people_map();
$kids = children_index($map);
$houseRows = [];
foreach ($map as $id => $p) {
    if ((int)$p['is_head']) $houseRows[] = [$p['house_name'] ?: 'بيت ' . $p['name'], count(descendant_ids($id, $kids)) + 1, 'house'];
}
usort($houseRows, fn($a, $b) => $b[1] <=> $a[1]);

const FEED_ICONS = [
    'create' => 'user-plus', 'submit' => 'inbox', 'update' => 'edit', 'move' => 'move', 'merge' => 'merge', 'delete' => 'trash',
    'restore' => 'undo', 'revert' => 'undo', 'approve' => 'check', 'reject' => 'x', 'login' => 'lock', 'logout' => 'logout',
    'login_failed' => 'alert', 'code_login' => 'key', 'code_failed' => 'alert', 'settings' => 'sliders', 'suggest' => 'alert',
    'code_create' => 'key', 'code_update' => 'key', 'code_delete' => 'trash', 'reorder' => 'layers', 'install' => 'sparkles',
];

admin_head('لوحة المعلومات', 'index', ['icon' => 'dashboard']);
?>
<section class="welcome">
  <div>
    <h2>أهلاً <?= e($me['display_name'] ?: $me['username']) ?></h2>
    <p><?= e(setting('clan_name')) ?> · <?= e(date('Y/m/d')) ?> · <?= $online ?> متصل الآن</p>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <a class="btn btn-gold" href="<?= e(url('admin/review.php')) ?>"><?= icon('inbox') ?>مراجعة الطلبات<?= $stats['pending'] ? ' (' . $stats['pending'] . ')' : '' ?></a>
    <a class="btn btn-outline" href="<?= e(url('tree.php')) ?>" target="_blank"><?= icon('tree') ?>تحرير الشجرة</a>
  </div>
</section>

<section class="kpis">
  <a class="kpi" href="<?= e(url('admin/people.php')) ?>"><span class="k-ic"><?= icon('users') ?></span><span>أفراد الشجرة</span><b><?= number_format($stats['persons']) ?></b><small class="<?= $addedWeek ? 'up' : '' ?>">+<?= $addedWeek ?> هذا الأسبوع</small></a>
  <a class="kpi gold" href="<?= e(url('admin/houses.php')) ?>"><span class="k-ic"><?= icon('house') ?></span><span>البيوت</span><b><?= number_format($stats['houses']) ?></b><small><?= $stats['generations'] ?> جيلاً في الشجرة</small></a>
  <a class="kpi warn" href="<?= e(url('admin/review.php')) ?>"><span class="k-ic"><?= icon('inbox') ?></span><span>بانتظار المراجعة</span><b><?= number_format($stats['pending']) ?></b><small><?= $openSugg ?> اقتراح تصحيح مفتوح</small></a>
  <a class="kpi info" href="<?= e(url('admin/visitors.php')) ?>"><span class="k-ic"><?= icon('eye') ?></span><span>زوار اليوم</span><b><?= number_format($visToday) ?></b><small><?= number_format($vis30) ?> زائر · <?= number_format($views30) ?> مشاهدة خلال 30 يوماً</small></a>
</section>

<div class="grid-panels c2">
  <section class="panel">
    <div class="panel-head"><div><h2><?= icon('chart') ?>الزوار الفريدون يومياً</h2><p>آخر 30 يوماً — مرّر على العمود لرؤية التفاصيل</p></div><a class="btn btn-sm btn-ghost" href="<?= e(url('admin/visitors.php')) ?>">التفاصيل</a></div>
    <div class="panel-body"><?= col_chart($rows, 'زائر') ?></div>
  </section>
  <section class="panel">
    <div class="panel-head"><div><h2><?= icon('mobile') ?>أجهزة الزوار</h2><p>آخر 30 يوماً</p></div></div>
    <div class="panel-body"><?= hbars($devices) ?>
      <div class="kpis" style="grid-template-columns:1fr 1fr;margin-top:16px">
        <div class="kpi"><span>الرموز الفعالة</span><b style="font-size:1.4rem"><?= $activeCodes ?></b></div>
        <div class="kpi"><span>متصل الآن</span><b style="font-size:1.4rem"><?= $online ?></b></div>
      </div>
    </div>
  </section>
</div>

<div class="grid-panels c2">
  <section class="panel">
    <div class="panel-head"><h2><?= icon('history') ?>آخر العمليات</h2><a class="btn btn-sm btn-ghost" href="<?= e(url('admin/log.php')) ?>">السجل الكامل</a></div>
    <div class="feed">
      <?php if (!$feed): ?><div class="empty"><?= icon('history') ?>لا توجد عمليات بعد</div><?php endif; ?>
      <?php foreach ($feed as $f): $tone = ACTION_LABELS[$f['action']][1] ?? 'muted'; ?>
        <div class="feed-item">
          <span class="feed-dot <?= e($tone) ?>"><?= icon(FEED_ICONS[$f['action']] ?? 'info') ?></span>
          <div style="min-width:0">
            <p><?= e($f['summary']) ?></p>
            <small><?= e($f['actor_label']) ?> · <?= e(time_ago($f['created_at'])) ?> · <?= e($f['device']) ?></small>
          </div>
        </div>
      <?php endforeach; ?>
    </div>
  </section>
  <div style="display:grid;gap:18px;align-content:start">
    <section class="panel">
      <div class="panel-head"><h2><?= icon('inbox') ?>طلبات بانتظارك</h2><a class="btn btn-sm btn-ghost" href="<?= e(url('admin/review.php')) ?>">الكل</a></div>
      <div class="feed">
        <?php if (!$pending): ?><div class="empty"><?= icon('check') ?>لا توجد طلبات معلقة</div><?php endif; ?>
        <?php foreach ($pending as $s): ?>
          <div class="feed-item"><span class="feed-dot warn"><?= icon('user-plus') ?></span>
            <div style="min-width:0"><p><b><?= e(implode(' ', json_decode($s['chain_json'], true) ?: [])) ?></b></p>
              <small><?= $s['anchor_id'] ? 'مربوط تلقائياً' : 'بدون ربط' ?> · <?= e(time_ago($s['created_at'])) ?> · <?= e($s['device']) ?></small></div></div>
        <?php endforeach; ?>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2><?= icon('users') ?>أكثر المساهمين في الإضافة</h2></div>
      <div class="panel-body"><?= hbars(array_map(fn($c) => [$c['l'] ?: '—', (int)$c['c'], $c['t'] === 'code' ? 'key' : ($c['t'] === 'admin' ? 'shield' : 'user')], $contrib)) ?></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2><?= icon('house') ?>البيوت حسب عدد الأفراد</h2></div>
      <div class="panel-body"><?= hbars(array_slice($houseRows, 0, 8), $stats['persons']) ?></div>
    </section>
  </div>
</div>
<?php admin_foot(); ?>

<?php
/**
 * الصفحة الرئيسية: تعريف العشيرة، معاينة حية للشجرة، البيوت، وطريقة الإضافة.
 */
require __DIR__ . '/includes/bootstrap.php';
require __DIR__ . '/includes/layout.php';

$visit = track_visit('home');
$stats = tree_stats();
$map = people_map();
$kids = children_index($map);
$dm = depth_map($map);

$houses = [];
foreach ($map as $id => $p) {
    if (!(int)$p['is_head']) continue;
    $desc = descendant_ids($id, $kids);
    $depth = 0;
    $base = $dm[$id];
    foreach ($desc as $d) {
        $depth = max($depth, $dm[$d] - $base);
    }
    $houses[] = [
        'id' => $id, 'name' => $p['house_name'] ?: 'بيت ' . $p['name'], 'color' => $p['house_color'],
        'nasab' => nasab($id, $map, 4), 'members' => count($desc) + 1, 'gens' => $depth + 1, 'gen' => $base,
    ];
}
usort($houses, fn($a, $b) => $a['gen'] <=> $b['gen'] ?: $b['members'] <=> $a['members']);
$palette = ['#c0392b', '#2e86c1', '#d68910', '#8e44ad', '#16a085', '#a04000', '#1f618d', '#b7950b', '#7d3c98', '#138d75', '#cb4335', '#2874a6'];

$roots = array_values(array_filter($map, fn($p) => $p['parent_id'] === null));
$rootName = count($roots) === 1 ? $roots[0]['name'] : setting('clan_name');
$clanShort = preg_replace('/^عشيرة\s+/u', '', (string)setting('clan_name'));

function rosette_svg(): string
{
    $d = '';
    for ($i = 0; $i <= 360; $i += 2) {
        $a = deg2rad($i);
        $r = 46 * (1 + 0.055 * cos(16 * $a));
        $d .= ($i ? 'L' : 'M') . round(50 + $r * cos($a), 1) . ',' . round(50 + $r * sin($a), 1);
    }
    return '<svg class="rosette" viewBox="0 0 100 100" aria-hidden="true"><path d="' . $d . 'Z" fill="var(--surface)" stroke="#b48a12" stroke-width="1.2"/>'
        . '<circle cx="50" cy="50" r="40" fill="none" stroke="#d9ae22" stroke-width=".7" stroke-dasharray="1.5 1.8"/></svg>';
}

page_head('', 'home', ['visit' => $visit]);
?>
<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-text">
      <span class="eyebrow"><?= icon('leaf') ?>سجلّ الأنساب الرقمي</span>
      <h1 class="display"><?= e(setting('clan_name')) ?></h1>
      <?= hierarchy_html() ?>
      <p class="lead"><?= e(setting('tagline')) ?></p>
      <div class="hero-cta">
        <a class="btn btn-gold btn-lg" href="<?= e(url('add.php')) ?>"><?= icon('user-plus') ?>أضف اسمك ونسبك</a>
        <a class="btn btn-outline btn-lg" href="<?= e(url('tree.php')) ?>"><?= icon('tree') ?>استعرض الشجرة</a>
      </div>
      <div class="search-box">
        <?= icon('search') ?>
        <input type="search" id="homeSearch" placeholder="ابحث عن اسمك… مثال: علي عبد الحليم جعفر" autocomplete="off">
        <div class="search-results" id="homeResults" hidden></div>
      </div>
    </div>

    <div class="hero-visual">
      <div class="poster">
        <div class="medallion m1"><?= rosette_svg() ?><span><?= e(setting('verse_1')) ?><small><?= e(setting('verse_1_ref')) ?></small></span></div>
        <div class="medallion m2"><?= rosette_svg() ?><span><?= e(setting('verse_2')) ?><small><?= e(setting('verse_2_ref')) ?></small></span></div>
        <p class="poster-title"><?= e(setting('poster_title') ?: $clanShort) ?></p>
        <div class="hero-tree" id="heroTree" role="img" aria-label="معاينة شجرة العشيرة"></div>
      </div>
    </div>
  </div>
</section>

<section class="stats-strip">
  <div class="wrap stats">
    <div class="stat"><span class="stat-ic"><?= icon('users') ?></span><div><b><?= number_format($stats['persons']) ?></b><span>فرداً في الشجرة</span></div></div>
    <div class="stat"><span class="stat-ic"><?= icon('house') ?></span><div><b><?= number_format($stats['houses']) ?></b><span>بيتاً</span></div></div>
    <div class="stat"><span class="stat-ic"><?= icon('layers') ?></span><div><b><?= number_format($stats['generations']) ?></b><span>جيلاً من الجد <?= e($rootName) ?></span></div></div>
    <div class="stat"><span class="stat-ic"><?= icon('clock') ?></span><div><b style="font-size:1.05rem"><?= e(time_ago($stats['updated_at'])) ?></b><span>آخر تحديث للشجرة</span></div></div>
  </div>
</section>

<section class="section" id="houses">
  <div class="wrap">
    <div class="section-head">
      <div><h2>بيوت العشيرة</h2><p>اختر بيتاً لعرض شجرته الخاصة بشكل أكبر وأوضح.</p></div>
      <a class="btn btn-outline" href="<?= e(url('tree.php')) ?>"><?= icon('tree') ?>الشجرة الكاملة</a>
    </div>
    <?php if ($houses): ?>
      <div class="houses-grid">
        <?php foreach ($houses as $i => $h): $c = $h['color'] ?: $palette[$i % count($palette)]; ?>
          <a class="house-card" href="<?= e(url('tree.php?root=' . $h['id'])) ?>" style="--hc:<?= e($c) ?>">
            <div class="house-top">
              <span class="house-emblem"><?= icon('crown') ?></span>
              <div><h3><?= e($h['name']) ?></h3><div class="nasab"><?= e($h['nasab']) ?></div></div>
            </div>
            <div class="house-meta">
              <span><?= icon('users') ?><?= number_format($h['members']) ?> فرداً</span>
              <span><?= icon('layers') ?><?= $h['gens'] ?> أجيال</span>
            </div>
            <span class="house-go">عرض شجرة البيت <?= icon('arrow-l') ?></span>
          </a>
        <?php endforeach; ?>
      </div>
    <?php else: ?>
      <div class="alert alert-info"><?= icon('info') ?>لم تُحدَّد بيوت بعد. يحدد المشرف رؤوس البيوت من لوحة التحكم.</div>
    <?php endif; ?>
  </div>
</section>

<section class="section" id="how" style="padding-top:10px">
  <div class="wrap">
    <div class="section-head"><div><h2>كيف تضيف نسبك؟</h2><p>ثلاث خطوات، والربط بالشجرة يتم تلقائياً وبذكاء.</p></div></div>
    <div class="steps-grid">
      <div class="step-card"><span class="stat-ic"><?= icon('edit') ?></span><h3>اكتب اسمك الكامل</h3><p>الاسم الخماسي أو السداسي، مثل: «علي عبد الحليم جعفر محمد موسى». نفصله تلقائياً إلى أب وجد وجد ثانٍ، مع مراعاة الأسماء المركبة.</p></div>
      <div class="step-card"><span class="stat-ic"><?= icon('sparkles') ?></span><h3>نربطك تلقائياً</h3><p>نبحث في الشجرة عن أجدادك ونقترح أقرب نقطة ربط مع نسبة التطابق، وإن تشابهت الأسماء نعرض عليك الخيارات لتختار نسبك الصحيح.</p></div>
      <div class="step-card"><span class="stat-ic"><?= icon('tree') ?></span><h3>راجع شجرتك</h3><p>بعد الحفظ تعرض لك شجرة عائلتك مباشرة لتتأكد من صحتها، ويمكنك تعديل طلبك حتى يعتمده رأس البيت أو المشرف.</p></div>
    </div>
    <div class="trust">
      <div><?= icon('key') ?><span><b>رمز لكل بيت</b>يضيف ويعدّل صاحب الرمز ضمن بيته فقط.</span></div>
      <div><?= icon('shield') ?><span><b>مراجعة قبل النشر</b>لا يظهر أي اسم جديد قبل التحقق منه.</span></div>
      <div><?= icon('history') ?><span><b>سجل كامل</b>نعرف من أضاف ومن عدّل ومتى، مع إمكانية التراجع.</span></div>
      <div><?= icon('merge') ?><span><b>منع التكرار</b>كشف الأسماء المتشابهة ودمج المكرر تلقائياً.</span></div>
    </div>
  </div>
</section>

<section class="verse-band">
  <div class="ornament"><?= icon('leaf') ?></div>
  <q><?= e(setting('verse_1')) ?></q>
  <small><?= e(setting('verse_1_ref')) ?></small>
  <?php if ($about = setting('about')): ?><p class="wrap muted" style="max-width:760px;margin:18px auto 0"><?= nl2br(e($about)) ?></p><?php endif; ?>
</section>

<script>window.CLAN_CFG = <?= json_encode(tree_client_config(), JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<?php page_foot(['scripts' => ['vendor/d3.min.js', 'tree.js'], 'inline' => <<<JS
(function(){
  App.searchBox(document.getElementById('homeSearch'), document.getElementById('homeResults'), function(r){ location.href = App.BASE + '/tree.php?focus=' + r.id; });
  var cfg = window.CLAN_CFG, box = document.getElementById('heroTree'), t;
  App.api('tree', undefined, 'GET').then(function(r){
    if (!r.persons.length) { box.innerHTML = '<div class="tree-loading">لا توجد أسماء بعد</div>'; return; }
    t = new ClanTree(box, { mode: 'organic', colorMode: cfg.colorMode, colors: cfg.colors, clan: cfg.clan, interactive: false, maxDepth: r.persons.length > 400 ? 6 : 0 });
    t.setData(r.persons).render();
    box.addEventListener('click', function(){ location.href = App.BASE + '/tree.php?mode=organic'; });
    box.style.cursor = 'zoom-in';
  }).catch(function(){});
  window.addEventListener('clan-theme', function(){ if (t) t.render(); });
  // تصغير خط الآية حتى تظهر كاملة داخل الإطار الزخرفي
  function fitVerses(){
    document.querySelectorAll('.medallion span').forEach(function(s){
      var box = s.parentNode, fs = parseFloat(getComputedStyle(box).fontSize), avail = box.clientHeight - 42;
      s.style.fontSize = ''; fs = parseFloat(getComputedStyle(s).fontSize);
      while (s.scrollHeight > avail && fs > 6) { fs -= 0.4; s.style.fontSize = fs + 'px'; }
    });
  }
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(fitVerses);
  window.addEventListener('resize', App.debounce(fitVerses, 150));
})();
JS]); ?>

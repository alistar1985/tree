<?php
/**
 * صفحة الشجرة التفاعلية: الشجرة كاملة أو شجرة بيت/فرع محدد.
 */
require __DIR__ . '/includes/bootstrap.php';
require __DIR__ . '/includes/layout.php';

$visit = track_visit('tree');
$cfg = tree_client_config();
$cfg['root'] = isset($_GET['root']) && $_GET['root'] !== '' ? (int)$_GET['root'] : null;
$cfg['focus'] = isset($_GET['focus']) && $_GET['focus'] !== '' ? (int)$_GET['focus'] : null;
$title = 'الشجرة';
if ($cfg['root'] && ($r = person_row($cfg['root']))) {
    $title = (int)$r['is_head'] ? ($r['house_name'] ?: 'بيت ' . $r['name']) : 'فرع ' . $r['name'];
}
page_head($title === 'الشجرة' ? '' : $title, 'tree', ['app' => true, 'visit' => $visit]);
?>
<main class="tree-app" id="treeApp">
  <aside class="tree-side" id="treeSide" aria-label="البيوت">
    <button class="icon-btn side-close" type="button" data-side-close title="إغلاق"><?= icon('x') ?></button>
    <div class="side-head">
      <h2><?= icon('house') ?>البيوت والفروع</h2>
      <input type="search" id="houseFilter" placeholder="ابحث عن بيت…" autocomplete="off">
    </div>
    <div class="side-list" id="houseList"><div class="sr-empty">جارِ التحميل…</div></div>
    <div class="side-foot">
      <div><b id="stPersons">—</b><span>فرداً</span></div>
      <div><b id="stHouses">—</b><span>بيتاً</span></div>
      <div><b id="stGens">—</b><span>جيلاً</span></div>
    </div>
  </aside>

  <section class="tree-stage">
    <div class="tree-topbar">
      <button class="icon-btn" type="button" id="sideToggle" title="البيوت"><?= icon('house') ?></button>
      <div class="tree-crumbs">
        <div style="min-width:0">
          <h1 id="viewTitle"><?= e($title === 'الشجرة' ? setting('site_title') : $title) ?></h1>
          <div class="crumb-path" id="crumbPath"></div>
        </div>
      </div>
      <div class="tree-search">
        <?= icon('search') ?>
        <input id="treeSearch" type="search" placeholder="ابحث بالاسم… مثال: علي عبد الحليم" autocomplete="off">
        <div class="search-results" id="treeSearchResults" hidden></div>
      </div>
      <div class="tool-group view-tools">
        <div class="menu-wrap">
          <button class="icon-btn" type="button" id="exportBtn" title="خيارات العرض والطباعة"><?= icon('sliders') ?></button>
          <div class="menu tools-menu" id="exportMenu" hidden>
            <div class="menu-sec">التلوين</div>
            <div class="seg" id="colorSeg" role="group" aria-label="التلوين">
              <button type="button" data-color="generation" title="كل جيل بلون"><?= icon('layers') ?><span>الأجيال</span></button>
              <button type="button" data-color="house" title="كل بيت بلون"><?= icon('house') ?><span>البيوت</span></button>
              <button type="button" data-color="classic" title="رؤوس البيوت ذهبي والأبناء أبيض"><?= icon('palette') ?><span>كلاسيكي</span></button>
            </div>
            <div class="menu-sec">الأجيال المعروضة</div>
            <select id="depthSel">
              <option value="0">كل الأجيال</option>
              <?php for ($i = 3; $i <= 12; $i++): ?><option value="<?= $i ?>"><?= $i ?> أجيال</option><?php endfor; ?>
            </select>
            <div class="menu-sec">طباعة ومشاركة</div>
            <button type="button" data-export="png"><?= icon('image') ?>تحميل كلوحة (صورة PNG)</button>
            <button type="button" data-export="svg"><?= icon('download') ?>تحميل SVG للطباعة الكبيرة</button>
            <button type="button" data-export="print"><?= icon('print') ?>طباعة</button>
            <button type="button" data-export="share"><?= icon('share') ?>نسخ رابط هذا العرض</button>
          </div>
        </div>
      </div>
    </div>

    <div class="tree-body">
      <div class="tree-canvas" id="treeCanvas">
        <div class="tree-loading"><div><div class="spinner"></div>جارِ رسم الشجرة…</div></div>
      </div>
      <div class="edit-banner" id="editBanner" hidden></div>
      <div class="empty-hint" id="emptyHint" hidden>
        <?= icon('leaf') ?>
        <b>الشجرة في بدايتها</b>
        <span>أضف اسمك ونسبك لتكون من أوائل المسجّلين.</span>
        <a class="btn btn-gold" href="<?= e(url('add.php')) ?>"><?= icon('user-plus') ?>أضف نسبك</a>
      </div>
      <div class="legend" id="legend" hidden></div>
      <div class="zoom-ctrl">
        <button class="icon-btn" type="button" data-zoom="in" title="تكبير"><?= icon('zoom-in') ?></button>
        <button class="icon-btn" type="button" data-zoom="out" title="تصغير"><?= icon('zoom-out') ?></button>
        <button class="icon-btn" type="button" data-zoom="fit" title="ملاءمة الشاشة"><?= icon('fit') ?></button>
      </div>
      <aside class="drawer" id="drawer" aria-live="polite"></aside>
    </div>
  </section>
</main>
<script>window.CLAN_CFG = <?= json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<?php page_foot(['app' => true, 'scripts' => ['vendor/d3.min.js', 'tree.js', 'tree-page.js']]); ?>

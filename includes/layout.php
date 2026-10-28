<?php
/**
 * القالب العام للواجهة: الرأس، شريط التنقل، نافذة رمز البيت، والتذييل.
 */

function hierarchy_html(string $class = 'lineage-chips'): string
{
    $levels = clan_hierarchy();
    if (!$levels) return '';
    $out = '<ol class="' . e($class) . '">';
    foreach ($levels as $l) {
        $out .= '<li><span>' . e($l['label']) . '</span><b>' . e($l['value']) . '</b></li>';
    }
    return $out . '</ol>';
}

function tree_client_config(): array
{
    return [
        'clan'      => setting('clan_name'),
        'title'     => setting('site_title'),
        'posterTitle' => setting('poster_title') ?: setting('site_title'),
        'credits'   => setting('poster_credits'),
        'laqab'     => laqab_list(),
        'hierarchy' => clan_hierarchy(),
        'view'      => setting('default_view'),
        'colorMode' => setting('default_color_mode'),
        'showFemales' => setting('show_females') === '1',
        'verses'    => [
            ['text' => setting('verse_1'), 'ref' => setting('verse_1_ref')],
            ['text' => setting('verse_2'), 'ref' => setting('verse_2_ref')],
        ],
        'colors'    => [
            'gen'    => setting_json('gen_colors'),
            'trunk'  => setting('color_trunk'),
            'root'   => setting('color_root'),
            'head'   => setting('color_head'),
            'son'    => setting('color_son'),
            'leaf'   => setting('color_leaf'),
            'branch' => setting('color_branch'),
        ],
    ];
}

function page_head(string $title, string $active = '', array $opt = []): void
{
    $site = setting('site_title');
    $app = !empty($opt['app']);
    $code = current_code();
    $admin = current_admin();
    $fullTitle = $title ? $title . ' — ' . $site : $site;
    $desc = $opt['description'] ?? setting('tagline');
    $visitId = $opt['visit'] ?? null;
    ?><!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= e($fullTitle) ?></title>
<meta name="description" content="<?= e($desc) ?>">
<meta property="og:title" content="<?= e($fullTitle) ?>">
<meta property="og:description" content="<?= e($desc) ?>">
<meta property="og:type" content="website">
<meta name="theme-color" content="#2f5d1e">
<meta name="base" content="<?= e(base_path()) ?>">
<meta name="csrf" content="<?= e(csrf_token()) ?>">
<?php if ($visitId): ?><meta name="visit" content="<?= (int)$visitId ?>"><?php endif; ?>
<link rel="icon" href="<?= e(url('assets/img/favicon.svg')) ?>" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Aref+Ruqaa:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="<?= e(asset('css/main.css')) ?>">
<script>try{var t=localStorage.getItem('clan-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>
</head>
<body class="<?= $app ? 'is-app' : 'is-page' ?> page-<?= e($active ?: 'x') ?>">
<?= icon_sprite() ?>
<header class="site-header<?= $app ? ' compact' : '' ?>">
  <div class="wrap header-in">
    <a class="brand" href="<?= e(url('index.php')) ?>">
      <?= logo_svg($app ? 34 : 42) ?>
      <span class="brand-txt"><b><?= e($site) ?></b><?php if (!$app && ($h = clan_hierarchy())): ?><small><?= e(implode(' · ', array_map(fn($l) => $l['value'], $h))) ?></small><?php endif; ?></span>
    </a>
    <nav class="main-nav" id="mainNav">
      <a href="<?= e(url('index.php')) ?>" class="<?= $active === 'home' ? 'on' : '' ?>"><?= icon('home') ?>الرئيسية</a>
      <a href="<?= e(url('tree.php')) ?>" class="<?= $active === 'tree' ? 'on' : '' ?>"><?= icon('tree') ?>الشجرة</a>
      <a href="<?= e(url('index.php#houses')) ?>"><?= icon('house') ?>البيوت</a>
      <a href="<?= e(url('add.php')) ?>" class="nav-cta <?= $active === 'add' ? 'on' : '' ?>"><?= icon('user-plus') ?>أضف نسبك</a>
    </nav>
    <div class="header-tools">
      <?php if ($admin): ?>
        <a class="chip chip-admin" href="<?= e(url('admin/index.php')) ?>" title="لوحة التحكم"><?= icon('dashboard') ?><span>لوحة التحكم</span></a>
      <?php elseif ($code): ?>
        <button class="chip chip-code" type="button" data-open="codeModal" title="أنت تعمل برمز صلاحية"><?= icon('key') ?><span><?= e($code['holder_name']) ?></span></button>
      <?php else: ?>
        <button class="icon-btn" type="button" data-open="codeModal" title="دخول برمز الصلاحية"><?= icon('key') ?></button>
      <?php endif; ?>
      <button class="icon-btn" type="button" data-theme-toggle title="الوضع الليلي/النهاري"><?= icon('moon', 'only-light') ?><?= icon('sun', 'only-dark') ?></button>
      <button class="icon-btn nav-toggle" type="button" data-nav-toggle aria-controls="mainNav" title="القائمة"><?= icon('menu') ?></button>
    </div>
  </div>
</header>
<?php
}

function code_modal(): void
{
    $code = current_code();
    $scopeName = null;
    if ($code && $code['scope_person_id']) {
        $map = people_map(true);
        $sid = (int)$code['scope_person_id'];
        $scopeName = isset($map[$sid]) ? ($map[$sid]['house_name'] ?: 'بيت ' . $map[$sid]['name']) : null;
    }
    ?>
<dialog class="modal" id="codeModal">
  <form class="modal-card" method="dialog" data-code-form>
    <header class="modal-head">
      <span class="modal-icon"><?= icon('key') ?></span>
      <div><h3>رمز الصلاحية</h3><p>رمز يمنحه مالك الشجرة لرؤساء البيوت والمشرفين، يتيح الإضافة والتعديل واعتماد الطلبات حسب صلاحياته.</p></div>
      <button class="icon-btn" value="cancel" formnovalidate title="إغلاق"><?= icon('x') ?></button>
    </header>
    <?php if ($code): ?>
      <div class="code-status">
        <div class="code-badge"><?= icon('shield') ?></div>
        <div>
          <b>أنت تعمل برمز: <?= e($code['holder_name']) ?></b>
          <span>النطاق: <?= e($scopeName ?: 'الشجرة كاملة') ?></span>
          <span class="perm-list">
            <?= (int)$code['can_add'] ? '<i>إضافة</i>' : '' ?><?= (int)$code['can_edit'] ? '<i>تعديل</i>' : '' ?><?= (int)$code['can_delete'] ? '<i>حذف</i>' : '' ?><?= (int)$code['can_approve'] ? '<i>اعتماد الطلبات</i>' : '' ?>
          </span>
        </div>
      </div>
      <footer class="modal-foot">
        <?php if ((int)$code['can_approve']): ?><a class="btn btn-ghost" href="<?= e(url('tree.php?pending=1')) ?>"><?= icon('inbox') ?>الطلبات</a><?php endif; ?>
        <a class="btn btn-ghost" href="<?= e(url('tree.php' . ($code['scope_person_id'] ? '?root=' . (int)$code['scope_person_id'] : ''))) ?>"><?= icon('tree') ?><?= $code['scope_person_id'] ? 'شجرة بيتي' : 'الشجرة' ?></a>
        <button class="btn btn-danger-soft" type="button" data-code-logout><?= icon('logout') ?>إنهاء الجلسة</button>
      </footer>
    <?php else: ?>
      <label class="field">
        <span>أدخل الرمز</span>
        <input name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" placeholder="0000-0000" maxlength="12" required>
      </label>
      <p class="hint"><?= icon('info') ?> كل إضافة أو تعديل يتم بالرمز يُسجَّل باسم صاحبه في سجل العمليات.</p>
      <p class="form-error" data-error hidden></p>
      <footer class="modal-foot">
        <button class="btn btn-primary" type="submit"><?= icon('check') ?>دخول</button>
      </footer>
    <?php endif; ?>
  </form>
</dialog>
<?php
}

function page_foot(array $opt = []): void
{
    $app = !empty($opt['app']);
    code_modal();
    if (!$app): ?>
<footer class="site-footer">
  <div class="wrap footer-in">
    <div class="footer-brand">
      <?= logo_svg(46) ?>
      <div>
        <b><?= e(setting('site_title')) ?></b>
        <p><?= e(setting('contact_note')) ?></p>
        <?php if ($p = setting('contact_phone')): ?><a class="footer-phone" href="https://wa.me/<?= e(preg_replace('/\D/', '', $p)) ?>" target="_blank" rel="noopener"><?= icon('whatsapp') ?><span dir="ltr"><?= e($p) ?></span></a><?php endif; ?>
      </div>
    </div>
    <nav class="footer-links">
      <a href="<?= e(url('tree.php')) ?>">الشجرة الكاملة</a>
      <a href="<?= e(url('add.php')) ?>">أضف نسبك</a>
      <a href="<?= e(url('index.php#how')) ?>">كيف تعمل الشجرة</a>
    </nav>
  </div>
  <div class="wrap footer-copy">© <?= date('Y') ?> <?= e(setting('clan_name')) ?> — جميع الحقوق محفوظة</div>
</footer>
<?php endif; ?>
<div class="toasts" id="toasts" aria-live="polite"></div>
<script src="<?= e(asset('js/app.js')) ?>"></script>
<?php foreach ($opt['scripts'] ?? [] as $s): ?>
<script src="<?= e(strpos($s, 'vendor/') === 0 ? asset($s) : asset('js/' . $s)) ?>"></script>
<?php endforeach; ?>
<?php if (!empty($opt['inline'])): ?><script><?= $opt['inline'] ?></script><?php endif; ?>
</body>
</html>
<?php
}

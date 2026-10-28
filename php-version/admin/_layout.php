<?php
/**
 * قالب لوحة التحكم: الحماية، القائمة الجانبية، الترقيم، والرسوم البيانية البسيطة.
 */
require_once dirname(__DIR__) . '/includes/bootstrap.php';

function admin_require(?string $perm = null): array
{
    $a = current_admin();
    if (!$a) {
        redirect(url('admin/login.php?next=' . urlencode($_SERVER['REQUEST_URI'] ?? '')));
    }
    if ($perm && !admin_can($perm)) {
        http_response_code(403);
        admin_head('غير مسموح', '');
        echo '<div class="alert alert-danger">' . icon('lock') . 'لا تملك صلاحية الوصول لهذه الصفحة. تواصل مع مالك الموقع.</div>';
        admin_foot();
        exit;
    }
    return $a;
}

/** التحقق من رمز الحماية لكل طلب POST */
function admin_post(): bool
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        return false;
    }
    if (!csrf_valid()) {
        flash('danger', 'انتهت صلاحية النموذج، أعد المحاولة.');
        redirect($_SERVER['REQUEST_URI']);
    }
    return true;
}

function back(string $fallback = ''): void
{
    redirect($_POST['_back'] ?? ($fallback ?: $_SERVER['REQUEST_URI']));
}

function qs(array $override = []): string
{
    $q = array_merge($_GET, $override);
    $q = array_filter($q, fn($v) => $v !== null && $v !== '');
    return $q ? '?' . http_build_query($q) : '';
}

function pager(int $total, int $page, int $per): string
{
    $pages = (int)ceil($total / max(1, $per));
    if ($pages <= 1) return '';
    $out = '<nav class="pager">';
    if ($page > 1) $out .= '<a href="' . e(qs(['page' => $page - 1])) . '">' . icon('chev-r') . '</a>';
    $from = max(1, $page - 2);
    $to = min($pages, $page + 2);
    if ($from > 1) $out .= '<a href="' . e(qs(['page' => 1])) . '">1</a>' . ($from > 2 ? '<span>…</span>' : '');
    for ($i = $from; $i <= $to; $i++) {
        $out .= $i === $page ? '<span class="on">' . $i . '</span>' : '<a href="' . e(qs(['page' => $i])) . '">' . $i . '</a>';
    }
    if ($to < $pages) $out .= ($to < $pages - 1 ? '<span>…</span>' : '') . '<a href="' . e(qs(['page' => $pages])) . '">' . $pages . '</a>';
    if ($page < $pages) $out .= '<a href="' . e(qs(['page' => $page + 1])) . '">' . icon('chev-l') . '</a>';
    return $out . '<span style="border:0;color:var(--muted)">' . number_format($total) . ' نتيجة</span></nav>';
}

/** رسم أعمدة لسلسلة واحدة: $rows = [[label, value, tip], ...] */
function col_chart(array $rows, string $unit = ''): string
{
    $max = max(1, ...array_map(fn($r) => (int)$r[1], $rows ?: [[0, 0]]));
    $cols = '';
    $axis = '';
    $n = count($rows);
    $every = $n > 20 ? 5 : ($n > 12 ? 3 : 1);
    foreach ($rows as $i => [$label, $val, $tip]) {
        $h = $val > 0 ? max(2, round($val / $max * 100, 1)) : 0;
        $cols .= '<div class="col' . ($val ? '' : ' zero') . '" data-tip="' . e($tip) . '"><i style="height:' . ($val ? $h : 1.2) . '%"></i></div>';
        $axis .= '<span>' . ($i % $every === 0 || $i === $n - 1 ? e($label) : '') . '</span>';
    }
    return '<div class="chart"><span class="chart-max">' . number_format($max) . ' ' . e($unit) . '</span><div class="chart-cols">' . $cols . '</div><div class="chart-axis">' . $axis . '</div></div>';
}

/** أشرطة أفقية: $rows = [[label, value, iconName|null], ...] */
function hbars(array $rows, ?int $total = null): string
{
    if (!$rows) return '<div class="empty">' . icon('chart') . 'لا توجد بيانات بعد</div>';
    $max = max(1, ...array_map(fn($r) => (int)$r[1], $rows));
    $total = $total ?? array_sum(array_map(fn($r) => (int)$r[1], $rows));
    $out = '<div class="hbars">';
    foreach ($rows as $r) {
        $pct = $total ? round($r[1] / $total * 100) : 0;
        $out .= '<div class="hbar"><span class="lbl">' . (!empty($r[2]) ? icon($r[2]) : '') . e($r[0]) . '</span><span class="trk"><i style="width:' . round($r[1] / $max * 100, 1) . '%"></i></span><b>' . number_format((int)$r[1]) . ' <small>' . $pct . '%</small></b></div>';
    }
    return $out . '</div>';
}

function action_badge(string $action): string
{
    [$label, $tone] = ACTION_LABELS[$action] ?? [$action, 'muted'];
    $map = ['ok' => 'badge-ok', 'warn' => 'badge-warn', 'danger' => 'badge-danger', 'info' => 'badge-info', 'muted' => 'badge-muted'];
    return '<span class="badge ' . $map[$tone] . '">' . e($label) . '</span>';
}

function device_icon(?string $d): string
{
    return icon(['mobile' => 'mobile', 'tablet' => 'tablet', 'desktop' => 'desktop', 'bot' => 'bot'][$d] ?? 'globe');
}

function person_picker(string $name, string $placeholder = 'اكتب الاسم ثم اسم الأب…', ?int $value = null, bool $required = false): string
{
    $label = '';
    if ($value) {
        $map = people_map(true);
        $label = isset($map[$value]) ? nasab($value, $map, 6) : '';
    }
    return '<div class="picker" data-person-picker><input type="search" placeholder="' . e($placeholder) . '" autocomplete="off" value="' . e($label ? $map[$value]['name'] : '') . '">'
        . '<input type="hidden" name="' . e($name) . '" value="' . e((string)$value) . '"' . ($required ? ' data-required' : '') . '>'
        . '<div class="search-results" hidden></div><div class="picked"' . ($label ? '' : ' hidden') . '>' . icon('check') . '<span>' . e($label) . '</span></div></div>';
}

function admin_counts(): array
{
    static $c = null;
    if ($c === null) {
        $c = [
            'review' => (int)db_val("SELECT COUNT(*) FROM submissions WHERE status = 'pending'") + (int)db_val("SELECT COUNT(*) FROM suggestions WHERE status = 'open'"),
        ];
    }
    return $c;
}

function admin_head(string $title, string $active, array $opt = []): void
{
    $a = current_admin();
    $counts = admin_counts();
    $nav = [
        ['', 'الرئيسية'],
        ['index', 'لوحة المعلومات', 'dashboard', null],
        ['review', 'الطلبات والاقتراحات', 'inbox', 'review'],
        ['', 'الشجرة'],
        ['people', 'الأفراد', 'users', 'people'],
        ['houses', 'البيوت', 'house', 'houses'],
        ['codes', 'رموز الصلاحية', 'key', 'codes'],
        ['', 'المتابعة'],
        ['log', 'سجل العمليات', 'history', 'log'],
        ['visitors', 'الزوار والأجهزة', 'eye', 'visitors'],
        ['', 'النظام'],
        ['settings', 'الإعدادات', 'sliders', 'settings'],
        ['users', 'المشرفون', 'shield', 'users'],
    ];
    ?><!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title><?= e($title) ?> — لوحة التحكم</title>
<meta name="base" content="<?= e(base_path()) ?>">
<meta name="csrf" content="<?= e(csrf_token()) ?>">
<link rel="icon" href="<?= e(url('assets/img/favicon.svg')) ?>" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Aref+Ruqaa:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="<?= e(asset('css/main.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/admin.css')) ?>">
<script>try{var t=localStorage.getItem('clan-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>
</head>
<body>
<?= icon_sprite() ?>
<div class="admin">
  <aside class="a-side" id="aSide">
    <a class="a-brand" href="<?= e(url('admin/index.php')) ?>"><?= logo_svg(40) ?><span><b>لوحة التحكم</b><small><?= e(setting('site_title')) ?></small></span></a>
    <nav class="a-nav">
      <?php foreach ($nav as $item):
          if ($item[0] === '') { echo '<div class="grp">' . e($item[1]) . '</div>'; continue; }
          [$key, $label, $ic, $perm] = $item;
          if ($perm && $perm !== 'users' && !admin_can($perm)) continue;
          if ($perm === 'users' && !admin_can('*') && !admin_can('users')) { $label = 'حسابي'; $key = 'users'; }
          $cnt = $counts[$key] ?? 0; ?>
        <a href="<?= e(url('admin/' . $key . '.php')) ?>" class="<?= $active === $key ? 'on' : '' ?>"><?= icon($ic) ?><span><?= e($label) ?></span><?php if ($cnt): ?><span class="count"><?= $cnt ?></span><?php endif; ?></a>
      <?php endforeach; ?>
      <div class="grp">الموقع</div>
      <a href="<?= e(url('tree.php')) ?>" target="_blank"><?= icon('tree') ?><span>الشجرة (تحرير مباشر)</span></a>
      <a href="<?= e(url('index.php')) ?>" target="_blank"><?= icon('external') ?><span>الموقع العام</span></a>
    </nav>
    <div class="a-side-foot">
      <div class="a-user"><span class="a-avatar"><?= e(mb_substr($a['display_name'] ?: $a['username'], 0, 1)) ?></span><span style="min-width:0"><b><?= e($a['display_name'] ?: $a['username']) ?></b><small><?= e(ROLE_LABELS[$a['role']] ?? $a['role']) ?></small></span></div>
      <button class="icon-btn" type="button" data-theme-toggle title="الوضع الليلي"><?= icon('moon', 'only-light') ?><?= icon('sun', 'only-dark') ?></button>
      <a class="icon-btn" href="<?= e(url('admin/logout.php?t=' . csrf_token())) ?>" title="تسجيل الخروج"><?= icon('logout') ?></a>
    </div>
  </aside>
  <div class="a-main">
    <header class="a-top">
      <button class="icon-btn a-menu-btn" type="button" onclick="document.getElementById('aSide').classList.toggle('open')" title="القائمة"><?= icon('menu') ?></button>
      <h1><?= icon($opt['icon'] ?? 'dashboard') ?><?= e($title) ?></h1>
      <span class="grow"></span>
      <form class="search-box" action="<?= e(url('admin/people.php')) ?>"><?= icon('search') ?><input type="search" name="q" placeholder="ابحث عن شخص…" value="<?= e($active === 'people' ? ($_GET['q'] ?? '') : '') ?>"></form>
      <?= $opt['actions'] ?? '' ?>
    </header>
    <main class="a-content">
      <?php foreach (flashes() as $f): ?>
        <div class="alert alert-<?= e($f['type']) ?>"><?= icon($f['type'] === 'ok' ? 'check' : 'alert') ?><span><?= e($f['msg']) ?></span></div>
      <?php endforeach; ?>
<?php
}

function admin_foot(array $scripts = []): void
{
    ?>
    </main>
  </div>
</div>
<div class="toasts" id="toasts" aria-live="polite"></div>
<script src="<?= e(asset('js/app.js')) ?>"></script>
<script src="<?= e(asset('js/admin.js')) ?>"></script>
<?php foreach ($scripts as $s): ?><script src="<?= e(asset($s)) ?>"></script><?php endforeach; ?>
</body>
</html>
<?php
}

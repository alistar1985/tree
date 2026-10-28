<?php
/**
 * الإعدادات: بيانات العشيرة وسلسلة الانتماء، التسجيل والحماية، ألوان الشجرة، الآيات، والنظام.
 */
require __DIR__ . '/_layout.php';
admin_require('settings');

const SETTING_TABS = [
    'general'  => ['عام', 'home', ['site_title', 'clan_name', 'tagline', 'about', 'contact_phone', 'contact_note']],
    'clan'     => ['العشيرة والنسب', 'tree', ['hierarchy', 'laqab', 'poster_title', 'poster_credits']],
    'security' => ['التسجيل والحماية', 'shield', ['registration_mode', 'require_phone', 'code_auto_approve', 'submissions_per_hour', 'blocked_words', 'show_added_by']],
    'tree'     => ['الشجرة والألوان', 'palette', ['default_color_mode', 'gen_colors', 'color_trunk', 'color_root', 'color_head', 'color_son', 'color_leaf', 'color_branch', 'show_females', 'show_years']],
    'verses'   => ['الآيات والزخارف', 'leaf', ['verse_1', 'verse_1_ref', 'verse_2', 'verse_2_ref']],
    'system'   => ['النظام والنسخ الاحتياطي', 'database', ['timezone', 'track_visits', 'anonymize_ip']],
];
const CHECKBOXES = ['require_phone', 'code_auto_approve', 'show_added_by', 'show_females', 'show_years', 'track_visits', 'anonymize_ip'];

$tab = isset(SETTING_TABS[$_GET['tab'] ?? '']) ? $_GET['tab'] : 'general';

if (admin_post()) {
    $act = (string)($_POST['act'] ?? '');
    try {
        if ($act === 'save') {
            $t = (string)$_POST['tab'];
            if (!isset(SETTING_TABS[$t])) throw new InvalidArgumentException('قسم غير معروف');
            $changed = [];
            foreach (SETTING_TABS[$t][2] as $key) {
                if (in_array($key, CHECKBOXES, true)) {
                    $v = isset($_POST[$key]) ? '1' : '0';
                } elseif ($key === 'hierarchy') {
                    $rows = [];
                    foreach ((array)($_POST['h_label'] ?? []) as $i => $l) {
                        $l = trim((string)$l);
                        $val = trim((string)($_POST['h_value'][$i] ?? ''));
                        if ($l !== '' || $val !== '') $rows[] = ['label' => $l, 'value' => $val];
                    }
                    $v = json_encode($rows, JSON_UNESCAPED_UNICODE);
                } elseif ($key === 'gen_colors') {
                    $cols = array_values(array_filter((array)($_POST['gen_colors'] ?? []), fn($c) => preg_match('/^#[0-9a-fA-F]{6}$/', (string)$c)));
                    $v = json_encode($cols ?: json_decode(settings_defaults()['gen_colors'], true));
                } elseif (strpos($key, 'color_') === 0) {
                    $v = preg_match('/^#[0-9a-fA-F]{6}$/', (string)($_POST[$key] ?? '')) ? $_POST[$key] : settings_defaults()[$key];
                } elseif ($key === 'registration_mode') {
                    $v = in_array($_POST[$key] ?? '', ['review', 'codes', 'closed'], true) ? $_POST[$key] : 'review';
                } elseif ($key === 'default_view') {
                    $v = ($_POST[$key] ?? '') === 'organic' ? 'organic' : 'down';
                } elseif ($key === 'default_color_mode') {
                    $v = in_array($_POST[$key] ?? '', ['generation', 'house', 'classic'], true) ? $_POST[$key] : 'generation';
                } elseif ($key === 'submissions_per_hour') {
                    $v = (string)max(1, min(100, (int)($_POST[$key] ?? 6)));
                } elseif ($key === 'timezone') {
                    $v = in_array($_POST[$key] ?? '', timezone_identifiers_list(), true) ? $_POST[$key] : 'Asia/Baghdad';
                } else {
                    $v = trim((string)($_POST[$key] ?? ''));
                }
                if ((string)setting($key) !== (string)$v) {
                    $changed[$key] = ['from' => setting($key), 'to' => $v];
                    setting_set($key, $v);
                }
            }
            if ($changed) {
                audit('settings', 'settings', null, 'عدّل الإعدادات (' . SETTING_TABS[$t][0] . '): ' . implode('، ', array_keys($changed)),
                    array_map(fn($c) => $c['from'], $changed), array_map(fn($c) => $c['to'], $changed));
            }
            flash('ok', $changed ? 'تم حفظ الإعدادات.' : 'لا توجد تغييرات.');
            redirect(url('admin/settings.php?tab=' . $t));
        } elseif ($act === 'reset_colors') {
            foreach (['gen_colors', 'color_trunk', 'color_root', 'color_head', 'color_son', 'color_leaf', 'color_branch'] as $k) setting_set($k, settings_defaults()[$k]);
            audit('settings', 'settings', null, 'استعادة ألوان الشجرة الافتراضية');
            flash('ok', 'تمت استعادة الألوان الافتراضية.');
            redirect(url('admin/settings.php?tab=tree'));
        } elseif ($act === 'wipe') {
            if (!admin_can('*')) throw new InvalidArgumentException('هذا الإجراء للمالك فقط');
            if (trim((string)($_POST['confirm'] ?? '')) !== 'حذف') throw new InvalidArgumentException('اكتب كلمة «حذف» للتأكيد');
            $n = (int)db_val('SELECT COUNT(*) FROM persons WHERE parent_id IS NOT NULL');
            db()->beginTransaction();
            db_exec('DELETE FROM persons WHERE parent_id IS NOT NULL');
            db_exec('DELETE FROM submissions');
            db_exec('DELETE FROM suggestions');
            db_exec("UPDATE codes SET scope_person_id = NULL, is_active = 0 WHERE scope_person_id IS NOT NULL");
            db()->commit();
            setting_set('demo_loaded', '0');
            people_refresh();
            audit('delete', 'person', null, "تفريغ الشجرة: حذف " . ar_count($n, "فرد واحد", "فردين", "أفراد", "فرداً") . " والإبقاء على الجد الأكبر فقط");
            flash('ok', "تم تفريغ الشجرة (" . ar_count($n, "فرد واحد", "فردين", "أفراد", "فرداً") . "). بقي الجد الأكبر فقط — ابدأ بإضافة بيوتك.");
            redirect(url('admin/settings.php?tab=system'));
        }
    } catch (InvalidArgumentException $e) {
        flash('danger', $e->getMessage());
    }
    back();
}

$s = settings_all();
$genColors = setting_json('gen_colors');
$hier = setting_json('hierarchy') ?: [['label' => '', 'value' => '']];
$dbSize = is_file(DB_FILE) ? filesize(DB_FILE) : 0;

admin_head('الإعدادات', 'settings', ['icon' => 'sliders']);
?>
<nav class="tabs">
  <?php foreach (SETTING_TABS as $k => [$label, $ic]): ?><a href="?tab=<?= $k ?>" class="<?= $tab === $k ? 'on' : '' ?>"><?= icon($ic) ?><?= e($label) ?></a><?php endforeach; ?>
</nav>

<form class="panel" method="post">
  <?= csrf_field() ?><input type="hidden" name="act" value="save"><input type="hidden" name="tab" value="<?= e($tab) ?>">
  <div class="panel-head"><h2><?= icon(SETTING_TABS[$tab][1]) ?><?= e(SETTING_TABS[$tab][0]) ?></h2></div>
  <div class="panel-body">

  <?php if ($tab === 'general'): ?>
    <div class="form-grid">
      <label class="field"><span>عنوان الموقع</span><input name="site_title" value="<?= e($s['site_title']) ?>" required></label>
      <label class="field"><span>اسم العشيرة (يظهر كعنوان رئيسي)</span><input name="clan_name" value="<?= e($s['clan_name']) ?>" required></label>
      <label class="field full"><span>الشعار التعريفي</span><input name="tagline" value="<?= e($s['tagline']) ?>"></label>
      <label class="field full"><span>نبذة عن العشيرة</span><textarea name="about" rows="4"><?= e($s['about']) ?></textarea></label>
      <label class="field"><span>هاتف/واتساب الإدارة</span><input name="contact_phone" dir="ltr" value="<?= e($s['contact_phone']) ?>" placeholder="9647xxxxxxxxx"></label>
      <label class="field"><span>نص التواصل في التذييل</span><input name="contact_note" value="<?= e($s['contact_note']) ?>"></label>
    </div>

  <?php elseif ($tab === 'clan'): ?>
    <div class="field"><span>سلسلة الانتماء (من الأعلى إلى الأدنى) — مثال: القبيلة: الجبور › العشيرة: المجابر › البطن: السواكن › الفخذ: آل صالح آغا</span>
      <div id="hRows">
        <?php foreach ($hier as $h): ?>
          <div class="h-row"><input name="h_label[]" value="<?= e($h['label']) ?>" placeholder="المستوى (القبيلة، العشيرة، الفخذ…)"><input name="h_value[]" value="<?= e($h['value']) ?>" placeholder="الاسم"><button class="icon-btn" type="button" data-row-del title="حذف"><?= icon('x') ?></button></div>
        <?php endforeach; ?>
      </div>
      <button class="btn btn-sm btn-ghost" type="button" data-row-add="hRows" style="align-self:flex-start"><?= icon('plus') ?>إضافة مستوى</button>
    </div>
    <div class="form-grid">
      <label class="field full"><span>ألقاب العشيرة (مفصولة بفاصلة) — تُستبعد تلقائياً من آخر الاسم عند الإضافة</span><input name="laqab" value="<?= e($s['laqab']) ?>" placeholder="الحلفي، الحلافي"></label>
      <label class="field"><span>عنوان لوحة الطباعة (فارغ = عنوان الموقع)</span><input name="poster_title" value="<?= e($s['poster_title']) ?>" placeholder="مثال: فخذ البو عبدالله"></label>
      <label class="field"><span>سطر الإهداء/الإعداد أسفل اللوحة</span><input name="poster_credits" value="<?= e($s['poster_credits']) ?>" placeholder="مثال: نُظمت هذه الشجرة بإشراف…"></label>
    </div>
    <p class="hint"><?= icon('info') ?>الجد الأكبر (جذر الشجرة) يُعدَّل من صفحة «الأفراد» كأي شخص آخر، ومنها أيضاً تضيف جداً أعلى منه لإكمال سلسلة الأجداد للأعلى.</p>

  <?php elseif ($tab === 'security'): ?>
    <div class="field"><span>طريقة الإضافة</span></div>
    <div class="radio-cards">
      <?php foreach ([
          'review' => ['مفتوحة مع المراجعة (مقترح)', 'أي شخص يضيف نسبه، ولا يظهر في الشجرة قبل أن يعتمده رأس البيت أو المشرف.'],
          'codes'  => ['برموز البيوت فقط', 'لا يضيف إلا من لديه رمز بيت؛ أعلى حماية من الأسماء الوهمية.'],
          'closed' => ['مغلقة', 'إيقاف الإضافة مؤقتاً؛ التصفح متاح للجميع.'],
      ] as $k => [$t, $d]): ?>
        <label class="radio-card"><input type="radio" name="registration_mode" value="<?= $k ?>" <?= $s['registration_mode'] === $k ? 'checked' : '' ?>><span><b><?= e($t) ?></b><small><?= e($d) ?></small></span></label>
      <?php endforeach; ?>
    </div>
    <label class="check"><input type="checkbox" name="code_auto_approve" <?= $s['code_auto_approve'] === '1' ? 'checked' : '' ?>><span>نشر إضافات أصحاب الرموز مباشرة دون مراجعة</span></label>
    <label class="check"><input type="checkbox" name="require_phone" <?= $s['require_phone'] === '1' ? 'checked' : '' ?>><span>إلزام الزائر برقم هاتف عند الإضافة (للتحقق — لا يظهر للعامة)</span></label>
    <label class="check"><input type="checkbox" name="show_added_by" <?= $s['show_added_by'] === '1' ? 'checked' : '' ?>><span>إظهار «من أضاف» للعامة في تفاصيل الشخص</span></label>
    <div class="form-grid" style="margin-top:10px">
      <label class="field"><span>الحد الأقصى للطلبات من نفس الجهاز في الساعة</span><input type="number" min="1" max="100" name="submissions_per_hour" value="<?= e($s['submissions_per_hour']) ?>"></label>
      <label class="field"><span>كلمات محظورة في الأسماء (مفصولة بفاصلة)</span><input name="blocked_words" value="<?= e($s['blocked_words']) ?>" placeholder="كلمات لا تُقبل في الأسماء"></label>
    </div>
    <div class="alert alert-info"><?= icon('shield') ?><span>الحماية المفعلة دائماً: تحديد محاولات إدخال الرموز (8 كل 15 دقيقة)، فخ للروبوتات، منع تكرار الأسماء تحت الأب نفسه، دمج تلقائي للمكرر عند الاعتماد، وتسجيل كل عملية مع الجهاز والعنوان.</span></div>

  <?php elseif ($tab === 'tree'): ?>
    <div class="form-grid">
      <label class="field"><span>التلوين الافتراضي</span><select name="default_color_mode">
        <option value="generation" <?= $s['default_color_mode'] === 'generation' ? 'selected' : '' ?>>لون لكل جيل (مع دليل الألوان)</option>
        <option value="classic" <?= $s['default_color_mode'] === 'classic' ? 'selected' : '' ?>>كلاسيكي: رؤوس البيوت ذهبي، الأبناء أبيض، الأحفاد أوراق خضراء</option>
        <option value="house" <?= $s['default_color_mode'] === 'house' ? 'selected' : '' ?>>لون لكل بيت</option></select></label>
    </div>
    <div class="field"><span>ألوان الأجيال بالترتيب (الجيل الأول، الثاني، …)</span>
      <div class="color-row" id="genRow">
        <?php foreach ($genColors as $i => $c): ?>
          <span class="color-chip"><input type="color" name="gen_colors[]" value="<?= e($c) ?>"><span><?= e(gen_ordinal($i + 1)) ?></span><button class="btn btn-xs btn-ghost" type="button" data-color-del><?= icon('x') ?></button></span>
        <?php endforeach; ?>
        <button class="btn btn-sm btn-ghost" type="button" data-color-add><?= icon('plus') ?>جيل</button>
      </div>
    </div>
    <div class="field"><span>ألوان العناصر</span>
      <div class="color-row">
        <?php foreach (['color_trunk' => 'ألواح الأجداد', 'color_root' => 'الجد الجامع', 'color_leaf' => 'الأوراق (الجيل الأخير)', 'color_branch' => 'الأغصان', 'color_head' => 'رؤوس البيوت (كلاسيكي)', 'color_son' => 'الأبناء (كلاسيكي)'] as $k => $l): ?>
          <span class="color-chip"><input type="color" name="<?= $k ?>" value="<?= e($s[$k]) ?>"><span><?= e($l) ?></span></span>
        <?php endforeach; ?>
      </div>
    </div>
    <label class="check"><input type="checkbox" name="show_years" <?= $s['show_years'] === '1' ? 'checked' : '' ?>><span>إظهار سنوات الميلاد والوفاة للعامة</span></label>
    <label class="check"><input type="checkbox" name="show_females" <?= $s['show_females'] === '1' ? 'checked' : '' ?>><span>إظهار الإناث في الشجرة العامة (الشجرة أبوية؛ لا يُضاف تحت الأنثى أبناء)</span></label>

  <?php elseif ($tab === 'verses'): ?>
    <p class="hint"><?= icon('info') ?>تظهر في الإطارين الزخرفيين أعلى الشجرة في الصفحة الرئيسية وفي لوحة الطباعة، كما في لوحات الأنساب.</p>
    <div class="form-grid">
      <label class="field full"><span>النص الأول (الإطار الأيمن)</span><textarea name="verse_1" rows="3" style="font-family:var(--font-quran);font-size:1.1rem"><?= e($s['verse_1']) ?></textarea></label>
      <label class="field"><span>مصدر النص الأول</span><input name="verse_1_ref" value="<?= e($s['verse_1_ref']) ?>"></label><span></span>
      <label class="field full"><span>النص الثاني (الإطار الأيسر)</span><textarea name="verse_2" rows="3" style="font-family:var(--font-quran);font-size:1.1rem"><?= e($s['verse_2']) ?></textarea></label>
      <label class="field"><span>مصدر النص الثاني</span><input name="verse_2_ref" value="<?= e($s['verse_2_ref']) ?>"></label>
    </div>

  <?php else: ?>
    <div class="form-grid">
      <label class="field"><span>المنطقة الزمنية</span><select name="timezone"><?php foreach (['Asia/Baghdad', 'Asia/Riyadh', 'Asia/Kuwait', 'Asia/Dubai', 'Asia/Amman', 'Asia/Damascus', 'Asia/Beirut', 'Africa/Cairo', 'Europe/London', 'Europe/Berlin', 'America/New_York'] as $tz): ?><option <?= $s['timezone'] === $tz ? 'selected' : '' ?>><?= $tz ?></option><?php endforeach; ?></select></label>
      <div></div>
    </div>
    <label class="check"><input type="checkbox" name="track_visits" <?= $s['track_visits'] === '1' ? 'checked' : '' ?>><span>تسجيل إحصاءات الزوار (الأجهزة، الأنظمة، الصفحات)</span></label>
    <label class="check"><input type="checkbox" name="anonymize_ip" <?= $s['anonymize_ip'] === '1' ? 'checked' : '' ?>><span>إخفاء آخر جزء من عنوان IP حفاظاً على الخصوصية</span></label>
  <?php endif; ?>
  </div>
  <div class="save-bar">
    <?php if ($tab === 'tree'): ?><button class="btn btn-ghost" type="submit" form="resetColors"><?= icon('refresh') ?>الألوان الافتراضية</button><?php endif; ?>
    <button class="btn btn-primary" type="submit"><?= icon('check') ?>حفظ</button>
  </div>
</form>
<?php if ($tab === 'tree'): ?><form id="resetColors" method="post" data-confirm="استعادة ألوان الشجرة الافتراضية؟"><?= csrf_field() ?><input type="hidden" name="act" value="reset_colors"></form><?php endif; ?>

<?php if ($tab === 'system'): ?>
  <section class="panel">
    <div class="panel-head"><div><h2><?= icon('download') ?>النسخ الاحتياطي والتصدير</h2><p>حجم قاعدة البيانات: <?= number_format($dbSize / 1024, 1) ?> ك.ب — يُنصح بتحميل نسخة أسبوعياً.</p></div></div>
    <div class="panel-body" style="display:flex;gap:10px;flex-wrap:wrap">
      <a class="btn btn-primary" href="<?= e(url('admin/export.php?type=db')) ?>"><?= icon('database') ?>نسخة كاملة من قاعدة البيانات</a>
      <a class="btn btn-outline" href="<?= e(url('admin/export.php?type=json')) ?>"><?= icon('download') ?>الشجرة بصيغة JSON</a>
      <a class="btn btn-outline" href="<?= e(url('admin/export.php?type=csv')) ?>"><?= icon('download') ?>الأفراد مع النسب (Excel/CSV)</a>
    </div>
  </section>
  <?php if (admin_can('*')): ?>
  <section class="panel">
    <div class="panel-head"><h2><?= icon('alert') ?>منطقة الخطر</h2></div>
    <div class="panel-body">
      <form method="post" class="danger-zone" data-confirm="سيتم حذف كل الأفراد عدا الجد الأكبر، مع الطلبات والاقتراحات. لا يمكن التراجع! متابعة؟">
        <?= csrf_field() ?><input type="hidden" name="act" value="wipe">
        <b>تفريغ الشجرة<?= setting('demo_loaded') === '1' ? ' (حذف البيانات التجريبية)' : '' ?></b>
        <p class="muted" style="font-size:.9rem;margin:4px 0 10px">يحذف جميع الأفراد عدا الجد الأكبر لتبدأ بياناتك الحقيقية. حمّل نسخة احتياطية أولاً.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input name="confirm" placeholder="اكتب: حذف" style="max-width:180px"><button class="btn btn-danger btn-sm" type="submit"><?= icon('trash') ?>تفريغ الشجرة</button></div>
      </form>
    </div>
  </section>
  <?php endif; ?>
<?php endif; ?>
<?php admin_foot(); ?>

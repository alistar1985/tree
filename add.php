<?php
/**
 * معالج "أضف نسبك": الاسم الكامل ← الربط الذكي ← التفاصيل ← مراجعة الشجرة.
 */
require __DIR__ . '/includes/bootstrap.php';
require __DIR__ . '/includes/layout.php';

$visit = track_visit('add');
$mode = setting('registration_mode');
$code = current_code();
$admin = current_admin();
$privileged = $admin || $code;
$blocked = !$privileged && in_array($mode, ['closed', 'codes'], true);

$cfg = tree_client_config() + [
    'requirePhone' => setting('require_phone') === '1' && !$privileged,
    'viewer' => $admin ? 'admin' : ($code ? 'code' : 'public'),
    'holder' => $code['holder_name'] ?? null,
    'autoApprove' => $admin || ($code && setting('code_auto_approve') === '1'),
];

page_head('أضف نسبك', 'add', ['visit' => $visit, 'description' => 'أضف اسمك ونسبك إلى شجرة ' . setting('clan_name')]);
?>
<main class="wrap add-page">
  <section class="wizard" id="wizard">
    <header class="wiz-head">
      <h1>أضف اسمك ونسبك</h1>
      <p>اكتب اسمك الكامل وسنربطك بأجدادك في الشجرة تلقائياً.</p>
      <ol class="wiz-steps" id="wizSteps">
        <li class="on">الاسم الكامل</li><li>الربط بالشجرة</li><li>التفاصيل</li><li>شجرتك</li>
      </ol>
    </header>

    <?php if ($blocked): ?>
      <div class="wiz-body">
        <div class="alert alert-warn"><?= icon('lock') ?>
          <div><b><?= $mode === 'closed' ? 'الإضافة مغلقة حالياً' : 'الإضافة متاحة لأصحاب رموز البيوت' ?></b><br>
          <?= $mode === 'closed' ? 'أوقفت الإدارة استقبال الإضافات مؤقتاً. تواصل مع إدارة الشجرة.' : 'اطلب رمز بيتك من رأس البيت أو من الإدارة، ثم أدخله للمتابعة.' ?></div>
        </div>
        <?php if ($mode === 'codes'): ?><button class="btn btn-gold" type="button" data-open="codeModal"><?= icon('key') ?>لدي رمز بيت</button><?php endif; ?>
      </div>
    <?php else: ?>

    <!-- 1: الاسم -->
    <div class="wiz-body" data-step="1">
      <?php if ($privileged): ?>
        <div class="alert alert-ok"><?= icon('shield') ?><span>أنت تعمل <?= $admin ? 'كمشرف' : 'برمز «' . e($code['holder_name']) . '»' ?> — <?= $cfg['autoApprove'] ? 'ستُنشر الإضافة مباشرة دون انتظار.' : 'ستُراجع الإضافة قبل النشر.' ?></span></div>
      <?php endif; ?>
      <label class="field">
        <span>اسمك الكامل (الخماسي أو السداسي)</span>
        <input class="big-input" id="fullName" placeholder="مثال: علي عبد الحليم جعفر محمد موسى الحلفي" autocomplete="name" autofocus>
      </label>
      <div class="name-chips empty" id="chips" data-empty="ستظهر هنا أسماء سلسلتك: أنت، الأب، الجد…"></div>
      <p class="chip-help"><?= icon('info') ?>اضغط على أي اسم لتعديله أو فصله، واضغط <b>⇆</b> لدمج اسمين (مثل «عبد» و«الحليم»). اللقب الأخير يُستبعد تلقائياً.</p>
      <input type="text" name="website" id="hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
    </div>

    <!-- 2: الربط -->
    <div class="wiz-body" data-step="2" hidden>
      <div id="matchBox"></div>
    </div>

    <!-- 3: التفاصيل -->
    <div class="wiz-body" data-step="3" hidden>
      <div class="alert alert-info" id="linkSummary"></div>
      <div class="grid-2">
        <label class="field"><span>الكنية / اللقب (اختياري)</span><input id="nickname" placeholder="أبو حسين، الحاج…"></label>
        <label class="field"><span>سنة الميلاد (اختياري)</span><input id="birthYear" inputmode="numeric" placeholder="1990"></label>
      </div>
      <label class="field">
        <span>رقم الهاتف <?= $cfg['requirePhone'] ? '(مطلوب للتحقق)' : '(اختياري — للتحقق فقط ولا يظهر للعامة)' ?></span>
        <input id="phone" inputmode="tel" dir="ltr" placeholder="07xx xxx xxxx">
      </label>
      <div class="field">
        <span>أبناؤك (اختياري) — من الأكبر إلى الأصغر</span>
        <div class="sons-list" id="sons"></div>
        <button class="btn btn-sm btn-ghost" type="button" id="addSon" style="align-self:flex-start"><?= icon('plus') ?>إضافة ابن</button>
      </div>
      <label class="field"><span>ملاحظة للمشرف (اختياري)</span><textarea id="note" rows="2" placeholder="أي معلومة تساعد في التحقق من النسب"></textarea></label>
    </div>

    <!-- 4: النتيجة -->
    <div class="wiz-body" data-step="4" hidden>
      <div id="resultBox"></div>
    </div>

    <footer class="wiz-foot" id="wizFoot">
      <button class="btn btn-ghost" type="button" id="backBtn" hidden><?= icon('arrow-r') ?>رجوع</button>
      <span></span>
      <button class="btn btn-primary btn-lg" type="button" id="nextBtn"><?= icon('sparkles') ?>ابحث عن عائلتي</button>
    </footer>
    <?php endif; ?>
  </section>

  <aside style="display:grid;gap:16px">
    <div class="card side-card" id="mySubs" hidden>
      <h3><?= icon('inbox') ?>طلباتك</h3>
      <div id="mySubsList"></div>
    </div>
    <div class="card side-card">
      <h3><?= icon('info') ?>نصائح للربط الدقيق</h3>
      <ul class="tips">
        <li>اكتب اسمك ثم اسم أبيك ثم جدك… حتى أبعد جد تعرفه.</li>
        <li>كلما زادت الأسماء زادت دقة الربط؛ يُفضّل الخماسي أو السداسي.</li>
        <li>إن ظهر أكثر من خيار، اختر الذي يطابق أسماء أعمامك وأجدادك.</li>
        <li>لا تقلق من الأخطاء الإملائية البسيطة؛ نتعرف على «عبدالله» و«عبد الله» و«إبراهيم» و«ابراهيم».</li>
        <li>بعد الحفظ تستطيع تعديل الأسماء ما دام الطلب قيد المراجعة.</li>
      </ul>
    </div>
  </aside>
</main>
<script>window.CLAN_CFG = <?= json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<?php page_foot(['scripts' => ['vendor/d3.min.js', 'tree.js', 'add.js']]); ?>

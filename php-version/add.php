<?php
/**
 * أضف نسبك: نموذج واحد بسيط — الاسم الكامل والتفاصيل ثم إرسال.
 * الربط بالأجداد يتم تلقائياً خلف الكواليس، وما لا يُربط يُضاف فرعاً جديداً حتى يكتمل نسبه.
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
];

page_head('أضف نسبك', 'add', ['visit' => $visit, 'description' => 'أضف اسمك ونسبك إلى شجرة ' . setting('clan_name')]);
?>
<main class="wrap add-simple">
  <section class="card add-card">
    <header class="add-head">
      <span class="add-icon"><?= icon('user-plus') ?></span>
      <div><h1>أضف نسبك</h1><p>اكتب اسمك الكامل وبياناتك، ونربطك بأجدادك في الشجرة تلقائياً.</p></div>
    </header>

    <?php if ($blocked): ?>
      <div class="alert alert-warn"><?= icon('lock') ?>
        <div><b><?= $mode === 'closed' ? 'الإضافة مغلقة حالياً' : 'الإضافة متاحة لأصحاب الرموز فقط' ?></b><br>
        <?= $mode === 'closed' ? 'أوقفت الإدارة استقبال الإضافات مؤقتاً.' : 'اطلب الرمز من رأس بيتك أو من الإدارة، ثم أدخله من أيقونة المفتاح.' ?></div>
      </div>
      <?php if ($mode === 'codes'): ?><button class="btn btn-gold" type="button" data-open="codeModal"><?= icon('key') ?>لدي رمز</button><?php endif; ?>
    <?php else: ?>

    <form id="addForm" novalidate>
      <?php if ($privileged): ?>
        <div class="alert alert-ok"><?= icon('shield') ?><span>أنت تعمل <?= $admin ? 'كمالك للشجرة' : 'برمز «' . e($code['holder_name']) . '»' ?>: الإضافة ضمن صلاحياتك تُنشر في الشجرة مباشرة.</span></div>
      <?php endif; ?>

      <label class="field">
        <span>اسمك الكامل (الخماسي أو السداسي)</span>
        <input class="big-input" id="fullName" placeholder="مثال: علي عبد الحليم جعفر محمد موسى" autocomplete="name" required>
      </label>
      <div class="name-chips empty" id="chips" data-empty="سيظهر هنا تسلسل نسبك: أنت، الأب، الجد…"></div>
      <p class="chip-help"><?= icon('info') ?>اكتب اسمك ثم اسم أبيك ثم جدك… حتى أبعد جد تعرفه. اضغط <b>⇆</b> لدمج اسمين مثل «عبد» و«الحليم».</p>

      <div class="grid-2">
        <label class="field"><span>رقم الهاتف<?= $cfg['requirePhone'] ? ' (مطلوب)' : '' ?></span><input id="phone" inputmode="tel" dir="ltr" placeholder="07xx xxx xxxx"><small>للتحقق فقط، ولا يظهر لأحد.</small></label>
        <label class="field"><span>سنة الميلاد (اختياري)</span><input id="birthYear" inputmode="numeric" placeholder="1990"></label>
      </div>

      <div class="field">
        <span>أبناؤك (اختياري) — من الأكبر إلى الأصغر</span>
        <div class="sons-list" id="sons"></div>
        <button class="btn btn-sm btn-ghost" type="button" id="addSon" style="align-self:flex-start"><?= icon('plus') ?>إضافة ابن</button>
      </div>

      <label class="field"><span>ملاحظة (اختياري)</span><textarea id="note" rows="2" placeholder="أي معلومة تساعد في التأكد من النسب، مثل اسم البيت أو المنطقة"></textarea></label>
      <input type="text" id="hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">

      <div id="choose" hidden></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit" id="sendBtn"><?= icon('check') ?><?= $privileged ? 'إضافة إلى الشجرة' : 'إرسال' ?></button>
    </form>
    <div id="doneBox" hidden></div>
    <?php endif; ?>
  </section>

  <section class="card side-card" id="mySubs" hidden>
    <h3><?= icon('inbox') ?>طلباتك السابقة</h3>
    <div id="mySubsList"></div>
  </section>
</main>
<script>window.CLAN_CFG = <?= json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<?php page_foot(['scripts' => ['add.js']]); ?>

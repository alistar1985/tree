/* ==========================================================================
   تهيئة الصفحات العامة: عنوان الموقع، أدوات الرأس، نافذة الرمز، وضع الصيانة، وتسجيل الزيارة.
   ========================================================================== */
/* global App */
import { ready, state, trackVisit, watchRev } from './store.js';

const { esc, icon } = App;
const page = document.body.dataset.page || 'tree';

await ready();
const s = state.settings;
const v = state.viewer;

if (!state.installed) {
  location.replace('/setup');
} else {
  document.querySelectorAll('[data-bind="site_title"]').forEach((el) => { el.textContent = s.site_title; });
  document.querySelectorAll('[data-bind="hierarchy"]').forEach((el) => { el.textContent = (s.hierarchy || []).filter((l) => l.value).map((l) => l.value).join(' · '); });
  document.title = (page === 'add' ? 'أضف نسبك — ' : '') + s.site_title;

  // أدوات الرأس: لوحة التحكم للمالك فقط، رمز الصلاحية، والوضع الليلي
  const tools = document.getElementById('headerTools');
  if (tools) {
    const cta = page === 'add'
      ? `<a class="btn btn-outline btn-sm header-cta" href="/">${icon('tree')}الشجرة</a>`
      : `<a class="btn btn-gold btn-sm header-cta" href="/add">${icon('user-plus')}أضف نسبك</a>`;
    const who = v.type === 'admin'
      ? `<a class="chip chip-admin" href="/admin" title="لوحة التحكم">${icon('dashboard')}<span>لوحة التحكم</span></a>`
      : v.type === 'code'
        ? `<button class="chip chip-code" type="button" data-open="codeModal" title="أنت تعمل برمز صلاحية">${icon('key')}<span>${esc(v.holder)}</span></button>`
        : `<button class="icon-btn" type="button" data-open="codeModal" title="دخول برمز الصلاحية">${icon('key')}</button>`;
    tools.innerHTML = cta + who + `<button class="icon-btn" type="button" data-theme-toggle title="الوضع الليلي/النهاري">${icon('moon', 'only-light')}${icon('sun', 'only-dark')}</button>`;
  }

  // نافذة رمز الصلاحية
  const modal = document.getElementById('codeModal');
  if (modal) {
    const head = `<header class="modal-head"><span class="modal-icon">${icon('key')}</span>
      <div><h3>رمز الصلاحية</h3><p>رمز يمنحه مالك الشجرة لرؤساء البيوت والمشرفين، يتيح الإضافة والتعديل واعتماد الطلبات حسب صلاحياته.</p></div>
      <button class="icon-btn" value="cancel" formnovalidate title="إغلاق">${icon('x')}</button></header>`;
    if (v.type === 'code') {
      const c = state.code;
      const perms = [c.add && 'إضافة', c.edit && 'تعديل', c.del && 'حذف', c.approve && 'اعتماد الطلبات'].filter(Boolean).map((x) => `<i>${x}</i>`).join('');
      modal.innerHTML = `<form class="modal-card" method="dialog">${head}
        <div class="code-status"><div class="code-badge">${icon('shield')}</div><div><b>أنت تعمل برمز: ${esc(c.holder)}</b>
        <span>النطاق: ${c.scope != null && c.scope !== '' ? 'بيت/فرع محدد' : 'الشجرة كاملة'}</span><span class="perm-list">${perms}</span></div></div>
        <footer class="modal-foot">
          ${c.approve ? `<a class="btn btn-ghost" href="/?pending=1">${icon('inbox')}الطلبات</a>` : ''}
          <button class="btn btn-danger-soft" type="button" data-code-logout>${icon('logout')}إنهاء الجلسة</button>
        </footer></form>`;
    } else {
      modal.innerHTML = `<form class="modal-card" method="dialog" data-code-form>${head}
        <label class="field"><span>أدخل الرمز</span><input name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" placeholder="0000-0000" maxlength="12" required></label>
        <p class="hint">${icon('info')} كل إضافة أو تعديل يتم بالرمز يُسجَّل باسم صاحبه في سجل العمليات.</p>
        <p class="form-error" data-error hidden></p>
        <footer class="modal-foot"><button class="btn btn-primary" type="submit">${icon('check')}دخول</button></footer></form>`;
    }
  }

  // وضع الصيانة: يظهر للزوار فقط، والمالك يتصفح ويعمل كالمعتاد
  if (s.maintenance && v.type !== 'admin') {
    document.body.insertAdjacentHTML('beforeend', `<div class="maint">
      <div class="maint-card">${icon('sliders')}<h1>${esc(s.site_title)}</h1><b>الموقع قيد الصيانة</b><p>${esc(s.maintenance_msg || '')}</p>
      <button class="icon-btn" type="button" data-open="codeModal" title="دخول برمز">${icon('key')}</button></div></div>`);
    document.body.classList.add('in-maint');
  } else if (s.maintenance) {
    document.body.insertAdjacentHTML('afterbegin', `<div class="maint-bar">${icon('alert')} الموقع في وضع الصيانة — الزوار يرون صفحة الصيانة، وأنت ترى الموقع كالمعتاد. <a href="/admin#settings/maintenance">إيقاف الصيانة</a></div>`);
  }

  // صفحة الإضافة: حالات الإغلاق والصلاحيات
  if (page === 'add') {
    const blocked = v.type === 'public' && (s.registration_mode === 'closed' || s.registration_mode === 'codes');
    const form = document.getElementById('addForm');
    const priv = document.getElementById('privAlert');
    if (blocked && form) {
      form.outerHTML = `<div class="alert alert-warn">${icon('lock')}<div><b>${s.registration_mode === 'closed' ? 'الإضافة مغلقة حالياً' : 'الإضافة متاحة لأصحاب الرموز فقط'}</b><br>
        ${s.registration_mode === 'closed' ? 'أوقفت الإدارة استقبال الإضافات مؤقتاً.' : 'اطلب الرمز من رأس بيتك أو من الإدارة، ثم أدخله من أيقونة المفتاح.'}</div></div>
        ${s.registration_mode === 'codes' ? `<button class="btn btn-gold" type="button" data-open="codeModal">${icon('key')}لدي رمز</button>` : ''}`;
    } else if (priv && v.type !== 'public') {
      priv.innerHTML = `${icon('shield')}<span>أنت تعمل ${v.type === 'admin' ? 'كمالك للشجرة' : 'برمز «' + esc(v.holder) + '»'}: الإضافة ضمن صلاحياتك تُنشر في الشجرة مباشرة.</span>`;
      priv.hidden = false;
      const btn = document.getElementById('sendBtn');
      if (btn) btn.innerHTML = icon('check') + 'إضافة إلى الشجرة';
    }
    const ph = document.getElementById('phoneLabel');
    if (ph && s.require_phone && v.type === 'public') ph.textContent = 'رقم الهاتف (مطلوب)';
  }

  trackVisit(page);
  // تحديث تلقائي: إن أضاف أحد أسماء جديدة تُعاد الشجرة دون إعادة تحميل الصفحة
  if (page === 'tree') watchRev(() => window.dispatchEvent(new Event('clan-data')));
}

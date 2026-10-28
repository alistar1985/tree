/* ==========================================================================
   أدوات لوحة التحكم: اختيار الأشخاص، تأكيد العمليات، النسخ، تلميحات الرسوم، الحقول المتكررة.
   ========================================================================== */
/* global App */
(function () {
  'use strict';
  const { $, $$, icon } = App;

  // اختيار شخص من الشجرة بالبحث
  $$('[data-person-picker]').forEach((box) => {
    const input = box.querySelector('input[type=search]');
    const hidden = box.querySelector('input[type=hidden]');
    const res = box.querySelector('.search-results');
    const picked = box.querySelector('.picked');
    App.searchBox(input, res, (r) => {
      hidden.value = r.id;
      input.value = r.name;
      picked.querySelector('span').textContent = r.nasab + (r.house ? ' · ' + r.house : '');
      picked.hidden = false;
    });
    input.addEventListener('input', () => { if (!input.value.trim()) { hidden.value = ''; picked.hidden = true; } });
  });

  document.addEventListener('submit', async (e) => {
    const f = e.target;
    const req = $$('input[data-required]', f).find((h) => !h.value);
    if (req) { e.preventDefault(); App.toast('اختر الشخص من نتائج البحث', 'err'); return; }
    if (f.dataset.confirm && !f.__ok) {
      e.preventDefault();
      const danger = /حذف|تفريغ|رفض|تعطيل/.test(f.dataset.confirm);
      if (await App.confirm({ title: 'تأكيد', text: f.dataset.confirm, danger, ok: 'متابعة' })) { f.__ok = true; f.requestSubmit ? f.requestSubmit(e.submitter || undefined) : f.submit(); }
    }
  }, true);

  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) App.copy(c.dataset.copy);
    const r = e.target.closest('[data-reveal]');
    if (r) { const v = r.dataset.reveal; r.dataset.reveal = r.textContent; r.textContent = v; }
    const add = e.target.closest('[data-row-add]');
    if (add) {
      const box = document.getElementById(add.dataset.rowAdd);
      const row = box.querySelector('.h-row').cloneNode(true);
      row.querySelectorAll('input').forEach((i) => { i.value = ''; });
      box.appendChild(row);
    }
    const del = e.target.closest('[data-row-del]');
    if (del) { const row = del.closest('.h-row'); if (row.parentNode.children.length > 1) row.remove(); else row.querySelectorAll('input').forEach((i) => { i.value = ''; }); }
    const ca = e.target.closest('[data-color-add]');
    if (ca) {
      const chip = document.createElement('span');
      chip.className = 'color-chip';
      const n = $$('#genRow .color-chip').length + 1;
      chip.innerHTML = `<input type="color" name="gen_colors[]" value="#9b59b6"><span>الجيل ${n}</span><button class="btn btn-xs btn-ghost" type="button" data-color-del>${icon('x')}</button>`;
      ca.before(chip);
    }
    const cd = e.target.closest('[data-color-del]');
    if (cd && $$('#genRow .color-chip').length > 1) cd.closest('.color-chip').remove();
    const side = $('#aSide');
    if (side && side.classList.contains('open') && !e.target.closest('#aSide') && !e.target.closest('.a-menu-btn')) side.classList.remove('open');
  });

  // رمز المشرف: الشجرة كاملة وكل الصلاحيات، فتُخفى حقول النطاق والصلاحيات
  const syncCodeType = () => {
    const sup = $('input[name=code_type][value=supervisor]');
    if (!sup) return;
    const on = sup.checked;
    ['scope_house', 'scope_person'].forEach((n) => { const el = $(`[name=${n}]`); if (el) el.closest('.field').hidden = on; });
    $$('input[name^=can_]').forEach((c) => { if (on) c.checked = true; c.disabled = on; });
  };
  document.addEventListener('change', (e) => { if (e.target.name === 'code_type') syncCodeType(); });
  syncCodeType();

  // تلميح أعمدة الرسوم البيانية
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  document.addEventListener('pointerover', (e) => {
    const col = e.target.closest('.chart-cols .col');
    if (!col) { tip.hidden = true; return; }
    tip.textContent = col.dataset.tip;
    tip.hidden = false;
  });
  document.addEventListener('pointermove', (e) => {
    if (tip.hidden) return;
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 12) + 'px';
    tip.style.top = (e.clientY - 36) + 'px';
  });
})();

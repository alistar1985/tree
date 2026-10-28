/* ==========================================================================
   أضف نسبك: نموذج واحد — يُحلَّل الاسم، ويُربط تلقائياً بأقرب نسب في الشجرة،
   وإن لم يُعثر على أجداده يُضاف فرعاً جديداً يكتمل لاحقاً عندما يضيف أقاربه أنسابهم.
   ========================================================================== */
/* global App */
(function () {
  'use strict';
  const { $, $$, api, toast, esc, icon, Names, storeGet, storeSet } = App;
  const CFG = window.CLAN_CFG || {};
  const form = $('#addForm');
  const st = { chain: [], pick: undefined };

  /* ───────────── رقائق الاسم ───────────── */
  const input = $('#fullName');
  const chipsBox = $('#chips');
  function parseInput() {
    st.chain = Names.parse(input.value, CFG.laqab || []);
    st.pick = undefined;
    hideChooser();
    drawChips();
  }
  function drawChips() {
    if (!chipsBox) return;
    if (!st.chain.length) { chipsBox.innerHTML = ''; chipsBox.classList.add('empty'); return; }
    chipsBox.classList.remove('empty');
    let gi = 0;
    chipsBox.innerHTML = st.chain.map((c, i) => {
      const role = c.laqab ? 'اللقب' : Names.role(gi++);
      const join = i < st.chain.length - 1 ? `<button type="button" class="nchip-join" data-join="${i}" title="دمج الاسمين">⇆</button>` : '';
      return `<span class="nchip ${c.laqab ? 'laqab' : ''} ${!c.laqab && role === 'أنت' ? 'self' : ''}" data-i="${i}" role="button" tabindex="0" title="اضغط للتعديل"><b>${esc(c.name)}</b><small>${role}</small></span>${join}`;
    }).join('');
  }
  const syncInput = () => { input.value = st.chain.map((c) => c.name).join(' '); st.pick = undefined; hideChooser(); drawChips(); };
  const names = () => st.chain.filter((c) => !c.laqab).map((c) => c.name);

  let menu = null;
  const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };
  if (chipsBox) chipsBox.addEventListener('click', (e) => {
    const j = e.target.closest('[data-join]');
    if (j) {
      const i = +j.dataset.join;
      st.chain.splice(i, 2, { name: st.chain[i].name + ' ' + st.chain[i + 1].name, laqab: false });
      return syncInput();
    }
    const chip = e.target.closest('.nchip');
    if (!chip) return;
    e.stopPropagation();
    closeMenu();
    const i = +chip.dataset.i;
    const c = st.chain[i];
    const r = chip.getBoundingClientRect();
    menu = document.createElement('div');
    menu.className = 'menu';
    menu.style.cssText = `position:fixed;top:${r.bottom + 6}px;left:${Math.max(8, Math.min(window.innerWidth - 230, r.left))}px;inset-inline-end:auto`;
    menu.innerHTML = [
      `<button type="button" data-m="edit">${icon('edit')}تعديل الاسم</button>`,
      c.name.includes(' ') ? `<button type="button" data-m="split">${icon('branch')}فصل إلى اسمين</button>` : '',
      i === st.chain.length - 1 ? `<button type="button" data-m="laqab">${icon('crown')}${c.laqab ? 'هذا اسم وليس لقباً' : 'هذا لقب العشيرة (استبعاده)'}</button>` : '',
      `<button type="button" data-m="del">${icon('trash')}حذف</button>`,
    ].join('');
    document.body.appendChild(menu);
    menu.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-m]');
      if (!b) return;
      if (b.dataset.m === 'edit') { const v = prompt('تعديل الاسم', c.name); if (v != null && Names.clean(v)) c.name = Names.clean(v); }
      if (b.dataset.m === 'split') st.chain.splice(i, 1, ...c.name.split(' ').map((n) => ({ name: n, laqab: false })));
      if (b.dataset.m === 'laqab') c.laqab = !c.laqab;
      if (b.dataset.m === 'del') st.chain.splice(i, 1);
      closeMenu();
      syncInput();
    });
  });
  document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
  window.addEventListener('scroll', closeMenu, { passive: true });

  /* ───────────── الأبناء ───────────── */
  function addSonRow() {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<input class="son" placeholder="اسم الابن"><button class="icon-btn" type="button" title="حذف">${icon('x')}</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    $('#sons').appendChild(row);
    return row;
  }

  /* ───────────── اختيار الربط عند الالتباس (لأصحاب الرموز فقط) ───────────── */
  function hideChooser() { const c = $('#choose'); if (c) { c.hidden = true; c.innerHTML = ''; } }
  function showChooser(cands) {
    const box = $('#choose');
    box.innerHTML = `<div class="alert alert-info">${icon('sparkles')}<span>وجدنا أكثر من احتمال لنسب «${esc(names().join(' '))}». اختر الصحيح ثم اضغط «إضافة».</span></div>
      <div class="cands">${cands.map((c, i) => `<label class="cand" data-c="${i}"><input type="radio" name="pick" value="${i}" style="display:none">
        <div class="cand-top"><b>${c.exists ? 'موجود مسبقاً: ' : 'تحت: '}${esc(c.nasab)}</b><span class="conf"><span class="conf-bar"><i style="width:${c.confidence}%"></i></span>${c.confidence}%</span></div></label>`).join('')}
        <label class="cand" data-c="new"><input type="radio" name="pick" value="new" style="display:none"><div class="cand-top"><b>لا شيء مما سبق — أضفه فرعاً جديداً يُربط لاحقاً</b></div></label></div>`;
    box.hidden = false;
    $$('.cand', box).forEach((el) => el.addEventListener('click', () => {
      $$('.cand', box).forEach((x) => x.classList.toggle('sel', x === el));
      st.pick = el.dataset.c === 'new' ? null : cands[+el.dataset.c];
    }));
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ───────────── الإرسال ───────────── */
  async function submit(e) {
    e.preventDefault();
    parseInputKeepPick();
    const n = names();
    if (n.length < 2) return toast('اكتب اسمك واسم أبيك على الأقل، ويُفضّل الاسم الخماسي', 'err');
    const phone = $('#phone').value.trim();
    if (CFG.requirePhone && phone.replace(/\D/g, '').length < 8) return toast('رقم الهاتف مطلوب للتحقق', 'err');
    const sons = $$('#sons .son').map((x) => Names.clean(x.value)).filter(Boolean);
    const btn = $('#sendBtn');
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;margin:0;border-width:2px"></span> جارِ الإرسال…';
    try {
      let pick = st.pick;
      if (pick === undefined) {
        const r = await api('match', { names: n });
        const bests = r.candidates.filter((c) => c.best);
        if (bests.length === 1 && bests[0].confidence >= 60) pick = bests[0];
        else if (r.candidates.length && CFG.viewer !== 'public') { showChooser(r.candidates); return; }
        else pick = null; // لم نجد أجداده بثقة: يُضاف فرعاً جديداً ويُراجَع
      }
      if (pick && pick.exists && !sons.length) return done({ status: 'exists', self_id: pick.anchor_id });
      const res = await api('submit', {
        names: n, sons, phone, birth_year: $('#birthYear').value, note: $('#note').value, website: $('#hp').value,
        anchor_id: pick ? pick.anchor_id : null, anchor_index: pick ? pick.anchor_index : 0,
      });
      const subs = storeGet('clan-subs', []);
      subs.unshift({ token: res.token, names: n, at: Date.now() });
      storeSet('clan-subs', subs.slice(0, 20));
      done(res);
      loadMySubs();
    } catch (x) {
      toast(x.message, 'err');
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }
  // التحليل قبل الإرسال دون مسح اختيار الربط إن لم يتغير الاسم
  function parseInputKeepPick() {
    const before = st.chain.map((c) => c.name).join(' ');
    if (Names.clean(input.value) !== Names.clean(before)) parseInput();
  }

  function done(r) {
    const box = $('#doneBox');
    const tree = App.BASE + '/index.php' + (r.self_id ? '?focus=' + r.self_id : '');
    let iconName = 'check', cls = '', title, text;
    if (r.status === 'exists') { title = 'اسمك موجود في الشجرة'; text = 'نسبك مسجل مسبقاً، يمكنك مشاهدته في الشجرة.'; }
    else if (r.status === 'approved') {
      title = 'تمت إضافتك إلى الشجرة';
      text = r.floating ? 'أُضيف نسبك فرعاً جديداً، وسيرتبط بأجداده تلقائياً عندما يضيف أقاربك أنسابهم.' : 'نُشرت الأسماء في الشجرة مباشرة.';
    } else {
      iconName = 'clock'; cls = 'pending';
      title = 'تم استلام بياناتك';
      text = 'سيتم مراجعة بياناتك للتأكد منها ثم إضافتها إلى الشجرة.';
    }
    box.innerHTML = `<div class="result-card">
        <div class="result-icon ${cls}">${icon(iconName)}</div>
        <h2 style="margin:0 0 6px">${title}</h2><p class="muted">${text}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:16px">
          <a class="btn btn-primary" href="${tree}">${icon('tree')}${r.status === 'pending' ? 'العودة إلى الشجرة' : 'عرضي في الشجرة'}</a>
          <button class="btn btn-outline" type="button" id="againBtn">${icon('user-plus')}إضافة شخص آخر</button>
        </div></div>`;
    form.hidden = true;
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#againBtn').addEventListener('click', () => {
      form.reset(); st.chain = []; st.pick = undefined; drawChips(); hideChooser();
      $('#sons').innerHTML = ''; addSonRow();
      box.hidden = true; form.hidden = false; input.focus();
    });
  }

  /* ───────────── طلباتي السابقة ───────────── */
  async function loadMySubs() {
    const tokens = storeGet('clan-subs', []).map((s) => s.token);
    const card = $('#mySubs');
    if (!tokens.length || !card) return;
    try {
      const r = await api('my_submissions', { tokens });
      if (!r.items.length) return;
      const badge = { pending: '<span class="badge badge-warn">قيد المراجعة</span>', approved: '<span class="badge badge-ok">مضاف للشجرة</span>', rejected: '<span class="badge badge-danger">مرفوض</span>' };
      $('#mySubsList').innerHTML = r.items.map((s) => `<div class="sub-item" data-t="${esc(s.token)}">
          <b>${esc(s.names.join(' '))}</b>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px">${badge[s.status] || ''}<small class="muted">${esc(s.created_at)}</small></div>
          ${s.note ? `<small class="muted">ملاحظة الإدارة: ${esc(s.note)}</small>` : ''}
          <div class="acts">
            ${s.self_id && s.status === 'approved' ? `<a class="btn btn-xs btn-outline" href="${App.BASE}/index.php?focus=${s.self_id}">${icon('tree')}عرض</a>` : ''}
            ${s.status === 'pending' ? `<button class="btn btn-xs btn-danger-soft" type="button" data-cancel>${icon('x')}إلغاء الطلب</button>` : ''}
          </div></div>`).join('');
      card.hidden = false;
    } catch (x) { /* القائمة اختيارية */ }
  }
  const subsCard = $('#mySubs');
  if (subsCard) subsCard.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-cancel]')) return;
    const token = e.target.closest('.sub-item').dataset.t;
    if (!(await App.confirm({ title: 'إلغاء الطلب', text: 'سيتم حذف الأسماء المرسلة في هذا الطلب.', danger: true, ok: 'إلغاء الطلب' }))) return;
    try { await api('submission_cancel', { token }); toast('تم إلغاء الطلب'); loadMySubs(); } catch (x) { toast(x.message, 'err'); }
  });

  if (form) {
    input.addEventListener('input', parseInput);
    form.addEventListener('submit', submit);
    $('#addSon').addEventListener('click', () => addSonRow().querySelector('input').focus());
    addSonRow();
    const pre = new URLSearchParams(location.search).get('name');
    if (pre) { input.value = pre; parseInput(); }
  }
  loadMySubs();
})();

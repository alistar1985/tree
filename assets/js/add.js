/* ==========================================================================
   معالج إضافة النسب: تحليل الاسم ← الربط الذكي ← التفاصيل ← معاينة الشجرة.
   ========================================================================== */
/* global ClanTree, App */
(function () {
  'use strict';
  const { $, $$, api, toast, esc, icon, Names, storeGet, storeSet } = App;
  const CFG = window.CLAN_CFG || {};
  const wiz = $('#wizard');
  if (!wiz || !$('#fullName')) { loadMySubs(); return; }

  const st = { step: 1, chain: [], cands: [], pick: null, exists: false };
  const input = $('#fullName');
  const chipsBox = $('#chips');
  const nextBtn = $('#nextBtn');
  const backBtn = $('#backBtn');

  /* ───────────── الخطوة 1: الاسم والرقائق ───────────── */
  function parseInput() {
    st.chain = Names.parse(input.value, CFG.laqab || []);
    drawChips();
  }
  function drawChips() {
    if (!st.chain.length) { chipsBox.innerHTML = ''; chipsBox.classList.add('empty'); return; }
    chipsBox.classList.remove('empty');
    let gi = 0;
    chipsBox.innerHTML = st.chain.map((c, i) => {
      const role = c.laqab ? 'اللقب' : Names.role(gi++);
      const join = i < st.chain.length - 1 ? `<button type="button" class="nchip-join" data-join="${i}" title="دمج الاسمين">⇆</button>` : '';
      return `<span class="nchip ${c.laqab ? 'laqab' : ''} ${!c.laqab && role === 'أنت' ? 'self' : ''}" data-i="${i}" role="button" tabindex="0"><b>${esc(c.name)}</b><small>${role}</small></span>${join}`;
    }).join('');
  }
  input.addEventListener('input', parseInput);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } });

  let menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  chipsBox.addEventListener('click', (e) => {
    const j = e.target.closest('[data-join]');
    if (j) {
      const i = +j.dataset.join;
      st.chain.splice(i, 2, { name: st.chain[i].name + ' ' + st.chain[i + 1].name, laqab: false });
      syncInput(); return;
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
      const m = b.dataset.m;
      if (m === 'edit') {
        const v = prompt('تعديل الاسم', c.name);
        if (v != null && Names.clean(v)) c.name = Names.clean(v);
      }
      if (m === 'split') st.chain.splice(i, 1, ...c.name.split(' ').map((n) => ({ name: n, laqab: false })));
      if (m === 'laqab') c.laqab = !c.laqab;
      if (m === 'del') st.chain.splice(i, 1);
      closeMenu();
      syncInput();
    });
  });
  document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
  window.addEventListener('scroll', closeMenu, { passive: true });

  function syncInput() {
    input.value = st.chain.map((c) => c.name).join(' ');
    drawChips();
  }
  const names = () => st.chain.filter((c) => !c.laqab).map((c) => c.name);

  /* ───────────── التنقل بين الخطوات ───────────── */
  function go(step) {
    st.step = step;
    $$('[data-step]', wiz).forEach((s) => { s.hidden = +s.dataset.step !== step; });
    $$('#wizSteps li').forEach((li, i) => { li.className = i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''; });
    backBtn.hidden = step === 1 || step === 4;
    $('#wizFoot').hidden = step === 4;
    if (step === 1) nextBtn.innerHTML = icon('sparkles') + 'ابحث عن عائلتي';
    if (step === 2) { nextBtn.innerHTML = icon('arrow-l') + 'متابعة'; nextBtn.disabled = !st.pick; }
    if (step === 3) { nextBtn.innerHTML = icon('check') + (CFG.autoApprove ? 'حفظ ونشر' : 'حفظ وإرسال للمراجعة'); nextBtn.disabled = false; }
    wiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  backBtn.addEventListener('click', () => go(st.step - 1));
  nextBtn.addEventListener('click', next);

  async function next() {
    if (st.step === 1) {
      parseInput();
      const n = names();
      if (n.length < 2) return toast('اكتب اسمك واسم أبيك على الأقل، ويُفضّل الاسم الخماسي', 'err');
      if (n.length < 4) toast('نصيحة: الاسم الخماسي يعطي ربطاً أدق');
      nextBtn.disabled = true;
      try {
        const r = await api('match', { names: n });
        st.cands = r.candidates;
        st.pick = null;
        drawMatches();
        go(2);
        const best = st.cands.find((c) => c.best && c.confidence >= 60);
        if (best && st.cands.filter((c) => c.best).length === 1) selectCand(st.cands.indexOf(best));
      } catch (x) { toast(x.message, 'err'); }
      nextBtn.disabled = false;
      return;
    }
    if (st.step === 2) {
      if (!st.pick) return toast('اختر نقطة الربط أولاً', 'err');
      drawSummary();
      go(3);
      return;
    }
    if (st.step === 3) return submit();
  }

  /* ───────────── الخطوة 2: نتائج الربط ───────────── */
  function chainViz(c) {
    const parts = [];
    (c.above || []).slice().reverse().forEach((a) => parts.push(`<span class="n above">${esc(a)}</span>`));
    c.path.forEach((p, i) => parts.push(`<span class="n ${i === c.path.length - 1 ? 'anchor' : 'old'}">${i === c.path.length - 1 ? icon('link') : icon('check')}${esc(p.name)}</span>`));
    c.new_names.forEach((nm) => parts.push(`<span class="n new">${icon('plus')}${esc(nm)}</span>`));
    return `<div class="chain-viz">${parts.join('<span class="arrow">‹</span>')}</div>`;
  }
  function drawMatches() {
    const box = $('#matchBox');
    const n = names();
    let html = '';
    if (st.cands.length) {
      html += `<h3 style="margin:0 0 4px">وجدنا ${st.cands.length === 1 ? 'نقطة ربط' : st.cands.length + ' احتمالات'} لنسبك</h3>
        <p class="muted" style="margin:0 0 16px">الأسماء الخضراء موجودة في الشجرة، والمنقطة جديدة ستُضاف تحتها. اختر ما يطابق نسبك.</p><div class="cands">`;
      st.cands.forEach((c, i) => {
        const notes = [];
        if (c.house) notes.push(`<span class="info">${icon('house')}ضمن ${esc(c.house)}</span>`);
        (c.fuzzy || []).forEach((f) => notes.push(`<span class="info">${icon('sparkles')}«${esc(f.given)}» مطابق تقريباً لـ «${esc(f.found)}»</span>`));
        if (c.conflict) notes.push(`<span class="warn">${icon('alert')}الاسم «${esc(c.conflict.given)}» في نسبك يختلف عن «${esc(c.conflict.found)}» المسجل — تحقق قبل الاختيار</span>`);
        if (c.extra_names && c.extra_names.length) notes.push(`<span class="info">${icon('info')}الأسماء الأقدم (${esc(c.extra_names.join('، '))}) أعلى من جذر الشجرة ولن تُضاف</span>`);
        if (c.children) notes.push(`<span class="info">${icon('users')}لدى «${esc(c.path[c.path.length - 1].name)}» ${c.children} من الأبناء المسجلين</span>`);
        html += `<div class="cand ${c.best ? 'best' : ''}" data-c="${i}" role="button" tabindex="0">
          <div class="cand-top"><b>${c.exists ? 'يبدو أنك مسجل مسبقاً: ' + esc(c.nasab) : 'الربط تحت: ' + esc(c.nasab)}</b>
            <span class="conf"><span class="conf-bar"><i style="width:${c.confidence}%"></i></span>${c.confidence}%</span></div>
          ${chainViz(c)}
          ${notes.length ? `<div class="cand-notes">${notes.join('')}</div>` : ''}
        </div>`;
      });
      html += '</div>';
    } else {
      html += `<div class="alert alert-warn">${icon('alert')}<div><b>لم نجد أجدادك في الشجرة بعد</b><br>ربما بيتك لم يُضف حتى الآن أو هناك اختلاف في كتابة الأسماء.</div></div>`;
    }
    const opts = n.map((nm, i) => (i ? `<option value="${i}">${esc(nm)} (${Names.role(i)})</option>` : '')).join('');
    html += `<div class="no-match" style="margin-top:18px">
      <b>${st.cands.length ? 'لم تجد نسبك الصحيح؟' : 'اربط نفسك يدوياً'}</b>
      <p class="muted" style="margin:4px 0 12px;font-size:.9rem">ابحث عن أحد أجدادك في الشجرة وحدد من هو في سلسلتك، أو أرسل الطلب ليتولى المشرف ربطك.</p>
      <div class="grid-2">
        <label class="field" style="position:relative"><span>ابحث عن جدك في الشجرة</span><input id="manualQ" placeholder="مثال: جعفر محمد" autocomplete="off">
          <div class="search-results" id="manualRes" hidden></div></label>
        <label class="field"><span>هذا الشخص هو في نسبي</span><select id="manualIdx">${opts}</select></label>
      </div>
      <p class="hint" id="manualPicked" hidden></p>
      <button class="btn btn-sm btn-outline" type="button" id="unlinkedBtn">${icon('inbox')}أرسل بدون ربط — المشرف سيربطني</button>
    </div>`;
    box.innerHTML = html;

    $$('.cand', box).forEach((el) => {
      el.addEventListener('click', () => selectCand(+el.dataset.c));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCand(+el.dataset.c); } });
    });
    App.searchBox($('#manualQ'), $('#manualRes'), (r) => {
      st.manual = r;
      $('#manualQ').value = r.name;
      const p = $('#manualPicked');
      p.innerHTML = icon('check') + ' تم اختيار: ' + esc(r.nasab);
      p.hidden = false;
      applyManual();
    });
    $('#manualIdx').addEventListener('change', applyManual);
    $('#unlinkedBtn').addEventListener('click', () => {
      st.pick = { unlinked: true };
      $$('.cand', box).forEach((x) => x.classList.remove('sel'));
      $('#unlinkedBtn').classList.add('btn-primary');
      nextBtn.disabled = false;
      toast('سيتم إرسال طلبك ليتولى المشرف ربطه');
    });
  }
  function applyManual() {
    if (!st.manual) return;
    const idx = +$('#manualIdx').value;
    const n = names();
    st.pick = { anchor_id: st.manual.id, anchor_index: idx, nasab: st.manual.nasab, new_names: n.slice(0, idx).reverse(), exists: false, manual: true };
    $$('.cand').forEach((x) => x.classList.remove('sel'));
    $('#unlinkedBtn').classList.remove('btn-primary');
    nextBtn.disabled = false;
  }
  function selectCand(i) {
    const c = st.cands[i];
    st.pick = c;
    $$('.cand').forEach((x) => x.classList.toggle('sel', +x.dataset.c === i));
    const ub = $('#unlinkedBtn');
    if (ub) ub.classList.remove('btn-primary');
    nextBtn.disabled = false;
  }

  /* ───────────── الخطوة 3: التفاصيل ───────────── */
  function drawSummary() {
    const p = st.pick;
    const box = $('#linkSummary');
    if (p.unlinked) box.innerHTML = `${icon('inbox')}<span>سيُرسل نسبك «${esc(names().join(' '))}» للمشرف ليربطه بالمكان الصحيح.</span>`;
    else if (p.exists) box.innerHTML = `${icon('check')}<span>أنت مسجل مسبقاً في الشجرة: <b>${esc(p.nasab)}</b>. يمكنك إضافة أبنائك تحت اسمك.</span>`;
    else box.innerHTML = `${icon('link')}<span>سيتم ربطك تحت <b>${esc(p.nasab)}</b> بإضافة: ${p.new_names.map((x) => '<b>' + esc(x) + '</b>').join(' ‹ ')}</span>`;
    if (!$('#sons').children.length) addSonRow();
  }
  function addSonRow(v) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<input class="son" placeholder="اسم الابن" value="${esc(v || '')}"><button class="icon-btn" type="button" title="حذف">${icon('x')}</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    $('#sons').appendChild(row);
    return row;
  }
  $('#addSon').addEventListener('click', () => addSonRow().querySelector('input').focus());

  async function submit() {
    const p = st.pick;
    const sons = $$('#sons .son').map((x) => Names.clean(x.value)).filter(Boolean);
    if (p.exists && !sons.length) {
      go(4);
      return showResult({ status: 'exists', self_id: p.anchor_id });
    }
    const phone = $('#phone').value.trim();
    if (CFG.requirePhone && phone.replace(/\D/g, '').length < 8) return toast('رقم الهاتف مطلوب للتحقق', 'err');
    nextBtn.disabled = true;
    try {
      const r = await api('submit', {
        names: names(), sons, phone, nickname: $('#nickname').value, birth_year: $('#birthYear').value, note: $('#note').value,
        anchor_id: p.unlinked ? null : p.anchor_id, anchor_index: p.unlinked ? 0 : p.anchor_index, website: $('#hp').value,
      });
      const subs = storeGet('clan-subs', []);
      subs.unshift({ token: r.token, names: names(), at: Date.now() });
      storeSet('clan-subs', subs.slice(0, 20));
      go(4);
      showResult(r);
      loadMySubs();
    } catch (x) { toast(x.message, 'err'); }
    nextBtn.disabled = false;
  }

  /* ───────────── الخطوة 4: النتيجة ومعاينة الشجرة ───────────── */
  async function showResult(r) {
    const box = $('#resultBox');
    const ok = r.status === 'approved' || r.status === 'exists';
    const title = r.status === 'approved' ? 'تمت إضافتك إلى الشجرة' : r.status === 'exists' ? 'أنت موجود في الشجرة' : 'تم استلام طلبك';
    const text = r.status === 'approved' ? 'نُشرت الأسماء مباشرة. راجع شجرة عائلتك أدناه وتأكد من صحتها.'
      : r.status === 'exists' ? 'هذه شجرة عائلتك كما هي مسجلة.'
        : (r.self_id ? 'سيراجعه رأس البيت أو المشرف قبل ظهوره للجميع. هذه معاينة لموقعك في الشجرة (الأسماء المنقطة بانتظار المراجعة).' : 'سيتولى المشرف ربطك بالمكان الصحيح في الشجرة ثم يظهر اسمك.');
    box.innerHTML = `<div class="result-card">
        <div class="result-icon ${ok ? '' : 'pending'}">${icon(ok ? 'check' : 'clock')}</div>
        <h2 style="margin:0 0 6px">${title}</h2><p class="muted">${text}</p>
      </div>
      ${r.self_id ? '<div class="mini-tree" id="miniTree"></div>' : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        ${r.self_id ? `<a class="btn btn-primary" href="${App.BASE}/tree.php?focus=${r.self_id}">${icon('tree')}عرضي في الشجرة الكاملة</a>` : ''}
        <button class="btn btn-outline" type="button" id="againBtn">${icon('user-plus')}إضافة شخص آخر</button>
        <button class="btn btn-ghost" type="button" id="shareBtn">${icon('share')}مشاركة الرابط مع الأقارب</button>
      </div>`;
    $('#againBtn').addEventListener('click', () => { input.value = ''; st.chain = []; drawChips(); $('#sons').innerHTML = ''; go(1); input.focus(); });
    $('#shareBtn').addEventListener('click', () => {
      const u = location.origin + App.BASE + '/add.php';
      const t = 'أضف اسمك ونسبك إلى شجرة ' + (CFG.clan || 'العشيرة');
      if (navigator.share) navigator.share({ title: t, url: u }).catch(() => {}); else App.copy(t + ' ' + u);
    });
    if (!r.self_id) return;
    try {
      const tokens = storeGet('clan-subs', []).map((s) => s.token).join(',');
      const d = await api('tree', { tokens }, 'GET');
      const t = new ClanTree($('#miniTree'), { mode: 'down', colorMode: CFG.colorMode, colors: CFG.colors, clan: CFG.clan, tooltip: true });
      t.setData(d.persons);
      const me = t.get(r.self_id);
      if (!me) return;
      let anc = me;
      for (let i = 0; i < 3 && anc.parent && !anc.parent.virtual; i++) anc = anc.parent;
      t.rootId = anc.id;
      t.render();
      t.select(me.id);
      setTimeout(() => t.fit(), 60);
    } catch (x) { /* المعاينة اختيارية */ }
  }

  /* ───────────── طلباتي السابقة ───────────── */
  async function loadMySubs() {
    const tokens = storeGet('clan-subs', []).map((s) => s.token);
    const card = $('#mySubs');
    if (!tokens.length || !card) return;
    try {
      const r = await api('my_submissions', { tokens });
      if (!r.items.length) return;
      const badge = { pending: '<span class="badge badge-warn">قيد المراجعة</span>', approved: '<span class="badge badge-ok">معتمد</span>', rejected: '<span class="badge badge-danger">مرفوض</span>' };
      $('#mySubsList').innerHTML = r.items.map((s) => `<div class="sub-item" data-t="${esc(s.token)}">
          <b>${esc(s.names.join(' '))}</b>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px">${badge[s.status] || ''}<small class="muted">${esc(s.created_at)}</small>${!s.linked && s.status === 'pending' ? '<span class="badge">بانتظار الربط</span>' : ''}</div>
          ${s.note ? `<small class="muted">ملاحظة الإدارة: ${esc(s.note)}</small>` : ''}
          <div class="acts">
            ${s.self_id && s.status !== 'rejected' ? `<a class="btn btn-xs btn-outline" href="${App.BASE}/tree.php?focus=${s.self_id}">${icon('tree')}عرض</a>` : ''}
            ${s.status === 'pending' && s.persons.length ? `<button class="btn btn-xs btn-outline" type="button" data-edit>${icon('edit')}تعديل الأسماء</button>` : ''}
            ${s.status === 'pending' ? `<button class="btn btn-xs btn-danger-soft" type="button" data-cancel>${icon('x')}إلغاء</button>` : ''}
          </div>
          <div data-editbox></div>
        </div>`).join('');
      card.hidden = false;
      card.__items = r.items;
    } catch (x) { /* تجاهل */ }
  }
  const subsCard = $('#mySubs');
  if (subsCard) subsCard.addEventListener('click', async (e) => {
    const item = e.target.closest('.sub-item');
    if (!item) return;
    const token = item.dataset.t;
    const s = (subsCard.__items || []).find((x) => x.token === token);
    if (e.target.closest('[data-cancel]')) {
      if (!(await App.confirm({ title: 'إلغاء الطلب', text: 'سيتم حذف الأسماء المرسلة في هذا الطلب.', danger: true, ok: 'إلغاء الطلب' }))) return;
      try { await api('submission_cancel', { token }); toast('تم إلغاء الطلب'); loadMySubs(); } catch (x) { toast(x.message, 'err'); }
    }
    if (e.target.closest('[data-edit]') && s) {
      const box = item.querySelector('[data-editbox]');
      box.innerHTML = `<form class="inline-form">${s.persons.filter((p) => p.status === 'pending').map((p) => `<div class="row" style="margin-bottom:6px"><input name="p${p.id}" data-pid="${p.id}" value="${esc(p.name)}"></div>`).join('')}
        <button class="btn btn-xs btn-primary" type="submit">${icon('check')}حفظ</button></form>`;
      box.querySelector('form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const inputs = $$('input[data-pid]', box);
        try {
          for (const inp of inputs) {
            const orig = s.persons.find((p) => p.id === +inp.dataset.pid);
            if (orig && Names.clean(inp.value) && Names.clean(inp.value) !== orig.name) await api('submission_rename', { token, person_id: +inp.dataset.pid, name: inp.value });
          }
          toast('تم حفظ التعديل');
          loadMySubs();
        } catch (x) { toast(x.message, 'err'); }
      });
    }
  });

  const pre = new URLSearchParams(location.search).get('name');
  if (pre) { input.value = pre; parseInput(); }
  loadMySubs();
})();

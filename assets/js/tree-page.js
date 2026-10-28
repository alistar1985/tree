/* ==========================================================================
   واجهة صفحة الشجرة: البيوت، البحث، تفاصيل الشخص، أدوات التحرير، التصدير.
   ========================================================================== */
/* global ClanTree, App */
(function () {
  'use strict';
  const { $, $$, api, toast, esc, icon, Names, storeGet, storeSet } = App;
  const CFG = window.CLAN_CFG || {};
  const params = new URLSearchParams(location.search);
  const prefs = storeGet('clan-tree-prefs', {});
  const state = {
    mode: 'organic', // الشجرة الطبيعية فقط
    color: params.get('color') || prefs.color || null, // يُكمَل من الإعدادات عند التحميل
    depth: prefs.depth != null ? +prefs.depth : null,
    root: params.get('root') ? +params.get('root') : null,
    sel: null,
  };
  let tree = null;
  let viewer = { type: 'public', perms: {} };
  const drawer = $('#drawer');

  const savePrefs = () => storeSet('clan-tree-prefs', { mode: state.mode, color: state.color, depth: state.depth });
  const myTokens = () => storeGet('clan-subs', []).map((s) => s.token).filter(Boolean);

  /* ───────────── التحميل ───────────── */
  async function load(keepView) {
    const r = await api('tree', { tokens: myTokens().join(',') }, 'GET');
    viewer = r.viewer || viewer;
    if (!state.color) state.color = CFG.colorMode || 'generation';
    if (!tree) {
      $('#treeCanvas').innerHTML = '';
      tree = new ClanTree('#treeCanvas', {
        mode: state.mode, colorMode: state.color, colors: CFG.colors, clan: CFG.clan,
        onSelect: (n) => (n && !n.virtual ? openDrawer(n.id) : closeDrawer()),
        onRender: afterRender,
        onLongPress: (n) => longPress(n),
      });
    }
    tree.setData(r.persons);
    if (state.depth == null) state.depth = autoDepth(r.persons);
    tree.o.maxDepth = state.depth;
    if (state.root && !tree.get(state.root)) state.root = null;
    tree.rootId = state.root;
    tree.render({ keepView });
    buildHouses();
    syncControls();
    renderBanner();
    $('#emptyHint').hidden = r.persons.length > 1 || viewer.type !== 'public';
    $('#stPersons').textContent = r.persons.length;
    $('#stHouses').textContent = tree.houses().length;
    $('#stGens').textContent = Math.max(0, ...tree.order.map((n) => n.gen || 0));
  }

  /** أكبر عدد أجيال يبقى معه العرض الأول واضحاً (حوالي 450 اسماً)؛ الباقي يُفتح بالضغط على «+» */
  function autoDepth(list) {
    if (list.length <= 450) return 0;
    const parent = new Map(list.map((p) => [p.i, p.p]));
    const depth = new Map();
    const d = (id) => {
      if (depth.has(id)) return depth.get(id);
      const par = parent.get(id);
      const v = par == null || !parent.has(par) ? 1 : d(par) + 1;
      depth.set(id, v);
      return v;
    };
    const count = [];
    list.forEach((p) => { const k = d(p.i); count[k] = (count[k] || 0) + 1; });
    let total = 0;
    for (let k = 1; k < count.length; k++) {
      total += count[k] || 0;
      if (total > 450) return Math.max(4, k - 1);
    }
    return 0;
  }

  function afterRender(t) {
    renderLegend(t.legend);
    renderCrumbs();
  }

  /* ───────────── البيوت ───────────── */
  function buildHouses() {
    const hs = tree.houses();
    const kids = new Map();
    const tops = [];
    hs.forEach((h) => {
      let p = h.parent;
      while (p && !p.house) p = p.parent;
      if (p) { if (!kids.has(p.id)) kids.set(p.id, []); kids.get(p.id).push(h); } else tops.push(h);
    });
    const item = (h) => `<button type="button" class="side-item ${state.root === h.id ? 'on' : ''}" data-root="${h.id}" style="--hc:${esc(h.hc)}">
        <span class="dot"></span><span><b>${esc(h.house)}</b><small>${esc(tree.nasab(h, 4))}</small></span><span class="cnt">${h.desc + 1}</span></button>`
      + (kids.has(h.id) ? `<div class="side-sub">${kids.get(h.id).map(item).join('')}</div>` : '');
    const total = tree.order.filter((n) => !n.virtual).length;
    const crown = tree.autoCrown;
    const branches = crown ? crown.kids.filter((k) => k.kids.length) : [];
    $('#houseList').innerHTML = `<button type="button" class="side-item ${!state.root ? 'on' : ''}" data-root="" style="--hc:#2f5d1e">
        <span class="dot"></span><span><b>الشجرة كاملة</b><small>${esc(CFG.clan || '')}</small></span><span class="cnt">${total}</span></button>`
      + (hs.length ? `<div class="side-sec">${icon('crown')}البيوت</div>` + tops.map(item).join('') : '')
      + (branches.length ? `<div class="side-sec">${icon('branch')}فروع الشجرة <small>تلقائياً من ${esc(crown.name)}</small></div>` + branches.map(branchItem).join('') : '')
      + (!hs.length && !branches.length ? '<div class="sr-empty">أضف أبناء الجد ليتفرع منهم كل نسب تلقائياً</div>' : '');
  }

  // عنصر فرع تلقائي: يُفتح ليُظهر فروعه (أبناؤه الذين لهم ذرية)
  function branchItem(n) {
    const sub = n.kids.some((k) => k.kids.length);
    const color = (n.branch && n.branch.bc) || '#8a6442';
    return `<div class="side-row">
        ${sub ? `<button type="button" class="br-tog" data-tog="${n.id}" title="فروعه">${icon('chev-l')}</button>` : '<span class="br-tog"></span>'}
        <button type="button" class="side-item ${state.root === n.id ? 'on' : ''}" data-root="${n.id}" style="--hc:${esc(color)}">
          <span class="dot"></span><span><b>${esc(n.house || n.name)}</b><small>${n.floating ? 'لم يُربط بأجداده بعد · ' : ''}${esc(tree.nasab(n, 3))}</small></span><span class="cnt">${n.desc + 1}</span></button>
      </div><div class="side-sub" data-sub="${n.id}" hidden></div>`;
  }

  $('#houseList').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tog]');
    if (t) {
      const box = $(`[data-sub="${t.dataset.tog}"]`, $('#houseList'));
      const open = box.hidden;
      if (open && !box.innerHTML) box.innerHTML = tree.get(+t.dataset.tog).kids.filter((k) => k.kids.length).map(branchItem).join('');
      box.hidden = !open;
      t.innerHTML = icon(open ? 'chev-d' : 'chev-l');
      return;
    }
    const b = e.target.closest('[data-root]');
    if (!b) return;
    setRoot(b.dataset.root ? +b.dataset.root : null);
    if (window.innerWidth < 980) $('#treeSide').classList.remove('open');
  });
  $('#houseFilter').addEventListener('input', (e) => {
    const q = Names.key(e.target.value);
    if (!q) return buildHouses();
    // بحث في البيوت وفي كل الفروع (كل شخص له ذرية)
    const hits = tree.order.filter((n) => !n.virtual && n.kids.length && Names.key(n.house || n.name).includes(q)).slice(0, 40);
    $('#houseList').innerHTML = hits.length ? hits.map(branchItem).join('') : '<div class="sr-empty">لا توجد نتائج</div>';
  });
  $('#sideToggle').addEventListener('click', () => {
    if (window.innerWidth < 980) $('#treeSide').classList.toggle('open');
    else { const s = $('#treeSide'); s.hidden = !s.hidden; setTimeout(() => tree && tree._updateRuler(), 50); }
  });
  $('[data-side-close]').addEventListener('click', () => $('#treeSide').classList.remove('open'));

  function setRoot(id, keepSel) {
    state.root = id;
    tree.rootId = id;
    if (!keepSel) { tree.select(null); closeDrawer(); }
    tree.render({ keepView: true });
    tree.fit();
    buildHouses();
    const u = new URL(location.href);
    if (id) u.searchParams.set('root', id); else u.searchParams.delete('root');
    u.searchParams.delete('focus');
    history.replaceState(null, '', u);
  }

  function renderCrumbs() {
    const vr = tree.viewRoot();
    const title = $('#viewTitle');
    const path = $('#crumbPath');
    if (!state.root || vr === tree.top) {
      title.textContent = CFG.title || CFG.clan;
      path.innerHTML = (CFG.hierarchy || []).map((l) => `<span>${esc(l.label)} ${esc(l.value)}</span>`).join('<i>‹</i>');
      document.title = (CFG.title || '') ;
      return;
    }
    const name = vr.house || ('فرع ' + vr.name);
    title.textContent = name;
    document.title = name + ' — ' + (CFG.title || '');
    const anc = tree.lineage(vr).slice(1).reverse().filter((a) => !a.virtual);
    path.innerHTML = `<button type="button" data-go="">الشجرة كاملة</button>` + anc.map((a) => `<i>‹</i><button type="button" data-go="${a.id}">${esc(a.name)}</button>`).join('') + `<i>‹</i><span>${esc(vr.name)}</span>`;
  }
  $('#crumbPath').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) setRoot(b.dataset.go ? +b.dataset.go : null);
  });

  /* ───────────── أدوات العرض ───────────── */
  function syncControls() {
    $$('#colorSeg button').forEach((b) => b.classList.toggle('on', b.dataset.color === state.color));
    $('#depthSel').value = String(state.depth || 0);
  }
  if ($('#modeSeg')) $('#modeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b || b.dataset.mode === state.mode) return;
    state.mode = b.dataset.mode;
    tree.setOptions({ mode: state.mode });
    tree.render({ keepView: true });
    tree.fit();
    if (state.sel) tree.select(state.sel);
    syncControls(); savePrefs();
  });
  $('#colorSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    state.color = b.dataset.color;
    tree.setOptions({ colorMode: state.color });
    tree.render({ keepView: true });
    syncControls(); savePrefs();
  });
  $('#depthSel').addEventListener('change', (e) => {
    state.depth = +e.target.value;
    tree.setOptions({ maxDepth: state.depth });
    tree.expanded.clear();
    tree.render({ keepView: true });
    tree.fit();
    savePrefs();
  });
  $$('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    const z = b.dataset.zoom;
    if (z === 'in') tree.zoomBy(1.35);
    else if (z === 'out') tree.zoomBy(1 / 1.35);
    else tree.fit();
  }));

  /* ───────────── وسيلة الإيضاح ───────────── */
  function swClass(t) { return { plaque: 'plaque', oval: 'plaque', leaf: 'leaf', ring: 'ring', badge: 'plaque', dashed: 'dash' }[t] || ''; }
  function renderLegend(items) {
    const L = $('#legend');
    const collapsed = storeGet('clan-legend-collapsed', window.innerWidth < 640);
    L.classList.toggle('collapsed', collapsed);
    L.innerHTML = `<div class="legend-head"><span>${icon('palette')} دليل الألوان</span>
      <button type="button" data-legend-toggle title="${collapsed ? 'إظهار' : 'إخفاء'}">${icon(collapsed ? 'chev-d' : 'x')}</button></div>
      <ul>${items.map((it) => {
        let st = `background:${esc(it.color)}`;
        if (it.type === 'ring') st = `border-color:${esc(it.color)}`;
        if (it.type === 'dashed') st = `border-top-color:${esc(it.color)}`;
        if (it.type === 'pending') st = 'background:#fff;border:2px dashed #b26a00';
        return `<li class="${it.wide ? 'wide' : ''}"><i class="sw ${swClass(it.type)}" style="${st}"></i>${esc(it.label)}</li>`;
      }).join('')}</ul>`;
    L.hidden = false;
  }
  $('#legend').addEventListener('click', (e) => {
    if (!e.target.closest('[data-legend-toggle]')) return;
    storeSet('clan-legend-collapsed', !storeGet('clan-legend-collapsed', window.innerWidth < 640));
    renderLegend(tree.legend);
  });

  /* ───────────── شريط وضع التحرير ───────────── */
  function renderBanner() {
    const b = $('#editBanner');
    if (viewer.type === 'public') { b.hidden = true; return; }
    let scope = '';
    if (viewer.type === 'code') {
      const s = viewer.scope != null ? tree.get(viewer.scope) : null;
      scope = s ? ' — ضمن ' + (s.house || 'فرع ' + s.name) : ' — الشجرة كاملة';
    }
    b.innerHTML = `${icon(viewer.type === 'admin' ? 'shield' : 'key')}<span>${viewer.type === 'admin' ? 'وضع المالك: اضغط على أي اسم لتعديله' : 'وضع التحرير برمز ' + esc(viewer.holder || '') + esc(scope)}</span>`
      + (viewer.perms && viewer.perms.approve ? `<button class="btn btn-xs btn-gold" type="button" data-pending>${icon('inbox')}الطلبات (${viewer.pending || 0})</button>` : '')
      + (viewer.type === 'code' && viewer.scope ? `<button class="btn btn-xs btn-outline" type="button" data-my-house>شجرة بيتي</button>` : '');
    b.hidden = false;
  }
  $('#editBanner').addEventListener('click', (e) => {
    if (e.target.closest('[data-my-house]')) setRoot(viewer.scope);
    if (e.target.closest('[data-pending]')) openPending();
  });

  /* ───────────── مراجعة الطلبات لأصحاب رموز المشرفين ───────────── */
  async function openPending() {
    state.sel = null;
    tree.select(null);
    drawer.innerHTML = `<div class="drawer-head"><button class="icon-btn" type="button" data-close title="إغلاق">${icon('x')}</button>
      <div class="person-hero"><div class="person-avatar" style="background:var(--gold-100);color:var(--gold-700)">${icon('inbox')}</div>
      <div><h2>طلبات بانتظار المراجعة</h2><div class="sub">اعتمد الصحيح منها ليظهر في الشجرة للجميع</div></div></div></div>
      <div class="drawer-body" id="pendingBody"><div class="tree-loading" style="position:static;padding:40px 0"><div class="spinner"></div></div></div>`;
    drawer.classList.add('open');
    try {
      const r = await api('pending', undefined, 'GET');
      const body = $('#pendingBody');
      if (!r.items.length) { body.innerHTML = `<div class="empty" style="padding:40px 0;text-align:center;color:var(--muted)">${icon('check')}<br>لا توجد طلبات بانتظارك</div>`; return; }
      body.innerHTML = r.items.map((s) => `<div class="inline-form" style="margin:0 0 12px">
          <b>${esc(s.names.join(' '))}</b>
          <div class="muted" style="font-size:.84rem;margin:4px 0">تحت: ${esc(s.anchor || '—')}</div>
          ${s.new.length ? `<div class="kids" style="margin:6px 0">${s.new.map((n) => `<span class="badge badge-gold">${icon('plus')}${esc(n)}</span>`).join('')}</div>` : ''}
          ${s.above && s.above.length ? `<div class="muted" style="font-size:.82rem">${icon('link')} يُكمل أجداد فرع غير مربوط: ${esc(s.above.join(' ‹ '))}</div>` : ''}
          ${s.dups.length ? `<div class="sub-warn" style="font-size:.82rem;color:var(--warn)">${icon('merge')} موجود مسبقاً وسيُدمج تلقائياً: ${esc(s.dups.join('، '))}</div>` : ''}
          ${s.note ? `<div class="muted" style="font-size:.84rem">${icon('info')} ${esc(s.note)}</div>` : ''}
          <div class="muted" style="font-size:.78rem;margin:6px 0">${esc(s.ago)}${s.phone ? ' · <span dir="ltr">' + esc(s.phone) + '</span>' : ''} · ${esc(s.device || '')}</div>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn btn-xs btn-ok-soft" type="button" data-sub-approve="${s.id}">${icon('check')}اعتماد</button>
            <button class="btn btn-xs btn-danger-soft" type="button" data-sub-reject="${s.id}">${icon('x')}رفض</button>
            ${s.self_id ? `<button class="btn btn-xs btn-ghost" type="button" data-focus="${s.self_id}">${icon('tree')}عرض في الشجرة</button>` : ''}
          </div></div>`).join('');
    } catch (x) {
      $('#pendingBody').innerHTML = `<div class="alert alert-danger">${icon('alert')}${esc(x.message)}</div>`;
    }
  }
  drawer.addEventListener('click', async (e) => {
    const ap = e.target.closest('[data-sub-approve]'), rj = e.target.closest('[data-sub-reject]');
    if (!ap && !rj) return;
    e.stopPropagation();
    const id = +(ap || rj).dataset[ap ? 'subApprove' : 'subReject'];
    if (rj && !(await App.confirm({ title: 'رفض الطلب', text: 'سيتم حذف أسماء هذا الطلب.', danger: true, ok: 'رفض' }))) return;
    try {
      const r = await api(ap ? 'submission_approve' : 'submission_reject', { submission_id: id });
      toast(ap ? 'تم الاعتماد' + (r.merged && r.merged.length ? ' (دُمج: ' + r.merged.join('، ') + ')' : '') : 'تم الرفض');
      await load(true);
      openPending();
    } catch (x) { toast(x.message, 'err'); }
  }, true);

  /* ───────────── البحث داخل الشجرة ───────────── */
  function searchLocal(q, limit) {
    const toks = Names.parse(q, []).map((t) => Names.key(t.name)).filter(Boolean);
    if (!toks.length) return [];
    const key = (n) => n._key || (n._key = Names.key(n.name));
    const res = [];
    tree.order.forEach((n) => {
      if (n.virtual) return;
      const k = key(n);
      if (!(k.startsWith(toks[0]) || (toks[0].length >= 3 && k.includes(toks[0])))) return;
      let a = n.parent;
      for (let i = 1; i < toks.length; i++) {
        if (!a || a.virtual || !key(a).startsWith(toks[i])) return;
        a = a.parent;
      }
      res.push({ n, s: (k === toks[0] ? 3 : 1) + toks.length * 2 });
    });
    res.sort((a, b) => b.s - a.s || a.n.gen - b.n.gen);
    return res.slice(0, limit || 15).map((r) => r.n);
  }
  function resultsHtml(list) {
    if (!list.length) return '<div class="sr-empty">لا توجد نتائج</div>';
    return list.map((n) => `<button type="button" data-id="${n.id}"><span class="sr-dot">${n.gen}</span>
      <span class="sr-main"><b>${esc(n.name)}${n.pending ? ' <span class="badge badge-warn">بانتظار المراجعة</span>' : ''}</b><small>${esc(tree.nasab(n, 6))}${n.houseNode ? ' · ' + esc(n.houseNode.house) : ''}</small></span></button>`).join('');
  }
  const sInput = $('#treeSearch'), sBox = $('#treeSearchResults');
  sInput.addEventListener('input', App.debounce(() => {
    const q = sInput.value.trim();
    if (q.length < 2 || !tree) { sBox.hidden = true; return; }
    sBox.innerHTML = resultsHtml(searchLocal(q));
    sBox.hidden = false;
  }, 120));
  sInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const f = sBox.querySelector('[data-id]'); if (f) f.click(); }
    if (e.key === 'Escape') sBox.hidden = true;
  });
  sBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    sBox.hidden = true;
    focusPerson(+b.dataset.id);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.tree-search')) sBox.hidden = true; });

  function focusPerson(id, scale) {
    const before = tree.rootId;
    tree.reveal(id);
    if (tree.rootId !== before) { state.root = tree.rootId; buildHouses(); }
    tree.render({ keepView: true });
    tree.select(id);
    tree.centerOn(id, scale || 1.15);
    openDrawer(id);
  }

  /* ───────────── درج التفاصيل ───────────── */
  function closeDrawer() {
    drawer.classList.remove('open');
    state.sel = null;
    if (tree) tree.select(null);
  }

  async function openDrawer(id) {
    const n = tree.get(id);
    if (!n || n.virtual) return closeDrawer();
    state.sel = id;
    tree.select(id);
    drawer.innerHTML = drawerHead(n, null) + '<div class="drawer-body"><div class="tree-loading" style="position:static;padding:40px 0"><div><div class="spinner"></div></div></div></div>';
    drawer.classList.add('open');
    try {
      const r = await api('person', { id }, 'GET');
      if (state.sel !== id) return;
      renderDrawer(r.person, n);
    } catch (x) {
      drawer.querySelector('.drawer-body').innerHTML = `<div class="alert alert-danger">${icon('alert')}${esc(x.message)}</div>`;
    }
  }

  function drawerHead(n, p) {
    const pos = tree.pos.get(n.id);
    const fill = pos ? pos.fill : '#fff';
    const tags = [];
    if (n.house) tags.push(`<span class="badge badge-gold">${icon('crown')}${esc(n.house)}</span>`);
    else if (n.houseNode) tags.push(`<span class="badge">${icon('house')}${esc(n.houseNode.house)}</span>`);
    else if (n.branch && n.branch !== n) tags.push(`<span class="badge">${icon('branch')}فرع ${esc(n.branch.name)}</span>`);
    if (n.dead) tags.push('<span class="badge badge-muted">رحمه الله</span>');
    if (n.pending) tags.push('<span class="badge badge-warn">' + icon('clock') + 'بانتظار المراجعة</span>');
    if (n.floating) tags.push('<span class="badge badge-info">' + icon('link') + 'لم يُربط بأجداده بعد</span>');
    if (p && p.birth_year) tags.push(`<span class="badge">مواليد ${esc(p.birth_year)}${p.death_year ? ' – ' + esc(p.death_year) : ''}</span>`);
    return `<div class="drawer-head">
      <button class="icon-btn" type="button" data-close title="إغلاق">${icon('x')}</button>
      <div class="person-hero">
        <div class="person-avatar" style="background:${esc(fill)};color:${ClanTree.inkFor(fill)}">${esc(n.name.trim().charAt(0))}</div>
        <div style="min-width:0">
          <h2>${esc(n.name)}${n.nick ? ` <small class="muted" style="font-size:.8rem">(${esc(n.nick)})</small>` : ''}</h2>
          <div class="sub">${esc(ClanTree.genName(n.gen))} في العشيرة${n.parent && !n.parent.virtual ? ' · ابن ' + esc(n.parent.name) : ''}</div>
        </div>
      </div>
      <div class="person-tags">${tags.join('')}</div>
    </div>`;
  }

  function renderDrawer(p, n) {
    const P = p.perms || {};
    const chain = p.lineage.map((a, i) => `${i ? '<i>‹</i>' : ''}<button type="button" class="${i === 0 ? 'me' : ''}" data-focus="${a.id}">${esc(a.name)}</button>`).join('');
    const laqab = (CFG.laqab && CFG.laqab[0]) ? ' ' + CFG.laqab[0] : '';
    const nasabText = p.lineage.map((a) => a.name).join(' ') + laqab;
    const kids = p.children.length
      ? `<div class="kids">${p.children.map((c) => `<button type="button" class="${c.pending ? 'pending' : ''}" data-focus="${c.id}">${c.head ? icon('crown') : ''}${esc(c.name)}${c.kids ? ` <small>(${c.kids})</small>` : ''}</button>`).join('')}</div>`
      : '<p class="muted" style="margin:0;font-size:.9rem">لا يوجد أبناء مسجلون.</p>';
    const meta = [];
    if (p.created_by) meta.push(['أضافه', p.created_by]);
    meta.push(['تاريخ الإضافة', p.created_at]);
    if (p.updated_by) meta.push(['آخر تعديل', p.updated_by + ' · ' + p.updated_at]);
    if (p.phone) meta.push(['الهاتف (للمشرف فقط)', p.phone]);

    const acts = [];
    acts.push(`<button class="btn btn-sm btn-outline" type="button" data-act="branch">${icon('branch')}شجرة فرعه وحده</button>`);
    if (n.kids.length) acts.push(`<button class="btn btn-sm btn-outline" type="button" data-act="toggle">${icon('layers')}طي/توسيع الفرع</button>`);
    acts.push(`<button class="btn btn-sm btn-outline" type="button" data-act="copy">${icon('copy')}نسخ النسب</button>`);
    acts.push(`<button class="btn btn-sm btn-outline" type="button" data-act="share">${icon('share')}مشاركة</button>`);
    const edit = [];
    if (P.add) edit.push(`<button class="btn btn-sm btn-primary" type="button" data-act="add">${icon('user-plus')}إضافة أبناء</button>`);
    if (P.edit) edit.push(`<button class="btn btn-sm btn-outline" type="button" data-act="edit">${icon('edit')}تعديل البيانات</button>`);
    if (P.move) edit.push(`<button class="btn btn-sm btn-outline" type="button" data-act="move">${icon(n.floating ? 'link' : 'move')}${n.floating ? 'ربطه بأبيه' : 'نقل إلى أب آخر'}</button>`);
    if (P.merge) edit.push(`<button class="btn btn-sm btn-outline" type="button" data-act="merge">${icon('merge')}دمج مع مكرر</button>`);
    if (P.reorder) {
      edit.push(`<button class="btn btn-sm btn-ghost" type="button" data-act="up">${icon('arrow-r')}تقديم (أكبر سناً)</button>`);
      edit.push(`<button class="btn btn-sm btn-ghost" type="button" data-act="down">${icon('arrow-l')}تأخير (أصغر سناً)</button>`);
    }
    if (P.delete) edit.push(`<button class="btn btn-sm btn-danger-soft full" type="button" data-act="delete">${icon('trash')}حذف</button>`);
    const review = P.approve && p.submission ? `<div class="d-sec"><h4>${icon('inbox')}طلب بانتظار المراجعة</h4><div class="d-actions">
        <button class="btn btn-sm btn-ok-soft" type="button" data-act="approve">${icon('check')}اعتماد الطلب</button>
        <button class="btn btn-sm btn-danger-soft" type="button" data-act="reject">${icon('x')}رفض الطلب</button></div></div>` : '';

    drawer.innerHTML = drawerHead(n, p) + `<div class="drawer-body">
      ${review}
      <div class="d-sec"><h4>${icon('link')}النسب</h4><div class="nasab-chain">${chain}</div></div>
      <div class="d-sec facts">
        <div><b>${p.children.length}</b><span>الأبناء</span></div>
        <div><b>${p.descendants}</b><span>الذرية</span></div>
        <div><b>${p.siblings}</b><span>الإخوة</span></div>
      </div>
      <div class="d-sec"><h4>${icon('users')}الأبناء</h4>${kids}</div>
      ${p.bio ? `<div class="d-sec"><h4>${icon('info')}نبذة</h4><p style="margin:0;white-space:pre-line">${esc(p.bio)}</p></div>` : ''}
      <div class="d-sec"><div class="d-actions">${acts.join('')}</div></div>
      ${edit.length ? `<div class="d-sec"><h4>${icon(viewer.type === 'admin' ? 'shield' : 'key')}أدوات التحرير</h4><div class="d-actions">${edit.join('')}</div></div>` : ''}
      <div id="dForm"></div>
      <div class="d-sec"><h4>${icon('history')}السجل</h4><div class="meta-list">${meta.map((m) => `<div><span>${esc(m[0])}</span><b>${esc(m[1])}</b></div>`).join('')}</div></div>
      <div class="d-sec"><button class="btn btn-sm btn-ghost btn-block" type="button" data-act="suggest">${icon('edit')}طلب تعديل (تصحيح الاسم أو من الأكبر)</button></div>
    </div>`;
    drawer.__p = p;
    drawer.__n = n;
    drawer.__nasab = nasabText;
  }

  drawer.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return closeDrawer();
    const f = e.target.closest('[data-focus]');
    if (f) return focusPerson(+f.dataset.focus, tree.transform.k);
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const p = drawer.__p, n = drawer.__n;
    const act = a.dataset.act;
    try {
      if (act === 'branch') return setRoot(n.id, true);
      if (act === 'toggle') return tree.toggle(n.id);
      if (act === 'copy') return App.copy(drawer.__nasab);
      if (act === 'share') {
        const u = new URL(location.href);
        u.searchParams.set('focus', n.id);
        if (navigator.share) { try { await navigator.share({ title: n.name, text: drawer.__nasab, url: u.toString() }); return; } catch (x) { /* أُلغيت */ } }
        return App.copy(u.toString());
      }
      if (act === 'up' || act === 'down') { await api('person_reorder', { id: n.id, dir: act }); await refresh(n.id); return toast('تم تغيير الترتيب'); }
      if (act === 'add') return formAdd(p);
      if (act === 'edit') return formEdit(p);
      if (act === 'move') return formPick(p, 'move');
      if (act === 'merge') return formPick(p, 'merge');
      if (act === 'suggest') return formSuggest(p);
      if (act === 'delete') {
        const hasKids = p.children.length > 0;
        const r = await App.confirm({ title: 'حذف «' + p.name + '»', text: hasKids ? 'لهذا الشخص ' + p.descendants + ' من الذرية. يمكن استعادة المحذوف لاحقاً من سجل العمليات.' : 'يمكن استعادة المحذوف لاحقاً من سجل العمليات.', danger: true, ok: 'حذف', check: hasKids ? 'حذفه مع جميع ذريته' : null });
        if (!r) return;
        if (hasKids && !r.checked) return toast('لم يتم الحذف: يجب اختيار حذف الذرية أو نقل الأبناء أولاً', 'err');
        await api('person_delete', { id: p.id, with_desc: hasKids ? 1 : 0 });
        closeDrawer();
        await refresh(null);
        return toast('تم الحذف');
      }
      if (act === 'approve' || act === 'reject') {
        const ok = await App.confirm({ title: act === 'approve' ? 'اعتماد الطلب' : 'رفض الطلب', text: act === 'approve' ? 'ستظهر الأسماء في الشجرة للجميع.' : 'سيتم حذف أسماء هذا الطلب.', danger: act === 'reject', ok: act === 'approve' ? 'اعتماد' : 'رفض' });
        if (!ok) return;
        const r = await api('submission_' + act, { submission_id: p.submission.id });
        await refresh(act === 'approve' ? p.id : null);
        return toast(act === 'approve' ? 'تم الاعتماد' + (r.merged && r.merged.length ? ' (دُمج: ' + r.merged.join('، ') + ')' : '') : 'تم الرفض');
      }
    } catch (x) { toast(x.message, 'err'); }
  });

  async function refresh(selectId) {
    await load(true);
    if (selectId && tree.get(selectId)) {
      tree.reveal(selectId);
      tree.render({ keepView: true });
      tree.select(selectId);
      openDrawer(selectId);
    }
  }

  function dForm(html) {
    const box = drawer.querySelector('#dForm');
    box.innerHTML = `<form class="inline-form">${html}</form>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const f = box.querySelector('form');
    const first = f.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea');
    if (first) first.focus();
    f.addEventListener('click', (e) => { if (e.target.closest('[data-cancel]')) box.innerHTML = ''; });
    return f;
  }
  const formFoot = (label) => `<div class="row" style="justify-content:flex-end"><button class="btn btn-sm btn-ghost" type="button" data-cancel>إلغاء</button><button class="btn btn-sm btn-primary" type="submit">${icon('check')}${label}</button></div>`;

  function formAdd(p) {
    const f = dForm(`<h4 style="margin:0 0 8px">إضافة أبناء «${esc(p.name)}»</h4>
      <label class="field"><span>أسماء الأبناء</span><input name="names" placeholder="مثال: علي، حسن، محمد" required><small>للإضافة دفعة واحدة افصل الأسماء بفاصلة، وبترتيب العمر من الأكبر.</small></label>
      ${formFoot('إضافة')}`);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const names = f.names.value.split(/[،,\n]+/).map((s) => Names.clean(s)).filter(Boolean);
      if (!names.length) return;
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      let ok = 0;
      for (const nm of names) {
        try { await api('person_add', { parent_id: p.id, name: nm }); ok++; } catch (x) { toast(nm + ': ' + x.message, 'err'); }
      }
      if (ok) { toast('تمت إضافة ' + ok + (ok === 1 ? ' اسم' : ' أسماء')); tree.collapsed.delete(p.id); tree.expanded.add(p.id); await refresh(p.id); }
      btn.disabled = false;
    });
  }

  function formEdit(p) {
    const P = p.perms || {};
    const f = dForm(`<h4 style="margin:0 0 8px">تعديل بيانات «${esc(p.name)}»</h4>
      <div class="grid-2">
        <label class="field"><span>الاسم</span><input name="name" value="${esc(p.name)}" required></label>
        <label class="field"><span>الكنية / اللقب</span><input name="nickname" value="${esc(p.nickname || '')}" placeholder="أبو علي، الحاج…"></label>
        <label class="field"><span>سنة الميلاد</span><input name="birth_year" inputmode="numeric" value="${esc(p.birth_year || '')}"></label>
        <label class="field"><span>سنة الوفاة</span><input name="death_year" inputmode="numeric" value="${esc(p.death_year || '')}"></label>
      </div>
      <label class="check"><input type="checkbox" name="is_deceased" ${p.is_deceased ? 'checked' : ''}><span>متوفى (رحمه الله)</span></label>
      ${P.head ? `<label class="check"><input type="checkbox" name="is_head" ${p.is_head ? 'checked' : ''}><span>رأس بيت (يظهر في قائمة البيوت بتاج ذهبي)</span></label>
      <div class="grid-2"><label class="field"><span>اسم البيت</span><input name="house_name" value="${esc(p.house_name || '')}" placeholder="بيت ${esc(p.name)}"></label>
      <label class="field"><span>لون البيت</span><input type="color" name="house_color" value="${esc(p.house_color || '#c0392b')}"></label></div>` : ''}
      ${p.phone !== undefined ? `<label class="field"><span>الهاتف (خاص بالمشرف)</span><input name="phone" inputmode="tel" dir="ltr" value="${esc(p.phone || '')}"></label>` : ''}
      <label class="field"><span>نبذة</span><textarea name="bio" rows="3">${esc(p.bio || '')}</textarea></label>
      ${formFoot('حفظ')}`);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = { id: p.id, name: f.name.value, nickname: f.nickname.value, birth_year: f.birth_year.value, death_year: f.death_year.value, is_deceased: f.is_deceased.checked ? 1 : 0, bio: f.bio.value };
      if (f.is_head) { d.is_head = f.is_head.checked ? 1 : 0; d.house_name = f.house_name.value; d.house_color = f.house_color.value; }
      if (f.phone) d.phone = f.phone.value;
      try { const r = await api('person_update', d); toast(r.changed.length ? 'تم الحفظ' : 'لا توجد تغييرات'); await refresh(p.id); } catch (x) { toast(x.message, 'err'); }
    });
  }

  function formPick(p, kind) {
    const f = dForm(`<h4 style="margin:0 0 8px">${kind === 'move' ? 'نقل «' + esc(p.name) + '» مع ذريته تحت أب آخر' : 'دمج «' + esc(p.name) + '» في شخص آخر (يُحذف المكرر وتنتقل ذريته)'}</h4>
      <label class="field"><span>${kind === 'move' ? 'الأب الجديد' : 'الشخص الصحيح'}</span><input name="q" placeholder="اكتب الاسم ثم اسم الأب…" autocomplete="off"></label>
      <div class="search-results" style="position:static;box-shadow:none;max-height:220px" data-res hidden></div>
      <input type="hidden" name="target">
      <p class="hint" data-picked hidden></p>
      ${formFoot(kind === 'move' ? 'نقل' : 'دمج')}`);
    const res = f.querySelector('[data-res]');
    f.q.addEventListener('input', App.debounce(() => {
      const list = searchLocal(f.q.value, 8).filter((x) => x.id !== p.id);
      res.innerHTML = resultsHtml(list);
      res.hidden = !f.q.value.trim();
    }, 120));
    res.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      const t = tree.get(+b.dataset.id);
      f.target.value = t.id;
      res.hidden = true;
      const pk = f.querySelector('[data-picked]');
      pk.innerHTML = icon('check') + ' ' + esc(tree.nasab(t, 6));
      pk.hidden = false;
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!f.target.value) return toast('اختر الشخص من نتائج البحث', 'err');
      try {
        if (kind === 'move') await api('person_move', { id: p.id, parent_id: +f.target.value });
        else await api('person_merge', { id: p.id, target_id: +f.target.value });
        toast(kind === 'move' ? 'تم النقل' : 'تم الدمج');
        await refresh(kind === 'move' ? p.id : +f.target.value);
      } catch (x) { toast(x.message, 'err'); }
    });
  }

  /** طلب تعديل من الزائر: تصحيح الاسم، أو من الأكبر بين الإخوة، أو ملاحظة — تراجعه الإدارة وتوافق أو ترفض */
  function formSuggest(p) {
    const node = tree.get(p.id);
    const sibs = node && node.parent ? node.parent.kids.filter((k) => k.id !== p.id && !k.pending) : [];
    const f = dForm(`<h4 style="margin:0 0 8px">طلب تعديل على «${esc(p.name)}»</h4>
      <div class="seg" style="display:flex;margin-bottom:12px">
        <button type="button" class="on" data-k="rename">تصحيح الاسم</button>
        ${sibs.length ? '<button type="button" data-k="order">من الأكبر؟</button>' : ''}
        <button type="button" data-k="note">ملاحظة أخرى</button></div>
      <input type="hidden" name="kind" value="rename">
      <label class="field" data-for="rename"><span>الاسم الصحيح</span><input name="value" placeholder="${esc(p.name)}"></label>
      ${sibs.length ? `<label class="field" data-for="order" hidden><span>«${esc(p.name)}» أكبر من أخيه:</span><select name="sib">${sibs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>` : ''}
      <label class="field"><span>ملاحظة (اختياري)</span><textarea name="message" rows="2" placeholder="أي توضيح يساعد الإدارة"></textarea></label>
      <label class="field"><span>للتواصل (اختياري)</span><input name="contact" placeholder="اسمك"></label>
      ${formFoot('إرسال الطلب')}`);
    f.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      f.kind.value = b.dataset.k;
      $$('[data-k]', f).forEach((x) => x.classList.toggle('on', x === b));
      $$('[data-for]', f).forEach((x) => { x.hidden = x.dataset.for !== b.dataset.k; });
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('suggest', { person_id: p.id, kind: f.kind.value, value: f.value.value, sib: f.sib ? f.sib.value : null, message: f.message.value, contact: f.contact.value });
        toast('وصل طلبك للإدارة، وسيُطبَّق بعد الموافقة');
        drawer.querySelector('#dForm').innerHTML = '';
      } catch (x) { toast(x.message, 'err'); }
    });
  }

  /* ───────────── الضغط المطوّل على الاسم ───────────── */
  async function longPress(n) {
    if (!n || n.virtual || n.pending) return;
    const canEdit = viewer.type === 'admin' || (viewer.type === 'code' && viewer.perms && viewer.perms.edit);
    if (!canEdit) {
      // الزائر: يفتح طلب تعديل مباشرة
      await openDrawer(n.id);
      if (drawer.__p) formSuggest(drawer.__p);
      return;
    }
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.innerHTML = `<form class="modal-card" method="dialog">
      <header class="modal-head"><span class="modal-icon">${icon('edit')}</span><div><h3>تعديل سريع</h3><p>${esc(tree.nasab(n, 5))}</p></div></header>
      <label class="field"><span>الاسم</span><input name="name" value="${esc(n.name)}" required></label>
      <label class="field"><span>إضافة أبناء (اختياري، افصلهم بفاصلة)</span><input name="kids" placeholder="مثال: علي، حسن"></label>
      <footer class="modal-foot" style="justify-content:space-between">
        <button class="btn btn-danger-soft" value="delete" type="submit">${icon('trash')}حذف</button>
        <span style="display:flex;gap:8px"><button class="btn btn-ghost" value="cancel" formnovalidate>إلغاء</button><button class="btn btn-primary" value="save" type="submit">${icon('check')}حفظ</button></span>
      </footer></form>`;
    document.body.appendChild(d);
    d.addEventListener('close', async () => {
      const f = d.querySelector('form');
      const act = d.returnValue;
      d.remove();
      try {
        if (act === 'save') {
          const name = Names.clean(f.name.value);
          if (name && name !== n.name) await api('person_update', { id: n.id, name });
          let added = 0;
          for (const k of f.kids.value.split(/[،,\n]+/).map((x) => Names.clean(x)).filter(Boolean)) { await api('person_add', { parent_id: n.id, name: k }); added++; }
          toast(added ? `تم الحفظ وإضافة ${added} من الأبناء` : 'تم الحفظ');
          await refresh(n.id);
        } else if (act === 'delete') {
          const hasKids = n.kids && n.kids.length;
          const r = await App.confirm({ title: 'حذف «' + n.name + '»', text: hasKids ? 'سيُحذف مع ذريته (' + n.desc + '). يمكن الاستعادة من سجل العمليات.' : 'يمكن الاستعادة من سجل العمليات.', danger: true, ok: 'حذف' });
          if (!r) return;
          await api('person_delete', { id: n.id, with_desc: hasKids ? 1 : 0 });
          closeDrawer();
          await refresh(null);
          toast('تم الحذف');
        }
      } catch (x) { toast(x.message, 'err'); }
    });
    d.showModal();
    setTimeout(() => d.querySelector('[name=name]').select(), 50);
  }

  /* ───────────── التصدير ───────────── */
  const exportMenu = $('#exportMenu');
  $('#exportBtn').addEventListener('click', (e) => { e.stopPropagation(); exportMenu.hidden = !exportMenu.hidden; });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) exportMenu.hidden = true; });
  function posterOpts() {
    const vr = tree.viewRoot();
    const sub = state.root && vr !== tree.top ? (vr.house || 'فرع ' + vr.name) : '';
    return { title: sub ? sub : (CFG.posterTitle || CFG.title), verses: CFG.verses, credits: CFG.credits, hierarchy: CFG.hierarchy };
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  exportMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-export]');
    if (!b) return;
    exportMenu.hidden = true;
    const kind = b.dataset.export;
    const fname = (posterOpts().title || 'شجرة').replace(/\s+/g, '-');
    if (kind === 'svg') download(new Blob([tree.exportSVG(posterOpts())], { type: 'image/svg+xml' }), fname + '.svg');
    if (kind === 'png') {
      toast('جارِ تجهيز اللوحة…');
      tree.exportPNG(posterOpts(), (blob) => (blob ? download(blob, fname + '.png') : toast('تعذر إنشاء الصورة، جرّب SVG', 'err')));
    }
    if (kind === 'print') {
      const w = window.open('', '_blank');
      if (!w) return toast('اسمح بالنوافذ المنبثقة للطباعة', 'err');
      w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(posterOpts().title)}</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri&family=Aref+Ruqaa:wght@700&family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap">
        <style>@page{size:auto;margin:6mm}body{margin:0}svg{width:100%;height:auto;display:block}</style></head>
        <body>${tree.exportSVG(posterOpts())}<script>document.fonts.ready.then(()=>setTimeout(()=>print(),400))<\/script></body></html>`);
      w.document.close();
    }
    if (kind === 'share') {
      const u = new URL(location.href);
      u.searchParams.set('mode', state.mode);
      App.copy(u.toString());
    }
  });

  /* ───────────── أحداث عامة ───────────── */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); sInput.focus(); }
  });
  window.addEventListener('clan-theme', () => tree && tree.render({ keepView: true }));
  let dataDirty = false; // وصل تحديث قبل اكتمال الرسم الأول
  window.addEventListener('clan-data', () => { if (tree) load(true).catch(() => {}); else dataDirty = true; });
  window.addEventListener('resize', App.debounce(() => tree && tree._updateRuler(), 100));

  load(false).then(() => {
    if (dataDirty) load(true).catch(() => {});
    const focus = params.get('focus') ? +params.get('focus') : null;
    if (focus && tree.get(focus)) setTimeout(() => focusPerson(focus, 1.1), 80);
    else if (params.get('pending') && viewer.perms && viewer.perms.approve) openPending();
  }).catch((x) => {
    $('#treeCanvas').innerHTML = `<div class="tree-loading"><div class="alert alert-danger">${icon('alert')}${esc(x.message)}</div></div>`;
  });
})();

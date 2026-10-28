/* ==========================================================================
   لوحة التحكم (Firebase): المعلومات، الطلبات، الأفراد، البيوت، الرموز، السجل، الزوار، الإعدادات، المشرفون.
   ========================================================================== */
/* global App */
import * as S from './store.js?v=18';

const { $, $$, esc, icon, toast } = App;
const { db, ref, get, update, push, query, orderByChild, startAt, limitToLast, equalTo, state, P } = S;
const TS = () => S.serverTimestamp();
const root = $('#adminRoot');
const ACTIONS = {
  create: ['إضافة', 'ok'], submit: ['طلب إضافة', 'warn'], update: ['تعديل', 'info'], move: ['نقل', 'info'], merge: ['دمج', 'info'], reorder: ['ترتيب', 'muted'],
  delete: ['حذف', 'danger'], restore: ['استعادة', 'ok'], revert: ['تراجع', 'info'], approve: ['اعتماد', 'ok'], reject: ['رفض', 'danger'], suggest: ['اقتراح تصحيح', 'warn'],
  login: ['دخول المشرف', 'muted'], code_login: ['دخول برمز', 'muted'], code_failed: ['رمز خاطئ', 'danger'], code_create: ['إنشاء رمز', 'ok'], code_update: ['تعديل رمز', 'info'],
  code_delete: ['حذف رمز', 'danger'], admin_create: ['إضافة مشرف', 'ok'], admin_update: ['تعديل مشرف', 'info'], settings: ['الإعدادات', 'info'], export: ['تصدير', 'muted'], install: ['تهيئة الموقع', 'ok'],
};
const ACTOR = { admin: 'مشرف', code: 'رمز', public: 'زائر' };
const ROLES = { owner: 'المالك', admin: 'مشرف عام', editor: 'محرر' };
const PALETTE = ['#c0392b', '#2e86c1', '#d68910', '#8e44ad', '#16a085', '#a04000', '#1f618d', '#b7950b'];

await S.ready();
if (!state.installed) location.replace('setup');
else if (!state.admin) renderLogin();
else start();

/* ───────────── الدخول ───────────── */
function renderLogin() {
  root.innerHTML = `<div class="auth-page"><main class="auth-wrap"><form class="auth-card" id="loginForm">
    <div class="auth-head"><span data-logo="64"></span><h1>لوحة التحكم</h1><p>${esc(state.settings.site_title)}</p></div>
    <div class="alert alert-danger" id="loginErr" hidden></div>
    <label class="field"><span>البريد الإلكتروني</span><input type="email" name="email" dir="ltr" required autofocus></label>
    <label class="field"><span>كلمة المرور</span><input type="password" name="password" dir="ltr" required></label>
    <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('lock')}دخول</button>
    <p class="hint" style="justify-content:center;margin-top:16px"><a href="./">${icon('arrow-r')} العودة إلى الموقع</a></p></form></main></div>`;
  fillLogos();
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const box = $('#loginErr');
    try {
      const cred = await S.signInWithEmailAndPassword(S.auth, f.email.value.trim(), f.password.value);
      const a = (await get(ref(db, 'admins/' + cred.user.uid))).val();
      if (!a || !a.active) { await S.signOut(S.auth); throw new Error('هذا الحساب ليس مشرفاً'); }
      const u = {};
      S.auditEntry(u, { t: 'admin', aid: cred.user.uid, l: 'المشرف: ' + (a.name || a.email) }, 'login', 'admin', null, `تسجيل دخول «${a.name || a.email}»`);
      await update(ref(db), u).catch(() => {});
      location.reload();
    } catch (x) {
      box.textContent = /wrong-password|invalid-credential|user-not-found/.test(x.code || '') ? 'البريد أو كلمة المرور غير صحيحة' : /too-many/.test(x.code || '') ? 'محاولات كثيرة، انتظر قليلاً' : x.message;
      box.hidden = false;
    }
  });
}
function fillLogos() { if (window.fillLogos) window.fillLogos(root); }

/* ───────────── الهيكل والتنقل ───────────── */
const NAV = [
  ['', 'الرئيسية'], ['dashboard', 'لوحة المعلومات', 'dashboard'], ['review', 'الطلبات والاقتراحات', 'inbox'],
  ['', 'الشجرة'], ['people', 'الأفراد', 'users'], ['trunk', 'الأجداد (الجذع)', 'tree'], ['houses', 'البيوت', 'house'], ['codes', 'رموز الصلاحية', 'key', 'manager'],
  ['', 'المتابعة'], ['log', 'سجل العمليات', 'history'], ['visitors', 'الزوار والأجهزة', 'eye', 'manager'],
  ['', 'النظام'], ['settings', 'الإعدادات', 'sliders', 'manager'], ['admins', 'المشرفون', 'shield'],
];
const isManager = () => state.admin.role !== 'editor';
const isOwner = () => state.admin.role === 'owner';
let counts = { review: 0 };

function start() {
  const a = state.admin;
  root.innerHTML = `<div class="admin">
    <aside class="a-side" id="aSide">
      <a class="a-brand" href="#dashboard"><span data-logo="40"></span><span><b>لوحة التحكم</b><small>${esc(state.settings.site_title)}</small></span></a>
      <nav class="a-nav" id="aNav"></nav>
      <div class="a-side-foot">
        <div class="a-user"><span class="a-avatar">${esc((a.name || a.email || '؟').charAt(0))}</span><span style="min-width:0"><b>${esc(a.name || a.email)}</b><small>${ROLES[a.role] || a.role}</small></span></div>
        <button class="icon-btn" type="button" data-theme-toggle title="الوضع الليلي">${icon('moon', 'only-light')}${icon('sun', 'only-dark')}</button>
        <button class="icon-btn" type="button" id="logoutBtn" title="تسجيل الخروج">${icon('logout')}</button>
      </div>
    </aside>
    <div class="a-main">
      <header class="a-top">
        <button class="icon-btn a-menu-btn" type="button" id="menuBtn" title="القائمة">${icon('menu')}</button>
        <h1 id="pageTitle">${icon('dashboard')}</h1><span class="grow"></span>
        <a class="btn btn-sm btn-outline" href="./" target="_blank">${icon('external')}الموقع</a>
      </header>
      <main class="a-content" id="view"></main>
    </div></div>`;
  fillLogos();
  $('#logoutBtn').addEventListener('click', async () => { await S.signOut(S.auth); location.reload(); });
  $('#menuBtn').addEventListener('click', () => $('#aSide').classList.toggle('open'));
  window.addEventListener('hashchange', route);
  refreshCounts().then(route);
}
async function refreshCounts() {
  try {
    const subs = await S.pendingSubs();
    const sugg = Object.values((await get(ref(db, 'suggestions'))).val() || {}).filter((s) => s.st === 'open').length;
    counts = { review: subs.length + sugg };
  } catch (e) { counts = { review: 0 }; }
  drawNav();
}
function drawNav() {
  const cur = (location.hash.slice(1) || 'dashboard').split('/')[0];
  $('#aNav').innerHTML = NAV.map(([k, label, ic, need]) => {
    if (!k) return `<div class="grp">${label}</div>`;
    if (need === 'manager' && !isManager()) return '';
    if (k === 'admins' && !isOwner()) label = 'حسابي';
    const c = counts[k];
    return `<a href="#${k}" class="${cur === k ? 'on' : ''}">${icon(ic)}<span>${label}</span>${c ? `<span class="count">${c}</span>` : ''}</a>`;
  }).join('') + `<div class="grp">الموقع</div><a href="./" target="_blank">${icon('tree')}<span>الشجرة (تحرير مباشر)</span></a>`;
}
function setTitle(t, ic) { $('#pageTitle').innerHTML = icon(ic) + esc(t); document.title = t + ' — لوحة التحكم'; }
const view = () => $('#view');

const PAGES = {};
async function route() {
  const [page, ...rest] = (location.hash.slice(1) || 'dashboard').split('/');
  drawNav();
  $('#aSide').classList.remove('open');
  const fn = PAGES[page] || PAGES.dashboard;
  view().innerHTML = '<div class="tree-loading" style="position:static;padding:60px 0"><div><div class="spinner"></div></div></div>';
  try { await S.syncPersons(); await fn(...rest); } catch (e) { console.error(e); view().innerHTML = `<div class="alert alert-danger">${icon('alert')}${esc(e.message)}</div>`; }
}
const go = (h) => { if (location.hash === '#' + h) route(); else location.hash = h; };
async function run(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; } catch (e) { console.error(e); toast(e.message || 'حدث خطأ', 'err'); return false; }
}

/* ───────────── أدوات العرض ───────────── */
const panel = (title, ic, body, extra = '', sub = '') => `<section class="panel"><div class="panel-head"><div><h2>${icon(ic)}${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${extra}</div>${body}</section>`;
const badgeAct = (a) => { const [l, t] = ACTIONS[a] || [a, 'muted']; return `<span class="badge badge-${t === 'danger' ? 'danger' : t === 'ok' ? 'ok' : t === 'warn' ? 'warn' : t === 'info' ? 'info' : 'muted'}">${esc(l)}</span>`; };
const empty = (ic, t) => `<div class="empty">${icon(ic)}${t}</div>`;
function colChart(rows, unit) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const every = rows.length > 20 ? 5 : rows.length > 12 ? 3 : 1;
  return `<div class="chart"><span class="chart-max">${max} ${unit}</span><div class="chart-cols">${rows.map(([, v, tip]) =>
    `<div class="col${v ? '' : ' zero'}" data-tip="${esc(tip)}"><i style="height:${v ? Math.max(2, (v / max) * 100) : 1.2}%"></i></div>`).join('')}</div>
    <div class="chart-axis">${rows.map(([l], i) => `<span>${i % every === 0 || i === rows.length - 1 ? esc(l) : ''}</span>`).join('')}</div></div>`;
}
function hbars(rows, total) {
  if (!rows.length) return empty('chart', 'لا توجد بيانات بعد');
  const max = Math.max(1, ...rows.map((r) => r[1]));
  total = total || rows.reduce((s, r) => s + r[1], 0);
  return `<div class="hbars">${rows.map(([l, v, ic]) => `<div class="hbar"><span class="lbl">${ic ? icon(ic) : ''}${esc(l)}</span><span class="trk"><i style="width:${(v / max) * 100}%"></i></span><b>${v} <small>${total ? Math.round((v / total) * 100) : 0}%</small></b></div>`).join('')}</div>`;
}
function picker(name, ph, value) {
  const label = value != null && P(value) ? S.nasab(value, 6) : '';
  return `<div class="picker" data-person-picker><input type="search" placeholder="${esc(ph || 'اكتب الاسم ثم اسم الأب…')}" autocomplete="off" value="${esc(label ? P(value).n : '')}">
    <input type="hidden" name="${esc(name)}" value="${value ?? ''}"><div class="search-results" hidden></div>
    <div class="picked"${label ? '' : ' hidden'}>${icon('check')}<span>${esc(label)}</span></div></div>`;
}
function bindPickers(scope) {
  $$('[data-person-picker]', scope).forEach((box) => {
    const input = box.querySelector('input[type=search]'), hidden = box.querySelector('input[type=hidden]'), res = box.querySelector('.search-results'), picked = box.querySelector('.picked');
    App.searchBox(input, res, (r) => { hidden.value = r.id; input.value = r.name; picked.querySelector('span').textContent = r.nasab + (r.house ? ' · ' + r.house : ''); picked.hidden = false; });
    input.addEventListener('input', () => { if (!input.value.trim()) { hidden.value = ''; picked.hidden = true; } });
  });
}
function pager(total, page, per, link) {
  const pages = Math.ceil(total / per);
  if (pages <= 1) return '';
  let out = '<nav class="pager">';
  for (let i = Math.max(1, page - 3); i <= Math.min(pages, page + 3); i++) out += i === page ? `<span class="on">${i}</span>` : `<a href="${link(i)}">${i}</a>`;
  return out + `<span style="border:0;color:var(--muted)">${total} نتيجة</span></nav>`;
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const vals = async (path) => Object.entries((await get(ref(db, path))).val() || {}).map(([id, v]) => ({ id, ...v }));
async function listSince(path, since) {
  const snap = await get(query(ref(db, path), orderByChild('at'), startAt(since)));
  const out = [];
  snap.forEach((c) => { out.push({ id: c.key, ...c.val() }); });
  return out;
}
async function lastN(path, n) {
  const snap = await get(query(ref(db, path), orderByChild('at'), limitToLast(n)));
  const out = [];
  snap.forEach((c) => { out.push({ id: c.key, ...c.val() }); });
  return out.reverse();
}
const dayKey = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const houses = () => S.houseList().map(P);
/** اختيار وضع البيت: تلقائي حسب العدد، أو بيت دائماً، أو ليس بيتاً */
function houseModeSeg(id) {
  const p = P(id), cur = p.head ? 'on' : p.nh ? 'off' : 'auto';
  const opts = [['auto', `تلقائي (${(state.settings.house_min || 20)}+ فرداً)`], ['on', 'بيت دائماً'], ['off', 'ليس بيتاً']];
  return `<div class="radio-row">${opts.map(([k, t]) => `<label class="radio-pill"><input type="radio" name="house_mode" value="${k}" ${cur === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;
}
function auditAdmin(u, action, entity, eid, sum, b, a) { S.auditEntry(u, S.actor(), action, entity, eid, sum, b, a); }

/* ───────────── لوحة المعلومات ───────────── */
PAGES.dashboard = async () => {
  setTitle('لوحة المعلومات', 'dashboard');
  const since = Date.now() - 29 * 864e5;
  const [visits, feed, subs, codes] = await Promise.all([
    isManager() ? listSince('visits', new Date(new Date(since).toDateString()).getTime()) : [], lastN('audit', 12), S.pendingSubs(), isManager() ? vals('codes') : [],
  ]);
  const map = state.map;
  const dm = new Map();
  map.forEach((p) => dm.set(p.id, S.depthOf(p.id)));
  const gens = Math.max(0, ...dm.values());
  const weekAgo = Date.now() - 7 * 864e5;
  const addedWeek = [...map.values()].filter((p) => (p.at || 0) > weekAgo).length;
  const today = new Date(new Date().toDateString()).getTime();
  const real = visits.filter((v) => v.d !== 'bot');
  const uniq = (arr) => new Set(arr.map((v) => v.v)).size;
  const online = uniq(real.filter((v) => v.at > Date.now() - 5 * 6e4));
  const rows = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today - i * 864e5);
    const day = real.filter((v) => dayKey(v.at) === dayKey(d.getTime()));
    rows.push([`${d.getDate()}/${d.getMonth() + 1}`, uniq(day), `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} — ${uniq(day)} زائر · ${day.length} مشاهدة`]);
  }
  const devs = {};
  real.forEach((v) => { (devs[v.d] = devs[v.d] || new Set()).add(v.v); });
  const contrib = {};
  map.forEach((p) => { const l = p.by ? p.by.l : '—'; contrib[l] = (contrib[l] || 0) + 1; });
  const hs = houses().map((h) => [h.house || 'بيت ' + h.n, S.descendants(h.id).length + 1, 'house']).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const tone = (a) => (ACTIONS[a] || ['', 'muted'])[1];
  view().innerHTML = `
    <section class="welcome"><div><h2>أهلاً ${esc(state.admin.name || '')}</h2><p>${esc(state.settings.clan_name)} · ${S.fmtDt(Date.now(), false)} · ${online} متصل الآن</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-gold" href="#review">${icon('inbox')}مراجعة الطلبات${subs.length ? ' (' + subs.length + ')' : ''}</a><a class="btn btn-outline" href="./" target="_blank">${icon('tree')}تحرير الشجرة</a></div></section>
    ${state.settings.maintenance ? `<div class="alert alert-warn">${icon('alert')}<span>الموقع في وضع الصيانة الآن — الزوار يرون صفحة الصيانة. <a href="#settings/maintenance">إيقاف الصيانة</a></span></div>` : ''}
    <section class="kpis">
      <a class="kpi" href="#people"><span class="k-ic">${icon('users')}</span><span>أفراد الشجرة</span><b>${map.size}</b><small class="${addedWeek ? 'up' : ''}">+${addedWeek} هذا الأسبوع</small></a>
      <a class="kpi gold" href="#houses"><span class="k-ic">${icon('house')}</span><span>البيوت</span><b>${houses().length}</b><small>${gens} جيلاً في الشجرة</small></a>
      <a class="kpi warn" href="#review"><span class="k-ic">${icon('inbox')}</span><span>بانتظار المراجعة</span><b>${subs.length}</b><small>${counts.review - subs.length} اقتراح تصحيح</small></a>
      <a class="kpi info" href="#visitors"><span class="k-ic">${icon('eye')}</span><span>زوار اليوم</span><b>${uniq(real.filter((v) => v.at >= today))}</b><small>${uniq(real)} زائر · ${real.length} مشاهدة خلال 30 يوماً</small></a>
    </section>
    <div class="grid-panels c2">
      ${panel('الزوار الفريدون يومياً', 'chart', `<div class="panel-body">${colChart(rows, 'زائر')}</div>`, `<a class="btn btn-sm btn-ghost" href="#visitors">التفاصيل</a>`, 'آخر 30 يوماً')}
      ${panel('أجهزة الزوار', 'mobile', `<div class="panel-body">${hbars(Object.entries(devs).map(([d, set]) => [S.DEVICE_LABELS[d] || d, set.size, d === 'tablet' ? 'tablet' : d === 'desktop' ? 'desktop' : 'mobile']))}
        <div class="kpis" style="grid-template-columns:1fr 1fr;margin-top:16px"><div class="kpi"><span>الرموز الفعالة</span><b style="font-size:1.4rem">${codes.filter((c) => c.active).length}</b></div><div class="kpi"><span>متصل الآن</span><b style="font-size:1.4rem">${online}</b></div></div></div>`)}
    </div>
    <div class="grid-panels c2">
      ${panel('آخر العمليات', 'history', `<div class="feed">${feed.length ? feed.map((f) => `<div class="feed-item"><span class="feed-dot ${tone(f.a)}">${icon('history')}</span><div style="min-width:0"><p>${esc(f.s)}</p><small>${esc(f.l)} · ${S.timeAgo(f.at)} · ${esc(f.dev || '')}</small></div></div>`).join('') : empty('history', 'لا توجد عمليات بعد')}</div>`, `<a class="btn btn-sm btn-ghost" href="#log">السجل الكامل</a>`)}
      <div style="display:grid;gap:18px;align-content:start">
        ${panel('طلبات بانتظارك', 'inbox', `<div class="feed">${subs.length ? subs.slice(0, 5).map((s) => `<div class="feed-item"><span class="feed-dot warn">${icon('user-plus')}</span><div><p><b>${esc((s.names || []).join(' '))}</b></p><small>${S.timeAgo(s.at)} · ${esc(s.dev || '')}</small></div></div>`).join('') : empty('check', 'لا توجد طلبات معلقة')}</div>`, `<a class="btn btn-sm btn-ghost" href="#review">الكل</a>`)}
        ${panel('أكثر المساهمين في الإضافة', 'users', `<div class="panel-body">${hbars(Object.entries(contrib).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, c]) => [l, c, l.startsWith('رمز') ? 'key' : l.startsWith('المشرف') ? 'shield' : 'user']))}</div>`)}
        ${panel('البيوت حسب عدد الأفراد', 'house', `<div class="panel-body">${hbars(hs, map.size)}</div>`)}
      </div>
    </div>`;
};

/* ───────────── الطلبات والاقتراحات ───────────── */
const role = (i) => ['صاحب الطلب', 'الأب', 'الجد'][i] || 'الجد ' + S.genOrdinal(i - 1);
PAGES.review = async (tab = 'subs') => {
  setTitle('الطلبات والاقتراحات', 'inbox');
  const subs = await S.pendingSubs();
  const sugg = (await vals('suggestions')).sort((a, b) => (b.at || 0) - (a.at || 0));
  const openSugg = sugg.filter((s) => s.st === 'open').length;
  let body = '';
  if (tab === 'subs') {
    body = subs.length ? subs.map((s) => {
      const names = s.names || [];
      const fl = s.anchor == null || s.idx >= names.length;
      const anchorTxt = fl ? '' : P(s.anchor) ? S.nasab(s.anchor, 8) : '—';
      const sugs = fl ? S.matchChain(names, 3).filter((c) => c.confidence >= 25) : [];
      const newNames = names.slice(0, fl ? names.length : s.idx).reverse();
      return `<article class="sub-card" data-sid="${esc(s.id)}">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div class="chain-viz">${names.map((n, i) => `<span class="n ${i ? 'old' : 'anchor'}" title="${role(i)}">${esc(n)}</span>`).join('<span class="arrow">›</span>')}</div>
          <span class="badge ${fl ? 'badge-warn' : 'badge-info'}">${fl ? icon('branch') + 'فرع جديد لم يُربط بأجداده' : icon('link') + 'مربوط تلقائياً'}</span></div>
        ${fl ? `<div style="font-size:.92rem">لم يُعثر على أجداده، فسيُضاف فرعاً معلقاً مؤقتاً بالجذر ويرتبط تلقائياً عندما يضيف أقاربه أنسابهم. وعند الاعتماد يُعاد البحث فيما اعتُمد قبله لمنع التكرار.</div>
          <div class="sub-actions">${sugs.map((c) => `<button class="btn btn-xs btn-outline" data-act="approve-at" data-anchor="${c.anchor_id}" data-idx="${c.anchor_index}">${icon('link')}تحت ${esc(S.nasab(c.anchor_id, 4))} (${c.confidence}%)</button>`).join('')}</div>`
          : `<div style="font-size:.92rem">نقطة الربط: <a href="./?focus=${s.anchor}" target="_blank"><b>${esc(anchorTxt)}</b></a>${newNames.length ? ' — يُضاف تحته: ' + newNames.map((n) => `<span class="badge badge-gold">${icon('plus')}${esc(n)}</span>`).join(' ') : ''}</div>`}
        ${s.above && s.above.length ? `<div class="sub-warn" style="color:var(--info)">${icon('link')}يُكمل أجداد فرع غير مربوط: ${esc(s.above.join(' ‹ '))}</div>` : ''}
        ${s.sons && s.sons.length ? `<div style="font-size:.88rem">الأبناء: ${esc(s.sons.join('، '))}</div>` : ''}
        ${s.note ? `<div class="alert alert-info" style="margin:0">${icon('info')}${esc(s.note)}</div>` : ''}
        <div class="sub-meta"><span>${icon('clock')}${S.timeAgo(s.at)}</span>${s.phone ? `<span>${icon('phone')}<a class="mono" href="https://wa.me/${esc(s.phone.replace(/\D/g, '').replace(/^0/, '964'))}" target="_blank" rel="noopener">${esc(s.phone)}</a></span>` : ''}<span>${icon('desktop')}${esc(s.dev || '')}</span>${s.code ? `<span>${icon('key')}برمز: ${esc(s.code)}</span>` : ''}</div>
        <div class="sub-actions">
          <button class="btn btn-sm btn-primary" data-act="approve">${icon('check')}اعتماد</button>
          <details class="more" style="flex-basis:100%"><summary>تغيير نقطة الربط ثم الاعتماد</summary>
            <form class="form-grid" style="margin-top:10px" data-form="reanchor"><label class="field"><span>الشخص الموجود في الشجرة</span>${picker('anchor', 'ابحث عن الجد…')}</label>
            <label class="field"><span>هذا الشخص هو في سلسلة الطالب</span><select name="idx">${names.map((n, i) => (i ? `<option value="${i}">${esc(n)} (${role(i)})</option>` : '')).join('')}</select></label>
            <div><button class="btn btn-sm btn-primary" type="submit">${icon('link')}ربط واعتماد</button></div></form></details>
          <form style="display:flex;gap:6px;flex:1;min-width:240px" data-form="reject"><input name="note" placeholder="سبب الرفض (يظهر لصاحب الطلب)" style="min-height:34px;font-size:.86rem"><button class="btn btn-sm btn-danger-soft" type="submit">${icon('x')}رفض</button></form>
        </div></article>`;
    }).join('') : `<div class="panel">${empty('check', 'لا توجد طلبات بانتظار المراجعة')}</div>`;
  } else if (tab === 'sugg') {
    body = panel('طلبات التعديل', 'edit', `<div class="feed">${sugg.length ? sugg.map((g) => `<div class="feed-item"><span class="feed-dot ${g.st === 'open' ? 'warn' : 'ok'}">${icon(g.st === 'open' ? 'alert' : 'check')}</span>
      <div style="flex:1;min-width:0">${g.who ? `<p style="margin:0 0 4px">${icon('user')}<b>${esc(g.who)}</b> يطلب:</p>` : ''}<p>${g.pid != null && P(g.pid) ? `<a href="#people/${g.pid}"><b>${esc(S.nasab(g.pid, 5))}</b></a> — ` : ''}${esc(g.msg)}</p>
      ${g.ord ? `<ol class="ord-view">${String(g.ord).split(',').map((x) => `<li>${esc(P(+x) ? P(+x).n : '؟')}</li>`).join('')}</ol>` : ''}<small>${S.timeAgo(g.at)}${g.contact && !g.who ? ' · ' + esc(g.contact) : ''}${g.st !== 'open' ? ' · ' + (g.st === 'done' ? 'تمت الموافقة' : 'مرفوض') + ' بواسطة ' + esc(g.rby || '') : ''}</small></div>
      ${g.st === 'open' ? `<div style="display:flex;gap:6px">${['rename', 'order', 'edit'].includes(g.kind)
        ? `<button class="btn btn-xs btn-ok-soft" data-act="sugg-apply" data-id="${esc(g.id)}">${icon('check')}موافقة وتطبيق</button>`
        : `<button class="btn btn-xs btn-ok-soft" data-act="sugg" data-st="done" data-id="${esc(g.id)}">${icon('check')}تم</button>`}
        <button class="btn btn-xs btn-danger-soft" data-act="sugg" data-st="dismissed" data-id="${esc(g.id)}">${icon('x')}رفض</button></div>` : ''}</div>`).join('') : empty('check', 'لا توجد طلبات تعديل')}</div>`);
  } else {
    const all = (await vals('subs')).filter((s) => s.st !== 'pending').sort((a, b) => (b.rat || b.at || 0) - (a.rat || a.at || 0)).slice(0, 150);
    body = panel('الأرشيف', 'history', `<div class="table-wrap"><table class="t"><thead><tr><th>النسب المرسل</th><th>الحالة</th><th>المراجع</th><th>التاريخ</th><th>الجهاز</th></tr></thead><tbody>
      ${all.map((s) => `<tr><td class="nm"><b>${esc((s.names || []).join(' '))}</b>${s.rnote ? `<small>${esc(s.rnote)}</small>` : ''}</td><td>${s.st === 'approved' ? '<span class="badge badge-ok">معتمد</span>' : s.st === 'cancelled' ? '<span class="badge badge-muted">ألغاه صاحبه</span>' : '<span class="badge badge-danger">مرفوض</span>'}</td><td>${esc(s.rby || '')}</td><td class="num">${S.fmtDt(s.rat || s.at)}</td><td><small>${esc(s.dev || '')}</small></td></tr>`).join('') || `<tr><td colspan="5">${empty('history', 'لا يوجد أرشيف بعد')}</td></tr>`}</tbody></table></div>`);
  }
  view().innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
    <nav class="tabs"><a href="#review" class="${tab === 'subs' ? 'on' : ''}">${icon('user-plus')}طلبات الإضافة${subs.length ? `<span class="count">${subs.length}</span>` : ''}</a>
    <a href="#review/sugg" class="${tab === 'sugg' ? 'on' : ''}">${icon('edit')}طلبات التعديل${openSugg ? `<span class="count">${openSugg}</span>` : ''}</a><a href="#review/archive" class="${tab === 'archive' ? 'on' : ''}">${icon('history')}الأرشيف</a></nav>
    ${tab === 'subs' && subs.length ? `<button class="btn btn-ok-soft btn-sm" data-act="approve-all">${icon('check')}اعتماد الكل</button>` : ''}</div>${body}`;
  bindPickers(view());
};

/* ───────────── الأفراد ───────────── */
PAGES.people = async (arg, sub) => {
  if (arg && !/^p\d+$/.test(arg) && P(arg)) return personEdit(+arg);
  setTitle('الأفراد', 'users');
  const page = arg ? +arg.slice(1) : 1;
  const qs = new URLSearchParams(sessionStorage.getItem('people-filter') || '');
  const q = qs.get('q') || '', hf = qs.get('house') || '', sort = qs.get('sort') || 'recent', by = qs.get('by') || '';
  let rows = q ? S.searchPeople(q, 5000).map((r) => r.id) : [...state.map.keys()];
  if (hf) rows = rows.filter((id) => S.inScope(id, +hf));
  if (by) rows = rows.filter((id) => P(id).by && P(id).by.l === by);
  if (!q || sort !== 'recent') rows.sort((a, b) => (sort === 'name' ? P(a).k.localeCompare(P(b).k) : sort === 'gen' ? S.depthOf(a) - S.depthOf(b) || a - b : (P(b).at || 0) - (P(a).at || 0) || b - a));
  const per = 50;
  const slice = rows.slice((page - 1) * per, page * per);
  const roots = [...state.map.values()].filter((p) => p.p == null);
  view().innerHTML = panel('إضافة أفراد', 'user-plus', `<form class="panel-body form-grid" data-form="people-add">
      <label class="field"><span>الأب</span>${picker('parent', 'ابحث عن الأب…')}<small>إن تركته فارغاً يُضاف الأبناء تحت الجد الأكبر.</small></label>
      <label class="field"><span>الأسماء</span><input name="names" placeholder="مثال: علي، حسن، محمد" required></label>
      <div class="full"><button class="btn btn-primary btn-sm" type="submit">${icon('plus')}إضافة</button></div></form>
      <form class="panel-body" style="border-top:1px dashed var(--line);display:flex;gap:8px;flex-wrap:wrap;align-items:end" data-form="ancestor">
      <label class="field" style="margin:0;flex:1;min-width:220px"><span>إضافة جد أعلى فوق «${esc(roots.map((r) => r.n).join('، '))}» (لإكمال سلسلة الأجداد للأعلى)</span><input name="name" placeholder="اسم أبي الجد الأكبر الحالي" required></label>
      <button class="btn btn-outline btn-sm" type="submit">${icon('arrow-up')}إضافة جد أعلى</button></form>`, '', 'اختر الأب ثم اكتب أسماء الأبناء مفصولة بفاصلة.')
    + `<section class="panel"><form class="filters" data-form="people-filter">
      <label class="field" style="flex:1"><span>بحث (الاسم ثم الأب ثم الجد)</span><input type="search" name="q" value="${esc(q)}" placeholder="مثال: علي عبد الحليم"></label>
      <label class="field"><span>البيت</span><select name="house"><option value="">كل البيوت</option>${houses().map((h) => `<option value="${h.id}" ${+hf === h.id ? 'selected' : ''}>${esc(h.house || 'بيت ' + h.n)}</option>`).join('')}</select></label>
      <label class="field"><span>الترتيب</span><select name="sort"><option value="recent">الأحدث</option><option value="name" ${sort === 'name' ? 'selected' : ''}>الاسم</option><option value="gen" ${sort === 'gen' ? 'selected' : ''}>الجيل</option></select></label>
      ${by ? `<span class="badge badge-info">أضافه: ${esc(by)}</span><input type="hidden" name="by" value="${esc(by)}">` : ''}
      <button class="btn btn-sm btn-primary" type="submit">${icon('filter')}تصفية</button><button class="btn btn-sm btn-outline" type="button" data-act="csv">${icon('download')}CSV</button></form>
      <div class="table-wrap"><table class="t"><thead><tr><th>الاسم والنسب</th><th>الجيل</th><th>البيت</th><th>الأبناء</th><th>أضافه</th><th>التاريخ</th><th></th></tr></thead><tbody>
      ${slice.map((id) => { const p = P(id), h = S.houseOf(id); return `<tr><td class="nm"><b>${S.isHouse(id) ? icon('crown') + ' ' : ''}${esc(p.n)}${p.fl ? ' <span class="badge badge-info">غير مربوط</span>' : ''}</b><small>${esc(S.nasab(id, 6))}</small></td>
        <td class="num">${S.depthOf(id)}</td><td>${h != null ? `<span class="swatch" style="background:${esc(P(h).hc || '#d9ae22')}"></span> ${esc(S.houseName(h))}` : '—'}</td><td class="num">${S.kidsOf(id).length}</td>
        <td><small>${esc(p.by ? p.by.l : '')}</small></td><td class="num"><small>${S.fmtDt(p.at, false)}</small></td>
        <td><div class="acts"><a class="btn btn-xs btn-outline" href="#people/${id}">${icon('edit')}تعديل</a><a class="btn btn-xs btn-ghost" href="./?focus=${id}" target="_blank">${icon('tree')}</a></div></td></tr>`; }).join('') || `<tr><td colspan="7">${empty('search', 'لا توجد نتائج')}</td></tr>`}
      </tbody></table></div>${pager(rows.length, page, per, (i) => '#people/p' + i)}</section>`;
  bindPickers(view());
};

async function personEdit(id) {
  const p = P(id);
  setTitle('تعديل: ' + p.n, 'edit');
  const phone = (await get(ref(db, 'private/' + id + '/phone'))).val() || '';
  const hist = (await get(query(ref(db, 'audit'), orderByChild('eid'), equalTo(id)))).val() || {};
  const history = Object.values(hist).sort((a, b) => b.at - a.at).slice(0, 30);
  const kids = S.kidsOf(id), desc = S.descendants(id);
  view().innerHTML = `<div class="panel"><div class="panel-body" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <div class="nasab-chain">${S.lineage(id).map((x, i) => `${i ? '<i>‹</i>' : ''}<a class="badge ${i ? '' : 'badge-ok'}" href="#people/${x}">${esc(P(x).n)}</a>`).join('')}</div>
      <span class="badge badge-muted">الجيل ${S.genOrdinal(S.depthOf(id))}</span><span class="badge badge-muted">${kids.length} أبناء · ${desc.length} ذرية</span>
      ${p.fl ? '<span class="badge badge-info">فرع لم يُربط بأجداده بعد</span>' : ''}<a class="btn btn-xs btn-outline" href="./?focus=${id}" target="_blank">${icon('tree')}في الشجرة</a></div></div>
    <div class="grid-panels c2">
      <form class="panel" data-form="person-save" data-id="${id}"><div class="panel-head"><h2>${icon('user')}البيانات</h2></div><div class="panel-body form-grid">
        <label class="field"><span>الاسم</span><input name="name" value="${esc(p.n)}" required></label>
        <label class="field"><span>الكنية / اللقب</span><input name="nickname" value="${esc(p.nick || '')}"></label>
        <label class="field"><span>سنة الميلاد</span><input name="birth_year" inputmode="numeric" value="${esc(p.b || '')}"></label>
        <label class="field"><span>سنة الوفاة</span><input name="death_year" inputmode="numeric" value="${esc(p.y || '')}"></label>
        <label class="field"><span>الجنس</span><select name="gender"><option value="m">ذكر</option><option value="f" ${p.g === 'f' ? 'selected' : ''}>أنثى</option></select></label>
        <label class="field"><span>الترتيب بين الإخوة</span><input type="number" name="sort_order" value="${p.o || 0}"></label>
        <label class="field"><span>الهاتف (خاص)</span><input name="phone" dir="ltr" value="${esc(phone)}"></label>
        <div class="field"><span>&nbsp;</span><label class="check"><input type="checkbox" name="is_deceased" ${p.dead ? 'checked' : ''}><span>متوفى (رحمه الله)</span></label></div>
        <div class="full" style="border:1px dashed var(--line-strong);border-radius:14px;padding:12px 14px 2px;margin-bottom:14px">
          <div class="field"><span><b>البيت</b> — ${S.isHouse(id) ? `${icon('crown')} «${esc(S.houseName(id))}» بيت حالياً` : 'ليس بيتاً حالياً'}</span>${houseModeSeg(id)}</div>
          <div class="form-grid"><label class="field"><span>اسم البيت</span><input name="house_name" value="${esc(p.house || '')}" placeholder="بيت ${esc(p.n)}"></label><label class="field"><span>لون البيت</span><input type="color" name="house_color" value="${esc(p.hc || '#c0392b')}"></label></div></div>
        <label class="field full"><span>نبذة</span><textarea name="bio" rows="3">${esc(p.bio || '')}</textarea></label>
        <div class="full sub-meta"><span>${icon('user-plus')}أضافه: ${esc(p.by ? p.by.l : '—')} · ${S.fmtDt(p.at)}</span>${p.ub ? `<span>${icon('edit')}آخر تعديل: ${esc(p.ub.l)} · ${S.fmtDt(p.ub.at)}</span>` : ''}</div>
      </div><div class="save-bar"><button class="btn btn-primary" type="submit">${icon('check')}حفظ التعديلات</button></div></form>
      <div style="display:grid;gap:18px;align-content:start">
        ${panel('الأبناء', 'users', `<div class="panel-body"><div class="kids" style="margin-bottom:12px">${kids.map((c) => `<a class="badge" href="#people/${c}">${S.isHouse(c) ? icon('crown') : ''}${esc(P(c).n)}</a>`).join('') || '<span class="muted">لا يوجد أبناء</span>'}</div>
          <form style="display:flex;gap:8px" data-form="kids-add" data-id="${id}"><input name="names" placeholder="أسماء الأبناء مفصولة بفاصلة" required><button class="btn btn-sm btn-primary" type="submit">${icon('plus')}إضافة</button></form></div>`)}
        ${panel('نقل ودمج', 'move', `<div class="panel-body">${p.p != null ? `<form style="margin-bottom:14px" data-form="move" data-id="${id}"><label class="field"><span>${p.fl ? 'ربطه بأبيه الحقيقي' : 'نقل مع ذريته تحت أب آخر'}</span>${picker('parent', 'ابحث عن الأب الجديد…')}</label><button class="btn btn-sm btn-outline" type="submit">${icon('move')}نقل</button></form>` : ''}
          <form data-form="merge" data-id="${id}"><label class="field"><span>دمج هذا الشخص (المكرر) في الشخص الصحيح</span>${picker('target', 'ابحث عن الشخص الصحيح…')}</label><button class="btn btn-sm btn-outline" type="submit">${icon('merge')}دمج</button></form></div>`)}
        ${panel('إضافة اسم في السلسلة', 'plus', `<div class="panel-body" style="display:grid;gap:10px">
          <form style="display:flex;gap:8px" data-form="insert-parent" data-id="${id}"><input name="name" placeholder="${p.p != null && P(p.p) ? `اسم قبله (بين «${esc(P(p.p).n)}» و«${esc(p.n)}»)` : `اسم قبله (جد أعلى من «${esc(p.n)}»)`}" required><button class="btn btn-sm btn-primary" type="submit">${icon('plus')}قبله</button></form>
          ${kids.length ? `<form style="display:flex;gap:8px" data-form="insert-child" data-id="${id}"><input name="name" placeholder="اسم بعده (بين «${esc(p.n)}» وأبنائه)" required><button class="btn btn-sm btn-outline" type="submit">${icon('plus')}بعده</button></form>` : ''}</div>`)}
        ${kids.length && p.p != null ? panel('حذفه وإبقاء أبنائه', 'link', `<div class="panel-body"><p class="muted" style="margin:0 0 10px">إن كان الاسم خطأً: يُحذف «${esc(p.n)}» وحده ويرتبط أبناؤه (${kids.map((c) => esc(P(c).n)).join('، ')}) بـ «${esc(P(p.p) ? P(p.p).n : '')}» مباشرة.</p><button class="btn btn-sm btn-danger-soft" data-act="unlink" data-id="${id}">${icon('trash')}حذف وربط الأبناء</button></div>`) : ''}
        ${panel('حذف', 'trash', `<div class="panel-body"><form class="danger-zone" data-form="delete" data-id="${id}" data-desc="${desc.length}">${desc.length ? `<label class="check"><input type="checkbox" name="with_desc" required><span>أفهم أن الحذف يشمل ${desc.length} من ذريته</span></label>` : ''}<button class="btn btn-sm btn-danger" type="submit">${icon('trash')}حذف «${esc(p.n)}»</button></form></div>`)}
      </div></div>
    ${panel('سجل هذا الشخص', 'history', `<div class="feed">${history.map((h) => `<div class="feed-item"><span class="feed-dot ${(ACTIONS[h.a] || [])[1] || ''}">${icon('history')}</span><div><p>${badgeAct(h.a)} ${esc(h.s)}</p><small>${esc(h.l)} · ${S.fmtDt(h.at)} · ${esc(h.dev || '')}</small></div></div>`).join('') || empty('history', 'لا توجد عمليات مسجلة')}</div>`)}`;
  bindPickers(view());
}

/* ───────────── الأجداد الرئيسيون (الجذع) ─────────────
   الأجداد من أعلى جد حتى أول تفرع يظهرون ألواحاً على جذع الشجرة: الأقدم في القاع وأكبرها،
   ثم الأحدث فالأصغر صعوداً حتى الجد الجامع الذي تتفرع منه البيوت. */
function trunkChain() {
  const r = S.rootId();
  const out = [];
  let x = r;
  while (x != null && P(x)) { out.push(x); const ks = S.kidsOf(x); if (ks.length !== 1) break; x = ks[0]; }
  return out;
}
PAGES.trunk = async () => {
  setTitle('الأجداد الرئيسيون (الجذع)', 'tree');
  const chain = trunkChain();
  if (!chain.length) { view().innerHTML = `<div class="panel">${empty('tree', 'الشجرة فارغة')}</div>`; return; }
  const crown = chain[chain.length - 1];
  const branching = S.kidsOf(crown).length > 1;
  const n = chain.length;
  // المعاينة: الجد الجامع فوق، والألواح تكبر كلما نزلنا
  const preview = `<div class="trunk-prev">
      ${branching ? `<div class="tp-branches">${S.kidsOf(crown).slice(0, 6).map((k) => `<span>${esc(P(k).n)}</span>`).join('')}${S.kidsOf(crown).length > 6 ? '<span>…</span>' : ''}</div>` : ''}
      <div class="tp-crown">${esc(P(crown).n)}</div>
      <div class="tp-trunk">${chain.slice(0, -1).reverse().map((id, i, arr) => `<div class="tp-plaque" style="width:${Math.round(52 + 48 * (i + 1) / arr.length)}%">${esc(P(id).n)}</div>`).join('') || '<small class="muted">لا أجداد على الجذع بعد</small>'}</div>
      <div class="tp-ground"></div></div>`;
  const rows = chain.slice().reverse().map((id, i) => {
    const pos = n - i; // 1 = القاع
    const isCrown = id === crown, isRoot = pos === 1;
    const canUp = S.kidsOf(id).length === 1, canDown = !isRoot;
    return `<li class="tr-row ${isCrown ? 'crown' : ''}">
      <span class="tr-n">${isCrown ? icon('crown') : pos}</span>
      <form class="tr-name" data-form="trunk-rename" data-id="${id}"><input name="name" value="${esc(P(id).n)}" required title="اكتب الاسم الصحيح ثم اضغط خارج الخانة"></form>
      <div class="tr-acts">
        <button class="tr-btn" data-act="trunk-up" data-id="${id}" ${canUp ? '' : 'disabled'} title="رفعه درجة (نحو الأحدث)">${icon('arrow-up')}</button>
        <button class="tr-btn dn" data-act="trunk-down" data-id="${id}" ${canDown ? '' : 'disabled'} title="إنزاله درجة (نحو القاع)">${icon('arrow-up')}</button>
        <button class="tr-btn" data-act="trunk-after" data-id="${id}" title="إضافة اسم فوقه">${icon('plus')}</button>
        <button class="tr-btn del" data-act="trunk-del" data-id="${id}" ${(isRoot && S.kidsOf(id).length === 1) || (!isRoot && !isCrown) || (isCrown && !branching && !isRoot) ? '' : 'disabled'} title="حذفه وإبقاء السلسلة">${icon('trash')}</button>
      </div>
      ${isCrown || isRoot ? `<span class="tr-tag">${isCrown ? (branching ? 'الجد الجامع — منه يبدأ التفرع' : 'آخر اسم') : 'القاع — أقدم جد'}</span>` : ''}
      <form class="tr-after" data-form="trunk-after" data-id="${id}" hidden><input name="name" placeholder="الاسم فوق «${esc(P(id).n)}»" required><button class="btn btn-sm btn-primary" type="submit">${icon('plus')}إضافة</button></form></li>`;
  }).join('');
  view().innerHTML = `<div class="grid-panels c2">
    ${panel('سلسلة الأجداد', 'tree', `<div class="panel-body"><ol class="tr-list">${rows}</ol>
      <form class="tr-add" data-form="trunk-before-root" data-id="${chain[0]}"><input name="name" placeholder="جد أقدم من «${esc(P(chain[0]).n)}» (يُضاف في القاع)" required><button class="btn btn-sm btn-primary" type="submit">${icon('plus')}إضافة في القاع</button></form></div>`, '', 'الأحدث فوق والأقدم في القاع. ↑ ↓ لتغيير المكان، + لإضافة اسم فوقه، وعدّل أي اسم بالكتابة عليه مباشرة.')}
    <div style="display:grid;gap:18px;align-content:start">
      ${panel('كيف تظهر على الشجرة', 'eye', `<div class="panel-body">${preview}</div>`)}
      ${panel('إضافة عدة أجداد دفعة واحدة', 'plus', `<form class="panel-body" data-form="trunk-bulk">
        <label class="field"><span>الأسماء من الأقدم إلى الأحدث، كل اسم في سطر</span><textarea name="names" rows="6" placeholder="الفضل&#10;خضرو&#10;درباس&#10;مسعود" required></textarea></label>
        <label class="field"><span>مكانها في السلسلة</span><select name="at">
          ${chain.map((id) => `<option value="after:${id}" ${id === chain[0] ? 'selected' : ''}>بعد «${esc(P(id).n)}»${id === crown && branching ? ' (بينه وبين أبنائه)' : ''}</option>`).join('')}
          <option value="below">في القاع (أقدم من «${esc(P(chain[0]).n)}»)</option></select></label>
        <button class="btn btn-primary" type="submit">${icon('check')}إضافة</button></form>`)}
    </div></div>`;
};

/* ───────────── البيوت ───────────── */
PAGES.houses = async (edit) => {
  setTitle('البيوت', 'house');
  const e = edit ? P(edit) : null;
  const root0 = S.rootId();
  const hs = houses().map((h) => ({ h, members: S.descendants(h.id).length + 1, gen: S.depthOf(h.id), gens: Math.max(0, ...S.descendants(h.id).map((d) => S.depthOf(d) - S.depthOf(h.id))) + 1
  })).sort((a, b) => a.gen - b.gen || b.members - a.members);
  const floating = [...state.map.values()].filter((p) => p.fl);
  const off = [...state.map.values()].filter((p) => p.nh);
  const min = state.settings.house_min || 20;
  view().innerHTML = panel(e ? 'تعديل ' + esc(e.house || 'بيت ' + e.n) : 'إنشاء بيت جديد', e ? 'edit' : 'plus', `<form class="panel-body form-grid" data-form="house-save" data-id="${e ? e.id : ''}">
      ${e ? `<div class="field"><span>رأس البيت</span><b style="padding:.5em 0">${esc(S.nasab(e.id, 6))}</b></div>` : `<label class="field"><span>اسم رأس البيت</span><input name="new_name" placeholder="مثال: محمد"><small>يُضاف تلقائياً إلى الشجرة إن لم يكن موجوداً.</small></label>
      <label class="field"><span>ابن مَن؟ (أبوه في الشجرة)</span>${picker('parent', 'ابحث عن الأب…', root0)}<small>الافتراضي: الجد الأكبر.</small></label>
      <label class="field full"><span>أو اختر شخصاً موجوداً في الشجرة ليصبح رأس بيت</span>${picker('person', 'ابحث عن شخص موجود…')}</label>`}
      <label class="field"><span>اسم البيت</span><input name="house_name" value="${esc(e ? e.house || '' : '')}" placeholder="مثال: بيت محمد الموسى"></label>
      <label class="field"><span>لون البيت</span><input type="color" name="house_color" value="${esc((e && e.hc) || '#c0392b')}"></label>
      <div class="field"><span>&nbsp;</span><div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" type="submit">${icon('check')}حفظ</button>${e ? '<a class="btn btn-ghost btn-sm" href="#houses">إلغاء</a>' : ''}</div></div></form>`, '', 'البيت = رأس بيت وكل ذريته. حتى بدون بيوت، تتفرع الشجرة تلقائياً من كل جد حسب نسبه.')
    + (floating.length ? panel(`فروع بانتظار الربط (${floating.length})`, 'link', `<div class="table-wrap"><table class="t"><thead><tr><th>رأس الفرع</th><th>الأفراد</th><th>ربطه بأبيه</th><th></th></tr></thead><tbody>
      ${floating.map((f) => `<tr><td class="nm"><b>${esc(f.n)}</b><small>معلق مؤقتاً بـ «${esc(P(f.p) ? P(f.p).n : '')}»</small></td><td class="num">${S.descendants(f.id).length + 1}</td>
        <td style="min-width:280px"><form style="display:flex;gap:6px;align-items:flex-start" data-form="link" data-id="${f.id}"><div style="flex:1">${picker('parent', 'ابحث عن أبيه في الشجرة…')}</div><button class="btn btn-xs btn-primary" type="submit" style="margin-top:6px">${icon('link')}ربط</button></form></td>
        <td><div class="acts"><a class="btn btn-xs btn-ghost" href="./?focus=${f.id}" target="_blank">${icon('tree')}</a><button class="btn btn-xs btn-outline" data-act="confirm-link" data-id="${f.id}" data-parent="${f.p}">${icon('check')}ابن مباشر لـ${esc(P(f.p) ? P(f.p).n : '')}</button></div></td></tr>`).join('')}</tbody></table></div>`, '', 'عائلات لم يُعثر على أجدادها بعد، فهي معلقة بالجذر بخط منقط. ترتبط تلقائياً عندما يضيف أحد أقاربها نسباً يجمعها، أو اربطها هنا.') : '')
    + panel(`بيوت العشيرة (${hs.length})`, 'house', `<form class="panel-body house-min" data-form="settings" data-tab="houses">
        ${icon('sparkles')}<span>كل من ذريته</span><input type="number" name="house_min" min="2" max="500" value="${min}" inputmode="numeric"><span>فرداً فأكثر يصير <b>بيتاً تلقائياً</b>.</span>
        <button class="btn btn-sm btn-outline" type="submit">${icon('check')}حفظ</button></form>
      <div class="table-wrap"><table class="t"><thead><tr><th>البيت</th><th>النوع</th><th>الجيل</th><th>الأفراد</th><th>الأجيال</th><th></th></tr></thead><tbody>
      ${hs.map(({ h, members, gen, gens }) => `<tr><td class="nm"><b><span class="swatch" style="background:${esc(h.hc || '#d9ae22')}"></span> ${esc(S.houseName(h.id))}</b><small>${esc(S.nasab(h.id, 5))}</small></td>
        <td>${S.isAutoHouse(h.id) ? '<span class="badge badge-info">تلقائي</span>' : '<span class="badge badge-gold">ثابت (يدوي)</span>'}</td>
        <td class="num">${gen}</td><td class="num"><b>${members}</b></td><td class="num">${gens}</td>
        <td><div class="acts"><a class="btn btn-xs btn-outline" href="./?root=${h.id}" target="_blank">${icon('tree')}الشجرة</a>
        <a class="btn btn-xs btn-ghost" href="#houses/${h.id}" title="الاسم واللون">${icon('edit')}</a>
        ${S.isAutoHouse(h.id) ? '' : `<button class="btn btn-xs btn-ghost" data-act="house-auto" data-id="${h.id}" title="يرجع يُحسب حسب العدد">${icon('refresh')}تلقائي</button>`}
        <button class="btn btn-xs btn-danger-soft" data-act="unhouse" data-id="${h.id}">${icon('x')}إلغاء البيت</button></div></td></tr>`).join('') || `<tr><td colspan="6">${empty('house', 'لا توجد بيوت بعد — تظهر تلقائياً عندما تكبر العوائل')}</td></tr>`}</tbody></table></div>`, '', `البيت = رأس البيت وكل ذريته. تُضاف البيوت تلقائياً عندما تبلغ الذرية ${min} فرداً، ويمكنك إلغاء أي بيت أو تثبيت أي شخص بيتاً.`)
    + (off.length ? panel(`بيوت ألغيتها (${off.length})`, 'x', `<div class="table-wrap"><table class="t"><tbody>
      ${off.map((p) => `<tr><td class="nm"><b>${esc(p.n)}</b><small>${esc(S.nasab(p.id, 5))} · ${S.descCount(p.id) + 1} فرداً</small></td>
        <td><div class="acts"><button class="btn btn-xs btn-outline" data-act="house-auto" data-id="${p.id}">${icon('refresh')}إرجاع للتلقائي</button><button class="btn btn-xs btn-gold" data-act="make-house" data-id="${p.id}">${icon('crown')}اجعله بيتاً</button></div></td></tr>`).join('')}</tbody></table></div>`, '', 'هؤلاء لن يصبحوا بيوتاً مهما كبرت ذريتهم حتى ترجعهم.') : '');
  bindPickers(view());
};

/* ───────────── رموز الصلاحية ─────────────
   رمز من 3 أرقام + اسم صاحبه فقط. صلاحيات كاملة (إضافة وتعديل وحذف واعتماد) في الشجرة كلها.
   يعمل لشخص واحد: أول جهاز يدخل به يُربط به ولا يفتح لغيره. */
let newCodeShown = null;
PAGES.codes = async () => {
  if (!isManager()) return go('dashboard');
  setTitle('رموز الصلاحية', 'key');
  const codes = (await vals('codes')).sort((a, b) => (b.at || 0) - (a.at || 0));
  const secrets = (await get(ref(db, 'codes_secret'))).val() || {};
  const adds = {};
  state.map.forEach((p) => { if (p.by && p.by.t === 'code') adds[p.by.id] = (adds[p.by.id] || 0) + 1; });
  let shown = '';
  if (newCodeShown) {
    const c = newCodeShown;
    const msg = `السلام عليكم\nرمز صلاحيتك في ${state.settings.site_title}: ${c.code}\n\nافتح ${new URL('./', location.href).href}\nثم اضغط أيقونة المفتاح 🔑 وأدخل الرمز.\nالرمز يعمل على جهازك أنت فقط من أول استخدام.`;
    shown = `<section class="panel" style="border-color:var(--primary)"><div class="panel-head"><div><h2>${icon('check')}رمز «${esc(c.holder)}» جاهز</h2><p>أرسله لصاحبه فقط — يُربط بأول جهاز يدخل به.</p></div></div>
      <div class="panel-body" style="display:grid;gap:12px;justify-items:center"><div class="code-big">${esc(c.code)}</div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
      <button class="btn btn-outline" type="button" data-copy="${esc(c.code)}">${icon('copy')}نسخ الرمز</button><button class="btn btn-outline" type="button" data-copy="${esc(msg)}">${icon('copy')}نسخ رسالة كاملة</button>
      <a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">${icon('whatsapp')}إرسال عبر واتساب</a></div></div></section>`;
    newCodeShown = null;
  }
  view().innerHTML = shown + panel('إنشاء رمز', 'plus', `<form class="panel-body form-grid" data-form="code-save">
      <label class="field"><span>الرمز (3 أرقام)</span><input name="code" class="code-input" inputmode="numeric" maxlength="3" placeholder="اتركه فارغاً لرمز عشوائي" dir="ltr"></label>
      <label class="field"><span>اسم صاحب الرمز</span><input name="holder" placeholder="مثال: أبو علي" required></label>
      <div class="full"><button class="btn btn-primary" type="submit">${icon('key')}إنشاء الرمز</button></div></form>`, '', 'صاحب الرمز يضيف ويعدّل ويحذف ويعتمد الطلبات في الشجرة كلها. يعمل على جهاز واحد فقط؛ إن ضاع منه اضغط «رمز جديد».')
    + panel(`الرموز (${codes.length})`, 'key', `<div class="table-wrap"><table class="t"><thead><tr><th>صاحب الرمز</th><th>الرمز</th><th>الجهاز</th><th>الاستخدام</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${codes.map((c) => { const code = (secrets[c.id] || {}).code || ''; return `<tr>
        <td class="nm"><b>${esc(c.holder)}</b><small>أُنشئ ${S.timeAgo(c.at)}</small></td>
        <td><b class="code-mask">${esc(code)}</b></td>
        <td>${c.claimed ? `<span class="badge badge-ok">${icon('lock')}مربوط بجهاز</span><br><small class="muted">${esc(c.dev || '')} · ${S.timeAgo(c.claimed)}</small>` : '<span class="badge badge-warn">لم يُستخدم بعد</span>'}</td>
        <td class="num"><small>${c.logins || 0} دخول · ${adds[c.id] || 0} إضافة</small></td>
        <td>${c.active ? '<span class="badge badge-ok">فعال</span>' : '<span class="badge badge-muted">معطّل</span>'}</td>
        <td><div class="acts"><button class="btn btn-xs btn-outline" data-act="code-toggle" data-id="${c.id}">${c.active ? 'تعطيل' : 'تفعيل'}</button>
          <button class="btn btn-xs btn-ghost" data-act="code-regen" data-id="${c.id}" title="رمز جديد لنفس الشخص">${icon('refresh')}رمز جديد</button>
          <button class="btn btn-xs btn-ghost" data-act="code-delete" data-id="${c.id}" title="حذف">${icon('trash')}</button></div></td></tr>`; }).join('') || `<tr><td colspan="6">${empty('key', 'لا توجد رموز بعد')}</td></tr>`}</tbody></table></div>`);
};
function syncCodeType() { /* لم يعد هناك أنواع للرموز */ }

/** ينشئ حساب رمز من 3 أرقام؛ إن كان الرقم مستخدماً يختار غيره (أو يرفض إن حدده المالك) */
async function makeCode(holder, wanted) {
  for (let i = 0; i < 25; i++) {
    const digits = wanted || String(100 + Math.floor(Math.random() * 900));
    const { email, password } = await S.codeEmail(digits);
    try {
      const uid = await S.createAuthUser(email, password);
      return { uid, digits };
    } catch (e) {
      if (!String(e.code).includes('email-already-in-use')) throw e;
      if (wanted) throw new Error('الرمز ' + wanted + ' مستخدم مسبقاً، اختر رقماً آخر');
    }
  }
  throw new Error('تعذر إيجاد رمز متاح، حدد رقماً بنفسك');
}

async function saveCode(f, fd) {
  const holder = (fd.get('holder') || '').toString().trim();
  const wanted = (fd.get('code') || '').toString().replace(/\D/g, '');
  if (!holder) return toast('اسم صاحب الرمز مطلوب', 'err');
  if (wanted && wanted.length !== 3) return toast('الرمز 3 أرقام', 'err');
  const ok = await run(async () => {
    const { uid, digits } = await makeCode(holder, wanted);
    const u = {
      ['codes/' + uid]: { holder, add: true, edit: true, del: true, approve: true, active: true, at: Date.now(), logins: 0 },
      ['codes_secret/' + uid]: { code: digits },
    };
    auditAdmin(u, 'code_create', 'code', null, `أنشأ رمزاً لـ «${holder}»`);
    await update(ref(db), u);
    newCodeShown = { holder, code: digits };
  });
  if (ok) go('codes');
}

/* ───────────── سجل العمليات ───────────── */
PAGES.log = async (pg) => {
  setTitle('سجل العمليات', 'history');
  const page = pg ? +pg : 1;
  const f = new URLSearchParams(sessionStorage.getItem('log-filter') || '');
  const all = await lastN('audit', 1500);
  const trash = (await get(ref(db, 'trash'))).val() || {};
  const q = (f.get('q') || '').trim(), t = f.get('t') || '', a = f.get('a') || '';
  const rows = all.filter((r) => (!t || r.t === t) && (!a || r.a === a) && (!q || (r.s || '').includes(q) || (r.l || '').includes(q)));
  const per = 50;
  const slice = rows.slice((page - 1) * per, page * per);
  const diff = (r) => {
    const b = r.b ? JSON.parse(r.b) : null, af = r.af ? JSON.parse(r.af) : null;
    if (!b && !af) return '';
    const keys = [...new Set([...Object.keys(b || {}), ...Object.keys(af || {})])].filter((k) => k !== 'batch');
    if (!keys.length) return '';
    return `<details class="more"><summary>عرض البيانات</summary><table class="diff"><tr><th>الحقل</th>${b ? '<th>قبل</th>' : ''}${af ? '<th>بعد</th>' : ''}</tr>${keys.map((k) => `<tr><th>${esc(S.FIELD_LABELS[k] || k)}</th>${b ? `<td class="old">${esc(JSON.stringify(b[k] ?? '')).slice(0, 200)}</td>` : ''}${af ? `<td class="new">${esc(JSON.stringify(af[k] ?? '')).slice(0, 200)}</td>` : ''}</tr>`).join('')}</table></details>`;
  };
  view().innerHTML = `<section class="panel"><form class="filters" data-form="log-filter">
      <label class="field" style="flex:1;min-width:200px"><span>بحث</span><input type="search" name="q" value="${esc(q)}" placeholder="اسم، فاعل…"></label>
      <label class="field"><span>الفاعل</span><select name="t"><option value="">الكل</option>${Object.entries(ACTOR).map(([k, l]) => `<option value="${k}" ${t === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>العملية</span><select name="a"><option value="">الكل</option>${Object.entries(ACTIONS).map(([k, [l]]) => `<option value="${k}" ${a === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="btn btn-sm btn-primary" type="submit">${icon('filter')}تصفية</button></form>
    <div class="table-wrap"><table class="t"><thead><tr><th>الوقت</th><th>الفاعل</th><th>العملية</th><th>التفاصيل</th><th>الجهاز</th><th></th></tr></thead><tbody>
    ${slice.map((r) => { const b = r.b ? JSON.parse(r.b) : {}; const canRestore = (r.a === 'delete' || r.a === 'merge') && b.batch && trash[b.batch]; const canRevert = (r.a === 'update' && r.e === 'person' && P(r.eid)) || (r.a === 'move' && b.p != null && P(r.eid));
      return `<tr><td class="num" style="white-space:nowrap"><small>${S.fmtDt(r.at)}<br><span class="muted">${S.timeAgo(r.at)}</span></small></td><td class="nm"><b>${esc(r.l)}</b><small>${ACTOR[r.t] || r.t}</small></td><td>${badgeAct(r.a)}</td>
      <td style="min-width:260px">${esc(r.s)}${diff(r)}</td><td><small>${esc(r.dev || '')}</small></td>
      <td><div class="acts">${canRestore ? `<button class="btn btn-xs btn-ok-soft" data-act="restore" data-batch="${esc(b.batch)}">${icon('undo')}استعادة</button>` : ''}${canRevert ? `<button class="btn btn-xs btn-outline" data-act="revert" data-id="${esc(r.id)}">${icon('undo')}تراجع</button>` : ''}${r.e === 'person' && r.eid != null && P(r.eid) ? `<a class="btn btn-xs btn-ghost" href="#people/${r.eid}">${icon('user')}</a>` : ''}</div></td></tr>`; }).join('') || `<tr><td colspan="6">${empty('history', 'لا توجد عمليات مطابقة')}</td></tr>`}
    </tbody></table></div>${pager(rows.length, page, per, (i) => '#log/' + i)}</section>`;
  view().__log = all;
};

/* ───────────── الزوار ───────────── */
PAGES.visitors = async (range = '30') => {
  if (!isManager()) return go('dashboard');
  setTitle('الزوار والأجهزة', 'eye');
  const days = [7, 30, 90, 365].includes(+range) ? +range : 30;
  const today = new Date(new Date().toDateString()).getTime();
  const since = today - (days - 1) * 864e5;
  const all = await listSince('visits', since);
  const real = all.filter((v) => v.d !== 'bot');
  const uniq = (arr) => new Set(arr.map((v) => v.v)).size;
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today - i * 864e5);
    const day = real.filter((v) => dayKey(v.at) === dayKey(d.getTime()));
    rows.push([`${d.getDate()}/${d.getMonth() + 1}`, uniq(day), `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} — ${uniq(day)} زائر · ${day.length} مشاهدة`]);
  }
  const hours = Array(24).fill(0);
  real.forEach((v) => { hours[new Date(v.at).getHours()]++; });
  const group = (key, map) => { const g = {}; real.forEach((v) => { const k = v[key] || 'غير معروف'; (g[k] = g[k] || new Set()).add(v.v); }); return Object.entries(g).map(([k, s]) => [map ? map(k) : k, s.size]).sort((a, b) => b[1] - a[1]).slice(0, 8); };
  const pageNames = { tree: 'الشجرة', add: 'أضف نسبك' };
  const refs = {};
  real.forEach((v) => { if (v.ref) { let h = v.ref; try { h = new URL(v.ref).host.replace(/^(www\.|m\.|l\.|lm\.)/, ''); } catch (e) { /* رابط */ } refs[h] = (refs[h] || 0) + 1; } });
  const list = real.slice().sort((a, b) => b.at - a.at).slice(0, 100);
  view().innerHTML = `<nav class="tabs">${[[7, '7 أيام'], [30, '30 يوماً'], [90, '3 أشهر'], [365, 'سنة']].map(([r, l]) => `<a href="#visitors/${r}" class="${days === r ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <section class="kpis"><div class="kpi"><span class="k-ic">${icon('globe')}</span><span>متصل الآن</span><b>${uniq(real.filter((v) => v.at > Date.now() - 5 * 6e4))}</b><small>آخر 5 دقائق</small></div>
      <div class="kpi info"><span class="k-ic">${icon('eye')}</span><span>زوار اليوم</span><b>${uniq(real.filter((v) => v.at >= today))}</b><small>زائر فريد</small></div>
      <div class="kpi gold"><span class="k-ic">${icon('users')}</span><span>زوار الفترة</span><b>${uniq(real)}</b><small>${real.length} مشاهدة · ${real.filter((v) => v.nw).length} زائر جديد</small></div>
      <div class="kpi warn"><span class="k-ic">${icon('key')}</span><span>دخلوا برمز</span><b>${uniq(real.filter((v) => v.code))}</b><small>${all.length - real.length} زيارة روبوتات مستبعدة</small></div></section>
    <div class="grid-panels c2">${panel('الزوار الفريدون يومياً', 'chart', `<div class="panel-body">${colChart(rows, 'زائر')}</div>`)}${panel('أوقات الزيارة خلال اليوم', 'clock', `<div class="panel-body">${colChart(hours.map((c, h) => [String(h).padStart(2, '0'), c, `${String(h).padStart(2, '0')}:00 — ${c} مشاهدة`]), 'مشاهدة')}</div>`)}</div>
    <div class="grid-panels c3">${panel('نوع الجهاز', 'mobile', `<div class="panel-body">${hbars(group('d', (k) => S.DEVICE_LABELS[k] || k))}</div>`)}${panel('نظام التشغيل', 'desktop', `<div class="panel-body">${hbars(group('os'))}</div>`)}${panel('المتصفح والتطبيق', 'globe', `<div class="panel-body">${hbars(group('br'))}</div>`)}
      ${panel('الصفحات', 'layers', `<div class="panel-body">${hbars(group('pg', (k) => pageNames[k] || k))}</div>`)}${panel('مصادر الزيارات', 'link', `<div class="panel-body">${hbars(Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, v, 'link']))}</div>`)}${panel('طرازات الهواتف', 'mobile', `<div class="panel-body">${hbars(group('m').filter(([k]) => k !== 'غير معروف'))}</div>`)}</div>
    ${panel('سجل الزيارات (آخر 100)', 'eye', `<div class="table-wrap"><table class="t"><thead><tr><th>الوقت</th><th>الزائر</th><th>الجهاز</th><th>النظام والمتصفح</th><th>الشاشة</th><th>الصفحة</th><th>المصدر</th></tr></thead><tbody>
      ${list.map((v) => `<tr><td class="num"><small>${S.fmtDt(v.at)}</small></td><td class="nm"><span class="mono">${esc(String(v.v).slice(0, 6))}</span><small>${v.code ? icon('key') + ' ' + esc(v.code) : v.adm ? icon('shield') + ' ' + esc(v.adm) : v.nw ? 'زائر جديد' : ''}</small></td>
        <td>${esc(S.DEVICE_LABELS[v.d] || v.d)}${v.m ? `<br><small class="muted">${esc(v.m)}</small>` : ''}</td><td><small>${esc(v.os)} · ${esc(v.br)}</small></td><td class="num"><small>${esc(v.sc || '')}</small></td><td><small>${esc(pageNames[v.pg] || v.pg)}</small></td><td><small>${esc(v.ref ? v.ref.slice(0, 40) : '—')}</small></td></tr>`).join('') || `<tr><td colspan="7">${empty('eye', 'لا توجد زيارات في هذه الفترة')}</td></tr>`}</tbody></table></div>`,
    `<button class="btn btn-xs btn-ghost" data-act="visits-clear">${icon('trash')}حذف الأقدم من 90 يوماً</button>`)}`;
};

/* ───────────── الإعدادات ───────────── */
const TABS = { general: ['عام', 'home'], clan: ['العشيرة والنسب', 'tree'], security: ['التسجيل والحماية', 'shield'], tree: ['الشجرة والألوان', 'palette'], verses: ['الآيات والزخارف', 'leaf'], maintenance: ['الصيانة', 'sliders'], system: ['النسخ الاحتياطي', 'database'] };
PAGES.settings = async (tab = 'general') => {
  if (!isManager()) return go('dashboard');
  if (!TABS[tab]) tab = 'general';
  setTitle('الإعدادات', 'sliders');
  const s = state.settings = { ...S.DEFAULTS, ...((await get(ref(db, 'settings'))).val() || {}) };
  const inp = (k, label, extra = '') => `<label class="field ${extra}"><span>${label}</span><input name="${k}" value="${esc(s[k] ?? '')}"></label>`;
  const chk = (k, label) => `<label class="check"><input type="checkbox" name="${k}" ${s[k] ? 'checked' : ''}><span>${label}</span></label>`;
  let body = '';
  if (tab === 'general') body = `<div class="form-grid">${inp('site_title', 'عنوان الموقع')}${inp('clan_name', 'اسم العشيرة')}${inp('tagline', 'الشعار التعريفي', 'full')}${inp('contact_phone', 'هاتف/واتساب الإدارة')}${inp('contact_note', 'نص التواصل')}</div>`;
  if (tab === 'clan') body = `<div class="field"><span>سلسلة الانتماء (من الأعلى إلى الأدنى)</span><div id="hRows">${(s.hierarchy || []).concat([{ label: '', value: '' }]).map((h) => `<div class="h-row"><input name="h_label" value="${esc(h.label)}" placeholder="المستوى (القبيلة، العشيرة، الفخذ…)"><input name="h_value" value="${esc(h.value)}" placeholder="الاسم"><span></span></div>`).join('')}</div></div>
    <div class="form-grid">${inp('laqab', 'ألقاب العشيرة (مفصولة بفاصلة) — تُستبعد تلقائياً من آخر الاسم', 'full')}${inp('poster_title', 'عنوان لوحة الطباعة')}${inp('poster_credits', 'سطر الإهداء أسفل اللوحة')}</div>`;
  if (tab === 'security') body = `<div class="field"><span>طريقة الإضافة</span></div><div class="radio-cards">${[['review', 'مفتوحة مع المراجعة (مقترح)', 'أي شخص يضيف نسبه، ولا يظهر قبل الاعتماد.'], ['codes', 'برموز الصلاحية فقط', 'لا يضيف إلا من لديه رمز.'], ['closed', 'مغلقة', 'إيقاف الإضافة مؤقتاً.']].map(([k, t, d]) => `<label class="radio-card"><input type="radio" name="registration_mode" value="${k}" ${s.registration_mode === k ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}</div>
    ${chk('show_added_by', 'إظهار «من أضاف» للعامة')}<div class="form-grid" style="margin-top:10px">${inp('blocked_words', 'كلمات محظورة في الأسماء (مفصولة بفاصلة)', 'full')}</div>`;
  if (tab === 'tree') body = `<label class="field"><span>التلوين الافتراضي</span><select name="default_color_mode"><option value="generation">لون لكل جيل</option><option value="classic" ${s.default_color_mode === 'classic' ? 'selected' : ''}>كلاسيكي</option><option value="house" ${s.default_color_mode === 'house' ? 'selected' : ''}>لون لكل بيت</option></select></label>
    <div class="field"><span>ألوان الأجيال بالترتيب</span><div class="color-row">${(s.gen_colors || []).map((c, i) => `<span class="color-chip"><input type="color" name="gen_colors" value="${esc(c)}"><span>${S.genOrdinal(i + 1)}</span></span>`).join('')}</div></div>
    <div class="field"><span>ألوان العناصر</span><div class="color-row">${[['color_trunk', 'ألواح الأجداد'], ['color_root', 'الجد الجامع'], ['color_leaf', 'الأوراق'], ['color_branch', 'الأغصان'], ['color_head', 'رؤوس البيوت'], ['color_son', 'الأبناء']].map(([k, l]) => `<span class="color-chip"><input type="color" name="${k}" value="${esc(s[k])}"><span>${l}</span></span>`).join('')}</div></div>
    ${chk('show_years', 'إظهار سنوات الميلاد والوفاة للعامة')}${chk('show_females', 'إظهار الإناث في الشجرة العامة')}`;
  if (tab === 'verses') body = `<div class="form-grid"><label class="field full"><span>النص الأول</span><textarea name="verse_1" rows="3" style="font-family:var(--font-quran);font-size:1.1rem">${esc(s.verse_1)}</textarea></label>${inp('verse_1_ref', 'مصدر النص الأول')}<span></span>
    <label class="field full"><span>النص الثاني</span><textarea name="verse_2" rows="3" style="font-family:var(--font-quran);font-size:1.1rem">${esc(s.verse_2)}</textarea></label>${inp('verse_2_ref', 'مصدر النص الثاني')}</div>`;
  if (tab === 'maintenance') body = `<div class="radio-cards"><label class="radio-card"><input type="radio" name="maintenance" value="0" ${!s.maintenance ? 'checked' : ''}><span><b>${icon('check')} الموقع يعمل</b><small>الزوار يرون الشجرة ويضيفون أنسابهم.</small></span></label>
    <label class="radio-card"><input type="radio" name="maintenance" value="1" ${s.maintenance ? 'checked' : ''}><span><b>${icon('lock')} وضع الصيانة</b><small>الزوار يرون صفحة «الموقع قيد الصيانة» فقط، وأنت تتصفح وتعمل كالمعتاد.</small></span></label></div>
    <label class="field"><span>رسالة الصيانة للزوار</span><textarea name="maintenance_msg" rows="2">${esc(s.maintenance_msg)}</textarea></label>${chk('track_visits', 'تسجيل إحصاءات الزوار')}`;
  if (tab === 'system') body = `<p class="muted">البيانات محفوظة في Firebase (مشروع clan-tree-halaf). يُنصح بتحميل نسخة احتياطية أسبوعياً.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary" type="button" data-act="backup">${icon('database')}نسخة كاملة (JSON)</button><button class="btn btn-outline" type="button" data-act="csv">${icon('download')}الأفراد مع النسب (CSV)</button></div>
    ${isOwner() ? `<div class="danger-zone" style="margin-top:18px"><b>تفريغ الشجرة</b><p class="muted" style="font-size:.9rem;margin:4px 0 10px">يحذف جميع الأفراد عدا الجد الأكبر، مع الطلبات. حمّل نسخة احتياطية أولاً.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="wipeConfirm" placeholder="اكتب: حذف" style="max-width:180px"><button class="btn btn-danger btn-sm" type="button" data-act="wipe">${icon('trash')}تفريغ الشجرة</button></div></div>` : ''}`;
  view().innerHTML = `<nav class="tabs">${Object.entries(TABS).map(([k, [l, ic]]) => `<a href="#settings/${k}" class="${tab === k ? 'on' : ''}">${icon(ic)}${l}</a>`).join('')}</nav>
    <form class="panel" data-form="settings" data-tab="${tab}"><div class="panel-head"><h2>${icon(TABS[tab][1])}${TABS[tab][0]}</h2></div><div class="panel-body">${body}</div>
    ${tab !== 'system' ? `<div class="save-bar"><button class="btn btn-primary" type="submit">${icon('check')}حفظ</button></div>` : ''}</form>`;
};

/* ───────────── المشرفون ───────────── */
PAGES.admins = async () => {
  setTitle(isOwner() ? 'المشرفون' : 'حسابي', 'shield');
  const list = isOwner() ? await vals('admins') : [];
  view().innerHTML = (isOwner() ? `<div class="alert alert-info">${icon('key')}<span>لوحة التحكم خاصة بك. لتعطي شخصاً صلاحية الإشراف دون لوحة التحكم، أنشئ له <a href="#codes/new/supervisor"><b>رمز مشرف</b></a>.</span></div>`
    + panel('فريق الإدارة', 'shield', `<div class="table-wrap"><table class="t"><thead><tr><th>المشرف</th><th>الدور</th><th>الحالة</th><th></th></tr></thead><tbody>${list.map((a) => { const self = a.id === state.admin.uid; return `<tr>
      <td class="nm"><b>${esc(a.name || '')}${self ? ' (أنت)' : ''}</b><small class="mono">${esc(a.email || '')}</small></td>
      <td>${self ? `<span class="badge badge-gold">${ROLES[a.role]}</span>` : `<select data-act="admin-role" data-id="${a.id}" style="min-height:32px;width:auto;font-size:.84rem">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${a.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</td>
      <td>${a.active ? '<span class="badge badge-ok">فعال</span>' : '<span class="badge badge-muted">معطّل</span>'}</td><td>${self ? '' : `<button class="btn btn-xs btn-outline" data-act="admin-toggle" data-id="${a.id}">${a.active ? 'تعطيل' : 'تفعيل'}</button>`}</td></tr>`; }).join('')}</tbody></table></div>
      <form class="panel-body form-grid" style="border-top:1px solid var(--line)" data-form="admin-add"><label class="field"><span>البريد الإلكتروني</span><input type="email" name="email" dir="ltr" required></label><label class="field"><span>الاسم الظاهر</span><input name="name" required></label>
      <label class="field"><span>الدور</span><select name="role"><option value="editor">محرر</option><option value="admin">مشرف عام</option></select></label><label class="field"><span>كلمة المرور</span><input type="password" name="password" dir="ltr" minlength="8" required></label>
      <div class="full"><button class="btn btn-primary btn-sm" type="submit">${icon('plus')}إضافة مشرف</button></div></form>`, '', 'المالك: كل شيء · المشرف العام: كل شيء عدا المشرفين · المحرر: الطلبات والأفراد والبيوت والسجل.') : '')
    + panel('حسابي — تغيير كلمة المرور', 'user', `<form class="panel-body" data-form="password"><label class="field"><span>البريد</span><input value="${esc(state.admin.email || '')}" dir="ltr" disabled></label>
      <label class="field"><span>كلمة المرور الحالية</span><input type="password" name="current" dir="ltr" required></label><label class="field"><span>كلمة المرور الجديدة</span><input type="password" name="next" dir="ltr" minlength="8" required></label>
      <button class="btn btn-primary" type="submit">${icon('check')}حفظ</button></form>`);
};

/* ───────────── الأحداث ───────────── */
const namesOf = (s) => String(s || '').split(/[،,\n]+/).map((x) => App.Names.clean(x)).filter(Boolean);
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form]');
  if (!f || !root.contains(f)) return;
  e.preventDefault();
  const kind = f.dataset.form;
  const fd = new FormData(f);
  const val = (k) => (fd.get(k) ?? '').toString().trim();
  const id = f.dataset.id ? (/^\d+$/.test(f.dataset.id) ? +f.dataset.id : f.dataset.id) : null;
  const sid = f.closest('[data-sid]') ? f.closest('[data-sid]').dataset.sid : null;
  const btn = f.querySelector('[type=submit]');
  if (btn) btn.disabled = true;
  try {
    if (kind === 'people-filter') { sessionStorage.setItem('people-filter', new URLSearchParams(fd).toString()); return go('people'); }
    if (kind === 'log-filter') { sessionStorage.setItem('log-filter', new URLSearchParams(fd).toString()); return go('log'); }
    if (kind === 'reject') { if (await run(() => S.rejectSubmission(sid, val('note')), 'تم رفض الطلب')) { await refreshCounts(); route(); } return; }
    if (kind === 'reanchor') {
      if (!val('anchor')) return toast('اختر الشخص من نتائج البحث', 'err');
      if (await run(() => S.approveSubmission(sid, +val('anchor'), +val('idx')), 'تم الربط والاعتماد')) { await refreshCounts(); route(); }
      return;
    }
    if (kind === 'people-add' || kind === 'kids-add') {
      const parent = kind === 'kids-add' ? id : (val('parent') ? +val('parent') : S.rootId());
      let n = 0;
      for (const nm of namesOf(val('names'))) { if (await run(() => S.addPerson(parent, { name: nm }))) n++; }
      if (n) toast('تمت إضافة ' + S.arCount(n, 'اسم واحد', 'اسمين', 'أسماء', 'اسماً'));
      return route();
    }
    if (kind === 'ancestor') {
      const name = App.Names.clean(val('name'));
      const err = S.nameError(name);
      if (err) return toast(err, 'err');
      const roots = [...state.map.values()].filter((p) => p.p == null);
      if (!(await App.confirm({ title: 'جد أعلى', text: `سيصبح «${name}» الجد الأكبر، وينتقل الجد الحالي وكل الشجرة تحته.`, ok: 'متابعة' }))) return;
      await run(async () => {
        const [nid] = await S.allocIds(1);
        const u = { ['persons/' + nid]: { n: name, k: App.Names.key(name), path: '/', o: 1, by: { t: 'admin', id: state.admin.uid, l: S.actor().l }, at: TS() } };
        roots.forEach((r) => { u[`persons/${r.id}/p`] = nid; u[`persons/${r.id}/path`] = '/' + nid + '/'; u[`persons/${r.id}/fl`] = null; S.descendants(r.id).forEach((d) => { u[`persons/${d}/path`] = '/' + nid + P(d).path; }); });
        auditAdmin(u, 'create', 'person', nid, `أضاف «${name}» جداً أعلى فوق «${roots.map((r) => r.n).join('، ')}»`);
        await S.commit(u);
      }, `أصبح «${name}» الجد الأكبر للشجرة`);
      return route();
    }
    if (kind === 'person-save') {
      const data = Object.fromEntries(fd);
      const hm = fd.get('house_mode') || 'auto';
      data.is_head = hm === 'on' ? 1 : 0;
      data.no_house = hm === 'off' ? 1 : 0;
      delete data.house_mode;
      data.is_deceased = fd.get('is_deceased') ? 1 : 0;
      if (hm === 'off') delete data.house_color;
      const r = await run(() => S.updatePerson(id, data));
      if (r !== false) toast(r.length ? 'تم حفظ التعديلات' : 'لا توجد تغييرات');
      return route();
    }
    if (kind === 'move' || kind === 'link') {
      if (!val('parent')) return toast('اختر الأب من نتائج البحث', 'err');
      if (await run(() => S.movePerson(id, +val('parent')), kind === 'link' ? 'تم ربط الفرع بأجداده' : 'تم النقل')) route();
      return;
    }
    if (kind === 'merge') {
      if (!val('target')) return toast('اختر الشخص من نتائج البحث', 'err');
      if (!(await App.confirm({ title: 'دمج', text: 'سيُحذف هذا الشخص وتنتقل ذريته إلى الشخص المختار.', danger: true, ok: 'دمج' }))) return;
      if (await run(() => S.mergePersons(id, +val('target')), 'تم الدمج')) go('people/' + val('target'));
      return;
    }
    if (kind === 'insert-parent') {
      const nid = await run(() => S.addAncestor(id, val('name')), 'أُضيف الاسم في السلسلة');
      if (nid) route();
      return;
    }
    if (kind === 'trunk-rename') {
      if (val('name') && App.Names.clean(val('name')) !== P(id).n && await run(() => S.updatePerson(id, { name: val('name') }), 'تم تعديل الاسم')) route();
      return;
    }
    if (kind === 'trunk-after') {
      if (await run(() => S.insertChild(id, val('name')), 'أُضيف إلى الجذع')) route();
      return;
    }
    if (kind === 'trunk-before-root') {
      if (await run(() => S.addAncestor(id, val('name')), 'أُضيف في القاع')) route();
      return;
    }
    if (kind === 'trunk-bulk') {
      const list = val('names').split(/\n+/).map((x) => App.Names.clean(x)).filter(Boolean);
      if (!list.length) return toast('اكتب اسماً واحداً على الأقل', 'err');
      const at = val('at');
      await run(async () => {
        if (at === 'below') {
          // الأحدث يصير أبا الجد الحالي، ثم الأقدم تحته
          let top = trunkChain()[0];
          for (const nm of list.slice().reverse()) top = await S.addAncestor(top, nm);
        } else {
          let cur = +at.split(':')[1];
          for (const nm of list) cur = await S.insertChild(cur, nm);
        }
      }, `أُضيف ${S.arCount(list.length, 'اسم واحد', 'اسمان', 'أسماء', 'اسماً')} إلى الجذع`);
      return route();
    }
    if (kind === 'insert-child') {
      const nid = await run(() => S.insertChild(id, val('name')), 'أُضيف الاسم في السلسلة');
      if (nid) route();
      return;
    }
    if (kind === 'delete') {
      if (+f.dataset.desc && !fd.get('with_desc')) return toast('أكّد حذف الذرية أولاً', 'err');
      if (!(await App.confirm({ title: 'حذف', text: 'يمكن الاستعادة لاحقاً من سجل العمليات.', danger: true, ok: 'حذف' }))) return;
      if (await run(() => S.deletePerson(id, true), 'تم الحذف')) go('people');
      return;
    }
    if (kind === 'house-save') {
      await run(async () => {
        let pid = id || (val('person') ? +val('person') : null);
        const newName = App.Names.clean(val('new_name'));
        if (!pid && newName) {
          const parent = val('parent') ? +val('parent') : S.rootId();
          const twin = S.kidsOf(parent).find((x) => P(x).k === App.Names.key(newName));
          pid = twin ?? await S.addPerson(parent, { name: newName });
        }
        if (!pid) throw new Error('اكتب اسم رأس البيت أو اختر شخصاً موجوداً');
        // تعديل اسم/لون بيت تلقائي لا يغيّر كونه تلقائياً؛ البيت الجديد يدوي دائماً
        const keepAuto = id && S.isAutoHouse(pid);
        await S.updatePerson(pid, { ...(keepAuto ? {} : { is_head: 1, no_house: 0 }), house_name: val('house_name') || 'بيت ' + P(pid).n, house_color: val('house_color') });
      }, 'تم حفظ البيت');
      return go('houses');
    }
    if (kind === 'code-save') await saveCode(f, fd);
    if (kind === 'settings') await saveSettings(f, fd);
    if (kind === 'admin-add') {
      await run(async () => {
        const uid = await S.createAuthUser(val('email'), val('password'));
        const u = { ['admins/' + uid]: { email: val('email'), name: val('name'), role: val('role') === 'admin' ? 'admin' : 'editor', active: true, at: Date.now() } };
        auditAdmin(u, 'admin_create', 'admin', null, `أضاف المشرف «${val('name')}»`);
        await update(ref(db), u);
      }, 'تمت إضافة المشرف');
      return route();
    }
    if (kind === 'password') { await run(() => S.changePassword(val('current'), val('next')), 'تم تغيير كلمة المرور'); f.reset(); }
  } finally { if (btn) btn.disabled = false; }
});

async function saveSettings(f, fd) {
  const tab = f.dataset.tab;
  const s = state.settings;
  const out = {};
  const pick = (keys) => keys.forEach((k) => { if (fd.has(k)) out[k] = fd.get(k).toString().trim(); });
  const bools = (keys) => keys.forEach((k) => { out[k] = !!fd.get(k); });
  if (tab === 'general') pick(['site_title', 'clan_name', 'tagline', 'contact_phone', 'contact_note']);
  if (tab === 'clan') {
    const labels = fd.getAll('h_label'), values = fd.getAll('h_value');
    out.hierarchy = labels.map((l, i) => ({ label: String(l).trim(), value: String(values[i] || '').trim() })).filter((h) => h.label || h.value);
    pick(['laqab', 'poster_title', 'poster_credits']);
  }
  if (tab === 'security') { out.registration_mode = fd.get('registration_mode') || 'review'; bools(['require_phone', 'show_added_by']); pick(['blocked_words']); }
  if (tab === 'tree') { out.default_color_mode = fd.get('default_color_mode'); out.gen_colors = fd.getAll('gen_colors'); ['color_trunk', 'color_root', 'color_leaf', 'color_branch', 'color_head', 'color_son'].forEach((k) => { out[k] = fd.get(k); }); bools(['show_years', 'show_females']); }
  if (tab === 'houses') out.house_min = Math.min(500, Math.max(2, Math.round(+fd.get('house_min') || 20)));
  if (tab === 'verses') pick(['verse_1', 'verse_1_ref', 'verse_2', 'verse_2_ref']);
  if (tab === 'maintenance') { out.maintenance = fd.get('maintenance') === '1'; pick(['maintenance_msg']); bools(['track_visits']); }
  const changed = Object.keys(out).filter((k) => JSON.stringify(out[k]) !== JSON.stringify(s[k]));
  if (!changed.length) return toast('لا توجد تغييرات');
  const u = {};
  changed.forEach((k) => { u['settings/' + k] = out[k]; });
  u['meta/srev'] = TS();
  auditAdmin(u, 'settings', 'settings', null, `عدّل الإعدادات (${(TABS[tab] || ['البيوت'])[0]}): ${changed.join('، ')}` + (tab === 'maintenance' ? (out.maintenance ? ' — تفعيل وضع الصيانة' : ' — إيقاف وضع الصيانة') : ''));
  if (await run(() => update(ref(db), u), tab === 'maintenance' ? (out.maintenance ? 'تم تفعيل وضع الصيانة' : 'الموقع يعمل الآن للجميع') : 'تم حفظ الإعدادات')) route();
}

// تعديل اسم في سلسلة الأجداد يُحفظ بمجرد الخروج من الخانة
document.addEventListener('change', (e) => {
  const f = e.target.closest('form[data-form="trunk-rename"]');
  if (f && root.contains(f)) f.requestSubmit();
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || !root.contains(b) || b.tagName === 'SELECT') return;
  const act = b.dataset.act;
  const sid = b.closest('[data-sid]') ? b.closest('[data-sid]').dataset.sid : null;
  const id = b.dataset.id ? (/^\d+$/.test(b.dataset.id) ? +b.dataset.id : b.dataset.id) : null;
  if (act === 'approve') { if (await run(() => S.approveSubmission(sid), 'تم اعتماد الطلب')) { await refreshCounts(); route(); } }
  if (act === 'approve-at') { if (await run(() => S.approveSubmission(sid, +b.dataset.anchor, +b.dataset.idx), 'تم الربط والاعتماد')) { await refreshCounts(); route(); } }
  if (act === 'approve-all') {
    if (!(await App.confirm({ title: 'اعتماد الكل', text: 'تُعتمد الطلبات بالترتيب، ويُعاد ربط كل فرع جديد بما اعتُمد قبله لمنع التكرار.', ok: 'اعتماد' }))) return;
    b.disabled = true;
    let n = 0;
    for (const s of (await S.pendingSubs()).reverse()) { if (await run(() => S.approveSubmission(s.id))) n++; }
    toast('تم اعتماد ' + S.arCount(n, 'طلب واحد', 'طلبين', 'طلبات', 'طلباً'));
    await refreshCounts(); route();
  }
  if (act === 'sugg') { if (await run(() => update(ref(db, 'suggestions/' + id), { st: b.dataset.st, rby: S.actor().l }), b.dataset.st === 'done' ? 'تم' : 'تم رفض الطلب')) { await refreshCounts(); route(); } }
  if (act === 'sugg-apply') {
    // تطبيق طلب التعديل نفسه ثم تعليمه كموافَق عليه
    const g = (await get(ref(db, 'suggestions/' + id))).val();
    const ok = await run(async () => {
      if (!g || g.pid == null || !P(g.pid)) throw new Error('الشخص غير موجود في الشجرة');
      if (g.kind === 'rename') await S.updatePerson(g.pid, { name: g.value });
      else if (g.kind === 'order') await S.placeBefore(g.pid, g.sib);
      else if (g.kind === 'edit') {
        if (g.value) await S.updatePerson(g.pid, { name: g.value });
        if (g.ord && g.op != null) await S.setOrder(g.op, String(g.ord).split(','));
      }
      await update(ref(db, 'suggestions/' + id), { st: 'done', rby: S.actor().l });
    }, 'تمت الموافقة وطُبّق التعديل');
    if (ok) { await refreshCounts(); route(); }
  }
  if (act === 'confirm-link') { if (await run(() => S.movePerson(id, +b.dataset.parent), 'تم تأكيد الربط')) route(); }
  if (act === 'make-house') { if (await run(() => S.setHouseMode(id, 'on'), 'أصبح بيتاً')) route(); }
  if (act === 'unhouse') { if (await App.confirm({ title: 'إلغاء البيت', text: `«${S.houseName(id)}» لن يبقى بيتاً، ولن يُحذف أي فرد. يمكنك إرجاعه لاحقاً.`, ok: 'إلغاء البيت' }) && await run(() => S.setHouseMode(id, 'off'), 'أُلغي البيت')) route(); }
  if (act === 'trunk-up' || act === 'trunk-down') {
    const a = act === 'trunk-up' ? id : P(id).p;
    if (a != null && await run(() => S.swapWithChild(a))) route();
    return;
  }
  if (act === 'trunk-after') {
    const f = b.closest('li').querySelector('.tr-after');
    f.hidden = !f.hidden;
    if (!f.hidden) f.querySelector('input').focus();
    return;
  }
  if (act === 'trunk-del') {
    if (!(await App.confirm({ title: `حذف «${P(id).n}» من السلسلة`, text: 'يُحذف هو وحده، ويرتبط ما بعده بما قبله. يمكن التراجع من سجل العمليات.', danger: true, ok: 'حذف' }))) return;
    if (await run(() => S.removeKeepKids(id), 'تم الحذف')) route();
    return;
  }
  if (act === 'unlink') {
    if (!(await App.confirm({ title: 'حذف وربط الأبناء', text: 'يمكن التراجع من سجل العمليات.', danger: true, ok: 'حذف' }))) return;
    const par = P(id).p;
    if (await run(() => S.removeKeepKids(id), 'تم الحذف وارتبط الأبناء بأبيه')) go('people/' + par);
    return;
  }
  if (act === 'house-auto') { if (await run(() => S.setHouseMode(id, 'auto'), 'رجع للوضع التلقائي')) route(); }
  if (act === 'code-toggle') {
    const c = (await get(ref(db, 'codes/' + id))).val();
    const u = { [`codes/${id}/active`]: !c.active };
    auditAdmin(u, 'code_update', 'code', null, `${c.active ? 'عطّل' : 'فعّل'} رمز «${c.holder}»`);
    if (await run(() => update(ref(db), u), c.active ? 'تم تعطيل الرمز' : 'تم تفعيل الرمز')) route();
  }
  if (act === 'code-regen' || act === 'code-delete') {
    const regen = act === 'code-regen';
    if (!(await App.confirm({ title: regen ? 'رمز جديد' : 'حذف الرمز', text: regen ? 'يتوقف الرمز الحالي فوراً ويُنشأ رمز جديد لنفس الشخص (ليستخدمه على جهاز جديد).' : 'يتوقف الرمز نهائياً. تبقى عملياته في السجل.', danger: !regen, ok: regen ? 'رمز جديد' : 'حذف' }))) return;
    await run(async () => {
      const c = (await get(ref(db, 'codes/' + id))).val();
      const u = { ['codes/' + id]: null, ['codes_secret/' + id]: null };
      if (regen) {
        const { uid, digits } = await makeCode(c.holder, '');
        u['codes/' + uid] = { holder: c.holder, add: true, edit: true, del: true, approve: true, active: true, at: Date.now(), logins: 0 };
        u['codes_secret/' + uid] = { code: digits };
        newCodeShown = { holder: c.holder, code: digits };
      }
      auditAdmin(u, regen ? 'code_update' : 'code_delete', 'code', null, `${regen ? 'رمز جديد لـ' : 'حذف رمز'} «${c.holder}»`);
      await update(ref(db), u);
    }, regen ? null : 'تم حذف الرمز');
    route();
  }
  if (act === 'restore') { if (await run(() => S.restoreBatch(b.dataset.batch), 'تمت الاستعادة')) route(); }
  if (act === 'revert') {
    const r = (view().__log || []).find((x) => x.id === b.dataset.id);
    if (!r || !(await App.confirm({ title: 'تراجع', text: 'التراجع عن هذه العملية؟', ok: 'تراجع' }))) return;
    const before = JSON.parse(r.b || '{}');
    await run(async () => {
      if (r.a === 'move') return S.movePerson(r.eid, before.p);
      const u = {};
      Object.entries(before).forEach(([k, v]) => { if (k === 'phone') u[`private/${r.eid}/phone`] = v; else if (k !== 'path') { u[`persons/${r.eid}/${k}`] = v; if (k === 'n') u[`persons/${r.eid}/k`] = App.Names.key(v); } });
      auditAdmin(u, 'revert', 'person', r.eid, 'تراجع عن تعديل سابق');
      await S.commit(u);
    }, 'تم التراجع');
    route();
  }
  if (act === 'admin-toggle') { const a = (await get(ref(db, 'admins/' + id))).val(); if (await run(() => update(ref(db, 'admins/' + id), { active: !a.active }), 'تم')) route(); }
  if (act === 'visits-clear') {
    if (!(await App.confirm({ title: 'تفريغ', text: 'حذف سجلات الزيارات الأقدم من 90 يوماً؟', danger: true, ok: 'حذف' }))) return;
    const snap = await get(query(ref(db, 'visits'), orderByChild('at'), limitToLast(100000)));
    const u = {};
    snap.forEach((c) => { if (c.val().at < Date.now() - 90 * 864e5) u['visits/' + c.key] = null; });
    if (await run(() => update(ref(db), u), 'تم حذف ' + Object.keys(u).length + ' زيارة')) route();
  }
  if (act === 'backup') {
    await run(async () => {
      const all = (await get(ref(db))).val();
      download(`clan-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(all, null, 1), 'application/json');
    }, 'تم تحميل النسخة');
  }
  if (act === 'csv') {
    const lines = [['الرقم', 'الاسم', 'النسب الكامل', 'الأب', 'الجيل', 'البيت', 'رأس بيت', 'الكنية', 'الميلاد', 'الوفاة', 'الأبناء', 'أضافه', 'تاريخ الإضافة']];
    state.map.forEach((p) => { const h = S.houseOf(p.id); lines.push([p.id, p.n, S.nasab(p.id, 0, true), p.p != null && P(p.p) ? P(p.p).n : '', S.depthOf(p.id), h != null ? S.houseName(h) : '', S.isHouse(p.id) ? 'نعم' : '', p.nick || '', p.b || '', p.y || '', S.kidsOf(p.id).length, p.by ? p.by.l : '', S.fmtDt(p.at)]); });
    download(`clan-people-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + lines.map((l) => l.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n'), 'text/csv');
  }
  if (act === 'wipe') {
    if ($('#wipeConfirm').value.trim() !== 'حذف') return toast('اكتب كلمة «حذف» للتأكيد', 'err');
    if (!(await App.confirm({ title: 'تفريغ الشجرة', text: 'سيتم حذف كل الأفراد عدا الجد الأكبر، مع الطلبات. لا يمكن التراجع!', danger: true, ok: 'تفريغ' }))) return;
    await run(async () => {
      const u = {};
      state.map.forEach((p) => { if (p.p != null) u['persons/' + p.id] = null; });
      (await vals('subs')).forEach((s) => { u['subs/' + s.id] = null; });
      auditAdmin(u, 'delete', 'person', null, 'تفريغ الشجرة والإبقاء على الجد الأكبر فقط');
      await S.commit(u);
    }, 'تم تفريغ الشجرة');
    route();
  }
});
document.addEventListener('change', async (e) => {
  const s = e.target.closest('[data-act="admin-role"]');
  if (s && await run(() => update(ref(db, 'admins/' + s.dataset.id), { role: s.value }), 'تم تغيير الدور')) route();
});
// تلميحات الرسوم البيانية والنسخ
const tip = document.createElement('div');
tip.className = 'chart-tip';
tip.hidden = true;
document.body.appendChild(tip);
document.addEventListener('pointerover', (e) => { const c = e.target.closest('.chart-cols .col'); if (!c) { tip.hidden = true; return; } tip.textContent = c.dataset.tip; tip.hidden = false; });
document.addEventListener('pointermove', (e) => { if (!tip.hidden) { tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 12) + 'px'; tip.style.top = (e.clientY - 36) + 'px'; } });
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]');
  if (c) App.copy(c.dataset.copy);
  const r = e.target.closest('[data-reveal]');
  if (r) { const v = r.dataset.reveal; r.dataset.reveal = r.textContent; r.textContent = v; }
});

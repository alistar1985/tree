/* ==========================================================================
   مخزن الشجرة على Firebase: الاتصال، الهوية والصلاحيات، الشجرة، الربط الذكي،
   الطلبات، رموز الصلاحية، السجل، والزوار. يحل محل خادم PHP السابق بالكامل.
   ========================================================================== */
/* global App */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, deleteUser,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential, setPersistence, inMemoryPersistence,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getDatabase, ref, get, update, push, runTransaction, serverTimestamp, query, orderByChild, startAt, limitToLast, equalTo,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { firebaseConfig } from './firebase-config.js?v=20';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export { ref, get, update, push, query, orderByChild, startAt, limitToLast, equalTo, serverTimestamp };

const Names = App.Names;
const TS = () => serverTimestamp();

/* ───────────── قراءة وكتابة خفيفة عبر REST مع ذاكرة المتصفح ─────────────
   الزوار لا يفتحون اتصالاً دائماً بقاعدة البيانات: يُقرأ رقم «نسخة البيانات» (بايتات قليلة)
   ولا تُنزَّل الشجرة إلا إذا تغيّرت منذ آخر زيارة، وإلا تُعرض من ذاكرة المتصفح. */
const DB_URL = firebaseConfig.databaseURL;
async function rest(path, opt = {}) {
  let url = `${DB_URL}/${path}.json`;
  if (auth.currentUser) url += '?auth=' + encodeURIComponent(await auth.currentUser.getIdToken());
  // القراءة تُعاد تلقائياً عند ضغط الخادم أو انقطاع الشبكة (حتى 4 محاولات بتأخير متزايد)
  const tries = opt.method ? 1 : 4;
  let r;
  for (let i = 0; i < tries; i++) {
    try {
      r = await fetch(url, { ...opt, headers: { 'Content-Type': 'application/json' } });
      if (r.ok || (r.status < 500 && r.status !== 429) || i === tries - 1) break;
    } catch (e) { if (i === tries - 1) throw e; }
    await new Promise((ok) => setTimeout(ok, 400 * 2 ** i + Math.random() * 400));
  }
  if (!r.ok) {
    const e = new Error(r.status === 401 || r.status === 403 ? 'PERMISSION_DENIED' : 'HTTP ' + r.status);
    e.code = e.message;
    throw e;
  }
  return r.json();
}
export const restGet = (path) => rest(path);
/** كتابة متعددة المسارات: بحساب (SDK) للمشرف وصاحب الرمز، وعبر REST للزائر */
export async function write(updates) {
  if (auth.currentUser) return update(ref(db), updates);
  return rest('', { method: 'PATCH', body: JSON.stringify(updates) });
}
function cacheGet(k) { try { return JSON.parse(localStorage.getItem('clan-cache-' + k) || 'null'); } catch (e) { return null; } }
function cacheSet(k, v) { try { localStorage.setItem('clan-cache-' + k, JSON.stringify(v)); } catch (e) { /* المساحة ممتلئة: نعمل بدون ذاكرة */ } }

// مفاتيح عشوائية بأسلوب Firebase (تُستخدم أيضاً كرقم سري للطلب) دون فتح اتصال
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
export function pushId() {
  let now = Date.now();
  let id = '';
  for (let i = 0; i < 8; i++) { id = PUSH_CHARS.charAt(now % 64) + id; now = Math.floor(now / 64); }
  const rnd = new Uint8Array(12);
  crypto.getRandomValues(rnd);
  rnd.forEach((b) => { id += PUSH_CHARS.charAt(b % 64); });
  return id;
}

/* ───────────── الإعدادات الافتراضية ───────────── */
export const DEFAULTS = {
  site_title: 'شجرة العشيرة', clan_name: 'العشيرة',
  hierarchy: [{ label: 'القبيلة', value: '' }, { label: 'العشيرة', value: '' }, { label: 'الفخذ', value: '' }],
  laqab: '', tagline: 'سجلّ نسب العشيرة، من الجد الأكبر إلى أصغر حفيد',
  verse_1: 'يَا أَيُّهَا النَّاسُ إِنَّا خَلَقْنَاكُم مِّن ذَكَرٍ وَأُنثَىٰ وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا ۚ إِنَّ أَكْرَمَكُمْ عِندَ اللَّهِ أَتْقَاكُمْ',
  verse_1_ref: 'سورة الحجرات: 13',
  verse_2: 'وَاتَّقُوا اللَّهَ الَّذِي تَسَاءَلُونَ بِهِ وَالْأَرْحَامَ ۚ إِنَّ اللَّهَ كَانَ عَلَيْكُمْ رَقِيبًا',
  verse_2_ref: 'سورة النساء: 1',
  registration_mode: 'review', require_phone: false, code_auto_approve: true, house_min: 20, blocked_words: '', show_females: false,
  show_years: true, show_added_by: false, default_color_mode: 'generation',
  gen_colors: ['#8fd3df', '#c0392b', '#ffffff', '#f4e7c5', '#f2b705', '#e67e22', '#8e5ea2', '#2e86c1', '#d35400', '#16a085'],
  color_trunk: '#bfe6dc', color_root: '#f3e6c4', color_head: '#e2b714', color_son: '#ffffff', color_leaf: '#2f6b1f', color_branch: '#3b2314',
  poster_title: '', poster_credits: '', contact_phone: '', contact_note: 'للاستفسار أو تصحيح الأنساب تواصل مع إدارة الشجرة.',
  track_visits: true, maintenance: false, maintenance_msg: 'نعمل على تحديث الشجرة، نعود قريباً بإذن الله.',
};

export const state = {
  settings: { ...DEFAULTS }, viewer: { type: 'public', label: 'زائر', perms: {}, scope: null }, admin: null, code: null,
  user: null, persons: null, map: null, kids: null, installed: true,
};

/* ───────────── أدوات عامة ───────────── */
export const ORD = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر'];
export const genOrdinal = (n) => ORD[n] || String(n);
export function arCount(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return n + ' ' + few;
  return n + ' ' + many;
}
export function fmtDt(ms, withTime = true) {
  if (!ms) return '—';
  const d = new Date(ms), p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}` + (withTime ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : '');
}
export function timeAgo(ms) {
  if (!ms) return '—';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60);
  if (m < 60) return 'منذ ' + arCount(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
  const h = Math.floor(m / 60);
  if (h < 24) return 'منذ ' + arCount(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
  const d = Math.floor(h / 24);
  if (d < 30) return 'منذ ' + arCount(d, 'يوم', 'يومين', 'أيام', 'يوماً');
  return fmtDt(ms, false);
}
const latin = (s) => String(s || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c));
const err = (m) => { const e = new Error(m); e.user = true; return e; };
const clean = (o) => { Object.keys(o).forEach((k) => (o[k] === undefined || o[k] === '' || o[k] === null) && delete o[k]); return o; };

export function laqabList() {
  return String(state.settings.laqab || '').split(/[،,\n]+/).map((x) => x.trim()).filter(Boolean);
}
export function hierarchy() {
  return (state.settings.hierarchy || []).filter((l) => l && String(l.value || '').trim());
}

/* ───────────── الأسماء ───────────── */
function lev(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 1) return 2;
  const d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
export function nameSim(a, b) {
  if (a === b) return 1;
  const a2 = a.replace(/^ال/, ''), b2 = b.replace(/^ال/, '');
  if (a2 === b2) return 0.9;
  if (Math.min(a2.length, b2.length) >= 5 && lev(a2, b2) <= 1) return 0.75;
  return 0;
}
export function nameError(n) {
  if (n.length < 2) return `الاسم «${n}» قصير جداً`;
  if (n.length > 30) return `الاسم «${n.slice(0, 20)}…» طويل جداً`;
  if (!/^[؀-ۿ\s]+$/.test(n)) return 'يُقبل الاسم بالحروف العربية فقط';
  const key = Names.key(n);
  for (const w of String(state.settings.blocked_words || '').split(/[،,\n]+/)) {
    const k = Names.key(w.trim());
    if (k && key.includes(k)) return `الاسم «${n}» غير مقبول`;
  }
  return null;
}
function cleanNames(list, max, label) {
  const out = (Array.isArray(list) ? list : []).map((x) => Names.clean(x)).filter(Boolean);
  for (const n of out) { const e = nameError(n); if (e) throw err(e); }
  if (out.length > max) throw err(`عدد ${label || 'الأسماء'} أكبر من المسموح (${max})`);
  return out;
}

/* ───────────── الأجهزة ───────────── */
export function uaParse(ua) {
  ua = ua || navigator.userAgent;
  const bot = /bot|crawl|spider|slurp|facebookexternalhit|WhatsApp|TelegramBot|preview|HeadlessChrome|Lighthouse/i.test(ua);
  let device = bot ? 'bot' : /iPad|Tablet|(Android(?!.*Mobile))/i.test(ua) ? 'tablet' : /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua) ? 'mobile' : 'desktop';
  let os = 'غير معروف', m;
  if ((m = ua.match(/Android\s?([\d.]+)?/i))) os = 'Android' + (m[1] ? ' ' + m[1].split('.')[0] : '');
  else if ((m = ua.match(/(iPhone|iPad|iPod).*?OS (\d+)/i))) os = 'iOS ' + m[2];
  else if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  const rules = [[/FBAN|FBAV|FB_IAB/i, 'Facebook'], [/Instagram/i, 'Instagram'], [/Snapchat/i, 'Snapchat'], [/TikTok|musical_ly/i, 'TikTok'], [/Telegram/i, 'Telegram'],
    [/Edg(A|iOS)?\//i, 'Edge'], [/OPR\/|Opera/i, 'Opera'], [/SamsungBrowser/i, 'Samsung Internet'], [/Firefox|FxiOS/i, 'Firefox'], [/CriOS|Chrome/i, 'Chrome'], [/Safari/i, 'Safari']];
  let browser = 'غير معروف';
  for (const [re, name] of rules) if (re.test(ua)) { browser = name; break; }
  let model = '';
  if ((m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/i)) && m[1].trim() !== 'K') model = m[1].trim();
  else if ((m = ua.match(/(iPhone|iPad)/))) model = m[1];
  return { device, os, browser, model, bot };
}
export const DEVICE_LABELS = { mobile: 'هاتف', tablet: 'لوحي', desktop: 'حاسبة', bot: 'روبوت' };
const devLabel = () => { const u = uaParse(); return `${u.device} · ${u.os} · ${u.browser}`; };

/* ───────────── الهوية ───────────── */
/** بيانات حساب الرمز: البريد وكلمة المرور الأولى مشتقة من الأرقام نفسها */
export async function codeEmail(code) {
  const digits = latin(code).replace(/\D/g, '');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('clan-tree:' + digits));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { email: `c${hex.slice(0, 24)}@codes.clan-tree.app`, password: 'ct-' + hex.slice(24, 44) };
}
const codeKeys = () => { try { return JSON.parse(localStorage.getItem('clan-code-keys') || '{}'); } catch (e) { return {}; } };
const saveCodeKeys = (k) => { try { localStorage.setItem('clan-code-keys', JSON.stringify(k)); } catch (e) { /* بدون تخزين */ } };

async function resolveViewer(user) {
  state.user = user;
  state.admin = null;
  state.code = null;
  if (user) {
    const a = (await get(ref(db, 'admins/' + user.uid)).catch(() => null))?.val();
    if (a && a.active) state.admin = { uid: user.uid, ...a };
    else {
      const c = (await get(ref(db, 'codes/' + user.uid)).catch(() => null))?.val();
      if (c && c.active && (!c.exp || c.exp > Date.now())) state.code = { uid: user.uid, ...c };
      else if (!a) await signOut(auth);
    }
  }
  const v = { type: 'public', label: 'زائر', perms: {}, scope: null };
  if (state.admin) {
    Object.assign(v, { type: 'admin', label: 'المشرف: ' + (state.admin.name || state.admin.email), role: state.admin.role,
      perms: { add: true, edit: true, delete: true, approve: true, merge: true } });
  } else if (state.code) {
    const c = state.code;
    Object.assign(v, { type: 'code', label: 'رمز: ' + c.holder, holder: c.holder, scope: c.scope != null && c.scope !== '' ? +c.scope : null,
      perms: { add: !!c.add, edit: !!c.edit, delete: !!c.del, approve: !!c.approve, merge: !!c.del && !!c.edit } });
  }
  state.viewer = v;
}

export function actor() {
  const v = state.viewer;
  if (v.type === 'admin') return { t: 'admin', aid: state.admin.uid, l: v.label };
  if (v.type === 'code') return { t: 'code', aid: state.code.uid, l: v.label };
  return { t: 'public', aid: null, l: 'زائر' };
}

let readyPromise = null;
/** تهيئة الصفحة: الإعدادات + هوية المستخدم. */
export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      // كل الطلبات تبدأ معاً (لا انتظار متسلسل)، والعرض يبدأ من ذاكرة المتصفح فوراً للزائر العائد
      const metaP = restGet('meta').catch(() => null);
      const authP = new Promise((resolve) => {
        const off = onAuthStateChanged(auth, async (u) => { off(); await resolveViewer(u); resolve(); });
      });
      const cm = cacheGet('meta'), cs = cacheGet('settings');
      let meta;
      if (cm && cm.installed && cs) {
        meta = cm;
        // تحقق في الخلفية: إن تغيرت البيانات تُحدَّث الشجرة والإعدادات دون إعادة تحميل
        metaP.then((m) => {
          if (!m) return;
          cacheSet('meta', m);
          if (m.srev !== cm.srev) refreshSettings(m.srev);
          if (m.rev !== state.rev) { state.rev = m.rev || 0; state.persons = null; window.dispatchEvent(new Event('clan-data')); }
        });
      } else {
        const [m, sv] = await Promise.all([metaP, restGet('settings').catch(() => null)]);
        meta = m || {};
        cacheSet('meta', meta);
        cacheSet('settings', { rev: meta.srev || 0, data: sv || {} });
      }
      state.installed = !!meta.installed;
      state.rev = meta.rev || 0;
      state.settings = { ...DEFAULTS, ...((cacheGet('settings') || {}).data || {}) };
      await authP;
      Object.assign(window.CLAN_CFG, clientConfig());
      return state;
    })();
  }
  return readyPromise;
}

export function clientConfig() {
  const s = state.settings;
  return {
    clan: s.clan_name, title: s.site_title, posterTitle: s.poster_title || s.site_title, credits: s.poster_credits,
    laqab: laqabList(), hierarchy: hierarchy(), view: 'organic', colorMode: s.default_color_mode || 'generation',
    showFemales: !!s.show_females, verses: [{ text: s.verse_1, ref: s.verse_1_ref }, { text: s.verse_2, ref: s.verse_2_ref }],
    colors: { gen: s.gen_colors, trunk: s.color_trunk, root: s.color_root, head: s.color_head, son: s.color_son, leaf: s.color_leaf, branch: s.color_branch },
    requirePhone: !!s.require_phone && state.viewer.type === 'public', viewer: state.viewer.type, holder: state.viewer.holder || null,
    registration: s.registration_mode,
  };
}

/* ───────────── الشجرة في الذاكرة ───────────── */
/** نسخة البيانات الحالية في القاعدة (بضعة بايتات) */
export async function currentRev() { return (await restGet('meta/rev').catch(() => null)) || 0; }

/** تحميل الشجرة: من ذاكرة المتصفح إن لم تتغير نسختها، وإلا من Firebase مرة واحدة */
export async function loadPersons(force) {
  if (state.persons && !force) return state.map;
  if (force) state.rev = await currentRev();
  const c = cacheGet('persons');
  let raw;
  if (c && state.rev && c.rev === state.rev && c.data) raw = c.data;
  else {
    try {
      raw = (await restGet('persons')) || {};
      cacheSet('persons', { rev: state.rev, data: raw });
    } catch (e) {
      // تعذر التحميل: نعرض آخر نسخة محفوظة بدل صفحة فارغة، ويُحدَّث لاحقاً
      if (!(c && c.data)) throw e;
      raw = c.data;
    }
  }
  return buildMap(raw);
}
/** يتحقق من تغيّر البيانات ويعيد التحميل عند الحاجة فقط — يعيد true إن تغيّرت */
export async function syncPersons() {
  const rev = await currentRev();
  if (state.persons && rev === state.rev) return false;
  state.rev = rev;
  await loadPersons(false);
  return true;
}
/** تحديث الإعدادات المحفوظة؛ وإن تغيّر وضع الصيانة يُعاد تحميل الصفحة حتى يُطبَّق فوراً */
function refreshSettings(srev) {
  return restGet('settings').then((x) => {
    cacheSet('settings', { rev: srev || 0, data: x || {} });
    if (!!(x || {}).maintenance !== !!state.settings.maintenance) window.dispatchEvent(new Event('clan-maint'));
  }).catch(() => {});
}
/** مراقبة التحديثات: يفحص نسخة البيانات كل دقيقة والصفحة ظاهرة */
export function watchRev(onChange, every = 60000) {
  const check = async () => {
    if (document.visibilityState !== 'visible') return;
    const m = await restGet('meta').catch(() => null);
    if (!m) return;
    const cm = cacheGet('meta') || {};
    if (m.srev && m.srev !== cm.srev) { cacheSet('meta', m); refreshSettings(m.srev); }
    if (m.rev && m.rev !== state.rev) { state.rev = m.rev; state.persons = null; onChange(); }
  };
  setInterval(check, every);
  document.addEventListener('visibilitychange', check);
}
function buildMap(raw) {
  const map = new Map();
  // Firebase يعيد الأرقام المتتالية كمصفوفة أولها فارغ، فنتجاهل الخانات الفارغة
  Object.keys(raw).forEach((k) => { const r = raw[k]; if (r) map.set(+k, { id: +k, ...r, p: r.p == null ? null : +r.p }); });
  const kids = new Map();
  map.forEach((p) => { if (p.p != null && map.has(p.p)) { if (!kids.has(p.p)) kids.set(p.p, []); kids.get(p.p).push(p.id); } });
  kids.forEach((list) => list.sort((a, b) => (map.get(a).o || 0) - (map.get(b).o || 0) || a - b));
  state.persons = raw;
  state.map = map;
  state.kids = kids;
  return map;
}
export const P = (id) => state.map.get(+id);
export const kidsOf = (id) => state.kids.get(+id) || [];
export function lineage(id) {
  const out = [];
  let x = P(id), g = 0;
  while (x && g++ < 400) { out.push(x.id); x = x.p != null ? P(x.p) : null; }
  return out;
}
export function nasab(id, max = 0, withLaqab = false) {
  let ids = lineage(id);
  if (max) ids = ids.slice(0, max);
  let s = ids.map((x) => P(x).n).join(' ');
  if (withLaqab && laqabList()[0]) s += ' ' + laqabList()[0];
  return s;
}
export const depthOf = (id) => lineage(id).length;
export function descendants(id) {
  const out = [], st = [...kidsOf(id)];
  while (st.length) { const x = st.pop(); out.push(x); st.push(...kidsOf(x)); }
  return out;
}
/* ───────────── البيوت التلقائية ─────────────
   كل من ذريته (house_min، افتراضياً 20) فأكثر يصير بيتاً تلقائياً (موسى، جعفر…)، إلا الجذر، وإلا الابن الوحيد لبيت
   (لأن بيت أبيه يغطيه). المالك يتحكم بكل شخص: head = بيت دائماً، nh = ليس بيتاً أبداً. */
let houseCache = null;
function houseSet() {
  const min = Math.max(2, +state.settings.house_min || 20);
  if (houseCache && houseCache.map === state.map && houseCache.min === min) return houseCache.set;
  const set = new Set(), desc = new Map();
  const order = [];
  const st = [...state.map.values()].filter((p) => p.p == null || !state.map.has(p.p)).map((p) => p.id);
  while (st.length) { const x = st.pop(); order.push(x); st.push(...kidsOf(x)); }
  for (let i = order.length - 1; i >= 0; i--) desc.set(order[i], kidsOf(order[i]).reduce((n, k) => n + 1 + (desc.get(k) || 0), 0));
  order.forEach((id) => {
    const p = P(id);
    if (p.head) { set.add(id); return; }
    if (p.nh || p.g === 'f' || p.p == null || !state.map.has(p.p)) return;
    if (desc.get(id) + 1 < min) return;
    if (set.has(p.p) && kidsOf(p.p).length === 1) return;
    set.add(id);
  });
  houseCache = { map: state.map, min, set, desc };
  return set;
}
export const isHouse = (id) => houseSet().has(+id);
/** بيت تلقائي (لم يحدده المالك يدوياً) */
export const isAutoHouse = (id) => isHouse(id) && !P(id).head;
export const descCount = (id) => { houseSet(); return houseCache.desc.get(+id) || 0; };
export const houseList = () => [...houseSet()].filter((id) => P(id));
/** وضع البيت لشخص: on = بيت دائماً، off = ليس بيتاً، auto = حسب عدد ذريته */
export async function setHouseMode(id, mode) {
  if (mode === 'on') return updatePerson(id, { is_head: 1, no_house: 0 });
  if (mode === 'off') return updatePerson(id, { is_head: 0, no_house: 1 });
  return updatePerson(id, { is_head: 0, no_house: 0 });
}
export function houseOf(id) { return lineage(id).find((x) => isHouse(x)) ?? null; }
export const houseName = (id) => P(id).house || 'بيت ' + P(id).n;
export function rootId() {
  let r = null;
  state.map.forEach((p) => { if (p.p == null && (r === null || p.id < r)) r = p.id; });
  return r;
}
export function inScope(id, scope) {
  if (scope == null) return true;
  return lineage(id).includes(+scope);
}
const pathOf = (id) => (P(id) ? P(id).path : null);
function childByKey(parent, key, extra) {
  const ids = [...kidsOf(parent), ...((extra && extra.get(parent)) || [])];
  return ids.find((x) => (P(x) || (extra && extra.rec && extra.rec.get(x)))?.k === key) ?? null;
}

export function compact(p) {
  const o = { i: p.id, p: p.p, n: p.n };
  if (isHouse(p.id)) { o.h = p.house || 'بيت ' + p.n; if (p.hc) o.c = p.hc; }
  if (p.dead) o.d = 1;
  if (p.g === 'f') o.g = 'f';
  if (p.nick) o.k = p.nick;
  if (p.fl) o.u = 1;
  if (state.settings.show_years) { if (p.b) o.b = p.b; if (p.y) o.y = p.y; }
  return o;
}

/* ───────────── الصلاحيات ───────────── */
export function can(perm, id) {
  const v = state.viewer;
  if (v.type === 'admin') return true;
  if (v.type !== 'code' || id == null || !P(id)) return false;
  const need = { add: 'add', edit: 'edit', move: 'edit', reorder: 'edit', delete: 'del', approve: 'approve' }[perm];
  if (!need || !state.code[need]) return false;
  if (!inScope(id, v.scope)) return false;
  if ((perm === 'delete' || perm === 'move') && v.scope != null && +id === v.scope) return false;
  return true;
}

/* ───────────── الكتابة ───────────── */
export async function allocIds(n) {
  const r = await runTransaction(ref(db, 'meta/seq'), (cur) => (cur || 1) + n);
  if (!r.committed) throw err('تعذر حجز أرقام جديدة، أعد المحاولة');
  const end = r.snapshot.val();
  return Array.from({ length: n }, (_, i) => end - n + 1 + i);
}
export function auditEntry(updates, a, action, entity, eid, summary, before, after) {
  const key = pushId();
  updates['audit/' + key] = clean({ t: a.t, aid: a.aid || undefined, l: a.l, a: action, e: entity, eid: eid ?? undefined, s: summary,
    b: before ? JSON.stringify(before).slice(0, 4000) : undefined, af: after ? JSON.stringify(after).slice(0, 4000) : undefined, dev: devLabel(), at: TS() });
}
/** حفظ تغييرات الشجرة مع رفع نسخة البيانات حتى تتحدث ذاكرة المتصفح عند الجميع */
export async function commit(updates) {
  updates['meta/rev'] = TS();
  await write(updates);
  await loadPersons(true);
}
const lite = (a) => ({ t: a.t, id: a.aid || '', l: a.l });

function newRecord(id, parent, fields, a, order, parentPath) {
  const r = clean({ n: fields.name, k: Names.key(fields.name), path: parent == null ? '/' : parentPath + parent + '/', o: order, by: lite(a), at: TS(),
    nick: fields.nickname || undefined, g: fields.gender === 'f' ? 'f' : undefined, head: fields.is_head ? true : undefined, house: fields.house_name || undefined,
    hc: fields.house_color || undefined, b: fields.birth_year ? +fields.birth_year : undefined, dead: fields.is_deceased ? true : undefined, fl: fields.floating ? true : undefined });
  if (parent != null) r.p = +parent;
  return r;
}
const nextOrder = (parent, extra = 0) => kidsOf(parent).reduce((m, x) => Math.max(m, P(x).o || 0), 0) + 1 + extra;

export async function addPerson(parent, fields) {
  await loadPersons();
  const name = Names.clean(fields.name || '');
  const e = nameError(name);
  if (e) throw err(e);
  if (parent != null) {
    if (!P(parent)) throw err('الأب غير موجود');
    if (P(parent).g === 'f') throw err('الشجرة أبوية: لا يُضاف أبناء تحت الإناث');
    if (childByKey(parent, Names.key(name)) != null) throw err(`يوجد ابن بالاسم «${name}» تحت هذا الأب مسبقاً`);
  }
  if (!can('add', parent) && state.viewer.type !== 'admin') throw err('لا تملك صلاحية الإضافة هنا');
  const [id] = await allocIds(1);
  const a = actor();
  const u = {};
  u['persons/' + id] = newRecord(id, parent, { ...fields, name }, a, nextOrder(parent), parent != null ? pathOf(parent) : null);
  auditEntry(u, a, 'create', 'person', id, parent != null ? `أضاف «${name}» ابناً لـ «${P(parent).n}»` : `أضاف «${name}» جذراً للشجرة`);
  await commit(u);
  return id;
}

const FIELD_MAP = { name: 'n', nickname: 'nick', gender: 'g', is_head: 'head', no_house: 'nh', house_name: 'house', house_color: 'hc', birth_year: 'b', death_year: 'y', is_deceased: 'dead', bio: 'bio', sort_order: 'o' };
export const FIELD_LABELS = { n: 'الاسم', nick: 'الكنية/اللقب', g: 'الجنس', head: 'رأس بيت', nh: 'إلغاء البيت التلقائي', house: 'اسم البيت', hc: 'لون البيت', b: 'سنة الميلاد', y: 'سنة الوفاة', dead: 'متوفى', bio: 'نبذة', o: 'الترتيب', p: 'الأب', phone: 'الهاتف', path: 'المسار' };

export async function updatePerson(id, fields) {
  await loadPersons();
  const p = P(id);
  if (!p) throw err('الشخص غير موجود');
  if (!can('edit', id)) throw err('لا تملك صلاحية التعديل هنا');
  const u = {}, before = {}, after = {};
  for (const [api, key] of Object.entries(FIELD_MAP)) {
    if (!(api in fields)) continue;
    let v = fields[api];
    if (key === 'n') {
      v = Names.clean(v);
      const e = nameError(v);
      if (e) throw err(e);
      if (v !== p.n && p.p != null && kidsOf(p.p).some((x) => x !== p.id && P(x).k === Names.key(v))) throw err(`يوجد أخ بالاسم «${v}» مسبقاً`);
    } else if (key === 'head' || key === 'dead' || key === 'nh') v = !!(+v || v === true) || null;
    else if (key === 'g') v = v === 'f' ? 'f' : null;
    else if (key === 'b' || key === 'y') {
      v = latin(v).trim();
      if (v === '') v = null;
      else if (!/^\d{3,4}$/.test(v) || +v > new Date().getFullYear() + 1) throw err('سنة غير صحيحة: ' + v);
      else v = +v;
    } else if (key === 'hc') v = /^#[0-9a-f]{6}$/i.test(v || '') ? v : null;
    else if (key === 'o') v = +v || 0;
    else { v = String(v || '').trim().slice(0, key === 'bio' ? 1000 : 80); if (!v) v = null; }
    if (key === 'g' && v === 'f' && kidsOf(id).length) throw err('لا يمكن تحويل شخص له أبناء إلى أنثى');
    if ((p[key] ?? null) !== v) {
      before[key] = p[key] ?? null;
      after[key] = v;
      u[`persons/${id}/${key}`] = v;
      if (key === 'n') u[`persons/${id}/k`] = Names.key(v);
    }
  }
  if ('phone' in fields && state.viewer.type === 'admin') {
    const cur = (await get(ref(db, 'private/' + id + '/phone'))).val() || null;
    const ph = latin(fields.phone).replace(/[^\d+]/g, '').slice(0, 20) || null;
    if (cur !== ph) { u[`private/${id}/phone`] = ph; before.phone = cur; after.phone = ph; }
  }
  if (!Object.keys(after).length) return [];
  const a = actor();
  u[`persons/${id}/ub`] = { l: a.l, at: TS() };
  auditEntry(u, a, 'update', 'person', id, `عدّل «${p.n}»: ` + Object.keys(after).map((k) => FIELD_LABELS[k] || k).join('، '), before, after);
  await commit(u);
  return Object.keys(after);
}

/** تحديث مسارات شخص وذريته عند نقله تحت أب جديد */
function movePaths(u, id, newParent, newParentPath) {
  const p = P(id);
  const oldPrefix = p.path + id + '/';
  const newPath = newParentPath + newParent + '/';
  const newPrefix = newPath + id + '/';
  u[`persons/${id}/p`] = +newParent;
  u[`persons/${id}/path`] = newPath;
  descendants(id).forEach((d) => { u[`persons/${d}/path`] = P(d).path.replace(oldPrefix, newPrefix); });
}

export async function movePerson(id, newParent) {
  await loadPersons();
  const p = P(id), np = P(newParent);
  if (!p || !np) throw err('الشخص أو الأب الجديد غير موجود');
  if (+id === +newParent) throw err('لا يمكن نقل الشخص تحت نفسه');
  if (np.g === 'f') throw err('لا يُضاف أبناء تحت الإناث');
  if (lineage(newParent).includes(+id)) throw err('لا يمكن نقل الشخص تحت أحد أحفاده');
  if (!can('move', id) || !can('add', newParent)) throw err('لا تملك صلاحية النقل هنا');
  const a = actor();
  const u = {};
  if (p.p === +newParent) {
    if (!p.fl) return;
    u[`persons/${id}/fl`] = null;
    auditEntry(u, a, 'move', 'person', id, `أكّد ربط فرع «${p.n}» ابناً لـ «${np.n}»`);
    return commit(u);
  }
  if (kidsOf(newParent).some((x) => P(x).k === p.k)) throw err(`يوجد تحت «${np.n}» ابن بالاسم نفسه — استخدم الدمج بدلاً من النقل`);
  const old = p.p != null ? P(p.p) : null;
  movePaths(u, id, newParent, np.path);
  u[`persons/${id}/o`] = nextOrder(newParent);
  u[`persons/${id}/fl`] = null;
  u[`persons/${id}/ub`] = { l: a.l, at: TS() };
  auditEntry(u, a, 'move', 'person', id, `نقل «${p.n}» من «${old ? old.n : '—'}» إلى «${np.n}»`, { p: p.p, parent: old ? old.n : null }, { p: +newParent, parent: np.n });
  await commit(u);
}

function trashOf(ids) {
  const persons = {};
  ids.forEach((x) => { persons[x] = state.persons[x]; });
  return persons;
}

/** دمج مكرر في الصحيح: تنتقل الذرية (ويُدمج المتشابه منها) ثم يُحذف المكرر */
function mergeInto(u, src, dst, batchPersons) {
  const s = P(src), d = P(dst);
  for (const k of ['nick', 'b', 'y', 'bio', 'house', 'hc']) if ((d[k] == null || d[k] === '') && s[k] != null && s[k] !== '') u[`persons/${dst}/${k}`] = s[k];
  if (s.head && !d.head) u[`persons/${dst}/head`] = true;
  if (s.dead) u[`persons/${dst}/dead`] = true;
  let order = nextOrder(dst);
  for (const c of kidsOf(src)) {
    const twin = kidsOf(dst).find((x) => P(x).k === P(c).k);
    if (twin != null) mergeInto(u, c, twin, batchPersons);
    else { movePaths(u, c, dst, d.path); u[`persons/${c}/o`] = order++; }
  }
  batchPersons[src] = state.persons[src];
  u['persons/' + src] = null;
}
export async function mergePersons(src, dst) {
  await loadPersons();
  if (!P(src) || !P(dst) || +src === +dst) throw err('اختيار غير صحيح للدمج');
  if (lineage(dst).includes(+src)) throw err('لا يمكن الدمج في أحد أحفاد الشخص نفسه');
  if (!can('delete', src) || !can('edit', dst)) throw err('لا تملك صلاحية الدمج هنا');
  const a = actor();
  const u = {}, batch = {};
  const label = `دمج «${nasab(src, 3)}» في «${nasab(dst, 3)}»`;
  mergeInto(u, +src, +dst, batch);
  const tk = pushId();
  u['trash/' + tk] = { kind: 'merge', at: TS(), by: a.l, root: +src, persons: batch };
  auditEntry(u, a, 'merge', 'person', +dst, label, { batch: tk });
  await commit(u);
}

export async function deletePerson(id, withDesc) {
  await loadPersons();
  const p = P(id);
  if (!p) throw err('الشخص غير موجود');
  if (!can('delete', id)) throw err('لا تملك صلاحية الحذف هنا');
  const desc = descendants(id);
  if (desc.length && !withDesc) throw err('لهذا الشخص أبناء؛ اختر حذفه مع ذريته أو انقل أبناءه أولاً');
  const a = actor();
  const ids = [+id, ...desc];
  const u = {};
  const tk = pushId();
  u['trash/' + tk] = { kind: 'delete', at: TS(), by: a.l, root: +id, persons: trashOf(ids) };
  ids.forEach((x) => { u['persons/' + x] = null; });
  auditEntry(u, a, 'delete', 'person', +id, `حذف «${nasab(id, 3)}»` + (desc.length ? ' مع ' + arCount(desc.length, 'فرد واحد', 'فردين', 'أفراد', 'فرداً') + ' من ذريته' : ''), { batch: tk, count: ids.length });
  await commit(u);
  return ids.length;
}

/** حذف اسم من وسط السلسلة (مثلاً اسم خطأ) مع إبقاء أبنائه: يرتبطون بأبيه مباشرة في مكانه */
export async function removeKeepKids(id) {
  await loadPersons();
  const p = P(id);
  if (!p) throw err('الشخص غير موجود');
  if (!can('delete', id)) throw err('لا تملك صلاحية الحذف هنا');
  if (p.p == null || !P(p.p)) return removeRoot(id);
  const kids = kidsOf(id), par = P(p.p);
  const clash = kids.filter((k) => kidsOf(par.id).some((x) => x !== +id && P(x).k === P(k).k));
  if (clash.length) throw err(`لا يمكن الربط: «${par.n}» عنده ابن باسم ${clash.map((k) => '«' + P(k).n + '»').join('، ')} — ادمجهما أولاً`);
  const a = actor();
  const u = {};
  const tk = pushId();
  u['trash/' + tk] = clean({ kind: 'unlink', at: TS(), by: a.l, root: +id, persons: trashOf([+id]), kids: kids.length ? kids : undefined });
  kids.forEach((k) => movePaths(u, k, par.id, par.path));
  // الأبناء يأخذون مكان أبيهم المحذوف في ترتيب الإخوة
  const order = kidsOf(par.id).flatMap((x) => (x === +id ? kids : [x]));
  order.forEach((x, i) => { u[`persons/${x}/o`] = i + 1; });
  u['persons/' + id] = null;
  auditEntry(u, a, 'delete', 'person', +id, `حذف «${nasab(id, 3)}» من السلسلة` + (kids.length ? ` وربط أبناءه (${kids.map((k) => P(k).n).join('، ')}) بـ «${par.n}»` : ''), { batch: tk, count: 1 });
  await commit(u);
}

/** تبديل مكان جد مع ابنه الوحيد في سلسلة الجذع: يصعد الأب درجة وينزل الابن درجة، وتبقى بقية السلسلة كما هي */
export async function swapWithChild(id) {
  await loadPersons();
  const a = P(id);
  if (!a) throw err('الشخص غير موجود');
  const ks = kidsOf(id);
  if (ks.length !== 1) throw err('يمكن تبديل المكان فقط مع ابن وحيد في السلسلة');
  if (!can('move', id)) throw err('لا تملك صلاحية التعديل هنا');
  const b = P(ks[0]);
  const rest = kidsOf(b.id);
  const act = actor();
  const u = {};
  // B يأخذ مكان A، ثم A تحت B، ثم أبناء B تحت A
  const gp = a.p != null && P(a.p) ? a.p : null;
  const basePath = a.path; // مسار A الحالي = مسار B الجديد
  u[`persons/${b.id}/p`] = gp;
  u[`persons/${b.id}/path`] = basePath;
  u[`persons/${b.id}/o`] = a.o || 1;
  u[`persons/${id}/p`] = b.id;
  u[`persons/${id}/path`] = basePath + b.id + '/';
  u[`persons/${id}/o`] = 1;
  const aPath = basePath + b.id + '/' + id + '/';
  rest.forEach((k) => {
    u[`persons/${k}/p`] = +id;
    const oldPrefix = P(k).path; // = basePath + A + '/' + B + '/'
    u[`persons/${k}/path`] = aPath;
    descendants(k).forEach((d) => { u[`persons/${d}/path`] = aPath + P(d).path.slice(oldPrefix.length); });
  });
  auditEntry(u, act, 'move', 'person', +id, `بدّل مكان «${a.n}» و«${b.n}» في سلسلة الأجداد`);
  await commit(u);
}

/** حذف أعلى جد إذا كان له ابن واحد: يصير ابنه هو أعلى جد */
async function removeRoot(id) {
  const p = P(id), kids = kidsOf(id);
  if (kids.length !== 1) throw err('أعلى جد له أكثر من ابن (أو لا أبناء له)؛ لا يمكن حذفه وحده');
  const k = kids[0];
  const a = actor();
  const u = {};
  const tk = pushId();
  u['trash/' + tk] = { kind: 'unlink', at: TS(), by: a.l, root: +id, persons: trashOf([+id]), kids: [k] };
  const oldPrefix = p.path + id + '/';
  u[`persons/${k}/p`] = null;
  u[`persons/${k}/path`] = '/';
  descendants(k).forEach((d) => { u[`persons/${d}/path`] = '/' + P(d).path.slice(oldPrefix.length); });
  u['persons/' + id] = null;
  auditEntry(u, a, 'delete', 'person', +id, `حذف الجد «${p.n}» فصار «${P(k).n}» أعلى جد`, { batch: tk, count: 1 });
  await commit(u);
}

/** إضافة اسم ناقص في وسط السلسلة: بين الشخص وأبيه، فتكتمل السلسلة دون كسرها */
export async function insertParent(id, name) {
  await loadPersons();
  const p = P(id);
  if (!p) throw err('الشخص غير موجود');
  if (p.p == null || !P(p.p)) throw err('هذا أعلى جد؛ أضف جداً أعلى من لوحة التحكم ← الأشخاص');
  name = Names.clean(name || '');
  const e = nameError(name);
  if (e) throw err(e);
  const par = P(p.p);
  if (childByKey(par.id, Names.key(name)) != null) throw err(`«${par.n}» عنده ابن باسم «${name}» مسبقاً — انقل «${p.n}» تحته بدل الإضافة`);
  if (!can('add', par.id) || !can('move', id)) throw err('لا تملك صلاحية الإضافة هنا');
  const [nid] = await allocIds(1);
  const a = actor();
  const u = {};
  u['persons/' + nid] = newRecord(nid, par.id, { name }, a, p.o || nextOrder(par.id), par.path);
  movePaths(u, id, nid, par.path + par.id + '/');
  u[`persons/${id}/o`] = 1;
  u[`persons/${id}/fl`] = null;
  auditEntry(u, a, 'create', 'person', nid, `أضاف «${name}» في السلسلة بين «${par.n}» وابنه «${p.n}»`);
  await commit(u);
  return nid;
}

/** إضافة اسم قبل الشخص (أبوه): إن كان أعلى جد صار الاسم الجديد جداً أعلى، وإلا أُضيف بينه وبين أبيه */
export async function addAncestor(id, name) {
  await loadPersons();
  const p = P(id);
  if (!p) throw err('الشخص غير موجود');
  if (p.p != null && P(p.p)) return insertParent(id, name);
  name = Names.clean(name || '');
  const e = nameError(name);
  if (e) throw err(e);
  if (state.viewer.type !== 'admin' && !can('move', id)) throw err('لا تملك صلاحية الإضافة هنا');
  const [nid] = await allocIds(1);
  const a = actor();
  const u = {};
  u['persons/' + nid] = newRecord(nid, null, { name }, a, 1, null);
  movePaths(u, id, nid, '/');
  u[`persons/${id}/fl`] = null;
  auditEntry(u, a, 'create', 'person', nid, `أضاف «${name}» جداً أعلى فوق «${p.n}»`);
  await commit(u);
  return nid;
}

/** إضافة اسم بعد الشخص: يصير ابنه، وينتقل أبناؤه الحاليون تحت الاسم الجديد فتكتمل السلسلة */
export async function insertChild(id, name) {
  await loadPersons();
  const p = P(id);
  if (!p) throw err('الشخص غير موجود');
  if (p.g === 'f') throw err('الشجرة أبوية: لا يُضاف أبناء تحت الإناث');
  name = Names.clean(name || '');
  const e = nameError(name);
  if (e) throw err(e);
  if (!can('add', id)) throw err('لا تملك صلاحية الإضافة هنا');
  const kids = kidsOf(id);
  const [nid] = await allocIds(1);
  const a = actor();
  const u = {};
  u['persons/' + nid] = newRecord(nid, id, { name }, a, 1, p.path);
  kids.forEach((k) => movePaths(u, k, nid, p.path + id + '/'));
  auditEntry(u, a, 'create', 'person', nid, kids.length ? `أضاف «${name}» في السلسلة بين «${p.n}» وأبنائه (${kids.map((k) => P(k).n).join('، ')})` : `أضاف «${name}» ابناً لـ «${p.n}»`);
  await commit(u);
  return nid;
}

export async function restoreBatch(tk) {
  await loadPersons();
  const t = (await get(ref(db, 'trash/' + tk))).val();
  if (!t || !t.persons) throw err('لا توجد عناصر لاستعادتها');
  const top = t.persons[t.root];
  if (top.p != null && !P(top.p)) throw err('لا يمكن الاستعادة: الأب محذوف أيضاً — استعد الأب أولاً');
  const kids = (t.kids || []).filter((k) => P(k));
  if (top.p != null && kidsOf(top.p).some((x) => !kids.includes(x) && P(x).k === top.k)) throw err('لا يمكن الاستعادة: يوجد شخص بالاسم نفسه في الموقع ذاته');
  const a = actor();
  const u = {};
  Object.entries(t.persons).forEach(([k, v]) => { if (v) u['persons/' + k] = v; }); // تجاهل الخانات الفارغة حتى لا يُحذف أحد
  kids.forEach((k) => movePaths(u, k, t.root, top.path)); // حذف من وسط السلسلة: يرجع أبناؤه تحته
  u['trash/' + tk] = null;
  auditEntry(u, a, 'restore', 'person', t.root, `استعاد «${top.n}»` + (Object.values(t.persons).filter(Boolean).length > 1 ? ' مع ' + (Object.values(t.persons).filter(Boolean).length - 1) + ' من ذريته' : ''));
  await commit(u);
  return Object.values(t.persons).filter(Boolean).length;
}

/** وضع الشخص قبل أخيه في الترتيب (أي أكبر منه) */
export async function placeBefore(id, sib) {
  await loadPersons();
  const p = P(id);
  if (!p || !P(sib) || P(sib).p !== p.p) throw err('الأخ غير موجود');
  if (!can('reorder', id)) throw err('لا تملك صلاحية الترتيب هنا');
  const ids = kidsOf(p.p).filter((x) => x !== +id);
  ids.splice(ids.indexOf(+sib), 0, +id);
  const u = {};
  ids.forEach((x, i) => { u[`persons/${x}/o`] = i + 1; });
  auditEntry(u, actor(), 'reorder', 'person', +id, `جعل «${p.n}» أكبر من أخيه «${P(sib).n}»`);
  await commit(u);
}

/** يرتب أبناء الأب حسب القائمة (من الأكبر)، ومن لم يرد فيها يبقى بعدهم بترتيبه الحالي */
export async function setOrder(parent, list) {
  await loadPersons();
  const cur = kidsOf(parent);
  if (!cur.length) throw err('لا يوجد أبناء لترتيبهم');
  if (!can('reorder', cur[0])) throw err('لا تملك صلاحية الترتيب هنا');
  const ids = list.map(Number).filter((x, i, a) => cur.includes(x) && a.indexOf(x) === i);
  cur.forEach((x) => { if (!ids.includes(x)) ids.push(x); });
  const u = {};
  ids.forEach((x, i) => { u[`persons/${x}/o`] = i + 1; });
  auditEntry(u, actor(), 'reorder', 'person', +parent, `رتّب أبناء «${P(parent) ? P(parent).n : ''}»: ${ids.map((x) => P(x).n).join('، ')}`);
  await commit(u);
}

export async function reorderPerson(id, dir) {
  await loadPersons();
  const p = P(id);
  if (!p || p.p == null) return;
  if (!can('reorder', id)) throw err('لا تملك صلاحية الترتيب هنا');
  const ids = [...kidsOf(p.p)];
  const pos = ids.indexOf(+id), to = dir === 'up' ? pos - 1 : pos + 1;
  if (pos < 0 || to < 0 || to >= ids.length) return;
  [ids[pos], ids[to]] = [ids[to], ids[pos]];
  const u = {};
  ids.forEach((x, i) => { u[`persons/${x}/o`] = i + 1; });
  auditEntry(u, actor(), 'reorder', 'person', +id, `غيّر ترتيب «${p.n}» بين إخوته`);
  await commit(u);
}

/* ───────────── الربط الذكي ───────────── */
export function matchChain(names, limit = 5) {
  const keys = names.map(Names.key);
  const m = keys.length;
  if (!m) return [];
  const map = state.map;
  let cands = [];
  map.forEach((p, id) => {
    for (let i = 0; i < m; i++) {
      const s0 = nameSim(p.k, keys[i]);
      if (s0 <= 0) continue;
      const matched = [{ id, idx: i, sim: s0 }];
      let score = s0, j = i + 1, cur = id, conflict = null, upward = false, skips = 0;
      while (j < m) {
        if (P(cur).fl) { upward = true; break; } // فرع غير مربوط: الأسماء الأقدم أجداده
        const a = P(cur).p;
        if (a == null || !P(a)) break;
        const s = nameSim(P(a).k, keys[j]);
        if (s <= 0) {
          // جد موجود في الشجرة لم يذكره صاحب النسب (مثل اسم أُضيف لاحقاً في وسط السلسلة): نتخطاه
          // إن كان الاسم التالي في نسبه هو أبو هذا الجد، فيبقى الربط صحيحاً
          const g = P(a).p;
          if (matched.length >= 2 && skips < 2 && g != null && P(g) && nameSim(P(g).k, keys[j]) > 0) { cur = a; skips++; score -= 0.3; continue; }
          conflict = { idx: j, given: names[j], found: P(a).n };
          break;
        }
        matched.push({ id: a, idx: j, sim: s });
        score += s; j++; cur = a;
      }
      const count = matched.length, chainDone = j >= m, rootReached = !chainDone && !conflict && !upward;
      if (conflict && count < 3) continue;
      if (count === 1 && !chainDone && !rootReached && !upward) continue;
      if (chainDone) score += 0.5;
      if (rootReached) score += 0.2;
      if (upward) score += 0.3;
      if (conflict) score -= 1.5;
      cands.push({ anchor_id: id, anchor_index: i, matched, score, conflict, extra: rootReached ? names.slice(j) : [], above: upward ? names.slice(j) : [], top: upward ? cur : null });
    }
  });
  const covered = new Set();
  cands.forEach((c) => c.matched.slice(1).forEach((mm) => covered.add(mm.id + ':' + mm.idx)));
  cands = cands.filter((c) => !covered.has(c.anchor_id + ':' + c.anchor_index));
  cands.sort((x, y) => (Math.abs(x.score - y.score) > 0.001 ? y.score - x.score : x.anchor_index - y.anchor_index));
  const top = cands.length ? cands[0].score : 0;
  return cands.slice(0, limit).map((c) => {
    const count = c.matched.length;
    const coverage = (c.anchor_index + count) / Math.max(1, m);
    let conf = c.above.length
      ? Math.min(88, 100 * Math.min(1, c.score / (count + 0.5)) * 0.95)
      : 100 * Math.min(1, c.score / Math.max(1, m - c.anchor_index + 0.5)) * (0.55 + 0.45 * coverage);
    if (c.conflict) conf *= 0.6;
    const rootTail = P(c.anchor_id).p == null && c.anchor_index === m - 1;
    if (count === 1) conf = rootTail ? Math.max(conf, 70) : Math.min(conf, 35);
    const h = houseOf(c.anchor_id);
    return {
      anchor_id: c.anchor_id, anchor_index: c.anchor_index, confidence: Math.round(Math.max(5, Math.min(99, conf))), best: Math.abs(c.score - top) < 0.001,
      path: c.matched.slice().reverse().map((mm) => ({ id: mm.id, name: P(mm.id).n })), new_names: names.slice(0, c.anchor_index).reverse(),
      exists: c.anchor_index === 0, fuzzy: c.matched.filter((mm) => mm.sim < 1).map((mm) => ({ given: names[mm.idx], found: P(mm.id).n })),
      conflict: c.conflict, extra_names: c.extra, attach_above: c.above, nasab: nasab(c.anchor_id, 8), house: h != null ? houseName(h) : null,
      children: kidsOf(c.anchor_id).length,
    };
  });
}
export function bestMatch(cands) {
  const bests = cands.filter((c) => c.best);
  return bests.length === 1 && bests[0].confidence >= 60 ? bests[0] : null;
}
export function searchPeople(q, limit = 20) {
  const parts = Names.parse(q, []).map((t) => Names.key(t.name)).filter(Boolean);
  if (!parts.length) return [];
  const res = [];
  state.map.forEach((p, id) => {
    if (!p.k.includes(parts[0])) return;
    let score = p.k === parts[0] ? 3 : p.k.startsWith(parts[0]) ? 2 : 1;
    if (parts.length > 1) {
      const line = lineage(id);
      for (let k = 1; k < parts.length; k++) { const anc = line[k]; if (anc == null || !P(anc).k.includes(parts[k])) return; }
      score += 3;
    }
    res.push([score, id]);
  });
  res.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  return res.slice(0, limit).map(([, id]) => {
    const h = houseOf(id);
    return { id, name: P(id).n, nasab: nasab(id, 6), gen: depthOf(id), house: h != null ? houseName(h) : null };
  });
}

/** أجداد أقدم في السلسلة فوق رأس فرع غير مربوط */
export function chainAbove(anchor, idx, names) {
  let cur = +anchor, j = idx + 1;
  while (j < names.length && P(cur)) {
    if (P(cur).fl) return { top: cur, names: names.slice(j) };
    const a = P(cur).p;
    if (a == null || !P(a) || nameSim(P(a).k, Names.key(names[j])) <= 0) return null;
    cur = a; j++;
  }
  return null;
}

/* ───────────── الطلبات ───────────── */
/** بناء أشخاص الطلب في تحديث واحد (مع إعادة استخدام الموجود لمنع التكرار) */
async function buildPersons(u, sub, a) {
  const names = sub.names || [], sons = sub.sons || [];
  const idx = sub.idx, floatTop = idx === names.length;
  const plan = [];
  let parent = +sub.anchor;
  const virt = new Map(); // id → {k, path}
  const extraKids = new Map();
  const vKids = (pid) => [...kidsOf(pid), ...(extraKids.get(pid) || [])];
  const keyOf = (x) => (P(x) ? P(x).k : virt.get(x).k);
  const pathOfAny = (x) => (P(x) ? P(x).path : virt.get(x).path);
  for (let k = idx - 1; k >= 0; k--) {
    const isTop = floatTop && k === idx - 1;
    const key = Names.key(names[k]);
    const ex = isTop ? null : vKids(parent).find((x) => keyOf(x) === key);
    if (ex != null) { parent = ex; continue; }
    plan.push({ parent, name: names[k], top: isTop, self: k === 0 });
    const tmp = 'n' + plan.length;
    virt.set(tmp, { k: key, path: '' });
    if (!extraKids.has(parent)) extraKids.set(parent, []);
    extraKids.get(parent).push(tmp);
    parent = tmp;
  }
  const selfRef = parent;
  sons.forEach((s) => {
    const key = Names.key(s);
    if (vKids(selfRef).some((x) => keyOf(x) === key)) return;
    plan.push({ parent: selfRef, name: s });
    const tmp = 'n' + plan.length;
    virt.set(tmp, { k: key, path: '' });
    if (!extraKids.has(selfRef)) extraKids.set(selfRef, []);
    extraKids.get(selfRef).push(tmp);
  });
  if (!plan.length) return { selfId: typeof selfRef === 'number' ? selfRef : null, created: [] };
  const ids = await allocIds(plan.length);
  const real = new Map();
  const by = { t: a.t, aid: a.aid, l: sub.submitter || a.l };
  const created = [];
  plan.forEach((pl, i) => {
    const id = ids[i];
    const tmp = 'n' + (i + 1);
    real.set(tmp, id);
    const par = typeof pl.parent === 'string' ? real.get(pl.parent) : pl.parent;
    const parPath = typeof pl.parent === 'string' ? virt.get(pl.parent).path : pathOfAny(pl.parent);
    const order = typeof pl.parent === 'string' ? 1 + created.filter((c) => c.parent === par).length : nextOrder(par, created.filter((c) => c.parent === par).length);
    const fields = { name: pl.name, floating: pl.top };
    if (pl.self) { if (sub.nick) fields.nickname = sub.nick; if (sub.birth) fields.birth_year = sub.birth; }
    const rec = newRecord(id, par, fields, by, order, parPath);
    virt.get(tmp).path = rec.path;
    u['persons/' + id] = rec;
    created.push({ id, parent: par });
  });
  const selfId = typeof selfRef === 'string' ? real.get(selfRef) : selfRef;
  return { selfId, created: created.map((c) => c.id) };
}

/** ربط فرع غير مربوط بأجداده بعد اعتماد الطلب */
async function applyAbove(sub, a) {
  const above = sub.above || [];
  const topId = sub.top;
  if (!above.length || topId == null) return null;
  await loadPersons(true);
  const top = P(topId);
  if (!top || !top.fl) return null;
  const skip = new Set([+topId, ...descendants(topId)]);
  const u = {};
  let parent = null, parentPath = null;
  const c = matchChain(above, 5).find((x) => !skip.has(x.anchor_id) && x.best && x.confidence >= 60);
  const toCreate = []; // من الأقدم إلى أبي رأس الفرع
  if (c) {
    // الأجداد موجودون في الشجرة: ننزل عبر الموجود منهم ونضيف الباقي
    parent = c.anchor_id; parentPath = P(parent).path;
    let k = c.anchor_index - 1;
    for (; k >= 0; k--) {
      const ex = kidsOf(parent).find((x) => P(x).k === Names.key(above[k]));
      if (ex == null) break;
      parent = ex; parentPath = P(ex).path;
    }
    for (; k >= 0; k--) toCreate.push({ n: above[k], hang: false });
  } else {
    // أجداد جدد: يُضافون فوق الفرع ويصبح أقدمهم رأس الفرع المعلق، إلا إن كان الجد الأكبر نفسه
    parent = top.p; parentPath = P(parent).path;
    const list = [...above];
    let hang = true;
    if (list.length && Names.key(list[list.length - 1]) === P(parent).k) { list.pop(); hang = false; }
    list.reverse().forEach((n, i) => toCreate.push({ n, hang: hang && i === 0 }));
  }
  if (toCreate.length) {
    const ids = await allocIds(toCreate.length);
    toCreate.forEach((item, i) => {
      const rec = newRecord(ids[i], parent, { name: item.n, floating: item.hang }, a, i === 0 ? nextOrder(parent) : 1, parentPath);
      u['persons/' + ids[i]] = rec;
      parentPath = rec.path;
      parent = ids[i];
    });
  }
  const twin = P(parent) ? kidsOf(parent).find((x) => x !== +topId && P(x).k === top.k) : null;
  if (twin != null) {
    const batch = {};
    mergeInto(u, +topId, twin, batch);
    u['trash/' + pushId()] = { kind: 'merge', at: TS(), by: a.l, root: +topId, persons: batch };
  } else {
    movePaths(u, +topId, parent, parentPath);
    u[`persons/${topId}/fl`] = null;
  }
  const sum = `ربط فرع «${top.n}» بأجداده: ${above.join(' ‹ ')}`;
  auditEntry(u, a, 'move', 'person', +topId, sum);
  await commit(u);
  return sum;
}

export async function submitLineage(input) {
  await loadPersons();
  const names = cleanNames(input.names, 15);
  if (names.length < 2) throw err('اكتب اسمك واسم أبيك على الأقل (ويُفضّل الاسم الخماسي)');
  const sons = cleanNames(input.sons, 25, 'الأبناء');
  const phone = latin(input.phone).replace(/[^\d+]/g, '').slice(0, 20);
  const v = state.viewer;
  let anchor = input.anchor_id != null && input.anchor_id !== '' ? +input.anchor_id : null;
  let idx = +input.anchor_index || 0, floating = false;
  const root = rootId();
  if (root == null) throw err('الشجرة غير مهيأة بعد');
  if (anchor == null) {
    anchor = root; idx = names.length; floating = true;
    if (Names.key(names[idx - 1]) === P(root).k) { idx--; floating = false; }
  } else {
    if (!P(anchor)) throw err('نقطة الربط غير موجودة');
    if (idx < 0 || idx >= names.length) throw err('نقطة ربط غير صالحة');
    if (P(anchor).g === 'f' && idx > 0) throw err('لا يُضاف أبناء تحت الإناث');
  }
  const above = floating ? null : chainAbove(anchor, idx, names);
  // رفض المكرر: الشخص وأبناؤه موجودون كلهم في الشجرة
  if (idx === 0 && !floating && sons.every((s) => kidsOf(anchor).some((x) => P(x).k === Names.key(s)))) {
    throw err(sons.length ? 'هذا النسب وأبناؤه موجودون مسبقاً في الشجرة' : `الاسم «${nasab(anchor, 5)}» موجود مسبقاً في الشجرة`);
  }
  // رفض المكرر: نفس النسب مُرسل وما زال بانتظار المراجعة
  const dkBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(names.map(Names.key).join('|') + '#' + sons.map(Names.key).join('|')));
  const dk = [...new Uint8Array(dkBuf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
  const prev = await restGet('dups/' + dk).catch(() => null);
  if (prev) {
    const ps = await restGet('subs/' + prev).catch(() => null);
    if (ps && ps.st === 'pending') throw err('هذا النسب مُرسل مسبقاً وهو بانتظار المراجعة');
    await write({ ['dups/' + dk]: null }).catch(() => {});
  }
  const mode = state.settings.registration_mode;
  let status = 'pending';
  if (v.type === 'admin') status = 'approved';
  else if (v.type === 'code') {
    if (can('add', anchor) && (!above || can('move', above.top))) status = 'approved'; // صاحب الصلاحية الكاملة يضيف مباشرة
  } else if (mode === 'closed') throw err('الإضافة مغلقة حالياً من قبل الإدارة');
  else if (mode === 'codes') throw err('الإضافة متاحة لأصحاب الرموز فقط — اطلب الرمز من رأس بيتك');
  const a = actor();
  const label = v.type === 'public' ? `زائر: ${names.slice(0, 3).join(' ')}${phone ? ' (' + phone + ')' : ''}` : a.l;
  const sid = pushId();
  const sub = clean({
    names, sons: sons.length ? sons : undefined, anchor, idx, above: above ? above.names : undefined, top: above ? above.top : undefined, fl: floating || undefined,
    phone: phone || undefined, note: String(input.note || '').trim().slice(0, 500) || undefined, nick: String(input.nickname || '').trim().slice(0, 80) || undefined,
    birth: /^\d{3,4}$/.test(latin(input.birth_year || '')) ? latin(input.birth_year) : undefined, st: status, dev: devLabel(), ua: navigator.userAgent.slice(0, 400),
    vid: visitorId(), at: TS(), code: v.type === 'code' ? v.holder : undefined, dk: status === 'pending' ? dk : undefined,
  });
  const u = {};
  let selfId = null, created = [];
  if (status === 'approved') {
    const r = await buildPersons(u, { ...sub, submitter: label }, a);
    selfId = r.selfId; created = r.created;
    Object.assign(sub, clean({ rby: a.l + ' (اعتماد تلقائي)', rat: TS(), self: selfId ?? undefined }));
  }
  u['subs/' + sid] = sub;
  if (status === 'pending') u['dups/' + dk] = sid;
  const sum = (status === 'approved' ? 'أضاف نسب ' : 'طلب إضافة نسب ') + `«${names.join(' ')}»` + (floating ? ' — فرع جديد غير مربوط بعد' : created.length ? ' — ' + arCount(created.length, 'اسم جديد', 'اسمان جديدان', 'أسماء جديدة', 'اسماً جديداً') : '');
  auditEntry(u, { ...a, l: label }, status === 'approved' ? 'create' : 'submit', 'submission', null, sum);
  if (status === 'approved') u['meta/rev'] = TS();
  await write(u);
  if (status === 'approved') { await loadPersons(true); if (above) await applyAbove({ above: above.names, top: above.top }, a); }
  return { ok: true, token: sid, status, self_id: status === 'approved' ? selfId : null, floating };
}

export async function approveSubmission(sid, newAnchor = null, newIndex = null) {
  await loadPersons(true);
  const sub = (await get(ref(db, 'subs/' + sid))).val();
  if (!sub || sub.st !== 'pending') throw err('الطلب غير موجود أو تمت مراجعته');
  const names = sub.names || [];
  if (newAnchor == null && (sub.anchor == null || sub.idx >= names.length)) {
    const best = bestMatch(matchChain(names, 5));
    if (best) { newAnchor = best.anchor_id; newIndex = best.anchor_index; }
    else if (sub.anchor == null) { newAnchor = rootId(); newIndex = names.length; }
  }
  if (newAnchor != null) {
    if (!P(newAnchor)) throw err('نقطة الربط الجديدة غير موجودة');
    sub.anchor = +newAnchor;
    sub.idx = Math.max(0, Math.min(names.length, +newIndex));
    const ab = sub.idx < names.length ? chainAbove(sub.anchor, sub.idx, names) : null;
    sub.above = ab ? ab.names : null;
    sub.top = ab ? ab.top : null;
  }
  if (state.viewer.type !== 'admin' && !can('approve', sub.anchor)) throw err('لا تملك صلاحية مراجعة هذا الطلب');
  const a = actor();
  const label = sub.code ? 'رمز: ' + sub.code : `زائر: ${names.slice(0, 3).join(' ')}${sub.phone ? ' (' + sub.phone + ')' : ''}`;
  const u = {};
  const r = await buildPersons(u, { ...sub, submitter: label }, { ...a });
  Object.assign(u, {
    [`subs/${sid}/st`]: 'approved', [`subs/${sid}/rby`]: a.l, [`subs/${sid}/rat`]: TS(), [`subs/${sid}/anchor`]: sub.anchor, [`subs/${sid}/idx`]: sub.idx,
    [`subs/${sid}/above`]: sub.above || null, [`subs/${sid}/top`]: sub.top ?? null, [`subs/${sid}/self`]: r.selfId ?? null,
  });
  if (sub.phone && r.selfId != null && a.t === 'admin') u[`private/${r.selfId}/phone`] = sub.phone;
  if (sub.dk) u['dups/' + sub.dk] = null;
  auditEntry(u, a, 'approve', 'submission', null,`اعتمد طلب «${names.join(' ')}»` + (r.created.length ? ' — ' + arCount(r.created.length, 'اسم جديد', 'اسمان جديدان', 'أسماء جديدة', 'اسماً جديداً') : ' (موجود مسبقاً)'));
  await commit(u);
  const linked = await applyAbove(sub, a);
  return { ok: true, merged: [], linked, self_id: r.selfId };
}

export async function rejectSubmission(sid, note = '') {
  const sub = (await get(ref(db, 'subs/' + sid))).val();
  if (!sub || sub.st !== 'pending') throw err('الطلب غير موجود أو تمت مراجعته');
  const a = actor();
  const u = { [`subs/${sid}/st`]: 'rejected', [`subs/${sid}/rby`]: a.l, [`subs/${sid}/rat`]: TS() };
  if (sub.dk) u['dups/' + sub.dk] = null;
  if (note) u[`subs/${sid}/rnote`] = String(note).slice(0, 300);
  auditEntry(u, a, 'reject', 'submission', null, `رفض طلب «${(sub.names || []).join(' ')}»` + (note ? ': ' + note : ''));
  await update(ref(db), u);
}

export async function pendingSubs() {
  const snap = await get(query(ref(db, 'subs'), orderByChild('st'), equalTo('pending')));
  const out = [];
  snap.forEach((c) => { out.push({ id: c.key, ...c.val() }); });
  return out.sort((x, y) => (y.at || 0) - (x.at || 0));
}

/** عقد افتراضية للطلبات المعلقة حتى تظهر لصاحبها وللمراجعين بخط منقط */
const virtualNodes = new Map();
function pendingNodes(subs, mine) {
  virtualNodes.clear();
  const out = [];
  const reg = new Map(); // (الأب، الاسم) ← عقدة افتراضية: الطلبات المتشابهة تُدمج في فرع واحد
  let vid = -1;
  const take = (parent, name, s, float) => {
    const key = Names.key(name);
    if (!float && parent > 0) {
      const ex = kidsOf(parent).find((x) => P(x).k === key);
      if (ex != null) return ex;
    }
    const rk = (float ? 'F' : parent) + ':' + key;
    if (reg.has(rk)) {
      const id = reg.get(rk);
      if (mine.has(s.id)) virtualNodes.get(id).node.m = 1;
      return id;
    }
    const node = { i: vid, p: parent, n: name, s: 1 };
    if (mine.has(s.id)) node.m = 1;
    if (float) node.u = 1;
    virtualNodes.set(vid, { sub: s.id, node });
    out.push(node);
    reg.set(rk, vid);
    return vid--;
  };
  subs.slice().sort((a, b) => (a.at || 0) - (b.at || 0)).forEach((s) => {
    const names = s.names || [];
    let parent = s.anchor != null && P(s.anchor) ? +s.anchor : rootId();
    const idx = s.anchor != null ? Math.min(s.idx, names.length) : names.length;
    const floatTop = idx >= names.length;
    for (let k = idx - 1; k >= 0; k--) parent = take(parent, names[k], s, floatTop && k === idx - 1);
    (s.sons || []).forEach((son) => take(parent, son, s, false));
  });
  return out;
}

/* ───────────── الرموز ───────────── */
/**
 * دخول برمز من 3 أرقام. أول جهاز يدخل به يُربط به: تتغير كلمة سر الحساب إلى سر عشوائي محفوظ
 * في هذا الجهاز فقط، فلا يعود الرمز يفتح لأي شخص آخر (يفرضه Firebase نفسه).
 */
export async function codeLogin(code) {
  const digits = latin(code).replace(/\D/g, '');
  if (digits.length !== 3) throw err('الرمز يتكون من 3 أرقام');
  const { email, password } = await codeEmail(digits);
  const keys = codeKeys();
  try {
    let cred, firstUse = false;
    try { cred = await signInWithEmailAndPassword(auth, email, keys[email] || password); firstUse = !keys[email]; }
    catch (e) { if (!keys[email]) throw e; cred = await signInWithEmailAndPassword(auth, email, password); firstUse = true; }
    await resolveViewer(cred.user);
    if (!state.code) { await signOut(auth); throw err('هذا الرمز معطّل'); }
    if (firstUse) {
      const rnd = new Uint8Array(24);
      crypto.getRandomValues(rnd);
      const secret = [...rnd].map((b) => b.toString(16).padStart(2, '0')).join('');
      await updatePassword(cred.user, secret);
      keys[email] = secret;
      saveCodeKeys(keys);
      await update(ref(db, 'codes/' + cred.user.uid), { claimed: Date.now(), dev: devLabel() }).catch(() => {});
    }
    await update(ref(db, 'codes/' + cred.user.uid), { logins: (state.code.logins || 0) + 1, last: Date.now() }).catch(() => {});
    const u = {};
    auditEntry(u, actor(), 'code_login', 'code', null, `دخول برمز «${state.code.holder}»` + (firstUse ? ' (أول استخدام — رُبط بهذا الجهاز)' : ''));
    await update(ref(db), u).catch(() => {});
    return { ok: true, holder: state.code.holder };
  } catch (e) {
    if (e.user) throw e;
    if (String(e.code).includes('too-many-requests')) throw err('محاولات كثيرة خاطئة، انتظر قليلاً ثم أعد المحاولة');
    const u = {};
    auditEntry(u, { t: 'public', l: 'زائر' }, 'code_failed', 'code', null, 'محاولة دخول برمز غير صالح أو مستخدم على جهاز آخر');
    write(u).catch(() => {});
    throw err('الرمز غير صحيح، أو أنه مستخدم على جهاز شخص آخر');
  }
}
export async function logout() { await signOut(auth); }

/** حساب ثانوي لإنشاء حسابات الرموز والمشرفين دون الخروج من حساب المالك */
let secondary = null;
async function secondaryAuth() {
  if (!secondary) {
    secondary = getAuth(initializeApp(firebaseConfig, 'secondary'));
    await setPersistence(secondary, inMemoryPersistence);
  }
  return secondary;
}
export async function createAuthUser(email, password) {
  const sa = await secondaryAuth();
  const cred = await createUserWithEmailAndPassword(sa, email, password);
  const uid = cred.user.uid;
  await signOut(sa);
  return uid;
}
export async function deleteCodeUser(code) {
  try {
    const sa = await secondaryAuth();
    const { email, password } = await codeEmail(code);
    const cred = await signInWithEmailAndPassword(sa, email, password);
    await deleteUser(cred.user);
  } catch (e) { /* الحساب محذوف مسبقاً */ }
}
export function newCodeDigits() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return String(1000 + (a[0] % 9000)) + String(a[1] % 10000).padStart(4, '0');
}
export const fmtCode = (d) => d.slice(0, 4) + '-' + d.slice(4);
export async function changePassword(current, next) {
  const u = auth.currentUser;
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
  await updatePassword(u, next);
}
export { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword };

/* ───────────── الزوار ───────────── */
export function visitorId() {
  try {
    let v = localStorage.getItem('clan-vid');
    if (!v) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('clan-vid', v); window.__newVisitor = true; }
    return v;
  } catch (e) { return 'anon'; }
}
export function trackVisit(page) {
  if (!state.settings.track_visits) return;
  const ua = uaParse();
  let ref0 = '';
  try { if (document.referrer && new URL(document.referrer).host !== location.host) ref0 = document.referrer.slice(0, 200); } catch (e) { /* رابط غير صالح */ }
  const rec = clean({
    v: visitorId(), pg: page, d: ua.device, os: ua.os, br: ua.browser, m: ua.model || undefined, ref: ref0 || undefined, sc: screen.width + '×' + screen.height,
    lang: (navigator.language || '').slice(0, 20), code: state.code ? state.code.holder : undefined, adm: state.admin ? (state.admin.name || '').slice(0, 80) : undefined,
    nw: window.__newVisitor ? true : undefined, at: TS(),
  });
  write({ ['visits/' + pushId()]: rec }).catch(() => {});
}

/* ───────────── واجهة متوافقة مع الصفحات (بديل api.php) ───────────── */
async function personDetails(id) {
  id = +id;
  if (id < 0 && virtualNodes.has(id)) {
    const vn = virtualNodes.get(id);
    const line = [{ id: vn.node.i, name: vn.node.n }];
    let pid = vn.node.p;
    while (pid != null) {
      if (pid < 0) {
        const v2 = virtualNodes.get(pid);
        if (!v2) break;
        line.push({ id: v2.node.i, name: v2.node.n });
        pid = v2.node.p;
      } else {
        if (P(pid)) line.push(...lineage(pid).map((x) => ({ id: x, name: P(x).n })));
        break;
      }
    }
    const kids = [...virtualNodes.values()].filter((v) => v.node.p === id).map((v) => ({ id: v.node.i, name: v.node.n, head: 0, kids: 0, pending: true }));
    const canApprove = state.viewer.type === 'admin' || (state.viewer.type === 'code' && state.code.approve);
    return { id, name: vn.node.n, status: 'pending', floating: vn.node.u ? 1 : 0, lineage: line, gen: line.length, children: kids, descendants: kids.length, siblings: 0,
      house: null, created_at: '—', submission: { id: vn.sub }, perms: { approve: canApprove } };
  }
  await loadPersons();
  const p = P(id);
  if (!p) throw err('الشخص غير موجود');
  const line = lineage(id);
  const h = houseOf(id);
  const privileged = state.viewer.type !== 'public';
  const showBy = privileged || state.settings.show_added_by;
  const out = {
    id, name: p.n, nickname: p.nick || '', gender: p.g || 'm', is_head: isHouse(id) ? 1 : 0, house_auto: isAutoHouse(id) ? 1 : 0, house_mode: p.head ? 'on' : p.nh ? 'off' : 'auto', house_min: state.settings.house_min || 20, house_name: p.house || '', house_color: p.hc || '',
    birth_year: p.b || '', death_year: p.y || '', is_deceased: p.dead ? 1 : 0, bio: p.bio || '', status: 'approved', floating: p.fl ? 1 : 0,
    created_at: fmtDt(p.at, false), updated_at: fmtDt(p.ub && p.ub.at), created_by: showBy && p.by ? p.by.l : null, updated_by: showBy && p.ub ? p.ub.l : null,
    lineage: line.map((x) => ({ id: x, name: P(x).n })), gen: line.length,
    children: kidsOf(id).map((c) => ({ id: c, name: P(c).n, head: isHouse(c) ? 1 : 0, kids: kidsOf(c).length, pending: false })),
    descendants: descendants(id).length, siblings: p.p != null ? Math.max(0, kidsOf(p.p).length - 1) : 0,
    house: h != null ? { id: h, name: houseName(h) } : null, submission: null,
    perms: { add: can('add', id) && p.g !== 'f', edit: can('edit', id), move: can('move', id) && p.p != null, reorder: can('reorder', id) && p.p != null,
      delete: can('delete', id), approve: false, merge: can('delete', id) && can('edit', id), head: can('edit', id) },
  };
  if (state.viewer.type === 'admin') out.phone = (await get(ref(db, 'private/' + id + '/phone'))).val() || '';
  return out;
}

const handlers = {
  async tree() {
    if (!state.persons) await loadPersons(false);
    const showF = state.settings.show_females || state.viewer.type === 'admin';
    const persons = [];
    state.map.forEach((p) => { if (p.g !== 'f' || showF) persons.push(compact(p)); });
    persons.sort((a, b) => (P(a.i).o || 0) - (P(b.i).o || 0) || a.i - b.i);
    // طلبات الزوار لا تظهر في الشجرة لأي أحد قبل موافقة المسؤول؛ المراجِع يراها في لوحة «الطلبات» فقط
    const v = state.viewer;
    const reviewer = v.type === 'admin' || (v.type === 'code' && v.perms.approve);
    if (reviewer) { try { v.pending = (await pendingSubs()).length; } catch (e) { v.pending = 0; } }
    return { ok: true, persons, viewer: v };
  },
  async search(d) { await loadPersons(); return { ok: true, results: searchPeople(d.q || '') }; },
  async match(d) { await syncPersons(); const names = cleanNames(d.names, 15); return { ok: true, candidates: matchChain(names, 5), names }; },
  async submit(d) { if (d.website) throw err('تعذر الإرسال'); return submitLineage(d); },
  async my_submissions(d) {
    const items = [];
    for (const t of (d.tokens || []).slice(0, 20)) {
      const s = await restGet('subs/' + t).catch(() => null);
      if (s) items.push({ token: t, status: s.st === 'cancelled' ? 'rejected' : s.st, names: s.names || [], created_at: fmtDt(s.at), self_id: s.self ?? null, note: s.rnote || (s.st === 'cancelled' ? 'أُلغي الطلب' : ''), persons: [], linked: true });
    }
    return { ok: true, items };
  },
  async submission_cancel(d) { await write({ ['subs/' + d.token + '/st']: 'cancelled' }); return { ok: true }; },
  async code_login(d) { return codeLogin(d.code); },
  async code_logout() { await logout(); return { ok: true }; },
  async person(d) { return { ok: true, person: await personDetails(d.id) }; },
  async person_add(d) { return { ok: true, id: await addPerson(d.parent_id != null ? +d.parent_id : null, d) }; },
  async person_update(d) { return { ok: true, changed: await updatePerson(+d.id, d) }; },
  async person_move(d) { await movePerson(+d.id, +d.parent_id); return { ok: true }; },
  async person_merge(d) { await mergePersons(+d.id, +d.target_id); return { ok: true }; },
  async person_delete(d) { return { ok: true, count: await deletePerson(+d.id, !!+d.with_desc) }; },
  async person_unlink(d) { await removeKeepKids(+d.id); return { ok: true }; },
  async person_add_ancestor(d) { return { ok: true, id: await addAncestor(+d.id, d.name) }; },
  async person_insert_child(d) { return { ok: true, id: await insertChild(+d.id, d.name) }; },
  async person_insert_parent(d) { return { ok: true, id: await insertParent(+d.id, d.name) }; },
  async person_reorder(d) { await reorderPerson(+d.id, d.dir); return { ok: true }; },
  async submission_approve(d) { return approveSubmission(d.submission_id); },
  async submission_reject(d) { await rejectSubmission(d.submission_id, d.note); return { ok: true }; },
  async pending() {
    await loadPersons();
    const items = (await pendingSubs()).filter((s) => state.viewer.type === 'admin' || can('approve', s.anchor ?? rootId())).map((s) => {
      const names = s.names || [];
      const fl = s.anchor == null || s.idx >= names.length;
      return { id: s.id, names, anchor: fl ? 'فرع جديد لم يُربط بأجداده بعد' : (P(s.anchor) ? nasab(s.anchor, 6) : '—'), above: s.above || [], new: names.slice(0, fl ? names.length : s.idx).reverse(), dups: [],
        self_id: null, phone: s.phone || '', note: s.note || '', ago: timeAgo(s.at), device: s.dev || '' };
    });
    return { ok: true, items };
  },
  /** طلب تعديل من الزائر: تصحيح الاسم و/أو ترتيب الأبناء من الأكبر، مع اسم مقدّم الطلب — يُعتمد أو يُرفض من لوحة التحكم */
  async suggest(d) {
    await loadPersons();
    const pid = d.person_id != null ? +d.person_id : null;
    const p = pid != null ? P(pid) : null;
    if (!p) throw err('الشخص غير موجود في الشجرة');
    const who = String(d.who || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (who.length < 3) throw err('اكتب اسمك حتى تعرف الإدارة من صاحب الطلب');
    const note = String(d.message || '').trim();
    const parts = [];
    let value, ord, op;
    const nv = Names.clean(d.value || '');
    if (nv && Names.key(nv) !== p.k) {
      const e = nameError(nv);
      if (e) throw err(e);
      value = nv;
      parts.push(`تصحيح الاسم من «${p.n}» إلى «${nv}»`);
    }
    if (d.order_parent != null && Array.isArray(d.order)) {
      op = +d.order_parent;
      const cur = kidsOf(op);
      const list = d.order.map(Number).filter((x) => cur.includes(x));
      if (list.length === cur.length && list.some((x, i) => x !== cur[i])) {
        ord = list.join(',');
        parts.push(`ترتيب أبناء «${P(op).n}» من الأكبر: ${list.map((x) => P(x).n).join('، ')}`);
      }
    }
    if (!parts.length && note.length < 5) throw err('لم تغيّر شيئاً — صحّح الاسم أو رتّب الأبناء أو اكتب ملاحظتك');
    const msg = (parts.join(' · ') || note) + (parts.length && note ? ' — ' + note : '');
    const u = {};
    u['suggestions/' + pushId()] = clean({ pid, kind: value || ord ? 'edit' : 'note', value, ord, op: ord ? op : undefined, msg: msg.slice(0, 1000), who, contact: who, at: TS(), st: 'open' });
    auditEntry(u, { t: 'public', l: who }, 'suggest', 'person', pid, `طلب تعديل: ${msg.slice(0, 90)}`);
    await write(u);
    return { ok: true };
  },
  async beacon() { return { ok: true }; },
};

export async function callApi(action, data) {
  await ready();
  const h = handlers[action];
  if (!h) throw new Error('إجراء غير معروف');
  try {
    return await h(data || {});
  } catch (e) {
    if (e.user) throw e;
    console.error('[' + action + ']', e);
    if (String(e.code || e.message).includes('PERMISSION_DENIED') || String(e.message).includes('permission')) throw new Error('لا تملك صلاحية هذا الإجراء');
    throw new Error('حدث خطأ غير متوقع، أعد المحاولة');
  }
}
if (window.__setApi) window.__setApi(callApi);

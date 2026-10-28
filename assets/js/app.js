/* ==========================================================================
   أدوات مشتركة: الاتصال بالخادم، الإشعارات، تحليل الأسماء العربية، الوضع الليلي، رمز البيت.
   ========================================================================== */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const meta = (n) => { const m = document.querySelector(`meta[name="${n}"]`); return m ? m.content : ''; };
  const BASE = meta('base');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function icon(name, cls) { return `<svg class="ic ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`; }

  // الاتصال يتم عبر store.js (Firebase) الذي يسجل نفسه هنا عند تحميله
  let setApi;
  const apiImpl = new Promise((resolve) => { setApi = resolve; });
  window.__setApi = setApi;
  window.CLAN_CFG = window.CLAN_CFG || {};
  async function api(action, data) {
    const impl = await apiImpl;
    if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');
    return impl(action, data);
  }

  function toast(msg, type) {
    const box = $('#toasts');
    if (!box) return alert(msg);
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'ok');
    t.innerHTML = icon(type === 'err' ? 'alert' : 'check') + '<span></span>';
    t.querySelector('span').textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, type === 'err' ? 5200 : 3200);
  }

  function debounce(fn, ms) {
    let t;
    return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(this, a), ms); };
  }

  /** نافذة تأكيد أنيقة — تعيد Promise<boolean|object> */
  function confirmBox(opt) {
    opt = typeof opt === 'string' ? { text: opt } : opt;
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'modal';
      d.innerHTML = `<form class="modal-card" method="dialog">
        <header class="modal-head"><span class="modal-icon" style="${opt.danger ? 'background:var(--danger-soft);color:var(--danger)' : ''}">${icon(opt.icon || (opt.danger ? 'alert' : 'info'))}</span>
          <div><h3>${esc(opt.title || 'تأكيد')}</h3><p>${esc(opt.text || '')}</p></div></header>
        ${opt.check ? `<label class="check"><input type="checkbox" name="chk"><span>${esc(opt.check)}</span></label>` : ''}
        <footer class="modal-foot"><button class="btn btn-ghost" value="no">إلغاء</button>
        <button class="btn ${opt.danger ? 'btn-danger' : 'btn-primary'}" value="yes">${esc(opt.ok || 'تأكيد')}</button></footer></form>`;
      document.body.appendChild(d);
      d.addEventListener('close', () => {
        const yes = d.returnValue === 'yes';
        const chk = d.querySelector('[name=chk]');
        resolve(yes ? (opt.check ? { checked: chk.checked } : true) : false);
        d.remove();
      });
      d.showModal();
    });
  }

  async function copyText(s) {
    try { await navigator.clipboard.writeText(s); toast('تم النسخ'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('تم النسخ'); } catch (x) { toast('تعذر النسخ', 'err'); }
      ta.remove();
    }
  }

  /* ───────────── الأسماء العربية ───────────── */
  const Names = {
    normalize(s) {
      return String(s || '')
        .replace(/[ً-ٰٟـۖ-ۭ]/g, '')
        .replace(/[أإآٱ]/g, 'ا').replace(/[ىیئ]/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ک/g, 'ك').replace(/ء/g, '')
        .replace(/\s+/g, ' ').trim();
    },
    key(s) { return Names.normalize(s).replace(/ /g, ''); },
    clean(s) { return String(s || '').replace(/ـ/g, '').replace(/[^؀-ۿ\s]/g, ' ').replace(/\s+/g, ' ').trim(); },
    /** تقسيم الاسم الكامل إلى سلسلة: [الشخص، الأب، الجد، ...] مع دمج الأسماء المركبة */
    parse(full, laqabs) {
      const toks = Names.clean(full).split(' ').filter(Boolean);
      const PREFIX = new Set(['عبد', 'ابو', 'ام', 'بني', 'ال']); // عبد الله، أبو بكر، بني مخزوم، آل صالح
      const SUFFIX = new Set(['الله', 'الدين', 'العابدين']);
      const DROP = new Set(['بن', 'ابن', 'بنت']);
      const out = [];
      for (let i = 0; i < toks.length; i++) {
        const k = Names.key(toks[i]);
        if (DROP.has(k)) continue;
        if (PREFIX.has(k) && i + 1 < toks.length && !DROP.has(Names.key(toks[i + 1]))) { out.push(toks[i] + ' ' + toks[i + 1]); i++; continue; }
        if (SUFFIX.has(k) && out.length && !/^(عبد|ابو)\s/.test(Names.normalize(out[out.length - 1]))) { out[out.length - 1] += ' ' + toks[i]; continue; }
        out.push(toks[i]);
      }
      const lk = (laqabs || []).map(Names.key);
      return out.map((name, i) => {
        const key = Names.key(name);
        const last = i === out.length - 1 && out.length >= 3;
        const laqab = last && (lk.includes(key) || (/^ال.{2,}ي$/.test(key) && !['الهادي', 'المهدي', 'الباقي'].includes(key)));
        return { name, laqab };
      });
    },
    role(i) {
      const r = ['أنت', 'الأب', 'الجد'];
      const o = ['', '', '', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
      return r[i] || ('الجد ' + (o[i] || i - 1));
    },
  };

  /* ───────────── المظهر والتنقل ───────────── */
  function currentTheme() {
    return document.documentElement.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  document.addEventListener('click', (e) => {
    const tt = e.target.closest('[data-theme-toggle]');
    if (tt) {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('clan-theme', next); } catch (x) { /* تخزين غير متاح */ }
      window.dispatchEvent(new CustomEvent('clan-theme', { detail: next }));
    }
    const nt = e.target.closest('[data-nav-toggle]');
    if (nt) { const nav = $('#mainNav'); if (nav) nav.classList.toggle('open'); }
    else if (!e.target.closest('#mainNav')) { const nav = $('#mainNav'); if (nav) nav.classList.remove('open'); }
    const op = e.target.closest('[data-open]');
    if (op) { const d = document.getElementById(op.dataset.open); if (d && d.showModal) { d.showModal(); const f = d.querySelector('input:not([type=hidden])'); if (f) setTimeout(() => f.focus(), 50); } }
    if (e.target.tagName === 'DIALOG' && e.target.classList.contains('modal')) e.target.close();
  });

  /* ───────────── رمز البيت ───────────── */
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-code-form]');
    if (!f || !f.code) return;
    e.preventDefault();
    const err = f.querySelector('[data-error]');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await api('code_login', { code: f.code.value });
      toast('مرحباً ' + r.holder + ' — تم تفعيل صلاحيات البيت');
      setTimeout(() => location.reload(), 700);
    } catch (x) {
      err.textContent = x.message; err.hidden = false; btn.disabled = false;
    }
  });
  document.addEventListener('input', (e) => {
    if (!e.target.classList.contains('code-input')) return;
    const ar = '٠١٢٣٤٥٦٧٨٩', fa = '۰۱۲۳۴۵۶۷۸۹';
    let v = e.target.value.replace(/[٠-٩۰-۹]/g, (c) => String(ar.indexOf(c) >= 0 ? ar.indexOf(c) : fa.indexOf(c))).replace(/\D/g, '').slice(0, 3);
    e.target.value = v;
  });
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-code-logout]')) return;
    try { await api('code_logout', {}); location.reload(); } catch (x) { toast(x.message, 'err'); }
  });

  /* ───────────── قياس الشاشة للإحصاءات ───────────── */
  const visit = meta('visit');
  if (visit) {
    setTimeout(() => {
      api('beacon', { v: +visit, sw: screen.width, sh: screen.height }).catch(() => {});
    }, 1200);
  }

  /* ───────────── مربع البحث العام ───────────── */
  function searchBox(input, box, onPick) {
    let items = [], idx = -1;
    const draw = () => {
      if (!items.length) { box.innerHTML = '<div class="sr-empty">لا توجد نتائج — يمكنك <a href="' + BASE + '/add">إضافة نسبك</a></div>'; box.hidden = false; return; }
      box.innerHTML = items.map((r, i) => `<button type="button" data-i="${i}" class="${i === idx ? 'active' : ''}">
        <span class="sr-dot">${esc(r.gen || '')}</span><span class="sr-main"><b>${esc(r.name)}</b><small>${esc(r.nasab)}${r.house ? ' · ' + esc(r.house) : ''}</small></span></button>`).join('');
      box.hidden = false;
    };
    const run = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { box.hidden = true; return; }
      try { const r = await api('search', { q }, 'GET'); items = r.results; idx = -1; draw(); } catch (x) { /* تجاهل */ }
    }, 220);
    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
      if (e.key === 'Enter' && items[Math.max(0, idx)]) { e.preventDefault(); onPick(items[Math.max(0, idx)]); box.hidden = true; }
      if (e.key === 'Escape') box.hidden = true;
    });
    box.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { onPick(items[+b.dataset.i]); box.hidden = true; } });
    document.addEventListener('click', (e) => { if (!box.contains(e.target) && e.target !== input) box.hidden = true; });
  }

  function storeGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function storeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* تخزين غير متاح */ } }

  window.App = { $, $$, BASE, api, toast, esc, icon, debounce, confirm: confirmBox, copy: copyText, Names, searchBox, storeGet, storeSet, theme: currentTheme };
})();

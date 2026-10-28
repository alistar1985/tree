/* ==========================================================================
   محرك رسم شجرة العشيرة (ClanTree)
   - عرض "نازل": الجد في الأعلى والأجيال تتفرع للأسفل.
   - عرض "طبيعي": جذع في الأسفل عليه ألواح الأجداد، وتاج من الأغصان والأوراق كلوحات الأنساب.
   - تلوين حسب الجيل (افتراضي) أو حسب البيت أو النمط الكلاسيكي (رؤوس ذهبية، أبناء بيض، أحفاد أوراق).
   ========================================================================== */
/* global d3 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const FONT = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';
  const FONT_DISPLAY = '"Aref Ruqaa", "Amiri", "Traditional Arabic", serif';
  const ORD = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
    'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون'];
  const genName = (n) => 'الجيل ' + (ORD[n] || n);
  const HOUSE_PALETTE = ['#c0392b', '#2e86c1', '#d68910', '#8e44ad', '#16a085', '#a04000', '#1f618d', '#b7950b', '#7d3c98', '#138d75', '#cb4335', '#2874a6'];
  const DEFAULT_COLORS = {
    gen: ['#8fd3df', '#c0392b', '#ffffff', '#f4e7c5', '#f2b705', '#e67e22', '#8e5ea2', '#2e86c1', '#d35400', '#16a085'],
    trunk: '#bfe6dc', root: '#f3e6c4', head: '#e2b714', son: '#ffffff', leaf: '#2f6b1f', branch: '#3b2314',
  };

  /* ───────────── أدوات الألوان ───────────── */
  function rgb(h) {
    h = String(h || '#888888').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lum(h) {
    const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function inkFor(h) {
    const L = lum(h);
    return (1.05 / (L + 0.05)) > ((L + 0.05) / 0.059) ? '#ffffff' : '#1f150b';
  }
  function mix(a, b, t) {
    const x = rgb(a), y = rgb(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  const darker = (h, t) => mix(h, '#000000', t == null ? 0.3 : t);

  /* ───────────── الأشكال ───────────── */
  // ورقة شجر: القاعدة عند (0,0) والطرف عند (L,0)
  function leafPath(L, W) {
    const f = (v) => v.toFixed(1);
    return `M0,0C${f(L * 0.22)},${f(-W * 0.62)} ${f(L * 0.72)},${f(-W * 0.58)} ${f(L)},0C${f(L * 0.72)},${f(W * 0.58)} ${f(L * 0.22)},${f(W * 0.62)} 0,0Z`;
  }
  // غصن مستدق على منحنى بيزييه
  function branchPath(p0, p1, p2, p3, w0, w1) {
    const steps = 12, L = [], R = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
      const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
      let dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
      let dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
      const len = Math.hypot(dx, dy) || 1;
      const w = (w1 + (w0 - w1) * Math.pow(1 - t, 1.3)) / 2;
      const nx = -dy / len * w, ny = dx / len * w;
      L.push((x + nx).toFixed(1) + ',' + (y + ny).toFixed(1));
      R.push((x - nx).toFixed(1) + ',' + (y - ny).toFixed(1));
    }
    return 'M' + L.join('L') + 'L' + R.reverse().join('L') + 'Z';
  }
  function bezierD(p0, p1, p2, p3) {
    const f = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);
    return `M${f(p0)}C${f(p1)} ${f(p2)} ${f(p3)}`;
  }
  const CROWN = 'M-6,3L-7,-4L-3.2,-1L0,-6L3.2,-1L7,-4L6,3Z';
  const EX = 0.94, EY = 1.1; // تاج بيضوي أطول من عرضه كالشجرة الحقيقية

  function rosettePath(cx, cy, R, n) {
    let d = '';
    for (let i = 0; i <= 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const r = R * (1 + 0.05 * Math.cos(n * a));
      d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1);
    }
    return d + 'Z';
  }

  function textLines(name) {
    const w = String(name).trim().split(/\s+/);
    if (w.length === 1) return w;
    if (w.length === 2) return w;
    return [w[0], w.slice(1).join(' ')];
  }
  function fitFont(lines, maxW, maxH, base) {
    const chars = Math.max(...lines.map((l) => l.length), 1);
    let fs = Math.min(base, maxW / (chars * 0.6));
    fs = Math.min(fs, maxH / (lines.length * 1.15));
    return Math.max(6.5, fs);
  }

  function el(parent, tag, attrs) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function addText(parent, lines, fs, color, attrs) {
    const t = el(parent, 'text', Object.assign({
      'text-anchor': 'middle', 'font-family': FONT, 'font-weight': 700, 'font-size': fs.toFixed(1), fill: color, 'pointer-events': 'none',
    }, attrs || {}));
    lines.forEach((ln, i) => {
      const ts = el(t, 'tspan', { x: 0, y: ((i - (lines.length - 1) / 2) * fs * 1.12).toFixed(1), 'dominant-baseline': 'central' });
      ts.textContent = ln;
    });
    return t;
  }

  /* ───────────── المحرك ───────────── */
  class ClanTree {
    constructor(container, opt) {
      this.el = typeof container === 'string' ? document.querySelector(container) : container;
      this.o = Object.assign({
        mode: 'down', colorMode: 'generation', interactive: true, maxDepth: 0, clan: '', tooltip: true,
        onSelect: null, onRender: null, onToggle: null,
      }, opt || {});
      this.o.colors = Object.assign({}, DEFAULT_COLORS, (opt && opt.colors) || {});
      if (!Array.isArray(this.o.colors.gen) || !this.o.colors.gen.length) this.o.colors.gen = DEFAULT_COLORS.gen;
      this.collapsed = new Set();
      this.expanded = new Set();
      this.rootId = null;
      this.selectedId = null;
      this.pos = new Map();
      this.legend = [];

      this.svg = d3.select(this.el).append('svg').attr('xmlns', NS).attr('class', 'clan-svg');
      const s = this.svg.append('style');
      s.text(`
        .nd{cursor:pointer;transition:opacity .2s}
        .br{transition:opacity .2s}
        .has-sel .nd:not(.on-path){opacity:.42}
        .has-sel .br:not(.on-path){opacity:.32}
        .nd:hover .shape{filter:brightness(1.07)}
        .sel-ring{animation:ctPulse 1.6s ease-in-out infinite}
        @keyframes ctPulse{50%{stroke-opacity:.35;stroke-width:7}}
      `);
      this.gWorld = this.svg.append('g').attr('class', 'ct-world');
      this.gDeco = this.gWorld.append('g');
      this.gLinks = this.gWorld.append('g');
      this.gHi = this.gWorld.append('g');
      this.gNodes = this.gWorld.append('g');
      this.gRuler = this.svg.append('g').attr('class', 'ct-ruler');
      this.transform = d3.zoomIdentity;

      if (this.o.interactive) {
        this.zoom = d3.zoom().scaleExtent([0.03, 4]).on('zoom', (e) => {
          this.transform = e.transform;
          this.gWorld.attr('transform', e.transform);
          this._updateRuler();
        });
        this.svg.call(this.zoom).on('dblclick.zoom', null);
        this.svg.on('click', (e) => {
          if (e.target === this.svg.node()) { this.select(null); if (this.o.onSelect) this.o.onSelect(null); }
        });
      }
      if (this.o.tooltip && this.o.interactive) {
        this.tip = document.createElement('div');
        this.tip.className = 'tree-tip';
        this.tip.hidden = true;
        document.body.appendChild(this.tip);
      }
    }

    /* ── البيانات ── */
    setData(list) {
      const by = new Map();
      list.forEach((p) => by.set(p.i, {
        id: p.i, pid: p.p, name: p.n, house: p.h || null, hc: p.c || null, dead: !!p.d, female: p.g === 'f',
        pending: !!p.s, mine: !!p.m, nick: p.k || '', birth: p.b || null, death: p.y || null, kids: [], parent: null,
      }));
      const roots = [];
      by.forEach((n) => {
        const par = n.pid != null ? by.get(n.pid) : null;
        if (par) { n.parent = par; par.kids.push(n); } else roots.push(n);
      });
      let top;
      if (roots.length === 1) top = roots[0];
      else {
        top = { id: 0, name: this.o.clan || 'العشيرة', kids: roots, parent: null, virtual: true };
        roots.forEach((r) => { r.parent = top; });
        by.set(0, top);
      }
      const order = [];
      const stack = [top];
      top.gen = top.virtual ? 0 : 1;
      while (stack.length) {
        const n = stack.pop();
        order.push(n);
        for (let i = n.kids.length - 1; i >= 0; i--) { n.kids[i].gen = n.gen + 1; stack.push(n.kids[i]); }
      }
      for (let i = order.length - 1; i >= 0; i--) {
        const n = order[i];
        n.desc = n.kids.reduce((s, k) => s + 1 + k.desc, 0);
      }
      let hi = 0;
      order.forEach((n) => {
        if (n.house) {
          if (!n.hc) n.hc = HOUSE_PALETTE[hi++ % HOUSE_PALETTE.length];
          n.houseNode = n;
        } else n.houseNode = n.parent ? n.parent.houseNode : null;
      });
      // الفروع التلقائية: أبناء الجد الجامع (أول جد له أكثر من ابن) هم رؤوس الفروع،
      // ويتبع كل شخص فرعه حسب نسبه حتى لو لم تُحدَّد بيوت يدوياً
      let crown = top;
      while (crown.kids.length === 1) crown = crown.kids[0];
      let bi = 0;
      crown.kids.forEach((k) => { k.bc = k.hc || HOUSE_PALETTE[bi++ % HOUSE_PALETTE.length]; });
      order.forEach((n) => { n.branch = n.parent === crown ? n : (n.parent && n.parent.branch) || null; });
      this.autoCrown = crown;
      this.hasHouses = order.some((n) => n.house);
      this.by = by;
      this.top = top;
      this.order = order;
      return this;
    }

    get(id) { return this.by ? this.by.get(id) : null; }
    viewRoot() { return (this.rootId != null && this.by.get(this.rootId)) || this.top; }
    lineage(n) { const a = []; while (n) { a.push(n); n = n.parent; } return a; }
    nasab(n, max) {
      const a = [];
      while (n && !n.virtual && (!max || a.length < max)) { a.push(n.name); n = n.parent; }
      return a.join(' ');
    }
    houses() { return this.order.filter((n) => n.house); }
    isDark() {
      const t = document.documentElement.dataset.theme;
      if (t) return t === 'dark';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    setOptions(o) { Object.assign(this.o, o); if (o.colors) this.o.colors = Object.assign({}, DEFAULT_COLORS, o.colors); return this; }

    _visKids(n, vd) {
      if (!n.kids || !n.kids.length) return [];
      if (this.collapsed.has(n.id)) return [];
      if (this.o.maxDepth && vd >= this.o.maxDepth && !this.expanded.has(n.id)) return [];
      return n.kids;
    }

    /** إظهار شخص: فك طي أسلافه وتغيير الجذر إن كان خارج العرض */
    reveal(id) {
      const n = this.get(id);
      if (!n) return false;
      const line = this.lineage(n);
      const vr = this.viewRoot();
      if (!line.includes(vr)) this.rootId = null;
      line.slice(1).forEach((a) => { this.collapsed.delete(a.id); this.expanded.add(a.id); });
      return true;
    }

    toggle(id) {
      const n = this.get(id);
      if (!n || !n.kids.length) return;
      const visible = this.pos.has(n.kids[0].id);
      if (visible) { this.collapsed.add(id); this.expanded.delete(id); }
      else { this.collapsed.delete(id); this.expanded.add(id); }
      this.render();
      if (this.o.onToggle) this.o.onToggle(n, !visible);
    }

    /* ── الرسم ── */
    render(opts) {
      opts = opts || {};
      if (!this.by) return;
      const root = this.viewRoot();
      const mode = this.o.mode;
      const C = this.o.colors;
      const dark = this.isDark();
      const branchColor = dark ? mix(C.branch, '#d9b38c', 0.55) : C.branch;

      // سلسلة الجذع: أجداد بابن واحد قبل أول تفرع
      const chain = [root];
      while (chain.length < 9) {
        const last = chain[chain.length - 1];
        const ks = this._visKids(last, chain.length);
        if (ks.length === 1 && this._visKids(ks[0], chain.length + 1).length > 0) chain.push(ks[0]);
        else break;
      }
      const crown = chain[chain.length - 1];
      const baseVd = chain.length;
      const build = (n, vd) => ({ n, children: this._visKids(n, vd).map((k) => build(k, vd + 1)) });
      const h = d3.hierarchy(build(crown, baseVd), (d) => (d.children.length ? d.children : null));
      h.each((d) => {
        const n = d.data.n;
        if (d.depth === 0) d.kind = 'crown';
        else if (!n.kids.length) d.kind = 'leaf';
        else d.kind = 'circle';
        d.hidden = n.kids.length && !(d.children && d.children.length) ? n.desc : 0;
      });
      const isLeaf = (d) => d.kind === 'leaf';

      const R = mode === 'organic' ? 24 : 26;           // نصف قطر الدائرة
      const LL = mode === 'organic' ? 56 : 62;          // طول الورقة
      const LW = mode === 'organic' ? 25 : 27;          // عرض الورقة
      const trunkNodes = chain.slice(0, -1);
      const nodes = [];
      const links = [];
      let trunk = null;

      if (mode === 'organic') {
        // تاج دائري: الأوراق كلها على محيط التاج، والأغصان الداخلية على حلقات حسب الجيل
        const span = Math.PI * 1.22;
        d3.cluster().size([span, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 1.45))(h);
        const H = h.height;
        const inner = [];
        h.each((d) => { if (d.depth > 0 && !isLeaf(d)) (inner[d.depth] = inner[d.depth] || []).push(d); });
        const minGap = (row, size) => {
          let need = 0;
          row = row.slice().sort((a, b) => a.x - b.x);
          for (let i = 1; i < row.length; i++) need = Math.max(need, size / Math.max(1e-4, row[i].x - row[i - 1].x));
          return need;
        };
        const radius = [0];
        for (let k = 1; k <= H; k++) {
          radius[k] = Math.max(k === 1 ? 140 : radius[k - 1] + 72, minGap(inner[k] || [], 2 * R + 6));
        }
        const leaves = [];
        h.each((d) => { if (isLeaf(d)) leaves.push(d); });
        const rOut = Math.max(H > 1 ? radius[H - 1] + 86 : 150, minGap(leaves, LW + 6));
        h.each((d) => {
          const a = -Math.PI / 2 - (d.x - span / 2);
          d.angle = a;
          d.r = d.depth === 0 ? 0 : (isLeaf(d) ? rOut : Math.min(radius[d.depth] || rOut, rOut - 40));
          d.px = d.r * Math.cos(a) * EX;
          d.py = d.r * Math.sin(a) * EY;
        });
        const step = 54;
        const tLen = Math.max(130, rOut * 0.34, trunkNodes.length * step + 80);
        trunk = { len: tLen, w: Math.max(26, Math.min(96, rOut * 0.075, 22 + Math.sqrt(crown.desc + 1) * 3)) };
        trunkNodes.forEach((n, i) => nodes.push({ kind: 'trunk', data: { n }, px: 0, py: (trunkNodes.length - i) * step + 6, depth: -1 }));
      } else {
        const NW = 56, LH = 116;
        d3.tree().nodeSize([NW, LH]).separation((a, b) => {
          let s = a.parent === b.parent ? 1 : 1.3;
          if (isLeaf(a) && isLeaf(b)) s *= 0.64;
          else if (isLeaf(a) || isLeaf(b)) s *= 0.82;
          return s;
        })(h);
        h.each((d) => { d.px = -d.x; d.py = d.y; });
        const step = 50;
        trunkNodes.forEach((n, i) => nodes.push({ kind: 'trunk', data: { n }, px: 0, py: -(trunkNodes.length - i) * step - 10, depth: -1 }));
        trunk = trunkNodes.length ? { top: -(trunkNodes.length) * step - 10, w: Math.min(40, 12 + Math.sqrt(crown.desc + 1) * 1.4) } : null;
        this._levelH = LH;
      }

      // اتجاه الأوراق ومواضع قواعدها
      h.each((d) => {
        if (!d.parent) return;
        if (isLeaf(d)) {
          let th;
          if (mode === 'organic') th = d.angle;
          else {
            const raw = Math.atan2(d.py - d.parent.py, d.px - d.parent.px);
            th = Math.PI / 2 + (raw - Math.PI / 2) * 0.42;
          }
          d.theta = th;
          const off = mode === 'organic' ? 0 : LL / 2;
          d.bx = d.px - Math.cos(th) * off;
          d.by = d.py - Math.sin(th) * off;
        }
      });
      h.each((d) => nodes.push(d));

      h.each((d) => {
        if (!d.parent) return;
        const p = d.parent;
        const x0 = p.px, y0 = p.py;
        const x1 = isLeaf(d) ? d.bx : d.px, y1 = isLeaf(d) ? d.by : d.py;
        const w0 = Math.min(mode === 'organic' ? 26 : 20, 1.6 + Math.sqrt(d.data.n.desc + 1) * (mode === 'organic' ? 1.9 : 1.5));
        const w1 = isLeaf(d) ? 1.3 : Math.max(1.4, w0 * 0.6);
        let p1, p2;
        if (mode === 'organic') {
          const rm = (p.r + d.r) / 2;
          p1 = p.depth === 0 ? [0, -Math.min(70, d.r * 0.4)] : [rm * Math.cos(p.angle) * EX, rm * Math.sin(p.angle) * EY];
          p2 = [rm * 0.98 * Math.cos(d.angle) * EX, rm * 0.98 * Math.sin(d.angle) * EY];
        } else {
          const dy = y1 - y0;
          p1 = [x0, y0 + dy * 0.55];
          p2 = [x1, y1 - dy * 0.5];
        }
        links.push({ id: d.data.n.id, d: branchPath([x0, y0], p1, p2, [x1, y1], w0, w1), c: bezierD([x0, y0], p1, p2, [x1, y1]) });
      });

      /* ── الرسم الفعلي ── */
      const gD = this.gDeco.node(), gL = this.gLinks.node(), gN = this.gNodes.node();
      gD.textContent = ''; gL.textContent = ''; gN.textContent = ''; this.gHi.node().textContent = '';
      this.pos.clear();

      // الجذع
      if (mode === 'organic') {
        const W = trunk.w, Lt = trunk.len, base = W * 1.55;
        const d = `M${-W / 2},-4C${-W / 2},${Lt * 0.45} ${-W * 0.62},${Lt * 0.8} ${-base},${Lt}L${base},${Lt}C${W * 0.62},${Lt * 0.8} ${W / 2},${Lt * 0.45} ${W / 2},-4Z`;
        el(gD, 'ellipse', { cx: 0, cy: Lt + 4, rx: base * 2.6, ry: 9, fill: dark ? '#2a3a1c' : '#7fae4a', opacity: 0.55 });
        el(gD, 'path', { d, fill: branchColor });
        for (let i = -3; i <= 3; i++) {
          const x = i * base * 0.55;
          el(gD, 'path', { d: `M${x - 4},${Lt + 3}L${x},${Lt - 8 - Math.abs(i) % 2 * 4}L${x + 4},${Lt + 3}Z`, fill: dark ? '#3e5a26' : '#5e9a2e' });
        }
      } else if (trunk) {
        el(gD, 'path', { d: `M${-trunk.w / 2},${trunk.top}L${trunk.w / 2},${trunk.top}L${trunk.w * 0.36},0L${-trunk.w * 0.36},0Z`, fill: branchColor });
      }

      links.forEach((l) => {
        el(gL, 'path', { d: l.d, fill: branchColor, class: 'br', 'data-id': l.id });
      });
      this._links = links;

      const legendGen = new Set();
      let hasLeaf = false, hasHead = false, hasPending = false, hasCollapsed = false;
      const housesInView = new Map();

      nodes.forEach((d) => {
        const n = d.data.n;
        const kind = d.kind;
        const fill = this._fill(d);
        const ink = inkFor(fill);
        const stroke = darker(fill, lum(fill) > 0.7 ? 0.22 : 0.32);
        const g = el(gN, 'g', {
          class: 'nd k-' + kind + (n.pending ? ' pending' : '') + (n.mine ? ' mine' : ''),
          'data-id': n.id, transform: `translate(${d.px.toFixed(1)},${d.py.toFixed(1)})`,
        });
        this.pos.set(n.id, { x: d.px, y: d.py, kind, fill });
        if (n.house) { hasHead = true; housesInView.set(n.id, n); }
        if (n.pending) hasPending = true;
        const dash = n.pending ? '4 3' : null;
        const sw = n.pending ? 2.2 : 1.4;
        const pendStroke = n.pending ? '#b26a00' : stroke;

        if (kind === 'trunk') {
          const lines = [n.name];
          const fs = fitFont(lines, 84, 22, 13);
          el(g, 'rect', { class: 'shape', x: -46, y: -14, width: 92, height: 28, rx: 14, fill, stroke: pendStroke, 'stroke-width': sw, 'stroke-dasharray': dash });
          addText(g, lines, fs, ink);
        } else if (kind === 'crown') {
          const lines = textLines(n.name);
          const fs = fitFont(lines, 84, 40, 16);
          el(g, 'ellipse', { cx: 0, cy: 0, rx: 54, ry: 31, fill: 'none', stroke: '#d9ae22', 'stroke-width': 1.4, 'stroke-dasharray': '2 3' });
          el(g, 'ellipse', { class: 'shape', cx: 0, cy: 0, rx: 48, ry: 26, fill, stroke: darker(fill, 0.35), 'stroke-width': 2, 'stroke-dasharray': dash });
          addText(g, lines, fs, ink, { 'font-family': FONT_DISPLAY, 'font-weight': 700 });
          if (n.house) el(g, 'path', { d: CROWN, transform: 'translate(0,-36) scale(1.4)', fill: '#d9ae22', stroke: '#8f6b0c', 'stroke-width': 0.6 });
        } else if (kind === 'leaf') {
          hasLeaf = true;
          const deg = d.theta * 180 / Math.PI;
          const lx = d.bx - d.px, ly = d.by - d.py;
          const lg = el(g, 'g', { transform: `translate(${lx.toFixed(1)},${ly.toFixed(1)}) rotate(${deg.toFixed(1)})` });
          el(lg, 'path', { class: 'shape', d: leafPath(LL, LW), fill, stroke: n.pending ? '#b26a00' : darker(fill, 0.35), 'stroke-width': n.pending ? 1.8 : 1, 'stroke-dasharray': dash });
          el(lg, 'path', { d: `M3,0L${LL - 6},0`, stroke: mix(fill, '#ffffff', 0.35), 'stroke-width': 0.7, opacity: 0.35 });
          // النص على امتداد الورقة ومن جهة القاعدة، مع تجنب انقلابه
          let tdeg = deg + 180;
          tdeg = ((tdeg % 360) + 360) % 360;
          if (tdeg > 90 && tdeg < 270) tdeg -= 180;
          const words = String(n.name).trim().split(/\s+/);
          const lines = words.length > 1 && n.name.length > 7 ? textLines(n.name) : [n.name];
          const fs = fitFont(lines, LL - 15, LW - 5, mode === 'organic' ? 10.5 : 11);
          const cx = Math.cos(d.theta) * LL * 0.53 + lx, cy = Math.sin(d.theta) * LL * 0.53 + ly;
          addText(g, lines, fs, ink, { transform: `translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${(tdeg - 360 * Math.round(tdeg / 360)).toFixed(1)})` });
          if (n.house) el(g, 'circle', { cx: lx, cy: ly, r: 4, fill: '#d9ae22', stroke: '#8f6b0c', 'stroke-width': 0.8 });
        } else {
          if (this.o.colorMode === 'generation') legendGen.add(d.depth);
          const lines = textLines(n.name);
          const fs = fitFont(lines, 2 * R - 8, 2 * R - 12, mode === 'organic' ? 11.5 : 12.5);
          if (n.house && this.o.colorMode !== 'classic') {
            el(g, 'circle', { cx: 0, cy: 0, r: R + 4, fill: 'none', stroke: '#d9ae22', 'stroke-width': 3 });
          }
          el(g, 'circle', { class: 'shape', cx: 0, cy: 0, r: R, fill, stroke: pendStroke, 'stroke-width': n.pending ? 2.2 : 1.6, 'stroke-dasharray': dash });
          addText(g, lines, fs, ink);
          if (n.house) el(g, 'path', { d: CROWN, transform: `translate(0,${-R - 9}) scale(1.15)`, fill: '#d9ae22', stroke: '#8f6b0c', 'stroke-width': 0.6 });
          if (d.hidden) {
            hasCollapsed = true;
            const label = '+' + d.hidden;
            const bw = 12 + label.length * 6.4;
            const bg = el(g, 'g', { class: 'badge', transform: `translate(0,${R + 9})` });
            el(bg, 'rect', { x: -bw / 2, y: -8, width: bw, height: 16, rx: 8, fill: dark ? '#e9dcc0' : '#3b2314' });
            const t = addText(bg, [label], 10, dark ? '#2a1d12' : '#fff3d6');
            t.setAttribute('font-family', FONT);
          }
        }
        if (n.dead && kind !== 'leaf') {
          el(g, 'title', null).textContent = 'رحمه الله';
        }
        g.__node = n;
      });

      // أحداث العقد
      if (this.o.interactive) {
        const self = this;
        this.gNodes.selectAll('g.nd')
          .on('click', function (e) {
            e.stopPropagation();
            const n = this.__node;
            if (e.target.closest && e.target.closest('.badge')) { self.toggle(n.id); return; }
            self.select(n.id);
            if (self.o.onSelect) self.o.onSelect(n);
          })
          .on('dblclick', function (e) { e.stopPropagation(); self.toggle(this.__node.id); })
          .on('pointerenter', function (e) { if (e.pointerType === 'mouse') self._showTip(this.__node, e); })
          .on('pointermove', function (e) { if (e.pointerType === 'mouse') self._moveTip(e); })
          .on('pointerleave', () => self._hideTip());
      }

      // وسيلة الإيضاح
      const lg = [];
      if (trunkNodes.length) lg.push({ type: 'plaque', color: C.trunk, label: 'الأجداد (ألواح الجذع)' });
      lg.push({ type: 'oval', color: C.root, label: 'الجد الجامع: ' + crown.name });
      if (this.o.colorMode === 'generation') {
        [...legendGen].sort((a, b) => a - b).forEach((k) => lg.push({ type: 'circle', color: C.gen[(k - 1) % C.gen.length], label: genName(k) }));
        if (hasLeaf) lg.push({ type: 'leaf', color: C.leaf, label: 'الأوراق: الجيل الأخير' });
        if (hasHead) lg.push({ type: 'ring', color: '#d9ae22', label: 'رأس بيت' });
      } else if (this.o.colorMode === 'classic') {
        if (hasHead) lg.push({ type: 'circle', color: C.head, label: 'رؤوس البيوت' });
        lg.push({ type: 'circle', color: C.son, label: 'الأبناء' });
        if (hasLeaf) lg.push({ type: 'leaf', color: C.leaf, label: 'الأحفاد (الأوراق)' });
      } else if (this.hasHouses) {
        [...housesInView.values()].slice(0, 14).forEach((hn) => lg.push({ type: 'circle', color: hn.hc, label: hn.house }));
        lg.push({ type: 'circle', color: C.son, label: 'خارج البيوت' });
      } else {
        const seen = new Set();
        nodes.forEach((d) => { const b = d.data.n.branch; if (b && !seen.has(b)) { seen.add(b); lg.push({ type: 'circle', color: b.bc, label: 'فرع ' + b.name }); } });
      }
      if (hasPending) lg.push({ type: 'pending', color: '#ffffff', label: 'بانتظار المراجعة', wide: true });
      if (hasCollapsed) lg.push({ type: 'badge', color: '#3b2314', label: 'فرع مطويّ (اضغط للتوسيع)', wide: true });
      this.legend = lg;
      this.crown = crown;
      this.chain = chain;
      this.maxRelDepth = h.height;

      this._drawRuler(h);
      if (this.selectedId != null) this._applySelection();

      if (!this.o.interactive) this._fitViewBox();
      else if (!opts.keepView && !this._fittedOnce) { this.fit(false); this._fittedOnce = true; }
      if (this.o.onRender) this.o.onRender(this);
    }

    _fill(d) {
      const n = d.data.n, C = this.o.colors, m = this.o.colorMode;
      if (d.kind === 'trunk') return C.trunk;
      if (d.kind === 'crown') return C.root;
      if (m === 'house') {
        const hc = n.houseNode ? n.houseNode.hc : (!this.hasHouses && n.branch ? n.branch.bc : null);
        if (d.kind === 'leaf') return hc ? mix(hc, C.leaf, 0.35) : C.leaf;
        return hc || C.son;
      }
      if (d.kind === 'leaf') return (m === 'classic' && n.house) ? C.head : C.leaf;
      if (m === 'classic') return n.house ? C.head : C.son;
      return C.gen[(d.depth - 1) % C.gen.length];
    }

    /* ── مسطرة الأجيال الثابتة (العرض النازل) ── */
    _drawRuler(h) {
      const g = this.gRuler.node();
      g.textContent = '';
      this._rulerRows = [];
      if (this.o.mode !== 'down' || !this.o.interactive) return;
      for (let k = 0; k <= h.height; k++) {
        const row = el(g, 'g', { opacity: 0.9 });
        const label = k === 0 ? 'الجد الجامع' : genName(k);
        const r = el(row, 'rect', { x: -44, y: -11, width: 88, height: 22, rx: 11, fill: this.isDark() ? '#2c271c' : '#fffcf5', stroke: this.isDark() ? '#4d4230' : '#cfbd96' });
        const t = el(row, 'text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': FONT, 'font-size': 11, 'font-weight': 600, fill: this.isDark() ? '#cfc1a4' : '#5a4836' });
        t.textContent = label;
        this._rulerRows.push({ g: row, y: k * this._levelH, r });
      }
      this._updateRuler();
    }
    _updateRuler() {
      if (!this._rulerRows || !this._rulerRows.length) return;
      const w = this.el.clientWidth;
      const t = this.transform;
      const show = t.k > 0.22;
      this._rulerRows.forEach((r) => {
        const y = t.applyY(r.y);
        r.g.setAttribute('transform', `translate(${w - 56},${y.toFixed(1)})`);
        r.g.style.display = show && y > -20 && y < this.el.clientHeight + 20 ? '' : 'none';
      });
    }

    /* ── التحديد وتتبع النسب ── */
    select(id) {
      this.selectedId = id;
      this._applySelection();
    }
    _applySelection() {
      const world = this.gWorld.node();
      const gHi = this.gHi.node();
      gHi.textContent = '';
      this.gNodes.selectAll('.sel-ring').remove();
      this.gNodes.selectAll('path.shape[data-os]').each(function () {
        this.setAttribute('stroke', this.getAttribute('data-os'));
        this.setAttribute('stroke-width', this.getAttribute('data-ow'));
        this.removeAttribute('data-os');
      });
      this.gNodes.selectAll('g.nd').classed('on-path', false);
      this.gLinks.selectAll('path.br').classed('on-path', false);
      const n = this.selectedId != null ? this.get(this.selectedId) : null;
      if (!n || !this.pos.has(n.id)) { world.classList.remove('has-sel'); return; }
      world.classList.add('has-sel');
      const ids = new Set(this.lineage(n).map((x) => x.id));
      this.gNodes.selectAll('g.nd').classed('on-path', function () { return ids.has(+this.getAttribute('data-id')); });
      this.gLinks.selectAll('path.br').classed('on-path', function () { return ids.has(+this.getAttribute('data-id')); });
      (this._links || []).forEach((l) => {
        if (ids.has(l.id)) el(gHi, 'path', { d: l.c, fill: 'none', stroke: '#f2c230', 'stroke-width': 3.2, 'stroke-linecap': 'round', opacity: 0.95 });
      });
      const p = this.pos.get(n.id);
      const g = this.gNodes.select(`g.nd[data-id="${n.id}"]`).node();
      if (g) {
        const rr = p.kind === 'crown' ? 60 : p.kind === 'trunk' ? 52 : p.kind === 'leaf' ? 0 : 35;
        if (rr) el(g, 'circle', { class: 'sel-ring', r: rr, fill: 'none', stroke: '#f2c230', 'stroke-width': 4, 'stroke-opacity': 0.9 });
        else {
          const lf = g.querySelector('path.shape');
          if (lf) {
            lf.setAttribute('data-os', lf.getAttribute('stroke'));
            lf.setAttribute('data-ow', lf.getAttribute('stroke-width'));
            lf.setAttribute('stroke', '#f2c230');
            lf.setAttribute('stroke-width', '3');
          }
        }
      }
    }

    /* ── التكبير والتوسيط ── */
    _bbox() {
      try { return this.gWorld.node().getBBox(); } catch (e) { return { x: -100, y: -100, width: 200, height: 200 }; }
    }
    fit(animate) {
      if (!this.zoom) return;
      const b = this._bbox();
      const w = this.el.clientWidth || 800, hgt = this.el.clientHeight || 600;
      const pad = 40;
      const rulerW = this._rulerRows && this._rulerRows.length ? 110 : 0; // مساحة مسطرة الأجيال
      const k = Math.min(1.4, Math.max(0.03, Math.min((w - pad * 2 - rulerW) / (b.width || 1), (hgt - pad * 2) / (b.height || 1))));
      const t = d3.zoomIdentity.translate((w - rulerW) / 2 - (b.x + b.width / 2) * k, hgt / 2 - (b.y + b.height / 2) * k).scale(k);
      (animate === false ? this.svg : this.svg.transition().duration(550)).call(this.zoom.transform, t);
    }
    centerOn(id, scale) {
      if (!this.zoom) return;
      const p = this.pos.get(id);
      if (!p) return;
      const w = this.el.clientWidth, hgt = this.el.clientHeight;
      const k = scale || Math.max(this.transform.k, 1);
      const t = d3.zoomIdentity.translate(w / 2 - p.x * k, hgt / 2 - p.y * k).scale(k);
      this.svg.transition().duration(650).call(this.zoom.transform, t);
    }
    zoomBy(f) { if (this.zoom) this.svg.transition().duration(250).call(this.zoom.scaleBy, f); }
    _fitViewBox() {
      const b = this._bbox();
      const pad = 16;
      this.svg.attr('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`).attr('preserveAspectRatio', 'xMidYMid meet');
    }

    /* ── التلميح ── */
    _showTip(n, e) {
      if (!this.tip) return;
      const house = n.houseNode ? n.houseNode.house : (n.branch && n.branch !== n ? 'فرع ' + n.branch.name : '');
      const parts = [`<b>${esc(n.name)}${n.nick ? ' <span>(' + esc(n.nick) + ')</span>' : ''}</b>`, `<span>${esc(this.nasab(n, 7))}</span>`];
      const meta = [];
      if (!n.virtual) meta.push(genName(n.gen) + ' في العشيرة');
      if (house) meta.push(house);
      if (n.kids && n.kids.length) meta.push('الأبناء: ' + n.kids.length);
      if (n.desc) meta.push('الذرية: ' + n.desc);
      if (n.birth) meta.push('مواليد ' + n.birth);
      if (n.dead) meta.push('رحمه الله');
      if (n.pending) meta.push('بانتظار المراجعة');
      if (meta.length) parts.push(`<span>${esc(meta.join(' · '))}</span>`);
      this.tip.innerHTML = parts.join('');
      this.tip.hidden = false;
      this._moveTip(e);
    }
    _moveTip(e) {
      if (!this.tip || this.tip.hidden) return;
      const x = Math.min(window.innerWidth - this.tip.offsetWidth - 10, e.clientX + 14);
      const y = Math.min(window.innerHeight - this.tip.offsetHeight - 10, e.clientY + 16);
      this.tip.style.left = Math.max(8, x) + 'px';
      this.tip.style.top = Math.max(8, y) + 'px';
    }
    _hideTip() { if (this.tip) this.tip.hidden = true; }

    /* ── التصدير: لوحة جاهزة للطباعة ── */
    exportSVG(opt) {
      opt = Object.assign({ title: '', verses: [], credits: '', hierarchy: [] }, opt || {});
      this._hideTip();
      const b = this._bbox();
      const pad = Math.max(60, b.width * 0.04);
      const W = Math.max(b.width + pad * 2, 900);
      const titleH = opt.title ? Math.max(120, W * 0.07) : 30;
      const legendRows = Math.ceil(this.legend.length / 2);
      const footH = Math.max(90, legendRows * 26 + 60);
      const H = b.height + pad * 2 + titleH + footH;
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('xmlns', NS);
      svg.setAttribute('width', Math.round(W));
      svg.setAttribute('height', Math.round(H));
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('direction', 'rtl');
      el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: '#f6efdc' });
      el(svg, 'rect', { x: 14, y: 14, width: W - 28, height: H - 28, fill: 'none', stroke: '#b48a12', 'stroke-width': 3, rx: 18 });
      el(svg, 'rect', { x: 24, y: 24, width: W - 48, height: H - 48, fill: 'none', stroke: '#d9ae22', 'stroke-width': 1.2, 'stroke-dasharray': '6 5', rx: 12 });
      if (opt.title) {
        const t = el(svg, 'text', { x: W / 2, y: titleH * 0.62, 'text-anchor': 'middle', 'font-family': FONT_DISPLAY, 'font-size': Math.min(72, titleH * 0.5), 'font-weight': 700, fill: '#3b2314' });
        t.textContent = opt.title;
        if (opt.hierarchy && opt.hierarchy.length) {
          const s = el(svg, 'text', { x: W / 2, y: titleH * 0.92, 'text-anchor': 'middle', 'font-family': FONT, 'font-size': Math.min(22, titleH * 0.15), fill: '#8b7a64' });
          s.textContent = opt.hierarchy.map((l) => l.label + ' ' + l.value).join('  ‹  ');
        }
      }
      // إطارات الآيات في الزاويتين العلويتين
      const mR = Math.min(110, W * 0.075);
      (opt.verses || []).slice(0, 2).forEach((v, i) => {
        if (!v || !v.text) return;
        const cx = i === 0 ? W - mR - 50 : mR + 50, cy = mR + 46;
        el(svg, 'path', { d: rosettePath(cx, cy, mR, 18), fill: '#fbf4e0', stroke: '#b48a12', 'stroke-width': 2 });
        el(svg, 'circle', { cx, cy, r: mR * 0.84, fill: 'none', stroke: '#d9ae22', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
        // تقسيم الآية إلى أسطر بحسب الحروف دون التشكيل، ثم اختيار أكبر خط يتسع داخل الإطار
        const words = v.text.split(/\s+/);
        const bare = (s) => s.replace(/[ً-ٰٟۖ-ۭ]/g, '').length;
        const wrap = (per) => {
          const out = [];
          let cur = '';
          words.forEach((w) => { if (cur && bare(cur + ' ' + w) > per) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
          if (cur) out.push(cur);
          return out;
        };
        let show = [], fs = 0;
        for (let per = 12; per <= 48; per += 2) {
          show = wrap(per);
          fs = Math.min(2.5 * mR / per, mR * 0.2);
          if (show.length * fs * 1.45 <= 1.2 * mR) break;
        }
        const tt = el(svg, 'text', { 'text-anchor': 'middle', 'font-family': '"Amiri", "Traditional Arabic", serif', 'font-size': fs.toFixed(1), fill: '#3b2314' });
        show.forEach((ln, j) => {
          const ts = el(tt, 'tspan', { x: cx, y: (cy - ((show.length - 1) / 2) * fs * 1.45 + j * fs * 1.45 - fs * 0.4).toFixed(1) });
          ts.textContent = ln;
        });
        if (v.ref) {
          const rt = el(svg, 'text', { x: cx, y: cy + mR * 0.66, 'text-anchor': 'middle', 'font-family': FONT, 'font-size': (fs * 0.75).toFixed(1), fill: '#8f6b0c' });
          rt.textContent = v.ref;
        }
      });
      const world = this.gWorld.node().cloneNode(true);
      world.removeAttribute('transform');
      world.classList.remove('has-sel');
      world.querySelectorAll('.sel-ring').forEach((x) => x.remove());
      world.querySelectorAll('.on-path').forEach((x) => x.classList.remove('on-path'));
      if (world.children[2]) world.children[2].textContent = '';
      world.querySelectorAll('path.shape[data-os]').forEach((x) => { x.setAttribute('stroke', x.getAttribute('data-os')); x.setAttribute('stroke-width', x.getAttribute('data-ow')); });
      world.setAttribute('transform', `translate(${(W - b.width) / 2 - b.x},${titleH + pad - b.y})`);
      svg.appendChild(world);
      // وسيلة الإيضاح أسفل اللوحة
      const lgX = W - 60, lgY = H - footH + 10;
      const lgT = el(svg, 'text', { x: lgX, y: lgY + 8, 'text-anchor': 'start', 'font-family': FONT, 'font-size': 16, 'font-weight': 700, fill: '#3b2314' });
      lgT.textContent = 'دليل الألوان';
      this.legend.forEach((it, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = lgX - col * 230, y = lgY + 36 + row * 26;
        const sw = el(svg, 'g', { transform: `translate(${x - 9},${y})` });
        if (it.type === 'leaf') el(sw, 'path', { d: leafPath(22, 11), transform: 'translate(11,0) rotate(180)', fill: it.color, stroke: darker(it.color, 0.35) });
        else if (it.type === 'plaque') el(sw, 'rect', { x: -12, y: -7, width: 24, height: 14, rx: 7, fill: it.color, stroke: darker(it.color, 0.3) });
        else if (it.type === 'oval') el(sw, 'ellipse', { rx: 12, ry: 8, fill: it.color, stroke: darker(it.color, 0.3) });
        else if (it.type === 'ring') el(sw, 'circle', { r: 8, fill: 'none', stroke: it.color, 'stroke-width': 3 });
        else if (it.type === 'pending') el(sw, 'circle', { r: 8, fill: '#fff', stroke: '#b26a00', 'stroke-dasharray': '3 2', 'stroke-width': 2 });
        else if (it.type === 'badge') el(sw, 'rect', { x: -12, y: -7, width: 24, height: 14, rx: 7, fill: it.color });
        else el(sw, 'circle', { r: 9, fill: it.color, stroke: darker(it.color, 0.3), 'stroke-width': 1.4 });
        const t = el(svg, 'text', { x: x - 30, y: y + 1, 'text-anchor': 'start', 'dominant-baseline': 'central', 'font-family': FONT, 'font-size': 14, fill: '#3b2314' });
        t.textContent = it.label;
      });
      if (opt.credits) {
        const ct = el(svg, 'text', { x: 60, y: H - 50, 'text-anchor': 'end', 'font-family': FONT, 'font-size': 14, fill: '#5a4836' });
        ct.textContent = opt.credits;
      }
      const st = el(svg, 'text', { x: 60, y: H - 30, 'text-anchor': 'end', 'font-family': FONT, 'font-size': 11, fill: '#8b7a64' });
      st.textContent = 'طُبعت بتاريخ ' + new Date().toLocaleDateString('ar-IQ');
      return new XMLSerializer().serializeToString(svg);
    }

    exportPNG(opt, cb) {
      const s = this.exportSVG(opt);
      const m = s.match(/width="(\d+)" height="(\d+)"/);
      const w = +m[1], hgt = +m[2];
      const scale = Math.max(0.3, Math.min(2, 14000 / w, 14000 / hgt, Math.sqrt(1.1e8 / (w * hgt))));
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = Math.round(w * scale);
        c.height = Math.round(hgt * scale);
        const ctx = c.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        c.toBlob((blob) => cb(blob), 'image/png');
      };
      img.onerror = () => cb(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    }

    destroy() { if (this.tip) this.tip.remove(); this.svg.remove(); }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  ClanTree.genName = genName;
  ClanTree.leafPath = leafPath;
  ClanTree.rosettePath = rosettePath;
  ClanTree.inkFor = inkFor;
  window.ClanTree = ClanTree;
})();

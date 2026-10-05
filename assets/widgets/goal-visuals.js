/* 10X Vital Intelligence: goal visuals (lifespan + morphology).
   Plain script, no dependencies. Renders inline SVG into
   [data-widget="lifespan"] and [data-widget="morphology"]. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var TAU = Math.PI * 2;
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduce = !!(mq && mq.matches);
  // Light palette. Colours resolve from the page's CSS variables (with fallbacks)
  // so the figures stay in step with the site theme.
  var C = {
    orange: 'var(--orange, #f97316)', amber: 'var(--amber, #f59e0b)', sky: 'var(--sky, #0ea5e9)',
    skyDeep: 'var(--sky-deep, #0284c7)', red: 'var(--red, #ef4444)', slate: 'var(--muted, #64748b)',
    line2: 'var(--line-2, #cbd5e1)'
  };
  var uid = 0;

  /* ---------- helpers ---------- */
  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, cls) {
    var t = mk('text', { x: f(x), y: f(y), 'class': cls || 'gv-lbl' }, parent);
    t.textContent = s;
    return t;
  }
  function stop(g, off, color, op) { return mk('stop', { offset: off, style: 'stop-color:' + color + ';stop-opacity:' + op }, g); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function f(n) { return Math.round(n * 100) / 100; }
  function px(n) { return Math.round(n) + 0.5; } // crisp 1px hairline
  // JetBrains Mono advance is 0.6em; labels use .14em tracking at 11px.
  function textW(s) { return s.length * (11 * 0.6 + 11 * 0.14) - 11 * 0.14; }
  function locked() { return root.classList.contains('gate-locked'); }

  /* Shared plate: unit grid (column width = one "Today" healthy span), header. */
  function plate(svg, W, H, id) {
    var pad = W < 480 ? 16 : 22;
    var x0 = pad, x1 = W - pad;
    var u = (x1 - x0) / 10.36;
    var top = 44;
    var defs = mk('defs', null, svg);
    var rg = mk('radialGradient', { id: id + 'gf', cx: '50%', cy: '60%', r: '72%' }, defs);
    stop(rg, '0', '#fff', '1'); stop(rg, '.62', '#fff', '.7'); stop(rg, '1', '#fff', '0');
    var m = mk('mask', { id: id + 'gm', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);
    mk('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#' + id + 'gf)' }, m);
    return { defs: defs, pad: pad, x0: x0, x1: x1, u: u, top: top, W: W, H: H, mask: 'url(#' + id + 'gm)' };
  }
  function gridPath(svg, P, yBase) {
    var d = '', x, y;
    for (x = P.x0; x <= P.W - 1; x += P.u) d += 'M' + px(x) + ' ' + P.top + 'V' + P.H;
    for (y = yBase; y >= P.top + 4; y -= P.u) d += 'M0 ' + px(y) + 'H' + P.W;
    for (y = yBase + P.u; y < P.H; y += P.u) d += 'M0 ' + px(y) + 'H' + P.W;
    mk('path', { d: d, 'class': 'gv-grid', mask: P.mask }, svg);
    mk('path', { d: 'M0 ' + (P.top - 0.5) + 'H' + P.W, 'class': 'gv-rule' }, svg);
  }

  /* ---------- runtime: one rAF loop for all widgets ---------- */
  var widgets = [], raf = 0, last = 0;
  function active() {
    if (reduce || locked() || document.hidden) return false;
    for (var i = 0; i < widgets.length; i++) if (widgets[i].visible) return true;
    return false;
  }
  function tick(now) {
    raf = 0;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    for (var i = 0; i < widgets.length; i++) {
      var w = widgets[i];
      if (w.visible) { w.t += dt; w.draw(); }
    }
    if (active()) raf = requestAnimationFrame(tick); else last = 0;
  }
  function kick() {
    if (!raf && active()) { last = 0; raf = requestAnimationFrame(tick); }
  }

  function mount(el, factory) {
    while (el.firstChild) el.removeChild(el.firstChild);
    var box = document.createElement('div');
    box.className = 'gv-plate';
    box.setAttribute('aria-hidden', 'true');
    el.appendChild(box);
    var svg = mk('svg', { 'class': 'gv-svg', 'aria-hidden': 'true', focusable: 'false' }, box);
    var w = factory(svg);
    w.el = el; w.t = 0; w.visible = false; w.W = 0; w.H = 0;
    function layout() {
      var r = svg.getBoundingClientRect();
      var W = Math.round(r.width), H = Math.round(r.height);
      if (W < 40 || H < 40 || (W === w.W && H === w.H)) return;
      w.W = W; w.H = H;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      w.build(W, H);
      w.draw();
    }
    layout();
    if ('ResizeObserver' in window) {
      var pend = 0;
      new ResizeObserver(function () {
        if (pend) return;
        pend = requestAnimationFrame(function () { pend = 0; layout(); });
      }).observe(box);
    } else {
      window.addEventListener('resize', layout);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (ents) {
        ents.forEach(function (e) { w.visible = e.isIntersecting && e.intersectionRatio >= 0.2; });
        kick();
      }, { threshold: [0, 0.2, 0.5, 1] }).observe(box);
    } else {
      w.visible = true;
    }
    widgets.push(w);
    return w;
  }

  /* =========================================================
     (a) LIFESPAN: Today vs 10X, drawn to one true scale.
     One grid column = one "Today" healthy span. 10X spans ten.
     ========================================================= */
  var DEC_TODAY = 0.9, DEC_10X = 0.36; // decline lengths, in grid units

  function decline(s) { s = clamp(s, 0, 1); return Math.pow(1 - s, 1.7) * (1 + 1.7 * s); }

  function lifespan(svg) {
    var id = 'gvL' + (uid++);
    var S = {};

    function build(W, H) {
      var P = plate(svg, W, H, id), d = P.defs;
      var u = P.u, x0 = P.x0;
      var ph = clamp(u * 0.5, 14, 26);
      var bh = ph + 26, gap = (H - P.top - 2 * bh - 12) / 3;
      var yA = Math.round(P.top + gap * 1.05 + bh), yB = Math.round(yA + gap * 0.9 + bh);
      S.P = P; S.u = u; S.x0 = x0; S.ph = ph; S.yA = yA; S.yB = yB; S.final = false;

      // gradients: healthy = orange to amber along the true time scale
      var gH = mk('linearGradient', { id: id + 'h', gradientUnits: 'userSpaceOnUse', x1: f(x0), y1: 0, x2: f(x0 + 10 * u), y2: 0 }, d);
      stop(gH, '0', C.orange, '1'); stop(gH, '1', C.amber, '1');
      // soft vertical sheen over the healthy bar (normal compositing, no glow)
      var gV = mk('linearGradient', { id: id + 'v', x1: 0, y1: 0, x2: 0, y2: 1 }, d);
      stop(gV, '0', '#ffffff', '.34'); stop(gV, '.45', '#ffffff', '.08'); stop(gV, '1', '#ffffff', '0');
      // decline: warm edge fading to soft red, then to nothing
      var gD = mk('linearGradient', { id: id + 'd', x1: 0, y1: 0, x2: 1, y2: 0 }, d);
      stop(gD, '0', C.amber, '.22'); stop(gD, '.3', C.red, '.12'); stop(gD, '1', C.red, '0');
      var gDL = mk('linearGradient', { id: id + 'dl', x1: 0, y1: 0, x2: 1, y2: 0 }, d);
      stop(gDL, '0', C.amber, '1'); stop(gDL, '.32', C.red, '.62'); stop(gDL, '1', C.slate, '.18');
      var gK = mk('linearGradient', { id: id + 'k', x1: 0, y1: 0, x2: 1, y2: 0 }, d);
      stop(gK, '0', C.red, '.75'); stop(gK, '1', C.slate, '.15');
      var gKH = mk('linearGradient', { id: id + 'kh', x1: 0, y1: 0, x2: 1, y2: 0 }, d);
      stop(gKH, '0', C.orange, '1'); stop(gKH, '1', C.amber, '1');
      var gS = mk('linearGradient', { id: id + 's', gradientUnits: 'userSpaceOnUse', x1: -200, y1: 0, x2: -100, y2: 0 }, d);
      stop(gS, '0', '#ffffff', '0'); stop(gS, '.5', '#ffffff', '1'); stop(gS, '1', '#ffffff', '0');
      S.shGrad = gS;
      // gentle drop shadow under the healthy bars
      var fl = mk('filter', { id: id + 'sh', x: '-10%', y: '-40%', width: '120%', height: '220%' }, d);
      mk('feDropShadow', { dx: 0, dy: 2, stdDeviation: 2.5, 'flood-color': '#c2410c', 'flood-opacity': '.16' }, fl);
      S.shadow = 'url(#' + id + 'sh)';

      gridPath(svg, P, yB);

      // header key (doubles as the legend)
      var hx = x0, hy = 24;
      txt(svg, hx, hy, 'Healthy years', 'gv-lbl gv-lbl-hi');
      var w1 = textW('Healthy years');
      mk('rect', { x: f(hx), y: hy + 7.5, width: f(w1), height: 3, rx: 1.5, fill: 'url(#' + id + 'kh)' }, svg);
      var hx2 = hx + w1 + 26;
      txt(svg, hx2, hy, 'Decline', 'gv-lbl');
      mk('rect', { x: f(hx2), y: hy + 7.5, width: f(textW('Decline')), height: 3, rx: 1.5, fill: 'url(#' + id + 'k)' }, svg);

      // rows
      S.rows = [row(yA, 'Today', 'gv-lbl gv-lbl-hi', DEC_TODAY), row(yB, '10X', 'gv-lbl gv-lbl-o', DEC_10X)];

      // unit guide: Today's healthy span == one 10X column
      var gx = px(x0 + u);
      S.guide = mk('path', { d: 'M' + gx + ' ' + (yA + 6) + 'V' + f(yB - ph - 5), 'class': 'gv-guide' }, svg);

      // 10X extras: column dividers, sheen sweep, growth head
      var R = S.rows[1];
      S.div = mk('path', { 'class': 'gv-div' }, R.g);
      // the sheen fades out toward the baseline (vertical mask), so it reads as a light catch
      var gM = mk('linearGradient', { id: id + 'mg', x1: 0, y1: 0, x2: 0, y2: 1 }, d);
      stop(gM, '0', '#ffffff', '1'); stop(gM, '1', '#ffffff', '0');
      var sm = mk('mask', { id: id + 'sm', maskUnits: 'userSpaceOnUse', x: 0, y: f(yB - ph - 2), width: W, height: f(ph + 4) }, d);
      mk('rect', { x: 0, y: f(yB - ph), width: W, height: f(ph), fill: 'url(#' + id + 'mg)' }, sm);
      S.shA = mk('path', { fill: 'url(#' + id + 's)', opacity: 0, mask: 'url(#' + id + 'sm)' }, R.g);
      S.halo = mk('circle', { r: 8, 'class': 'gv-halo', opacity: 0 }, R.g);
      S.head = mk('circle', { r: 3.2, 'class': 'gv-head', opacity: 0 }, R.g);
    }

    function row(yb, label, cls, dec) {
      var g = mk('g', null, svg), P = S.P;
      var o = { g: g, yb: yb, dec: dec };
      o.label = txt(g, S.x0, yb - S.ph - 12, label, cls);
      mk('path', { d: 'M' + S.x0 + ' ' + px(yb) + 'H' + P.x1, 'class': 'gv-base' }, g);
      o.ticksOff = mk('path', { 'class': 'gv-tick' }, g);
      o.ticksOn = mk('path', { 'class': 'gv-tick gv-tick-on' }, g);
      o.da = mk('path', { fill: 'url(#' + id + 'd)' }, g);
      o.dl = mk('path', { stroke: 'url(#' + id + 'dl)', 'class': 'gv-line' }, g);
      o.ha = mk('path', { fill: 'url(#' + id + 'h)', filter: S.shadow }, g);
      o.hv = mk('path', { fill: 'url(#' + id + 'v)' }, g);
      o.hl = mk('path', { 'class': 'gv-line gv-line-h' }, g);
      return o;
    }

    // draw one track with healthy span of `units` (grown by pg) and decline grown by pd
    function track(o, units, pg, pd) {
      var x0 = S.x0, u = S.u, yb = o.yb, ph = S.ph, yt = yb - ph;
      var xh = x0 + units * u * pg;
      if (pg <= 0) { o.ha.setAttribute('d', ''); o.hv.setAttribute('d', ''); o.hl.setAttribute('d', ''); }
      else {
        var r = Math.min(4, (xh - x0) * 0.5);
        var top = 'M' + x0 + ' ' + yb + 'V' + f(yt + r) + 'Q' + x0 + ' ' + f(yt) + ' ' + f(x0 + r) + ' ' + f(yt) + 'H' + f(xh);
        o.ha.setAttribute('d', top + 'V' + yb + 'Z');
        o.hv.setAttribute('d', top + 'V' + yb + 'Z');
        o.hl.setAttribute('d', top);
      }
      if (pd <= 0) { o.da.setAttribute('d', ''); o.dl.setAttribute('d', ''); }
      else {
        var L = o.dec * u, n = 28, pts = '';
        for (var i = 0; i <= n; i++) {
          var s = (i / n) * pd;
          pts += 'L' + f(xh + s * L) + ' ' + f(yb - ph * decline(s));
        }
        var line = 'M' + f(xh) + ' ' + f(yt) + pts;
        o.dl.setAttribute('d', line);
        o.da.setAttribute('d', line + 'L' + f(xh + pd * L) + ' ' + yb + 'L' + f(xh) + ' ' + yb + 'Z');
      }
      // ruler ticks under the baseline: lit where healthy years are
      var on = '', off = '';
      for (var k = 0; k <= 10; k++) {
        var x = px(x0 + k * u), tl = (k === 0 || k === 10) ? 7 : 4;
        var seg = 'M' + x + ' ' + (yb + 3) + 'v' + tl;
        if (x0 + k * u <= xh + 0.5 && pg > 0) on += seg; else off += seg;
      }
      o.ticksOn.setAttribute('d', on);
      o.ticksOff.setAttribute('d', off);
      return xh;
    }

    // timeline (seconds since first in view)
    var T_A = 0.25, T_B = 1.35, GROW = 3.2, T_SH = T_B + GROW + 0.9, SH_P = 7.5;

    function draw() {
      if (!S.rows) return;
      var t = reduce ? 99 : this.t;
      var A = S.rows[0], B = S.rows[1];
      var settled = t > T_B + GROW + 1.0;
      if (settled && S.final) { shimmer(t, B); return; }
      S.final = settled;
      var lab = easeOut(seg(t, 0, 0.8));
      A.g.setAttribute('opacity', f(0.45 + 0.55 * lab));
      B.g.setAttribute('opacity', f(0.45 + 0.55 * easeOut(seg(t, T_B - 0.6, T_B + 0.2))));
      track(A, 1, easeOut(seg(t, T_A, T_A + 0.8)), ease(seg(t, T_A + 0.7, T_A + 1.6)));
      var pg = ease(seg(t, T_B, T_B + GROW));
      var xh = track(B, 10, pg, ease(seg(t, T_B + GROW - 0.05, T_B + GROW + 0.6)));
      S.guide.setAttribute('opacity', f(easeOut(seg(t, T_B - 0.4, T_B + 0.4))));

      // column dividers inside the 10X fill (ten equal spans)
      var dv = '';
      for (var k = 1; k < 10; k++) {
        var x = S.x0 + k * S.u;
        if (x < xh - 1) dv += 'M' + px(x) + ' ' + f(B.yb - S.ph + 2) + 'V' + (B.yb - 1);
      }
      S.div.setAttribute('d', dv);

      // growth head
      var hv = pg > 0 && pg < 1 ? 1 : (pg >= 1 ? 1 - seg(t, T_B + GROW, T_B + GROW + 0.6) : 0);
      S.head.setAttribute('cx', f(xh)); S.head.setAttribute('cy', f(B.yb - S.ph));
      S.halo.setAttribute('cx', f(xh)); S.halo.setAttribute('cy', f(B.yb - S.ph));
      S.head.setAttribute('opacity', f(hv));
      S.halo.setAttribute('opacity', f(hv * 0.22));

      shimmer(t, B);
    }

    // living shimmer: a soft pulse travelling along the healthy years
    function shimmer(t, B) {
      var si = reduce ? 0 : easeOut(seg(t, T_SH, T_SH + 1.5));
      if (si > 0) {
        var ph = ((t - T_SH) % SH_P) / SH_P;           // 0..1
        var span = 10 * S.u, hw = Math.max(30, span * 0.085);
        var cx = S.x0 - hw + (span + 2 * hw) * ease(seg(ph, 0, 0.78));
        S.shGrad.setAttribute('x1', f(cx - hw));
        S.shGrad.setAttribute('x2', f(cx + hw));
        var yt = B.yb - S.ph, x10 = S.x0 + 10 * S.u;
        S.shA.setAttribute('d', 'M' + f(S.x0 + 1) + ' ' + (B.yb - 1) + 'V' + f(yt + 2) + 'H' + f(x10 - 1) + 'V' + (B.yb - 1) + 'Z');
        S.shA.setAttribute('opacity', f(0.45 * si));
      }
    }

    return { build: build, draw: draw };
  }

  /* =========================================================
     (b) MORPHOLOGY: Maintain / Repair / Shape.
     The form is a radial Fourier contour; a dashed ghost is the
     target pattern. Maintain = hold to it, Repair = return to it,
     Shape = the target is changed by choice and the form follows.
     ========================================================= */
  // coefficients [a1,b1,a2,b2,a3,b3,a4,b4,a5,b5]
  var FORMS = [
    [0.02, 0.01, 0.07, 0.02, 0.01, 0.05, -0.02, 0.0, 0.0, 0.01],     // round cell
    [0.06, 0.0, 0.17, 0.0, 0.07, 0.0, 0.0, 0.025, 0.01, 0.0],       // elongated, bean-like
    [0.0, 0.03, 0.03, -0.02, 0.0, 0.13, 0.01, 0.0, 0.02, 0.0]        // three-lobed
  ];
  var NOTCH_AT = [-0.85, -1.05, -0.55]; // radians (screen space, negative = upper side)
  var PH = ['Maintain', 'Repair', 'Shape'];
  var D_M = 4.6, D_R = 5.6, D_S = 5.4, CYC = D_M + D_R + D_S;

  function rAt(c, th) {
    var r = 1;
    for (var k = 1; k <= 5; k++) r += c[2 * k - 2] * Math.cos(k * th) + c[2 * k - 1] * Math.sin(k * th);
    return r;
  }
  function mix(a, b, t) { var o = []; for (var i = 0; i < a.length; i++) o.push(lerp(a[i], b[i], t)); return o; }
  function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function bump(d, w) { var x = d / w; if (x <= -1 || x >= 1) return 0; x = 1 - x * x; return x * x * x; }
  function smin(a, b, k) { return -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k)); }

  function morphology(svg) {
    var id = 'gvM' + (uid++);
    var S = {};
    var N = 120, DOTS = 64, GOLD = Math.PI * (3 - Math.sqrt(5));

    function build(W, H) {
      var P = plate(svg, W, H, id);
      S.P = P;
      var cy = Math.round(P.top + (H - P.top) / 2);
      var R = Math.min((H - P.top) / 2 - 27, W * 0.3);
      S.cx = Math.round(W / 2); S.cy = cy; S.R = R;
      S.sx = clamp(((W - 2 * P.pad) * 0.34) / R, 1, 1.42);
      gridPath(svg, P, Math.round(cy + P.u * 1.5));

      // crosshair at the form's centre
      var cx = S.cx;
      mk('path', { d: 'M' + (cx - 6) + ' ' + px(cy) + 'h12M' + px(cx) + ' ' + (cy - 6) + 'v12', 'class': 'gv-cross' }, svg);

      var d = P.defs;
      var gk = mk('linearGradient', { id: id + 'kh', x1: 0, y1: 0, x2: 1, y2: 0 }, d);
      stop(gk, '0', C.skyDeep, '1'); stop(gk, '1', C.sky, '1');

      // header: phase stepper (same system as the lifespan key)
      S.steps = [];
      var x = P.x0, hy = 24;
      for (var i = 0; i < 3; i++) {
        var w = textW(PH[i]);
        var g = mk('g', null, svg);
        txt(g, x, hy, PH[i], 'gv-lbl');
        var on = txt(g, x, hy, PH[i], 'gv-lbl gv-lbl-s');
        mk('rect', { x: f(x), y: hy + 7.5, width: f(w), height: 3, rx: 1.5, 'class': 'gv-track' }, g);
        var bar = mk('rect', { x: f(x), y: hy + 7.5, height: 3, rx: 1.5, width: 0, fill: 'url(#' + id + 'kh)' }, g);
        S.steps.push({ on: on, bar: bar, w: w });
        x += w + 26;
      }

      // tissue body: soft warm fill, darker toward the rim, gentle drop shadow
      var gw = mk('radialGradient', { id: id + 'in', cx: '46%', cy: '42%', r: '62%' }, d);
      stop(gw, '0', C.amber, '.04'); stop(gw, '.6', C.orange, '.08'); stop(gw, '1', C.orange, '.18');
      var fl = mk('filter', { id: id + 'sh', x: '-20%', y: '-20%', width: '140%', height: '150%' }, d);
      mk('feDropShadow', { dx: 0, dy: 4, stdDeviation: 5, 'flood-color': '#c2410c', 'flood-opacity': '.14' }, fl);

      S.fill = mk('path', { fill: 'url(#' + id + 'in)', filter: 'url(#' + id + 'sh)' }, svg);
      S.ghost = mk('path', { 'class': 'gv-ghost' }, svg);
      S.ghostN = mk('path', { 'class': 'gv-ghost gv-ghost-n', opacity: 0 }, svg);
      S.in2 = mk('path', { 'class': 'gv-inner', opacity: 0.3 }, svg);
      S.in1 = mk('path', { 'class': 'gv-inner', opacity: 0.5 }, svg);
      S.dots = [];
      var dg = mk('g', { 'class': 'gv-dots' }, svg);
      for (var j = 0; j < DOTS; j++) {
        var rho = Math.sqrt((j + 0.6) / DOTS) * 0.84;
        S.dots.push({ rho: rho, th: j * GOLD, el: mk('circle', { r: 1.25 }, dg) });
      }
      S.heal = mk('path', { 'class': 'gv-heal', opacity: 0 }, svg);
      S.main = mk('path', { 'class': 'gv-form' }, svg);
      S.dmg = mk('path', { 'class': 'gv-form' }, svg);
      S.dmgR = mk('path', { 'class': 'gv-dmg', opacity: 0 }, svg);
    }

    function pt(r, th) {
      return [S.cx + Math.cos(th) * r * S.R * S.sx, S.cy + Math.sin(th) * r * S.R];
    }
    function pathOf(fn, a0, a1, n, close) {
      var d = '';
      for (var i = 0; i <= n; i++) {
        var th = lerp(a0, a1, i / n), p = pt(fn(th), th);
        d += (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1]);
      }
      return close ? d + 'Z' : d;
    }

    function draw() {
      if (!S.P) return;
      var t = reduce ? 0 : this.t;
      var cyc = Math.floor(t / CYC), lt = t - cyc * CYC;
      var fi = cyc % 3, cur = FORMS[fi], nxt = FORMS[(fi + 1) % 3];
      var phase, pp;
      if (lt < D_M) { phase = 0; pp = lt / D_M; }
      else if (lt < D_M + D_R) { phase = 1; pp = (lt - D_M) / D_R; }
      else { phase = 2; pp = (lt - D_M - D_R) / D_S; }
      if (reduce) { phase = -1; }

      // contour coefficients (inner layers lag slightly while shaping)
      var cOut = cur, cIn1 = cur, cIn2 = cur, cGhost = cur, ghostLift = 0;
      if (phase === 2) {
        var ls = lt - D_M - D_R;
        cGhost = mix(cur, nxt, ease(seg(ls, 0.15, 1.25)));
        cOut = mix(cur, nxt, ease(seg(ls, 1.0, 3.8)));
        cIn1 = mix(cur, nxt, ease(seg(ls, 1.25, 4.05)));
        cIn2 = mix(cur, nxt, ease(seg(ls, 1.5, 4.3)));
        // the target shows only while the form has not yet reached it
        ghostLift = clamp((ease(seg(ls, 0.15, 1.25)) - ease(seg(ls, 1.0, 3.8))) * 3, 0, 1);
      }

      // damage + healing (Repair)
      var dmg = 0, healGlow = 0;
      if (phase === 1) {
        var lr = lt - D_M;
        dmg = easeOut(seg(lr, 0.2, 1.2)) * (1 - ease(seg(lr, 2.0, 4.8)));
        healGlow = Math.sin(Math.PI * seg(lr, 1.9, 5.2));
      }
      var th0 = NOTCH_AT[fi], NW = 0.62, ND = 0.24 * dmg;

      // breathing (continuous, never resets)
      var tb = reduce ? 0 : this.t;
      var br = 1 + 0.014 * Math.sin(TAU * tb / 4.6);
      function rT(c, th) { return (rAt(c, th) + 0.007 * Math.sin(3 * th - 0.8 * tb)) * br; }
      function rO(th) { return rT(cOut, th) - ND * bump(wrap(th - th0), NW); }

      S.ghost.setAttribute('d', pathOf(function (th) { return rAt(cGhost, th); }, 0, TAU, N, true));
      S.ghost.setAttribute('opacity', f(0.95 * ghostLift));

      var outer = pathOf(rO, 0, TAU, N, true);
      S.fill.setAttribute('d', outer);
      S.in1.setAttribute('d', pathOf(function (th) { return smin(0.78 * rT(cIn1, th), rO(th) - 0.07, 0.035); }, 0, TAU, N, true));
      S.in2.setAttribute('d', pathOf(function (th) { return smin(0.56 * rT(cIn2, th), rO(th) - 0.16, 0.035); }, 0, TAU, N, true));

      // split outer contour so the damaged arc can dim while the rest stays steady
      var aw = NW * 0.92;
      S.main.setAttribute('d', pathOf(rO, th0 + aw, th0 + TAU - aw, N, false));
      S.dmg.setAttribute('d', pathOf(rO, th0 - aw, th0 + aw, 24, false));
      var dmgArc = pathOf(rO, th0 - aw, th0 + aw, 24, false);
      S.dmg.setAttribute('opacity', f(1 - dmg));
      S.dmgR.setAttribute('d', dmgArc);
      S.dmgR.setAttribute('opacity', f(0.85 * dmg));
      S.heal.setAttribute('d', pathOf(rO, th0 - aw * 1.2, th0 + aw * 1.2, 28, false));
      // the target pattern shows through where the form has been damaged
      S.ghostN.setAttribute('d', pathOf(function (th) { return rAt(cGhost, th); }, th0 - aw * 0.8, th0 + aw * 0.8, 24, false));
      S.ghostN.setAttribute('opacity', f(0.9 * easeOut(Math.min(1, dmg * 1.6))));
      S.heal.setAttribute('opacity', f(0.38 * healGlow));

      // tissue pattern: dots hold their place in the form and regrow in the notch
      for (var i = 0; i < S.dots.length; i++) {
        var D = S.dots[i];
        var th = D.th + 0.04 * Math.sin(tb * 0.35 + i);
        var want = D.rho * rT(cIn1, th), have = rO(th) - 0.06;
        var a = clamp((have - want) / 0.07, 0, 1);
        var p = pt(Math.min(want, have + 0.03), th);
        D.el.setAttribute('cx', f(p[0])); D.el.setAttribute('cy', f(p[1]));
        D.el.setAttribute('opacity', f((0.34 + 0.32 * (1 - D.rho)) * a));
      }

      // stepper
      for (var s = 0; s < 3; s++) {
        var st = S.steps[s];
        var act = phase === -1 ? 1 : (s === phase ? Math.min(1, pp * 12, (1 - pp) * 12) : 0);
        st.on.setAttribute('opacity', f(act));
        var bw = phase === -1 ? st.w : (s === phase ? st.w * pp : 0);
        st.bar.setAttribute('width', f(bw));
        st.bar.setAttribute('opacity', f(phase === -1 ? 0.55 : 1));
      }
    }

    return { build: build, draw: draw };
  }

  /* ---------- boot ---------- */
  function init() {
    var a = document.querySelectorAll('[data-widget="lifespan"]');
    var b = document.querySelectorAll('[data-widget="morphology"]');
    for (var i = 0; i < a.length; i++) mount(a[i], lifespan);
    for (var j = 0; j < b.length; j++) mount(b[j], morphology);
    document.addEventListener('visibilitychange', kick);
    document.addEventListener('site:unlocked', function () { setTimeout(kick, 30); });
    if ('MutationObserver' in window) {
      new MutationObserver(kick).observe(root, { attributes: true, attributeFilter: ['class'] });
    }
    if (mq) {
      var onMq = function () {
        reduce = mq.matches;
        widgets.forEach(function (w) { w.draw(); });
        kick();
      };
      if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    }
    kick();
    // inspection hook (no effect unless called): seek all widgets to time t
    window.__goalVisuals = {
      seek: function (t) { widgets.forEach(function (w) { w.t = t; w.draw(); }); },
      times: function () { return widgets.map(function (w) { return w.t; }); }
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

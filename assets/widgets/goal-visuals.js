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
    red: 'var(--red, #ef4444)', slate: 'var(--muted, #64748b)',
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
  // JetBrains Mono advance is 0.6em; labels use .14em tracking at 0.6875rem
  // (11px at the default 16px root, larger when the reader raises the text size).
  function lblPx() {
    var r = parseFloat(window.getComputedStyle(root).fontSize);
    return 0.6875 * (r > 0 ? r : 16);
  }
  function textW(s) { var p = lblPx(); return s.length * (p * 0.6 + p * 0.14) - p * 0.14; }
  function locked() { return root.classList.contains('gate-locked'); }
  // site-wide "Pause animations" control (layout): html.motion-paused + document 'site:motion'
  function paused() { return root.classList.contains('motion-paused'); }

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
  function gridPath(svg, P, yBase, noRule) {
    var d = '', x, y;
    for (x = P.x0; x <= P.W - 1; x += P.u) d += 'M' + px(x) + ' ' + P.top + 'V' + P.H;
    for (y = yBase; y >= P.top + 4; y -= P.u) d += 'M0 ' + px(y) + 'H' + P.W;
    for (y = yBase + P.u; y < P.H; y += P.u) d += 'M0 ' + px(y) + 'H' + P.W;
    mk('path', { d: d, 'class': 'gv-grid', mask: P.mask }, svg);
    if (!noRule) mk('path', { d: 'M0 ' + (P.top - 0.5) + 'H' + P.W, 'class': 'gv-rule' }, svg);
  }

  /* ---------- runtime: one rAF loop for all widgets ---------- */
  var widgets = [], raf = 0, last = 0;
  function active() {
    if (reduce || paused() || locked() || document.hidden) return false;
    for (var i = 0; i < widgets.length; i++) if (widgets[i].visible) return true;
    return false;
  }
  function tick(now) {
    raf = 0;
    // paused between frames: stop at once, so the frame on screen is exactly the one kept
    if (paused() || locked()) { last = 0; return; }
    // 0.12 s cap: slow frames still advance the intros at true speed, while a
    // tab switch or scroll-away (both pause the loop) cannot cause a jump
    var dt = last ? Math.min(0.12, (now - last) / 1000) : 0;
    last = now;
    for (var i = 0; i < widgets.length; i++) {
      var w = widgets[i];
      if (!w.visible) continue;
      var was = w.t;
      w.t += dt;
      // a staggered clock (t < 0) holds its first frame, so there is nothing to redraw yet
      if (!(was < 0 && w.t < 0)) w.draw();
    }
    if (active()) raf = requestAnimationFrame(tick); else last = 0;
  }
  function kick() {
    if (!raf && active()) { last = 0; raf = requestAnimationFrame(tick); }
  }

  /* Pause: the loop stops and the frame on screen stays (each clock simply stops
     advancing). On resume the clocks carry on from that frame (dt is 0 on the first
     tick). A figure that has not started yet has no frame of its own to keep, so it
     shows its settled still instead of an empty plate; if it was never seen paused,
     it gets its entrance back on resume. */
  var wasPaused = false;
  function freeze(w) {
    // (the first 0.15 s of a clock are still its blank opening frame)
    if (w.started && w.t > 0.15) return;
    if (!w.started) w.pre = true;
    w.started = true;
    w.t = w.still;
    if (w.W) w.draw();
  }
  function syncPause() {
    var p = paused();
    if (p === wasPaused) return;
    wasPaused = p;
    if (p) {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      last = 0;
      if (!reduce) widgets.forEach(freeze);
    } else {
      widgets.forEach(function (w) {
        // frozen before its start and never in view since: let it enter as usual
        if (w.pre && !w.ratio) { w.pre = false; w.started = false; w.t = 0; if (w.reset) w.reset(); if (w.W) w.draw(); }
        w.pre = false;
        w.update();
      });
      pairCheck(); // a reset pair gets its stagger back
      kick();
    }
  }

  // a figure's clock starts once this much of its plate is in view (then runs while any of it is)
  var START_RATIO = 0.35;
  // side-by-side goal cards: the morphology starts this much later, so the eye takes the lifespan
  // first (the site's motion spec: figures side by side stagger by about 500ms, left first)
  var STAGGER = 0.5;

  /* Wait for the card's reveal (site.js adds .in) before a clock may run, so a
     figure never plays under a fading wrapper. Returns true when already clear. */
  function watchReveal(el, w, update) {
    var rv = el.closest ? el.closest('.reveal') : null;
    if (!rv || rv.classList.contains('in') || !root.classList.contains('js') || !('MutationObserver' in window)) return true;
    var mo = new MutationObserver(function () {
      if (!rv.classList.contains('in')) return;
      mo.disconnect();
      // let the card's fade get well under way (it runs 900ms) before the figure starts
      setTimeout(function () { w.ready = true; update(); kick(); }, reduce ? 0 : 480);
    });
    mo.observe(rv, { attributes: true, attributeFilter: ['class'] });
    return false;
  }

  function mount(el, factory) {
    while (el.firstChild) el.removeChild(el.firstChild);
    var box = document.createElement('div');
    box.className = 'gv-plate';
    el.appendChild(box);
    var svg = mk('svg', { 'class': 'gv-svg', 'aria-hidden': 'true', focusable: 'false' }, box);
    var w = factory(svg, box, el);
    w.el = el; w.t = 0; w.visible = false; w.W = 0; w.H = 0;
    w.delay = 0; w.started = false; w.ratio = 0;
    function update() {
      if (w.ratio > 0 && wasPaused) w.pre = false; // its still has been on screen
      var on = !!w.ready && w.ratio > 0 && (w.started || w.ratio >= START_RATIO);
      // a figure the reader has already operated (a tab chosen early) skips the stagger
      if (on && !w.started) { w.started = true; if (!w.touched) w.t = -w.delay; }
      w.visible = on;
    }
    w.update = update;
    w.ready = watchReveal(el, w, update);
    if (wasPaused && !reduce) freeze(w);
    function layout() {
      pairCheck();
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
        ents.forEach(function (e) { w.ratio = e.isIntersecting ? Math.max(e.intersectionRatio, 0.001) : 0; });
        update();
        kick();
      }, { threshold: [0, START_RATIO, 0.6, 1] }).observe(box);
    } else {
      w.ratio = 1; w.ready = true; update();
    }
    widgets.push(w);
    pairCheck();
    return w;
  }

  /* The two goal cards share a row on wide screens: stagger the morphology
     (right) after the lifespan (left). Stacked in one column, no offset. */
  function pairCheck() {
    var L = null, M = null;
    for (var i = 0; i < widgets.length; i++) {
      if (widgets[i].kind === 'lifespan' && !L) L = widgets[i];
      if (widgets[i].kind === 'morphology' && !M) M = widgets[i];
    }
    if (!L || !M || M.started) return;
    var same = Math.abs(L.el.getBoundingClientRect().top - M.el.getBoundingClientRect().top) < 4;
    M.delay = same && !reduce ? STAGGER : 0;
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
      stop(gK, '0', C.red, '.85'); stop(gK, '1', C.red, '.2');
      var gKH = mk('linearGradient', { id: id + 'kh', x1: 0, y1: 0, x2: 1, y2: 0 }, d);
      stop(gKH, '0', C.orange, '1'); stop(gKH, '1', C.amber, '1');
      var gS = mk('linearGradient', { id: id + 's', gradientUnits: 'userSpaceOnUse', x1: -200, y1: 0, x2: -100, y2: 0 }, d);
      stop(gS, '0', '#ffffff', '0'); stop(gS, '.5', '#ffffff', '1'); stop(gS, '1', '#ffffff', '0');
      S.shGrad = gS;
      // gentle drop shadow under the healthy bars
      var fl = mk('filter', { id: id + 'sh', x: '-10%', y: '-40%', width: '120%', height: '220%' }, d);
      mk('feDropShadow', { dx: 0, dy: 2, stdDeviation: 2.5, 'flood-color': '#c2410c', 'flood-opacity': '.16' }, fl);
      S.shadow = 'url(#' + id + 'sh)';

      // no header rule here: this row is a colour key, not a tab bar
      gridPath(svg, P, yB, true);

      // header: swatch legend (a key, deliberately unlike the morphology tabs)
      var hx = x0, hy = 24, sw = 10;
      mk('rect', { x: f(hx), y: hy - 9, width: sw, height: sw, rx: 2.5, fill: 'url(#' + id + 'kh)', 'class': 'gv-sw gv-sw-h' }, svg);
      txt(svg, hx + sw + 8, hy, 'Healthy years', 'gv-lbl gv-lbl-hi');
      var hx2 = hx + sw + 8 + textW('Healthy years') + 22;
      mk('rect', { x: f(hx2), y: hy - 9, width: sw, height: sw, rx: 2.5, fill: 'url(#' + id + 'k)', 'class': 'gv-sw gv-sw-d' }, svg);
      txt(svg, hx2 + sw + 8, hy, 'Decline', 'gv-lbl');

      // rows
      S.rows = [row(yA, 'Today', 'gv-lbl gv-lbl-hi', DEC_TODAY), row(yB, '10X', 'gv-lbl gv-lbl-o', DEC_10X)];

      // unit guide: Today's healthy span == one 10X column
      var gx = px(x0 + u);
      S.guide = mk('path', { d: 'M' + gx + ' ' + (yA + 6) + 'V' + f(yB - ph - 5), 'class': 'gv-guide' }, svg);

      // 10X extras: column dividers, sheen sweep, growth head
      var R = S.rows[1];
      // faint outline of the full 10X span, so the ratio reads before the bar finishes growing
      var tgt = mk('rect', { x: f(x0), y: f(yB - ph), width: f(10 * u), height: f(ph), rx: 4, 'class': 'gv-target' }, R.g);
      R.g.insertBefore(tgt, R.g.firstChild);
      S.div = mk('path', { 'class': 'gv-div' }, R.g);
      // the sheen fades out toward the baseline (vertical mask), so it reads as a light catch
      var gM = mk('linearGradient', { id: id + 'mg', x1: 0, y1: 0, x2: 0, y2: 1 }, d);
      stop(gM, '0', '#ffffff', '1'); stop(gM, '1', '#ffffff', '0');
      var sm = mk('mask', { id: id + 'sm', maskUnits: 'userSpaceOnUse', x: 0, y: f(yB - ph - 2), width: W, height: f(ph + 4) }, d);
      mk('rect', { x: 0, y: f(yB - ph), width: W, height: f(ph), fill: 'url(#' + id + 'mg)' }, sm);
      S.shA = mk('path', { fill: 'url(#' + id + 's)', opacity: 0, mask: 'url(#' + id + 'sm)', 'class': 'gv-shim' }, R.g);
      S.halo = mk('circle', { r: 8, 'class': 'gv-halo', opacity: 0 }, R.g);
      S.head = mk('circle', { r: 3.2, 'class': 'gv-head', opacity: 0 }, R.g);
    }

    function row(yb, label, cls, dec) {
      var g = mk('g', null, svg), P = S.P;
      var o = { g: g, yb: yb, dec: dec };
      // the row label sits outside the fading group, so it is always full contrast
      o.label = txt(svg, S.x0, yb - S.ph - 12, label, cls);
      mk('path', { d: 'M' + S.x0 + ' ' + px(yb) + 'H' + P.x1, 'class': 'gv-base' }, g);
      o.ticksOff = mk('path', { 'class': 'gv-tick' }, g);
      o.ticksOn = mk('path', { 'class': 'gv-tick gv-tick-on' }, g);
      o.da = mk('path', { fill: 'url(#' + id + 'd)', 'class': 'gv-da' }, g);
      o.dl = mk('path', { stroke: 'url(#' + id + 'dl)', 'class': 'gv-line' }, g);
      o.ha = mk('path', { fill: 'url(#' + id + 'h)', filter: S.shadow, 'class': 'gv-ha' }, g);
      o.hv = mk('path', { fill: 'url(#' + id + 'v)', 'class': 'gv-hv' }, g);
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

    // timeline (seconds since first in view). The 10X span grows on an ease-out,
    // so most of its length is there early and the slow-down reads as reaching.
    var T_A = 0.15, T_B = 0.75, GROW = 1.9, T_SH = T_B + GROW + 0.9, SH_P = 7.5;

    function draw() {
      if (!S.rows) return;
      var t = reduce ? 99 : this.t;
      var A = S.rows[0], B = S.rows[1];
      var settled = t > T_B + GROW + 1.0;
      if (settled && S.final) { shimmer(t, B); return; }
      S.final = settled;
      var lab = easeOut(seg(t, 0, 0.8));
      A.g.setAttribute('opacity', f(0.7 + 0.3 * lab));
      B.g.setAttribute('opacity', f(0.7 + 0.3 * easeOut(seg(t, T_B - 0.6, T_B + 0.2))));
      track(A, 1, easeOut(seg(t, T_A, T_A + 0.8)), ease(seg(t, T_A + 0.7, T_A + 1.6)));
      var pg = easeOut(seg(t, T_B, T_B + GROW));
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

    // the paused still before any intro has run: both spans grown, no shimmer yet
    return { kind: 'lifespan', build: build, draw: draw, still: T_SH };
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

  var PH_START = [0, D_M, D_M + D_R], PH_DUR = [D_M, D_R, D_S];
  // reduced motion: one still frame per phase (steady / damaged and healing / mid-reshape)
  var PH_STILL = [D_M * 0.5, D_M + 2.6, D_M + D_R + 2.4];
  var HOLD = 8, BLEND = 0.45;

  function morphology(svg, box, el) {
    var id = 'gvM' + (uid++);
    var S = { off: 0, hold: null, from: null, last: null, rsel: 0, cur: -1, kb: false };
    var N = 120, DOTS = 64, GOLD = Math.PI * (3 - Math.sqrt(5));
    var self;

    /* Phase tabs: real controls (HTML, outside the aria-hidden SVG). The phases
       auto-advance; choosing one jumps to it and holds there for a few seconds. */
    el.setAttribute('role', 'group');
    var tabs = document.createElement('div');
    tabs.className = 'gv-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Phases');
    box.id = id + 'panel';
    box.setAttribute('role', 'tabpanel');
    // the panel's content for assistive tech: the figure itself, described by the
    // mount's own label (kept on the group as well, so the tabs keep their context)
    var lbl = el.getAttribute('aria-label');
    if (lbl) {
      var fig = document.createElement('div');
      fig.className = 'gv-fig';
      fig.setAttribute('role', 'img');
      fig.setAttribute('aria-label', lbl);
      box.insertBefore(fig, svg);
      fig.appendChild(svg);
    }
    S.tabs = [];
    PH.forEach(function (name, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gv-tab';
      b.id = id + 'tab' + i;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', box.id);
      b.setAttribute('aria-label', name); // mixed case, so the uppercase styling is not read letter by letter
      b.setAttribute('aria-selected', 'false');
      b.tabIndex = -1;
      var l = document.createElement('span');
      l.textContent = name;
      b.appendChild(l);
      b.addEventListener('click', function () { goTo(i); });
      tabs.appendChild(b);
      S.tabs.push(b);
    });
    tabs.addEventListener('keydown', function (e) {
      var i = S.tabs.indexOf(document.activeElement), n = -1;
      if (i < 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % 3;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i + 2) % 3;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = 2;
      if (n < 0) return;
      e.preventDefault();
      S.tabs[n].focus();
      goTo(n);
    });
    // keyboard focus in the tabs freezes auto-advance, so the selection does not move under the user
    tabs.addEventListener('focusin', function (e) {
      var fv = true;
      try { fv = e.target.matches(':focus-visible'); } catch (_) {}
      if (!fv) return;
      S.kb = true;
      wake();
      if (!S.hold && !reduce && self) {
        var T = self.t + S.off, c = Math.floor(T / CYC), lt = T - c * CYC;
        var p = lt < D_M ? 0 : lt < D_M + D_R ? 1 : 2;
        S.hold = { end: c * CYC + PH_START[p] + PH_DUR[p] - 0.001, until: self.t + HOLD };
      }
    });
    tabs.addEventListener('focusout', function (e) {
      if (e.relatedTarget && tabs.contains(e.relatedTarget)) return;
      S.kb = false;
      if (S.hold && self) S.hold.until = Math.max(S.hold.until, self.t + 3);
      kick();
    });
    // tabs and plate share a positioned stage, so the tabs sit on the plate header
    var stage = document.createElement('div');
    stage.className = 'gv-stage';
    el.insertBefore(stage, box);
    stage.appendChild(tabs);
    stage.appendChild(box);

    // a choice made during the stagger delay starts the clock at once
    function wake() { if (!self) return; self.touched = true; if (self.t < 0) self.t = 0; }

    function goTo(p) {
      if (!self) return;
      if (reduce) { S.rsel = p; self.draw(); return; }
      wake();
      var T = self.t + S.off, c = Math.floor(T / CYC), lt = T - c * CYC;
      // once the form has started to change in Shape, the next cycle continues from the new form
      if (lt > D_M + D_R + 1.0) c += 1;
      var start = c * CYC + PH_START[p];
      // a jump straight to Shape skips Repair, so there is no healed seam to carry over
      S.noSeam = p === 2;
      S.hold = { end: start + PH_DUR[p] - 0.001, until: self.t + HOLD };
      if (paused()) {
        // animations paused: no blend; show the phase's telling still at once
        // (steady / damaged and healing / mid-reshape), and play on from it on resume
        S.from = null;
        if (self.t < self.still) self.t = self.still;
        S.off = c * CYC + PH_STILL[p] - self.t;
        S.hold.until = self.t + HOLD;
      } else {
        S.from = S.last ? { q: S.last, t0: self.t } : null;
        S.off = start - self.t;
      }
      self.draw();
      kick();
    }

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
      // header: the phase tabs (HTML) line up with the plate's content edge
      tabs.style.left = (P.pad - 8) + 'px';

      // tissue body: soft warm fill, darker toward the rim, gentle drop shadow
      var gw = mk('radialGradient', { id: id + 'in', cx: '46%', cy: '42%', r: '62%' }, d);
      stop(gw, '0', C.amber, '.04'); stop(gw, '.6', C.orange, '.08'); stop(gw, '1', C.orange, '.18');
      var fl = mk('filter', { id: id + 'sh', x: '-20%', y: '-20%', width: '140%', height: '150%' }, d);
      mk('feDropShadow', { dx: 0, dy: 4, stdDeviation: 5, 'flood-color': '#c2410c', 'flood-opacity': '.14' }, fl);

      S.fill = mk('path', { fill: 'url(#' + id + 'in)', filter: 'url(#' + id + 'sh)', 'class': 'gv-body' }, svg);
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
      S.seam = mk('path', { 'class': 'gv-seam', opacity: 0 }, svg);
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
      var now = Math.max(0, self.t), cyc, lt;
      if (reduce) { cyc = 0; lt = PH_STILL[S.rsel]; }
      else {
        var T = now + S.off;
        if (S.hold) {
          if (S.kb || now < S.hold.until) {
            if (T > S.hold.end) { T = S.hold.end; S.off = T - now; }
          } else S.hold = null;
        }
        cyc = Math.floor(T / CYC); lt = T - cyc * CYC;
      }
      var fi = ((cyc % 3) + 3) % 3, cur = FORMS[fi], nxt = FORMS[(fi + 1) % 3];
      var phase, pp;
      if (lt < D_M) { phase = 0; pp = lt / D_M; }
      else if (lt < D_M + D_R) { phase = 1; pp = (lt - D_M) / D_R; }
      else { phase = 2; pp = (lt - D_M - D_R) / D_S; }

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

      // damage + healing (Repair). The cut lands at 8% of the phase; the target
      // (sky ghost) and the red wound edge stay on from 8% to 80% while the contour
      // eases back; a faint sky seam then marks the healed arc until the tab changes.
      var dmg = 0, healGlow = 0, mark = 0, rec = 0, seam = 0;
      if (phase === 1) {
        var cut = easeOut(seg(pp, 0.06, 0.13));
        rec = ease(seg(pp, 0.26, 0.8));
        dmg = cut * (1 - rec);
        mark = cut * (1 - easeOut(seg(pp, 0.78, 0.86)));
        healGlow = Math.sin(Math.PI * seg(pp, 0.24, 0.84));
        seam = easeOut(seg(pp, 0.8, 0.9));
      } else if (phase === 2 && !S.noSeam) {
        // the seam stays with the healed form as the next phase opens, then lets go
        seam = 1 - easeOut(seg(lt - D_M - D_R, 0, 0.6));
      }
      if (phase !== 2) S.noSeam = false;
      var th0 = NOTCH_AT[fi];

      // after a jump between phases, ease from what was on screen instead of snapping
      var Q = { cOut: cOut, cIn1: cIn1, cIn2: cIn2, cGhost: cGhost, gl: ghostLift, dmg: dmg, heal: healGlow, th0: th0,
        mark: mark, rec: rec, seam: seam };
      if (S.from && !reduce) {
        var k = (now - S.from.t0) / BLEND;
        if (k >= 1 || k < 0) S.from = null;
        else {
          var q = S.from.q, e = ease(k);
          Q = { cOut: mix(q.cOut, cOut, e), cIn1: mix(q.cIn1, cIn1, e), cIn2: mix(q.cIn2, cIn2, e), cGhost: mix(q.cGhost, cGhost, e),
            gl: lerp(q.gl, ghostLift, e), dmg: lerp(q.dmg, dmg, e), heal: lerp(q.heal, healGlow, e), th0: lerp(q.th0, th0, e),
            mark: lerp(q.mark, mark, e), rec: lerp(q.rec, rec, e), seam: lerp(q.seam, seam, e) };
        }
      }
      S.last = Q;
      cOut = Q.cOut; cIn1 = Q.cIn1; cIn2 = Q.cIn2; cGhost = Q.cGhost; ghostLift = Q.gl; dmg = Q.dmg; healGlow = Q.heal; th0 = Q.th0;
      mark = Q.mark; rec = Q.rec; seam = Q.seam;
      var NW = 0.62, ND = 0.24 * dmg;

      // breathing (continuous, never resets)
      var tb = reduce ? 0 : now;
      var br = 1 + 0.014 * Math.sin(TAU * tb / 4.6);
      function rT(c, th) { return (rAt(c, th) + 0.007 * Math.sin(3 * th - 0.8 * tb)) * br; }
      function rO(th) { return rT(cOut, th) - ND * bump(wrap(th - th0), NW); }

      S.ghost.setAttribute('d', pathOf(function (th) { return rAt(cGhost, th); }, 0, TAU, N, true));
      S.ghost.setAttribute('opacity', f(0.95 * ghostLift));

      var outer = pathOf(rO, 0, TAU, N, true);
      S.fill.setAttribute('d', outer);
      // entrance: the inner structure eases in over 600ms when the clock starts
      var ent = reduce ? 1 : easeOut(seg(self.t, 0, 0.6));
      S.in1.setAttribute('opacity', f(0.5 * (0.35 + 0.65 * ent)));
      S.in2.setAttribute('opacity', f(0.3 * (0.35 + 0.65 * ent)));
      S.in1.setAttribute('d', pathOf(function (th) { return smin(0.78 * rT(cIn1, th), rO(th) - 0.07, 0.035); }, 0, TAU, N, true));
      S.in2.setAttribute('d', pathOf(function (th) { return smin(0.56 * rT(cIn2, th), rO(th) - 0.16, 0.035); }, 0, TAU, N, true));

      // split outer contour so the damaged arc can dim while the rest stays steady
      var aw = NW * 0.92;
      S.main.setAttribute('d', pathOf(rO, th0 + aw, th0 + TAU - aw, N, false));
      S.dmg.setAttribute('d', pathOf(rO, th0 - aw, th0 + aw, 24, false));
      var dmgArc = pathOf(rO, th0 - aw, th0 + aw, 24, false);
      // the orange rim regrows under the red edge as the contour heals
      S.dmg.setAttribute('opacity', f(Math.max(1 - mark, 0.75 * rec)));
      S.dmgR.setAttribute('d', dmgArc);
      S.dmgR.setAttribute('opacity', f(0.85 * mark));
      // the seam runs just outside the rim, so it reads beside the orange stroke rather than under it
      var so = 3.5 / S.R;
      S.seam.setAttribute('d', seam > 0.001 ? pathOf(function (th) { return rO(th) + so; }, th0 - aw * 0.8, th0 + aw * 0.8, 20, false) : '');
      S.seam.setAttribute('opacity', f(0.55 * seam));
      S.heal.setAttribute('d', pathOf(rO, th0 - aw * 1.2, th0 + aw * 1.2, 28, false));
      // the target pattern shows through where the form has been damaged
      S.ghostN.setAttribute('d', pathOf(function (th) { return rAt(cGhost, th); }, th0 - aw * 0.8, th0 + aw * 0.8, 24, false));
      S.ghostN.setAttribute('opacity', f(0.9 * mark));
      S.heal.setAttribute('opacity', f(0.38 * healGlow));

      // tissue pattern: dots hold their place in the form and regrow in the notch
      for (var i = 0; i < S.dots.length; i++) {
        var D = S.dots[i];
        var th = D.th + 0.04 * Math.sin(tb * 0.35 + i);
        var want = D.rho * rT(cIn1, th), have = rO(th) - 0.06;
        var a = clamp((have - want) / 0.07, 0, 1);
        var p = pt(Math.min(want, have + 0.03), th);
        D.el.setAttribute('cx', f(p[0])); D.el.setAttribute('cy', f(p[1]));
        D.el.setAttribute('opacity', f((0.34 + 0.32 * (1 - D.rho)) * a * (0.3 + 0.7 * ent)));
      }

      // tabs: selection changes only on phase change; the progress bar fills each frame
      if (phase !== S.cur) {
        S.cur = phase;
        for (var s = 0; s < 3; s++) {
          var on = s === phase;
          S.tabs[s].setAttribute('aria-selected', on ? 'true' : 'false');
          S.tabs[s].tabIndex = on ? 0 : -1;
          if (!on) S.tabs[s].style.setProperty('--p', '0');
        }
        box.setAttribute('aria-labelledby', S.tabs[phase].id);
      }
      S.tabs[phase].style.setProperty('--p', reduce ? '1' : f(pp));
    }

    // still: the entrance has finished, early in Maintain
    self = { kind: 'morphology', build: build, draw: draw, still: 0.6, reset: function () { S.off = 0; S.hold = null; S.from = null; } };
    return self;
  }

  /* ---------- boot ---------- */
  function init() {
    wasPaused = paused();
    var a = document.querySelectorAll('[data-widget="lifespan"]');
    var b = document.querySelectorAll('[data-widget="morphology"]');
    for (var i = 0; i < a.length; i++) mount(a[i], lifespan);
    for (var j = 0; j < b.length; j++) mount(b[j], morphology);
    document.addEventListener('visibilitychange', kick);
    document.addEventListener('site:unlocked', function () { setTimeout(kick, 30); });
    document.addEventListener('site:motion', function () { syncPause(); kick(); });
    if ('MutationObserver' in window) {
      new MutationObserver(function () { syncPause(); kick(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
    }
    if (mq) {
      var onMq = function () {
        reduce = mq.matches;
        if (!reduce && wasPaused) widgets.forEach(freeze);
        widgets.forEach(function (w) { w.draw(); });
        kick();
      };
      if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    }
    kick();
    // inspection hook (no effect unless called): seek all widgets to time t
    window.__goalVisuals = {
      seek: function (t) { widgets.forEach(function (w) { w.t = t; if (w.reset) w.reset(); w.draw(); }); },
      times: function () { return widgets.map(function (w) { return w.t; }); },
      state: function () {
        return { running: !!raf, widgets: widgets.map(function (w) {
          return { kind: w.kind, t: w.t, visible: w.visible, ratio: w.ratio, started: w.started, ready: w.ready, delay: w.delay, pre: !!w.pre };
        }) };
      }
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

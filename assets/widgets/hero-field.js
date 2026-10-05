/* hero-field (light)
   A living sheet of cells on white. Orange-gold cells fire in coordinated waves
   carried by sky-blue signals that travel link by link from a few pacemakers.
   Every so often a patch loses step: its timing scatters and its cells fade
   toward slate. The next sky waves that cross it pull the cells back into rhythm.
   Mounts: canvas[data-widget="hero-field"], optional data-mode="calm". */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var finePointer = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)').matches : false;

  function isReduced() { return !!(mqReduce && mqReduce.matches); }
  function isLocked() { return document.documentElement.classList.contains('gate-locked'); }
  /* the site-wide "Pause animations" control: the field holds its current frame until resumed */
  function isPaused() { return document.documentElement.classList.contains('motion-paused'); }
  function hash(a, b) {
    var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function sm(e0, e1, x) { var t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(x) { x = clamp(x, 0, 1); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function q(a) { return Math.round(clamp(a, 0, 1) * 1000) / 1000; }

  /* ---------- palette, read from the page's CSS variables ---------- */
  var PAL = null;
  function parseCol(v, fb) {
    v = (v || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
    if (m) {
      var hx = m[1];
      if (hx.length === 3) hx = hx[0] + hx[0] + hx[1] + hx[1] + hx[2] + hx[2];
      return [parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16)];
    }
    m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(v);
    if (m) return [+m[1], +m[2], +m[3]];
    return fb;
  }
  function palette() {
    if (PAL) return PAL;
    var cs = getComputedStyle(document.documentElement);
    function g(n, fb) { return parseCol(cs.getPropertyValue(n), fb); }
    PAL = {
      orange: g('--orange', [249, 115, 22]), amber: g('--amber', [245, 158, 11]),
      sky: g('--sky', [14, 165, 233]), skyDeep: g('--sky-deep', [2, 132, 199]),
      red: g('--red', [239, 68, 68]), muted: g('--muted', [100, 116, 139]),
      line2: g('--line-2', [203, 213, 225])
    };
    /* desaturated slate that cells fade toward when they lose step */
    PAL.slate = [148, 163, 184];
    PAL.deep = [234, 88, 12];
    return PAL;
  }
  function lerp3(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function rgb(c) { return Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]); }

  /* ---------- shared sprites: one 3x3 atlas of soft radial fills (normal compositing) ---------- */
  var SPR = null, ATLAS = null, SS = 128;
  function paintSprite(g, ox, oy, col, kind) {
    var h = SS / 2, gr = g.createRadialGradient(ox + h, oy + h, 0, ox + h, oy + h, h);
    col = rgb(col);
    if (kind === 'halo') {
      gr.addColorStop(0, 'rgba(' + col + ',.9)');
      gr.addColorStop(.25, 'rgba(' + col + ',.45)');
      gr.addColorStop(.55, 'rgba(' + col + ',.14)');
      gr.addColorStop(1, 'rgba(' + col + ',0)');
    } else if (kind === 'haze') {
      gr.addColorStop(0, 'rgba(' + col + ',.6)');
      gr.addColorStop(.5, 'rgba(' + col + ',.3)');
      gr.addColorStop(1, 'rgba(' + col + ',0)');
    } else { /* out-of-focus disc with a soft rim */
      gr.addColorStop(0, 'rgba(' + col + ',.35)');
      gr.addColorStop(.7, 'rgba(' + col + ',.5)');
      gr.addColorStop(.88, 'rgba(' + col + ',.7)');
      gr.addColorStop(1, 'rgba(' + col + ',0)');
    }
    g.fillStyle = gr;
    g.fillRect(ox, oy, SS, SS);
    return { sx: ox, sy: oy };
  }
  function sprites() {
    if (SPR) return SPR;
    var P0 = palette(), list = [
      ['hS', P0.sky, 'halo'], ['hO', P0.orange, 'halo'], ['hA', P0.amber, 'halo'],
      ['zR', P0.red, 'haze'], ['zS', P0.slate, 'haze'], ['zK', P0.sky, 'haze'],
      ['bA', P0.amber, 'bokeh'], ['bS', P0.sky, 'bokeh'], ['bO', P0.orange, 'bokeh']
    ];
    ATLAS = document.createElement('canvas');
    ATLAS.width = ATLAS.height = SS * 3;
    var g = ATLAS.getContext('2d');
    SPR = {};
    list.forEach(function (it, k) { SPR[it[0]] = paintSprite(g, (k % 3) * SS, Math.floor(k / 3) * SS, it[1], it[2]); });
    return SPR;
  }
  function blit(ctx, sp, x, y, w, h) { ctx.drawImage(ATLAS, sp.sx, sp.sy, SS, SS, x, y, w, h); }

  /* ---------- style strings, built once per colour and alpha step ---------- */
  var WQ = 5, DQ = 9, AQ = 64, AQ1 = AQ + 1;
  var COL = null, CID = null, STR = [];
  function colours() {
    if (COL) return CID;
    var P0 = palette();
    COL = []; CID = {};
    function add(c) { COL.push(rgb(c)); return COL.length - 1; }
    var wi, di;
    CID.cell = COL.length;
    for (wi = 0; wi < WQ; wi++) for (di = 0; di < DQ; di++) add(lerp3(lerp3(P0.orange, P0.amber, .15 + .85 * wi / (WQ - 1)), P0.slate, di / (DQ - 1)));
    CID.nuc = COL.length;
    for (wi = 0; wi < WQ; wi++) for (di = 0; di < DQ; di++) add(lerp3(lerp3(P0.deep, P0.orange, .6 * wi / (WQ - 1)), P0.slate, di / (DQ - 1)));
    CID.sig = COL.length;
    for (di = 0; di < DQ; di++) add(lerp3(P0.sky, P0.slate, di / (DQ - 1)));
    CID.slate = add(P0.slate);
    CID.line2 = add(P0.line2);
    CID.hue = [add(P0.orange), add(P0.amber), add(P0.sky)];
    return CID;
  }
  /* key = colour id * (AQ + 1) + alpha step */
  function aStep(a, r) {
    /* r: alpha resolution of a group (a divisor of AQ); tiny or very numerous marks use coarser steps */
    if (!r || r === AQ) return Math.round(clamp(a, 0, 1) * AQ);
    return Math.round(clamp(a, 0, 1) * r) * (AQ / r);
  }
  function styleOf(key) {
    return STR[key] || (STR[key] = 'rgba(' + COL[(key / AQ1) | 0] + ',' + ((key % AQ1) / AQ) + ')');
  }
  /* "More contrast" swaps --line, --line-2, --muted and --text: drop every cached colour and
     re-read the tokens. Colour ids keep their positions, so a field's CID indices stay valid. */
  function refreshPalette() {
    PAL = null; COL = null; STR = [];
    colours();
    if (SPR) { SPR = null; sprites(); }
  }
  /* geometry grouped by style: one path and one fill or stroke per group */
  function Batch(n) { this.n = n; this.m = {}; this.keys = []; }
  Batch.prototype.reset = function () {
    for (var i = 0; i < this.keys.length; i++) this.m[this.keys[i]].length = 0;
    this.keys.length = 0;
  };
  Batch.prototype.at = function (key) {
    var a = this.m[key];
    if (!a) a = this.m[key] = [];
    if (!a.length) this.keys.push(key);
    return a;
  };

  /* ---------- one field per canvas ---------- */
  function Field(cv) {
    var ctx = cv.getContext('2d');
    var calm = cv.getAttribute('data-mode') === 'calm';
    var sp = null, CI = colours();
    var W = 0, H = 0, dpr = 1, mobile = false, s = 60, gain = calm ? .42 : 1, PLc = palette();
    var cells = [], links = [], back = [], backPath = null, bokeh = [];
    var srcPos = [], Ts = [], Tb = [], Tk = [], maxT = 1, speed = 100, P = calm ? 6.2 : 4.2;
    var F = null, NW = 0, kmin = 0;
    var t = 0, running = false, raf = 0, last = 0, visible = true, shown = false;
    var ev = { st: 'idle', until: calm ? 9 : 3.5, t0: 0, rec: 0, cx: 0, cy: 0, R: 1 };
    var ptr = { x: -1e5, y: -1e5, lx: null, ly: null, e: 0, tx: 0, ty: 0, ox: 0, oy: 0 };
    /* the canvas box in page coordinates, so pointer events never need a layout read */
    var box = { x: 0, y: 0, w: 1, h: 1 }, boxAge = 0, ptrOn = false, usePtr = finePointer && !calm;
    function measure(r) {
      r = r || cv.getBoundingClientRect();
      box.x = r.left + (window.pageXOffset || 0);
      box.y = r.top + (window.pageYOffset || 0);
      box.w = Math.max(1, r.width);
      box.h = Math.max(1, r.height);
      boxAge = 0;
    }

    cv.setAttribute('aria-hidden', 'true');
    cv.style.opacity = '0';

    /* where the light is allowed to be strong */
    function weight(x, y) {
      if (calm) {
        var dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
        var r = Math.sqrt(dx * dx * .8 + dy * dy * 1.1);
        return .14 + .86 * sm(.3, 1.05, r);
      }
      if (mobile) return (.14 + .86 * sm(H * .5, H * .05, y)) * (.75 + .25 * sm(0, W, x));
      return (.12 + .88 * sm(W * .26, W * .76, x)) * (.55 + .45 * sm(-H * .05, H * .22, y)) * (1 - .35 * sm(H * .78, H * 1.05, y));
    }
    function keep(x, y) {
      if (calm) return .5;
      if (mobile) return .7 + .3 * sm(H * .9, H * .3, y);
      return .45 + .55 * sm(W * .05, W * .6, x);
    }
    function srcOf(k) {
      var n = srcPos.length, h = hash(k * 7 + 1, 991);
      /* the first pacemaker leads most of the time, the others interject */
      if (h < .5) return 0;
      return 1 + Math.floor((h - .5) / .5 * (n - 1));
    }

    function build() {
      var r = cv.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      /* the art is soft (halos, hazes, bokeh): cap the backing store, hairlines stay crisp */
      var budget = calm ? 3e6 : 4.2e6;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (W * H * dpr * dpr > budget) dpr = Math.max(1, Math.sqrt(budget / (W * H)));
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      mobile = W < 760;
      s = clamp(Math.sqrt(W * H / (calm ? (mobile ? 150 : 230) : mobile ? 150 : 250)), mobile ? 44 : 56, calm ? 90 : 84);
      speed = s * (calm ? 1.45 : 2.25);

      /* mid layer: jittered hexagonal sheet of cells */
      cells = [];
      var rowH = s * .866, m = s * 1.1;
      var rows = Math.ceil((H + 2 * m) / rowH) + 1, cols = Math.ceil((W + 2 * m) / s) + 1;
      for (var j = 0; j < rows; j++) {
        for (var i = 0; i < cols; i++) {
          var h1 = hash(i * 7 + 3, j * 13 + 5), h2 = hash(i * 11 + 1, j * 5 + 9), h3 = hash(i + 101, j + 307),
            h4 = hash(i * 3 + 17, j * 17 + 1), h5 = hash(i + 57, j * 29 + 11);
          var x = -m + i * s + (j & 1 ? s * .5 : 0) + (h1 - .5) * s * .42;
          var y = -m + j * rowH + (h2 - .5) * s * .4;
          if (h3 > keep(x, y)) continue;
          var big = h5 > .93 ? 1.4 : 1;
          cells.push({
            bx: x, by: y, x: x, y: y, w: weight(x, y), w0: 0, wi: Math.round(h3 * (WQ - 1)),
            r: s * (.12 + .075 * h4) * big * (calm ? .85 : 1), ay: .74 + .26 * h5, rot: h1 * TAU,
            p1: h2 * TAU, p2: h4 * TAU, fq: .7 + .6 * h3, jit: (h5 - .5) * .07,
            nb: [], d: 0, rw: 0, fl: 0, pass: 0, act: 0, tau: 9,
            hu: h3, col: lerp3(PLc.orange, PLc.amber, .15 + .85 * h3), nuc: lerp3(PLc.deep, PLc.orange, h3 * .6)
          });
        }
      }
      /* links: two nearest always, a few more at random; curved */
      links = [];
      var seen = {}, R2 = (s * 1.34) * (s * 1.34), n = cells.length;
      for (var a = 0; a < n; a++) {
        var ca = cells[a], cand = [];
        for (var b = 0; b < n; b++) {
          if (a === b) continue;
          var dx = cells[b].bx - ca.bx, dy = cells[b].by - ca.by, dd = dx * dx + dy * dy;
          if (dd < R2) cand.push([dd, b]);
        }
        cand.sort(function (u, v) { return u[0] - v[0]; });
        for (var c = 0; c < cand.length; c++) {
          if (c >= 2 && hash(a * 31 + c, 77) > .5) continue;
          var bb = cand[c][1], lo = Math.min(a, bb), hi = Math.max(a, bb), key = lo * 4096 + hi;
          if (seen[key]) continue;
          seen[key] = 1;
          links.push({ a: lo, b: hi, c: (hash(lo, hi) - .5) * .44, w: 0 });
          cells[lo].nb.push(hi); cells[hi].nb.push(lo);
        }
      }

      /* pacemakers */
      var sp0 = calm ? [[1.04, .5], [-.04, .45], [.5, -.06]]
        : mobile ? [[.82, .1], [1.08, .42], [.12, .04]]
        : [[.8, .3], [1.06, .82], [.6, -.06]];
      srcPos = sp0.map(function (p) { return [p[0] * W, p[1] * H]; });
      Ts = srcPos.map(function (p) {
        var best = 0, bd = Infinity;
        for (var i = 0; i < n; i++) {
          var d2 = (cells[i].bx - p[0]) * (cells[i].bx - p[0]) + (cells[i].by - p[1]) * (cells[i].by - p[1]);
          if (d2 < bd) { bd = d2; best = i; }
        }
        var D = dijkstra(best), T = new Float32Array(n), off = Math.sqrt(bd);
        for (var k = 0; k < n; k++) {
          var c = cells[k];
          var dist = isFinite(D[k]) ? D[k] + off : Math.hypot(c.bx - p[0], c.by - p[1]) * 1.25;
          T[k] = dist / speed + c.jit;
        }
        return T;
      });
      maxT = 0;
      Ts.forEach(function (T) { for (var i = 0; i < T.length; i++) if (T[i] > maxT) maxT = T[i]; });

      /* back layer: finer, out-of-focus tissue */
      back = [];
      var bs = s * .6, brow = bs * .866, bm = s * 1.2;
      var brows = Math.ceil((H + 2 * bm) / brow) + 1, bcols = Math.ceil((W + 2 * bm) / bs) + 1;
      for (j = 0; j < brows; j++) {
        for (i = 0; i < bcols; i++) {
          var g1 = hash(i * 5 + 701, j * 3 + 11), g2 = hash(i * 13 + 5, j * 7 + 801), g3 = hash(i + 909, j * 19 + 3);
          var bx = -bm + i * bs + (j & 1 ? bs * .5 : 0) + (g1 - .5) * bs * .8;
          var by = -bm + j * brow + (g2 - .5) * bs * .8;
          if (g3 > (calm ? .55 : .7)) continue;
          back.push({ x: bx, y: by, w: weight(bx, by), w0: 0, r: .8 + g1 * 1.1, j: (g2 - .5) * .1, k: g3 < .3 ? 0 : g3 < .52 ? 1 : 2 });
        }
      }
      Tb = srcPos.map(function (p) {
        var T = new Float32Array(back.length);
        for (var i = 0; i < back.length; i++) T[i] = Math.hypot(back[i].x - p[0], back[i].y - p[1]) * 1.18 / speed + back[i].j + .35;
        return T;
      });
      /* faint lattice for the back layer, one path */
      backPath = new Path2D();
      var cell2 = {}, gk = function (x, y) { return Math.floor(x / (bs * 1.2)) + ':' + Math.floor(y / (bs * 1.2)); };
      back.forEach(function (p, idx) { var k = gk(p.x, p.y); (cell2[k] = cell2[k] || []).push(idx); });
      back.forEach(function (p, idx) {
        var gx = Math.floor(p.x / (bs * 1.2)), gy = Math.floor(p.y / (bs * 1.2)), best = [];
        for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
          var arr = cell2[(gx + ox) + ':' + (gy + oy)];
          if (!arr) continue;
          arr.forEach(function (o) { if (o > idx) { var d = Math.hypot(back[o].x - p.x, back[o].y - p.y); if (d < bs * 1.25) best.push([d, o]); } });
        }
        best.sort(function (u, v) { return u[0] - v[0]; });
        best.slice(0, 2).forEach(function (bq) { backPath.moveTo(p.x, p.y); backPath.lineTo(back[bq[1]].x, back[bq[1]].y); });
      });

      /* front layer: a few large out-of-focus cells drifting close to the lens.
         Each rests on a loose anchor inside the canvas, inset by its radius plus its drift
         (s * .5 across, s * .4 down) and the front parallax (camera times 1.9, at most 29 x 19 px),
         so no disc is ever cut into a half-moon at an edge. Warm discs sit high on the page's warm
         wash, sky discs low on its sky wash, so no disc greys out over the opposite hue. */
      bokeh = [];
      var nb = calm ? 0 : mobile ? 2 : 5;
      var bAnc = mobile ? [[.86, .14], [.12, .8]] : [[.7, .42], [.62, .98], [.93, .05], [.16, 1], [1, .8]];
      var bmx = s * .5 + 30, bmy = s * .4 + 20, bx0 = mobile ? 0 : W * .5, by1 = mobile ? H * .42 : H;
      for (i = 0; i < nb; i++) {
        var k1 = hash(i + 41, 5), k2 = hash(i + 17, 23), k3 = hash(i + 3, 61);
        var br = Math.max(8, Math.min((.035 + .045 * k3) * Math.max(W, H), (W - bx0) / 2 - bmx, by1 / 2 - bmy));
        var xl = bx0 + br + bmx, xh = Math.max(xl, W - br - bmx), yl = br + bmy, yh = Math.max(yl, by1 - br - bmy);
        bokeh.push({
          x: xl + (xh - xl) * clamp(bAnc[i][0] + (k1 - .5) * .1, 0, 1),
          y: yl + (yh - yl) * clamp(bAnc[i][1] + (k2 - .5) * .1, 0, 1),
          r: br, p: k3 * TAU
        });
      }
      Tk = srcPos.map(function (p) { return bokeh.map(function (b) { return Math.hypot(b.x - p[0], b.y - p[1]) * 1.15 / speed; }); });

      cells.forEach(function (c) { c.w0 = c.w; });
      back.forEach(function (p) { p.w0 = p.w; });
      clearHeadline();

      if (t < maxT + 2 * P) t = maxT + 2 * P + (calm ? 1.3 : .6);
      ev.st = 'idle';
      ev.until = t + (calm ? 8 : 2.5);
      cells.forEach(function (c) { c.d = 0; c.rw = 0; c.fl = 0; });
    }

    /* hero only: a soft clear zone around the headline's glyphs so the type sits on calm ground */
    function clearHeadline() {
      var rects = [], h1 = calm ? null : cv.parentNode && cv.parentNode.querySelector('h1');
      if (h1 && document.createRange) {
        var rg = document.createRange(), cr = cv.getBoundingClientRect();
        rg.selectNodeContents(h1);
        var rs = rg.getClientRects();
        for (var i = 0; i < rs.length; i++) {
          if (rs[i].width < 1 || rs[i].height < 1) continue;
          rects.push([rs[i].left - cr.left, rs[i].top - cr.top, rs[i].right - cr.left, rs[i].bottom - cr.top]);
        }
      }
      function f(x, y) {
        if (!rects.length) return 1;
        var dm = Infinity;
        for (var k = 0; k < rects.length; k++) {
          var r = rects[k], dx = Math.max(r[0] - x, 0, x - r[2]), dy = Math.max(r[1] - y, 0, y - r[3]);
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < dm) dm = d;
        }
        return .15 + .85 * sm(0, 48, dm);
      }
      for (var j = 0; j < cells.length; j++) { var c = cells[j]; c.clr = f(c.bx, c.by); c.w = c.w0 * c.clr; }
      for (j = 0; j < links.length; j++) {
        var lk = links[j], a = cells[lk.a], b = cells[lk.b];
        var mid = rects.length ? f((a.bx + b.bx) / 2, (a.by + b.by) / 2) : 1;
        lk.w0 = (a.w0 + b.w0) / 2;
        lk.w = lk.w0 * Math.min(a.clr, b.clr, mid);
      }
      for (j = 0; j < back.length; j++) back[j].w = back[j].w0 * (rects.length ? .3 + .7 * (f(back[j].x, back[j].y) - .15) / .85 : 1);
    }
    this.reclear = function () {
      if (calm || W < 2 || !cells.length) return;
      clearHeadline();
      if (shown && !running) { if (isReduced()) renderStatic(); else { update(0); render(); } }
    };
    /* after refreshPalette(): pick up the new tokens and redraw a held frame (a running field
       repaints on its next frame anyway) */
    this.recolour = function () {
      PLc = palette(); CI = colours();
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        c.col = lerp3(PLc.orange, PLc.amber, .15 + .85 * c.hu);
        c.nuc = lerp3(PLc.deep, PLc.orange, c.hu * .6);
      }
      if (W < 2 || !cells.length || !shown || running) return;
      if (isReduced()) renderStatic(); else { update(0); render(); }
    };

    function dijkstra(src) {
      var n = cells.length, D = new Float64Array(n), done = new Uint8Array(n);
      for (var i = 0; i < n; i++) D[i] = Infinity;
      D[src] = 0;
      for (var it = 0; it < n; it++) {
        var u = -1, best = Infinity;
        for (i = 0; i < n; i++) if (!done[i] && D[i] < best) { best = D[i]; u = i; }
        if (u < 0) break;
        done[u] = 1;
        var cu = cells[u];
        for (var qn = 0; qn < cu.nb.length; qn++) {
          var v = cu.nb[qn], cv2 = cells[v];
          var dd = best + Math.hypot(cv2.bx - cu.bx, cv2.by - cu.by);
          if (dd < D[v]) D[v] = dd;
        }
      }
      return D;
    }

    /* ---------- desynchronisation episodes ---------- */
    function pickRegion(deterministic) {
      var fx, fy, tries = 0;
      do {
        var h1 = deterministic ? .62 : Math.random(), h2 = deterministic ? .42 : Math.random();
        if (calm) { fx = .06 + .88 * h1; fy = .14 + .72 * h2; if (Math.abs(fx - .5) < .26) fx = fx < .5 ? fx - .2 : fx + .2; }
        else if (mobile) { fx = .2 + .6 * h1; fy = .08 + .2 * h2; }
        else { fx = .62 + .28 * h1; fy = .14 + .56 * h2; }
        tries++;
      } while (!deterministic && tries < 8 && Math.hypot(fx * W - ev.cx, fy * H - ev.cy) < s * 4);
      ev.cx = fx * W; ev.cy = fy * H;
      ev.R = s * (mobile ? 2.3 : calm ? 2.4 : 2.9);
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i], d = Math.hypot(c.bx - ev.cx, c.by - ev.cy);
        c.rw = 1 - sm(ev.R * .4, ev.R, d);
        c.pass = 0;
      }
    }

    function updateEpisode(dt) {
      var i, c;
      if (ev.st === 'static') return;
      if (ev.st === 'idle') {
        if (t > ev.until) { pickRegion(false); ev.st = 'drift'; ev.t0 = t; }
        return;
      }
      if (ev.st === 'drift') {
        var amt = ease((t - ev.t0) / 5.5);
        for (i = 0; i < cells.length; i++) { c = cells[i]; if (c.rw > 0) c.d += (c.rw * amt - c.d) * (1 - Math.exp(-dt * 2.5)); }
        if (t - ev.t0 > 8) { ev.st = 'recover'; ev.rec = t; }
        return;
      }
      /* recover: each coherent wave that reaches a cell pulls it most of the way back */
      var kmaxNow = Math.floor(t / P), kStart = Math.max(0, Math.floor((ev.rec - maxT - 1) / P)), any = false;
      for (i = 0; i < cells.length; i++) {
        c = cells[i];
        if (c.rw <= 0 && c.d < .002) continue;
        var count = 0;
        for (var k = kStart; k <= kmaxNow; k++) {
          var arr = k * P + Ts[srcOf(k)][i];
          if (arr >= ev.rec && arr <= t) count++;
        }
        if (count > c.pass) {
          c.fl = Math.max(c.fl, clamp(c.d * 1.6, 0, 1));
          c.pass = count;
        }
        var target = c.rw * Math.pow(.26, count);
        c.d += (target - c.d) * (1 - Math.exp(-dt * 3.2));
        if (c.d > .012 || target > .012) any = true;
      }
      if (!any && t - ev.rec > 2) {
        for (i = 0; i < cells.length; i++) { cells[i].d = 0; cells[i].rw = 0; }
        ev.st = 'idle';
        ev.until = t + (calm ? 9 + Math.random() * 6 : 3 + Math.random() * 4);
      }
    }

    /* ---------- per-frame state ---------- */
    function update(dt) {
      updateEpisode(dt);
      var kmax = Math.floor(t / P);
      kmin = Math.max(0, Math.floor((t - maxT - 3.5) / P));
      NW = kmax - kmin + 1;
      var n = cells.length;
      if (!F || F.length < n * NW) F = new Float32Array(n * NW + 64);
      var srcs = [];
      for (var w = 0; w < NW; w++) srcs.push(srcOf(kmin + w));
      /* camera drift + pointer parallax */
      ptr.ox += (ptr.tx - ptr.ox) * (1 - Math.exp(-dt * 1.6));
      ptr.oy += (ptr.ty - ptr.oy) * (1 - Math.exp(-dt * 1.6));
      ptr.e *= Math.exp(-dt * .9);
      var camX = Math.sin(t * .041) * 7 + ptr.ox, camY = Math.cos(t * .033) * 5 + ptr.oy;
      ev.camX = camX; ev.camY = camY;
      var amp = s * .05;
      var pr = s * 2.3, pxl = ptr.x - camX, pyl = ptr.y - camY, sumD = 0, sumW = 0;
      for (var i = 0; i < n; i++) {
        var c = cells[i];
        c.x = c.bx + Math.sin(t * .23 * c.fq + c.p1) * amp;
        c.y = c.by + Math.cos(t * .19 * c.fq + c.p2) * amp;
        var act = 0, tau = 9, base = i * NW;
        for (w = 0; w < NW; w++) {
          var k = kmin + w;
          var f = k * P + Ts[srcs[w]][i] + (c.d > .001 ? c.d * (hash(i * 3 + 7, k) - .5) * P * .95 : 0);
          F[base + w] = f;
          var tt = t - f, a;
          if (tt < -.35 || tt > 4) continue;
          a = tt < 0 ? .22 * Math.exp(tt * 16) : Math.exp(-tt * 2.1);
          if (a > act) act = a;
          if (tt >= 0 && tt < tau) tau = tt;
        }
        if (ptr.e > .01) {
          var pd = Math.hypot(c.x - pxl, c.y - pyl);
          if (pd < pr) { var pa = ptr.e * .6 * Math.pow(1 - pd / pr, 2); if (pa > act) act = pa; }
        }
        /* out-of-step cells fire weakly */
        c.act = act * (1 - .55 * c.d);
        if (c.rw > .5) { sumD += c.d * c.rw; sumW += c.rw; }
        c.tau = tau;
        c.fl *= Math.exp(-dt * 1.5);
      }
      ev.amt = sumW > 0 ? sumD / sumW : 0;
    }

    /* ---------- drawing ---------- */
    function bez(x0, y0, cx, cy, x1, y1, u, out) {
      var v = 1 - u;
      out[0] = v * v * x0 + 2 * v * u * cx + u * u * x1;
      out[1] = v * v * y0 + 2 * v * u * cy + u * u * y1;
    }
    var pt = [0, 0];
    /* per-style batches, reused every frame */
    var bBand = new Batch(6), bBroken = new Batch(6), bWake = new Batch(6), bStreak = new Batch(6), bHead = new Batch(3),
      bFill = new Batch(5), bMem = new Batch(5), bRing = new Batch(5), bFlash = new Batch(3), bNuc = new Batch(3), bBack = new Batch(3);
    var STREAK = 5;
    function flush(B, doFill) {
      for (var k = 0; k < B.keys.length; k++) {
        var key = B.keys[k], L = B.m[key], n = L.length, j;
        if (!n) continue;
        ctx.beginPath();
        if (B.n === 6) {
          for (j = 0; j < n; j += 6) { ctx.moveTo(L[j], L[j + 1]); ctx.quadraticCurveTo(L[j + 2], L[j + 3], L[j + 4], L[j + 5]); }
        } else if (B.n === 5) {
          for (j = 0; j < n; j += 5) { ctx.moveTo(L[j] + L[j + 2] * Math.cos(L[j + 4]), L[j + 1] + L[j + 2] * Math.sin(L[j + 4])); ctx.ellipse(L[j], L[j + 1], L[j + 2], L[j + 3], L[j + 4], 0, TAU); }
        } else {
          for (j = 0; j < n; j += 3) { ctx.moveTo(L[j] + L[j + 2], L[j + 1]); ctx.arc(L[j], L[j + 1], L[j + 2], 0, TAU); }
        }
        if (doFill) { ctx.fillStyle = styleOf(key); ctx.fill(); } else { ctx.strokeStyle = styleOf(key); ctx.stroke(); }
      }
      B.reset();
    }
    function addQuad(B, cid, a, x0, y0, cx, cy, x1, y1, r) {
      var st = aStep(a, r);
      if (!st) return;
      B.at(cid * AQ1 + st).push(x0, y0, cx, cy, x1, y1);
    }
    function dIdx(d, e1) { return d > .01 ? Math.round(sm(0, e1, d) * (DQ - 1)) : 0; }
    function sprAlpha(a) { a = q(a); return a < .006 ? 0 : a; }

    function render() {
      if (!sp) sp = sprites();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      var camX = ev.camX || 0, camY = ev.camY || 0;
      var i, w, c, a, b, ga;

      /* --- back layer: a fine, colourful particle field (the site's signature) --- */
      ctx.save();
      ctx.translate(camX * .45, camY * .45);
      ctx.strokeStyle = styleOf(CI.line2 * AQ1 + aStep(calm ? .22 : .3));
      ctx.lineWidth = .6;
      ctx.stroke(backPath);
      var srcB = [];
      for (w = 0; w < NW; w++) srcB.push(srcOf(kmin + w));
      /* 3 hues x 4 levels, one path each */
      var haloB = [];
      for (i = 0; i < back.length; i++) {
        var bp = back[i], act = 0;
        for (w = 0; w < NW; w++) {
          var tt = t - ((kmin + w) * P + Tb[srcB[w]][i]);
          if (tt < -.3 || tt > 3) continue;
          a = tt < 0 ? .2 * Math.exp(tt * 14) : Math.exp(-tt * 1.8);
          if (a > act) act = a;
        }
        var lev = Math.min(3, Math.floor(bp.w * (.3 + .7 * act) * 4));
        bBack.at(CI.hue[bp.k] * AQ1 + aStep((.16 + lev * .17) * gain)).push(bp.x, bp.y, bp.r * (1 + lev * .12));
        if (act > .35 && bp.w > .35 && bp.k === 2) haloB.push(bp, act);
      }
      flush(bBack, true);
      for (i = 0; i < haloB.length; i += 2) {
        var gp = haloB[i], gs = 4 + gp.r * 4;
        if (!(ga = sprAlpha(haloB[i + 1] * gp.w * .22 * gain))) continue;
        ctx.globalAlpha = ga;
        blit(ctx, sp.hS, gp.x - gs, gp.y - gs, gs * 2, gs * 2);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      /* --- mid layer: the tissue --- */
      ctx.save();
      ctx.translate(camX, camY);
      var L = links.length, lk;

      /* a soft wash over a patch that has lost step (damage = faint red, fading cells = slate) */
      if (ev.amt > .01) {
        var hz = ev.R * 1.55, wv = weight(ev.cx, ev.cy);
        ctx.globalAlpha = q(.16 * ev.amt * gain * wv);
        blit(ctx, sp.zR, ev.cx - hz, ev.cy - hz, hz * 2, hz * 2);
        ctx.globalAlpha = q(.22 * ev.amt * gain * wv);
        blit(ctx, sp.zS, ev.cx - hz * .8, ev.cy - hz * .8, hz * 1.6, hz * 1.6);
        ctx.globalAlpha = 1;
      }

      /* resting links: fine slate hairlines in three bands; links inside a patch that has lost step break up */
      var bandA = [.14, .26, .38];
      for (i = 0; i < L; i++) {
        lk = links[i]; a = cells[lk.a]; b = cells[lk.b];
        var mx = (a.x + b.x) / 2 - (b.y - a.y) * lk.c, my = (a.y + b.y) / 2 + (b.x - a.x) * lk.c;
        lk.cx = mx; lk.cy = my;
        var ex = mx - a.x, ey = my - a.y, el = Math.sqrt(ex * ex + ey * ey) || 1;
        lk.x0 = a.x + ex / el * a.r * 1.18; lk.y0 = a.y + ey / el * a.r * 1.18;
        ex = mx - b.x; ey = my - b.y; el = Math.sqrt(ex * ex + ey * ey) || 1;
        lk.x1 = b.x + ex / el * b.r * 1.18; lk.y1 = b.y + ey / el * b.r * 1.18;
        if ((a.d + b.d) / 2 > .25) addQuad(bBroken, CI.slate, .42 * lk.w * gain, lk.x0, lk.y0, mx, my, lk.x1, lk.y1);
        else {
          var bw0 = lk.w0;
          var bandIdx = bw0 < .35 ? 0 : bw0 < .7 ? 1 : 2;
          /* near the headline the band fades with the link */
          addQuad(bBand, CI.slate, bandA[bandIdx] * gain * (lk.w / (bw0 || 1)), lk.x0, lk.y0, mx, my, lk.x1, lk.y1, 32);
        }
      }
      ctx.lineWidth = 1;
      flush(bBand, false);
      ctx.setLineDash([2, 4]);
      flush(bBroken, false);
      ctx.setLineDash([]);

      /* sky signals travelling along links: a faint wake over the whole link and a bright streak behind the head */
      var heads = [];
      for (i = 0; i < L; i++) {
        lk = links[i]; a = cells[lk.a]; b = cells[lk.b];
        for (w = 0; w < NW; w++) {
          var fa = F[lk.a * NW + w], fb = F[lk.b * NW + w];
          var early = fa < fb ? fa : fb, D = Math.abs(fb - fa);
          if (D < .045 || D > 1.9) continue;
          var p = (t - early) / D;
          if (p < 0 || p > 1.5) continue;
          var dAvg = (a.d + b.d) / 2;
          var fade = p > 1 ? 1 - (p - 1) / .5 : 1;
          var I = lk.w * (1 - .6 * dAvg) * gain * fade;
          if (I < .03) continue;
          var fwd = fa <= fb;
          var uh = Math.min(p, 1), ut = Math.max(0, p - .55);
          if (!fwd) { uh = 1 - uh; ut = 1 - ut; }
          var cid = CI.sig + dIdx(dAvg, .7);
          addQuad(bWake, cid, .16 * I * Math.sin(Math.min(p / 1.5, 1) * Math.PI), lk.x0, lk.y0, lk.cx, lk.cy, lk.x1, lk.y1);
          bez(lk.x0, lk.y0, lk.cx, lk.cy, lk.x1, lk.y1, uh, pt);
          var hx = pt[0], hy = pt[1];
          bez(lk.x0, lk.y0, lk.cx, lk.cy, lk.x1, lk.y1, ut, pt);
          if (Math.abs(hx - pt[0]) + Math.abs(hy - pt[1]) >= .5) {
            /* the streak brightens from tail to head in a few exact sub-curves */
            var sx = pt[0], sy = pt[1];
            for (var sg = 0; sg < STREAK; sg++) {
              var u0 = ut + (uh - ut) * sg / STREAK, u1 = ut + (uh - ut) * (sg + 1) / STREAK, v0 = 1 - u0, v1 = 1 - u1;
              var m0 = v0 * v1, m1 = v0 * u1 + u0 * v1, m2 = u0 * u1;
              bez(lk.x0, lk.y0, lk.cx, lk.cy, lk.x1, lk.y1, u1, pt);
              addQuad(bStreak, cid, .95 * I * (sg + .5) / STREAK, sx, sy,
                m0 * lk.x0 + m1 * lk.cx + m2 * lk.x1, m0 * lk.y0 + m1 * lk.cy + m2 * lk.y1, pt[0], pt[1], 32);
              sx = pt[0]; sy = pt[1];
            }
          }
          if (p <= 1) heads.push(hx, hy, I, dAvg);
        }
      }
      ctx.lineWidth = 1;
      flush(bWake, false);
      ctx.lineWidth = 1.5;
      flush(bStreak, false);
      for (i = 0; i < heads.length; i += 4) {
        var hI = heads[i + 2], hd = heads[i + 3], hs = 6;
        if (hd < .3 && (ga = sprAlpha(.32 * hI * (1 - hd)))) {
          ctx.globalAlpha = ga;
          blit(ctx, sp.hS, heads[i] - hs, heads[i + 1] - hs, hs * 2, hs * 2);
        }
        var st = aStep(.95 * hI, 16);
        if (st) bHead.at((CI.sig + dIdx(hd, .7)) * AQ1 + st).push(heads[i], heads[i + 1], 1.5);
      }
      ctx.globalAlpha = 1;
      flush(bHead, true);

      /* cells */
      var n = cells.length;
      /* warm bloom as a wave passes (soft radial fill, normal compositing) */
      for (i = 0; i < n; i++) {
        c = cells[i];
        if (c.act < .04 || c.x < -60 || c.x > W + 60 || c.y < -60 || c.y > H + 60) continue;
        var Ib = c.w * gain * (1 - c.d);
        if (Ib < .02 || !(ga = sprAlpha(.2 * c.act * Ib))) continue;
        var gsz = c.r * (2 + 1.5 * c.act);
        ctx.globalAlpha = ga;
        blit(ctx, c.hu < .5 ? sp.hO : sp.hA, c.x - gsz, c.y - gsz, gsz * 2, gsz * 2);
      }
      /* restoration: a sky flash where a wave pulls a cell back into step */
      for (i = 0; i < n; i++) {
        c = cells[i];
        if (c.fl < .03 || !(ga = sprAlpha(.32 * c.fl * c.w * gain))) continue;
        var fz = c.r * 3.4;
        ctx.globalAlpha = ga;
        blit(ctx, sp.hS, c.x - fz, c.y - fz, fz * 2, fz * 2);
      }
      ctx.globalAlpha = 1;
      for (i = 0; i < n; i++) {
        c = cells[i];
        if (c.x < -60 || c.x > W + 60 || c.y < -60 || c.y > H + 60) continue;
        var I2 = c.w * gain, di = dIdx(c.d, .85), st2;
        var br = 1 + .1 * c.act;
        var rx = c.r * br, ry = c.r * c.ay * br, rot = c.rot + t * .02 * c.fq;
        var ccid = CI.cell + c.wi * DQ + di;
        /* cytoplasm */
        if ((st2 = aStep((.1 + .28 * c.act) * I2 * (1 - .35 * c.d), 32))) bFill.at(ccid * AQ1 + st2).push(c.x, c.y, rx, ry, rot);
        /* membrane */
        if ((st2 = aStep((.36 + .5 * c.act) * I2, 32))) bMem.at((CI.cell + (c.wi >> 1) * 2 * DQ + di) * AQ1 + st2).push(c.x, c.y, rx, ry, rot);
        /* depolarisation ring: the sky signal leaving the cell */
        if (c.tau < 1.8) {
          var rr = c.r * 1.1 + s * .22 * (1 - Math.exp(-c.tau * 2.1));
          var ra = .42 * Math.exp(-c.tau * 2.3) * I2 * (1 - .7 * c.d);
          if (ra > .015 && (st2 = aStep(ra, 32))) bRing.at((c.d > .05 ? CI.slate : CI.sig) * AQ1 + st2).push(c.x, c.y, rr, rr * (.9 + .1 * c.ay), c.rot);
        }
        if (c.fl > .03 && (st2 = aStep(.7 * c.fl * c.w * gain))) bFlash.at(CI.sig * AQ1 + st2).push(c.x, c.y, c.r * 1.1 + s * .34 * (1 - c.fl));
        /* nucleus */
        if ((st2 = aStep((.5 + .45 * c.act) * I2, 16))) bNuc.at((CI.nuc + (c.wi >> 1) * 2 * DQ + di) * AQ1 + st2).push(c.x, c.y, Math.max(1.1, c.r * .17) + .6 * c.act);
      }
      flush(bFill, true);
      ctx.lineWidth = 1;
      flush(bMem, false);
      flush(bRing, false);
      ctx.lineWidth = 1.25;
      flush(bFlash, false);
      ctx.lineWidth = 1;
      flush(bNuc, true);
      ctx.restore();

      /* --- front layer: a few big, soft cells near the lens --- */
      if (bokeh.length) {
        ctx.save();
        ctx.translate(camX * 1.9, camY * 1.9);
        var srcF = [];
        for (w = 0; w < NW; w++) srcF.push(srcOf(kmin + w));
        for (i = 0; i < bokeh.length; i++) {
          var bo = bokeh[i], ba = 0;
          for (w = 0; w < NW; w++) {
            var tb = t - ((kmin + w) * P + Tk[srcF[w]][i]);
            if (tb < -.6 || tb > 4) continue;
            var av = tb < 0 ? Math.exp(tb * 5) : Math.exp(-tb * 1.3);
            if (av > ba) ba = av;
          }
          var bx2 = bo.x + Math.sin(t * .05 + bo.p) * s * .5, by2 = bo.y + Math.cos(t * .043 + bo.p) * s * .4;
          var bw = weight(bx2, by2);
          ctx.globalAlpha = q((.06 + .07 * ba) * bw);
          blit(ctx, i % 3 === 1 ? sp.bS : i % 3 === 2 ? sp.bO : sp.bA, bx2 - bo.r, by2 - bo.r, bo.r * 2, bo.r * 2);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    /* ---------- loop & lifecycle ---------- */
    function frame(now) {
      raf = 0;
      if (!running) return;
      var dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 1 / 60;
      if (dt > .1) dt = .1;
      t += dt;
      /* the hero does not move on the page, but re-check its box now and then (about every 1.5 s) */
      if (ptrOn && ++boxAge > 90) measure();
      update(dt);
      render();
      raf = requestAnimationFrame(frame);
    }
    function renderStatic() {
      /* one complete frame: waves crossing the tissue, one patch caught out of step */
      t = maxT + 3 * P + P * .42;
      pickRegion(true);
      for (var i = 0; i < cells.length; i++) cells[i].d = cells[i].rw * .9;
      ev.st = 'static';
      update(0);
      render();
    }
    function listen(on) {
      if (!usePtr || on === ptrOn) return;
      ptrOn = on;
      ptr.lx = null;
      if (on) { measure(); window.addEventListener('pointermove', onPtr, { passive: true }); }
      else window.removeEventListener('pointermove', onPtr, { passive: true });
    }
    function evaluate() {
      if (!W) return;
      var locked = isLocked(), reduce = isReduced(), paused = isPaused();
      var should = visible && !document.hidden && !locked && !reduce && !paused;
      if (should && !running) {
        running = true;
        /* leaving the reduced-motion still: the next waves pull its out-of-step patch back into rhythm */
        if (ev.st === 'static') { ev.st = 'recover'; ev.rec = t; }
        last = performance.now();
        listen(true);
        if (!raf) raf = requestAnimationFrame(frame);
      } else if (!should && running) {
        /* stop where we are: the last drawn frame stays on the canvas */
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        listen(false);
      }
      if (!locked && !shown) {
        shown = true;
        if (!calm) clearHeadline();
        if (reduce) renderStatic(); else { update(1 / 60); render(); }
        /* the closing field is drawn on approach and fades in on first scroll into view (enter());
           the hero fades in behind the headline as the page unlocks */
        if (!calm) requestAnimationFrame(function () { cv.style.opacity = '1'; });
      }
      if (calm && shown && !entered && (inView || reduce || paused)) enter(reduce || paused);
    }
    this.evaluate = evaluate;

    /* the shared first-view entrance (closing field only): about 600 ms ease-in, once.
       Under reduced motion or the pause it is simply there, with no transition. */
    var entered = false, inView = false;
    function enter(still) {
      entered = true;
      if (still) cv.style.transition = 'none';
      cv.style.opacity = '1';
    }

    var rt = 0, lastW = 0, lastH = 0, near = !calm;
    function relayout() {
      if (!near) return;
      var r = cv.getBoundingClientRect();
      if (usePtr) measure(r);
      var nw = Math.round(r.width), nh = Math.round(r.height);
      if (nw === lastW && nh === lastH) return;
      lastW = nw; lastH = nh;
      if (!nw || !nh) return;
      build();
      /* under the gate nothing is drawn; evaluate() paints the first frame on unlock */
      if (shown) { if (isReduced()) renderStatic(); else { update(1 / 60); render(); } }
      evaluate();
    }
    /* the closing field is far down the page: build it on approach, free its pixels when far away */
    function release() {
      if (!lastW) return;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      listen(false);
      cv.width = cv.height = 0;
      lastW = lastH = 0; W = 0;
    }
    relayout();
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(relayout, 120); }).observe(cv);
    } else {
      window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(relayout, 150); });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[es.length - 1].isIntersecting;
        evaluate();
      }, { rootMargin: '80px 0px' }).observe(cv);
      if (calm) {
        new IntersectionObserver(function (es) {
          near = es[es.length - 1].isIntersecting;
          if (near) relayout(); else release();
        }, { rootMargin: '100% 0px' }).observe(cv);
        /* first real scroll into view (a sixth of the section showing) starts the entrance */
        var seenIO = new IntersectionObserver(function (es) {
          if (!es[es.length - 1].isIntersecting) return;
          inView = true;
          seenIO.disconnect();
          evaluate();
        }, { threshold: .16 });
        seenIO.observe(cv);
      }
    } else { near = true; inView = true; relayout(); }
    if (mqReduce) {
      var onMQ = function () { if (isReduced()) { evaluate(); if (W && shown) renderStatic(); } else evaluate(); };
      if (mqReduce.addEventListener) mqReduce.addEventListener('change', onMQ);
      else if (mqReduce.addListener) mqReduce.addListener(onMQ);
    }

    /* pointer: moving the cursor gently excites nearby cells (desktop, hero only).
       Attached only while the field runs (on screen, not paused); page coordinates
       against the cached box, so a mouse move never forces a layout. */
    function onPtr(e) {
      if (!running || e.pointerType !== 'mouse') { ptr.lx = null; return; }
      var x = e.pageX - box.x, y = e.pageY - box.y;
      if (x < 0 || y < 0 || x > box.w || y > box.h) { ptr.lx = null; return; }
      if (ptr.lx !== null) ptr.e = Math.min(1, ptr.e + Math.hypot(x - ptr.lx, y - ptr.ly) * .006);
      ptr.lx = x; ptr.ly = y;
      ptr.x = x; ptr.y = y;
      ptr.tx = -(x / box.w - .5) * 16;
      ptr.ty = -(y / box.h - .5) * 10;
    }
  }

  /* ---------- boot ---------- */
  /* under the password gate the fields are built in idle time, so typing stays responsive */
  var fields = [];
  function evalAll() { for (var i = 0; i < fields.length; i++) fields[i].evaluate(); }
  function create() {
    var nodes = document.querySelectorAll('canvas[data-widget="hero-field"]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].__heroField) continue;
      if (!nodes[i].getContext) continue;
      nodes[i].__heroField = new Field(nodes[i]);
      fields.push(nodes[i].__heroField);
    }
    evalAll();
  }
  var idle = window.requestIdleCallback ? function (f) { window.requestIdleCallback(f, { timeout: 1500 }); } : function (f) { setTimeout(f, 60); };
  function boot() {
    if (!isLocked()) { create(); return; }
    idle(function () { create(); idle(sprites); });
  }
  document.addEventListener('site:unlocked', function () { setTimeout(create, 0); });
  document.addEventListener('visibilitychange', evalAll);
  document.addEventListener('site:motion', evalAll);
  var mqContrast = window.matchMedia ? window.matchMedia('(prefers-contrast: more)') : null;
  if (mqContrast) {
    var onContrast = function () {
      if (!PAL) return; /* nothing read yet: the first read gets the current values */
      refreshPalette();
      for (var i = 0; i < fields.length; i++) fields[i].recolour();
    };
    if (mqContrast.addEventListener) mqContrast.addEventListener('change', onContrast);
    else if (mqContrast.addListener) mqContrast.addListener(onContrast);
  }
  if ('MutationObserver' in window) {
    new MutationObserver(evalAll).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { for (var i = 0; i < fields.length; i++) fields[i].reclear(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

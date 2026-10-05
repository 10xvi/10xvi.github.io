/* 10X Vital Intelligence: "coordination" figure (light).
   Three cards showing the same tissue: 01 Coordinated, 02 Coordination lost, 03 Conversation restored.
   Each cell is a phase oscillator; its warmth is its voltage. The trace under each tissue plots
   a few cells' voltages (faint) and their mean (bold) over the last few seconds.
   Card 03 runs its own short loop: sky signal waves sweep in within a second of the card being
   on screen and pull the cells back into step within a few seconds. */
(function () {
  'use strict';
  var mounts = [].slice.call(document.querySelectorAll('[data-widget="coordination"]'));
  if (!mounts.length) return;

  var TAU = Math.PI * 2;
  var P = 2.0, OMEGA = TAU / P;            // shared rhythm
  var KAPPA = 0.9, KP = 3.6;               // phase lag across tissue, pull strength
  var TRACE_SEC = 3 * P, SAMPLE_DT = 1 / 30;
  /* restore loop (seconds within its own cycle) */
  var RC = 12.5;                            // loop length
  var PT = [0.35, 1.25, 2.15, 3.05];        // pulse launch times
  var REACH = [0.42, 0.78, 1.25, 1.25];     // how far each pulse entrains
  var GAIN = 0.62;                          // entrainment gained per pulse
  var DECAY = 9.6;                          // after this the cells drift apart again
  var PULSE_CROSS = 1.25;                   // seconds for a pulse to cross the tissue
  var STILL = 2.75;                         // reduced-motion frame: restoration under way
  var NAMES = ['Coordinated', 'Coordination lost', 'Conversation restored'];
  var SHORT = ['Coordinated', 'Lost', 'Restored'];
  var MODES = ['sync', 'lost', 'restore'];
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q) : null; };
  var reduceMQ = mq('(prefers-reduced-motion: reduce)');
  var mobileMQ = mq('(max-width: 759px)');

  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, al) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + clamp(al, 0, 1).toFixed(3) + ')'; }
  function mod(a, n) { return ((a % n) + n) % n; }
  function volt(phi) { return Math.pow(0.5 + 0.5 * Math.cos(phi), 1.6); }
  function parseColor(s, fb) {
    s = (s || '').trim();
    var m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) { var n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
    if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
    m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
    if (m) return [+m[1], +m[2], +m[3]];
    return fb;
  }

  /* polygon clipping against a half-plane nx*x+ny*y <= d (flat arrays) */
  var BA = new Float64Array(400), BB = new Float64Array(400);
  function clip(src, n, dst, nx, ny, d) {
    var m = 0, px = src[n * 2 - 2], py = src[n * 2 - 1], pd = nx * px + ny * py - d, t;
    for (var i = 0; i < n; i++) {
      var x = src[i * 2], y = src[i * 2 + 1], cd = nx * x + ny * y - d;
      if (cd <= 0) {
        if (pd > 0) { t = pd / (pd - cd); dst[m++] = px + (x - px) * t; dst[m++] = py + (y - py) * t; }
        dst[m++] = x; dst[m++] = y;
      } else if (pd <= 0) { t = pd / (pd - cd); dst[m++] = px + (x - px) * t; dst[m++] = py + (y - py) * t; }
      px = x; py = y; pd = cd;
    }
    return m / 2;
  }
  function roundPoly(ctx, p, n, r) {
    for (var i = 0; i < n; i++) {
      var x = p[i * 2], y = p[i * 2 + 1], a = (i + n - 1) % n, b = (i + 1) % n;
      var ax = p[a * 2] - x, ay = p[a * 2 + 1] - y, bx = p[b * 2] - x, by = p[b * 2 + 1] - y;
      var la = Math.sqrt(ax * ax + ay * ay) || 1e-6, lb = Math.sqrt(bx * bx + by * by) || 1e-6;
      var rr = Math.min(r, la * 0.5, lb * 0.5);
      var x1 = x + ax / la * rr, y1 = y + ay / la * rr;
      if (i === 0) ctx.moveTo(x1, y1); else ctx.lineTo(x1, y1);
      ctx.quadraticCurveTo(x, y, x + bx / lb * rr, y + by / lb * rr);
    }
    ctx.closePath();
  }

  /* ---------------- Panel: one view of the tissue ---------------- */
  function Panel(index) { this.index = index; this.mode = MODES[index]; }
  Panel.prototype.build = function (tissue, trace, s) {
    var R = rng(9137);                 // same seed: the same tissue in all three panels
    this.tissue = tissue; this.trace = trace; this.s = s;
    var cx = tissue.x + tissue.w / 2, cy = tissue.y + tissue.h / 2, a = tissue.w / 2, b = tissue.h / 2, NE = 3.4;
    this.cx = cx; this.cy = cy;
    var bn = 72, bp = new Float64Array(bn * 2);
    for (var k = 0; k < bn; k++) {
      var th = k / bn * TAU, co = Math.cos(th), si = Math.sin(th);
      bp[k * 2] = cx + a * (co < 0 ? -1 : 1) * Math.pow(Math.abs(co), 2 / NE);
      bp[k * 2 + 1] = cy + b * (si < 0 ? -1 : 1) * Math.pow(Math.abs(si), 2 / NE);
    }
    this.bp = bp; this.bn = bn;
    var cells = [], rowH = s * 0.866, nr = Math.ceil(b / rowH) + 1, nc = Math.ceil(a / s) + 1;
    var ai = a - 0.3 * s, bi = b - 0.3 * s, ain = a - 1.75 * s, bin = b - 1.75 * s;
    for (var r = -nr; r <= nr; r++) {
      for (var q = -nc; q <= nc; q++) {
        var x = cx + (q + ((r & 1) ? 0.5 : 0)) * s + (R() - 0.5) * 0.24 * s;
        var y = cy + r * rowH + (R() - 0.5) * 0.24 * s;
        var dx = Math.abs(x - cx), dy = Math.abs(y - cy);
        if (Math.pow(dx / ai, NE) + Math.pow(dy / bi, NE) > 1) continue;
        var inner = ain > 0 && bin > 0 && dx < ain && dy < bin && (Math.pow(dx / ain, NE) + Math.pow(dy / bin, NE) <= 1);
        cells.push({
          x0: x, y0: y, x: x, y: y, u: (x - tissue.x) / tissue.w, inner: inner,
          w: OMEGA * (1 + (R() * 2 - 1) * 0.38), psi: R() * TAU, eps: (R() - 0.5) * 0.24,
          gapL: lerp(3.6, 8, R()), rL: s * lerp(0.44, 0.58, R()),
          f1: 0.25 + 0.3 * R(), f2: 0.22 + 0.3 * R(), a1: R() * TAU, a2: R() * TAU, amp: s * (0.14 + 0.1 * R()),
          phi: 0, e: 0, eT: 0, c: 0, hit: -99, poly: new Float32Array(200), n: 0, cand: []
        });
      }
    }
    for (var i = 0; i < cells.length; i++) {
      for (var j = 0; j < cells.length; j++) {
        if (i === j) continue;
        var ddx = cells[j].x0 - cells[i].x0, ddy = cells[j].y0 - cells[i].y0;
        if (ddx * ddx + ddy * ddy < 3.4 * s * s) cells[i].cand.push(j);
      }
    }
    this.cells = cells;
    // trace sample cells, spread across the middle band
    this.samples = [];
    var us = [0.08, 0.24, 0.4, 0.56, 0.72, 0.9];
    for (var u = 0; u < us.length; u++) {
      var best = -1, bd = 1e9;
      for (var c = 0; c < cells.length; c++) {
        var d = Math.abs(cells[c].u - us[u]) * tissue.w + Math.abs(cells[c].y0 - cy) * 0.8;
        if (d < bd && this.samples.indexOf(c) < 0) { bd = d; best = c; }
      }
      if (best >= 0) this.samples.push(best);
    }
    // incoming signal geometry (restore panel): waves arrive from beyond the left edge
    this.sx = tissue.x - tissue.h * 1.4; this.sy = cy; this.r0 = tissue.x - this.sx;
    this.pv = tissue.w / PULSE_CROSS;
    for (var m = 0; m < cells.length; m++) {
      var ce = cells[m];
      ce.d = Math.sqrt((ce.x0 - this.sx) * (ce.x0 - this.sx) + (ce.y0 - this.sy) * (ce.y0 - this.sy));
    }
    this.geomValid = false;
  };
  Panel.prototype.coh = function (cell) {
    return this.mode === 'sync' ? 1 : this.mode === 'lost' ? 0 : cell.c;
  };
  Panel.prototype.target = function (cell, T) { return OMEGA * T - KAPPA * cell.u + cell.eps; };
  Panel.prototype.clearBuf = function () { this.bt = []; this.bm = []; this.bc = []; this.bs = []; this.bsc = []; for (var k = 0; k < this.samples.length; k++) { this.bs.push([]); this.bsc.push([]); } };
  Panel.prototype.sample = function (T) {
    var cells = this.cells, sm = 0, sc = 0, ns = this.samples.length;
    for (var k = 0; k < ns; k++) {
      var ce = cells[this.samples[k]], v = volt(ce.phi), c = this.coh(ce);
      this.bs[k].push(v); this.bsc[k].push(c); sm += v; sc += c;
    }
    this.bt.push(T); this.bm.push(sm / ns); this.bc.push(sc / ns);
    while (this.bt.length && this.bt[0] < T - TRACE_SEC - 0.5) {
      this.bt.shift(); this.bm.shift(); this.bc.shift();
      for (var j = 0; j < this.bs.length; j++) { this.bs[j].shift(); this.bsc[j].shift(); }
    }
    this.nextSample = T + SAMPLE_DT;
  };
  /* set the state at absolute time T0 with a full trace history */
  Panel.prototype.init = function (T0) {
    var cells = this.cells, i, t, sync = this.mode === 'sync';
    this.clearBuf();
    for (t = T0 - TRACE_SEC; t <= T0 + 1e-9; t += SAMPLE_DT) {
      for (i = 0; i < cells.length; i++) {
        var ce = cells[i];
        ce.phi = sync ? this.target(ce, t) : ce.psi + this.index * 1.7 + ce.w * t;
        ce.e = ce.eT = ce.c = sync ? 1 : 0; ce.hit = -99;
      }
      this.sample(t);
    }
  };
  Panel.prototype.step = function (T, dt) {
    var cells = this.cells, i, ce;
    if (this.mode === 'restore') {
      var cyc = mod(T, RC), prev = cyc - dt;
      if (cyc >= DECAY) {
        for (i = 0; i < cells.length; i++) cells[i].eT = 0;
      } else {
        for (var k = 0; k < PT.length; k++) {
          var te = PT[k];
          if (cyc <= te) continue;
          var r = this.r0 + this.pv * (cyc - te), rp = prev <= te ? -1 : this.r0 + this.pv * (prev - te);
          for (i = 0; i < cells.length; i++) {
            ce = cells[i];
            if (ce.d > rp && ce.d <= r) {
              var g = 1 - sstep(REACH[k] - 0.08, REACH[k] + 0.08, ce.u);
              if (g > 0.05) { ce.eT = Math.min(1, ce.eT + GAIN * g); ce.hit = T; }
            }
          }
        }
      }
      var ke = 1 - Math.exp(-dt * (cyc >= DECAY ? 1.6 : 2.4));
      for (i = 0; i < cells.length; i++) { ce = cells[i]; ce.e += (ce.eT - ce.e) * ke; ce.c = sstep(0.02, 0.96, ce.e); }
    }
    for (i = 0; i < cells.length; i++) {
      ce = cells[i];
      var e = this.mode === 'sync' ? 1 : this.mode === 'lost' ? 0 : ce.e;
      ce.phi += dt * (ce.w * (1 - e) + OMEGA * e + KP * e * Math.sin(this.target(ce, T) - ce.phi));
      if (ce.phi > 1e4) ce.phi = mod(ce.phi, TAU);
    }
    if (T >= this.nextSample) this.sample(T);
  };
  Panel.prototype.geometry = function (T) {
    if (this.mode === 'sync' && this.geomValid) return;
    var cells = this.cells, s = this.s, i, k;
    for (i = 0; i < cells.length; i++) {
      var ce = cells[i], c = this.coh(ce), l = 1 - c;
      ce.x = ce.x0 + l * ce.amp * (0.65 * Math.sin(T * ce.f1 + ce.a1) + 0.35 * Math.sin(T * ce.f2 * 1.7 + ce.a2));
      ce.y = ce.y0 + l * ce.amp * (0.65 * Math.cos(T * ce.f2 + ce.a2) + 0.35 * Math.cos(T * ce.f1 * 1.5 + ce.a1));
      ce.gap = lerp(ce.gapL, 2.2, c); ce.rmax = lerp(ce.rL, s * 2.6, c * c);
    }
    for (i = 0; i < cells.length; i++) {
      var cc = cells[i], n, src = BA, dst = BB, tmp;
      if (cc.inner) {
        n = 6; for (k = 0; k < 6; k++) { BA[k * 2] = cc.x + Math.cos(k / 6 * TAU) * s * 1.7; BA[k * 2 + 1] = cc.y + Math.sin(k / 6 * TAU) * s * 1.7; }
      } else { n = this.bn; BA.set(this.bp); }
      for (k = 0; k < cc.cand.length && n >= 3; k++) {
        var o = cells[cc.cand[k]], dx = o.x - cc.x, dy = o.y - cc.y, L = Math.sqrt(dx * dx + dy * dy);
        if (L < 1e-6) continue;
        var nx = dx / L, ny = dy / L;
        n = clip(src, n, dst, nx, ny, nx * (cc.x + o.x) * 0.5 + ny * (cc.y + o.y) * 0.5 - cc.gap * 0.5);
        tmp = src; src = dst; dst = tmp;
      }
      // radial clamp (loosened cells round off and pull apart) + drop tiny edges
      var m = 0, p = cc.poly, rm = cc.rmax;
      for (k = 0; k < n; k++) {
        var vx = src[k * 2] - cc.x, vy = src[k * 2 + 1] - cc.y, vl = Math.sqrt(vx * vx + vy * vy);
        if (vl > rm) { vx *= rm / vl; vy *= rm / vl; }
        var X = cc.x + vx, Y = cc.y + vy;
        if (m && Math.abs(X - p[m * 2 - 2]) + Math.abs(Y - p[m * 2 - 1]) < 2.4) continue;
        p[m * 2] = X; p[m * 2 + 1] = Y; m++;
      }
      if (m > 2 && Math.abs(p[0] - p[m * 2 - 2]) + Math.abs(p[1] - p[m * 2 - 1]) < 2.4) m--;
      cc.n = m;
    }
    this.geomValid = true;
  };

  /* ---------------- Widget ---------------- */
  function Widget(mount) {
    this.mount = mount;
    if (!mount.getAttribute('role')) mount.setAttribute('role', 'img');
    if (!mount.getAttribute('aria-label')) mount.setAttribute('aria-label', 'Three views of the same tissue: cells in step, cells out of step, and an incoming signal bringing them back into step.');
    mount.innerHTML = '';
    var root = document.createElement('div'); root.className = 'cw'; root.setAttribute('aria-hidden', 'true');
    this.cards = []; this.heads = [];
    var i;
    for (i = 0; i < 3; i++) {
      var card = document.createElement('div'); card.className = 'cw-card';
      root.appendChild(card); this.cards.push(card);
    }
    var cv = document.createElement('canvas'); cv.className = 'cw-canvas';
    root.appendChild(cv);
    for (i = 0; i < 3; i++) {
      var h = document.createElement('div'); h.className = 'cw-head cw-s' + i;
      h.innerHTML = '<span class="cw-label"><span class="cw-num">0' + (i + 1) + '</span><span class="cw-name">' + NAMES[i] + '</span></span><span class="cw-rule"><span class="cw-fill"></span></span>';
      root.appendChild(h); this.heads.push({ el: h, name: h.querySelector('.cw-name'), fill: h.querySelector('.cw-fill') });
    }
    mount.appendChild(root);
    this.root = root; this.cv = cv; this.ctx = cv.getContext('2d');
    this.panels = [new Panel(0), new Panel(1), new Panel(2)];
    this.T = 0; this.hiddenAt = 0; this.running = false; this.visible = false; this.W = 0; this.H = 0; this.lastFill = -1;
    this.reduce = !!(reduceMQ && reduceMQ.matches);
    this.readColors();
    var self = this;
    this.loop = function (now) { self.frame(now); };
    this.layout();
    this.reset();
    this.render();

    if (window.ResizeObserver) {
      var pend = false;
      new ResizeObserver(function () { if (pend) return; pend = true; requestAnimationFrame(function () { pend = false; self.onResize(); }); }).observe(mount);
    } else window.addEventListener('resize', function () { self.onResize(); });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        var vis = es[es.length - 1].isIntersecting;
        if (vis && !self.visible) self.replay(); else if (!vis && self.visible) self.hiddenAt = performance.now();
        self.visible = vis; self.update();
      }, { rootMargin: '0px' }).observe(mount);
    } else this.visible = true;
    document.addEventListener('visibilitychange', function () { self.update(); });
    document.addEventListener('site:unlocked', function () { self.readColors(); self.onResize(true); self.update(); });
    if (reduceMQ) {
      var onRM = function () { self.reduce = reduceMQ.matches; self.reset(); self.render(); self.update(); };
      if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onRM); else if (reduceMQ.addListener) reduceMQ.addListener(onRM);
    }
    this.update();
  }
  Widget.prototype.readColors = function () {
    var cs = getComputedStyle(document.documentElement);
    function v(n, fb) { return parseColor(cs.getPropertyValue(n), fb); }
    this.OR = v('--orange', [249, 115, 22]);
    this.AM = v('--amber', [245, 158, 11]);
    this.SKY = v('--sky', [14, 165, 233]);
    this.SKYD = v('--sky-deep', [2, 132, 199]);
    this.RED = v('--red', [239, 68, 68]);
    this.MU = v('--muted', [100, 116, 139]);
    this.LINE = v('--line', [226, 232, 240]);
    this.LINE2 = v('--line-2', [203, 213, 225]);
    this.HEAD = v('--head', [15, 23, 42]);
    this.ORSOFT = v('--orange-soft', [255, 247, 237]);
    // desaturated slate with a soft red tint for cells that have lost the rhythm
    this.LOST = mixc(mixc(this.MU, this.LINE2, 0.3), this.RED, 0.24);
    this.LOSTN = mixc(this.MU, this.RED, 0.2);
    this.ORD = mixc(this.OR, [154, 52, 18], 0.28);   // deeper orange for nuclei
  };
  /* coming back on screen after a while with card 03 already restored (or drifting apart):
     restart its loop so the viewer sees the signal re-entrain the tissue within a few seconds */
  Widget.prototype.replay = function () {
    if (this.reduce || !this.hiddenAt || performance.now() - this.hiddenAt < 1500) return;
    if (mod(this.T, RC) < 4.6) return;
    this.T = Math.ceil(this.T / RC) * RC; this.reset(true); this.render();
  };
  Widget.prototype.locked = function () { return document.documentElement.classList.contains('gate-locked'); };
  Widget.prototype.update = function () {
    var want = !this.reduce && this.visible && !document.hidden && !this.locked();
    if (want && !this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.loop); }
    else if (!want) this.running = false;
  };
  Widget.prototype.onResize = function (force) {
    var w = this.mount.clientWidth, h = this.mount.clientHeight;
    if (!force && w === this.W && h === this.H) return;
    this.layout(); this.reset(true); this.render();
  };
  Widget.prototype.layout = function () {
    var W = Math.max(1, this.mount.clientWidth), H = Math.max(1, this.mount.clientHeight);
    this.W = W; this.H = H;
    var dpr = Math.min(window.devicePixelRatio || 1, 2); this.dpr = dpr;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    var vertical = (mobileMQ && mobileMQ.matches) || W < 640;
    this.vertical = vertical;
    var rects = [], i, gap, pad, traceH;
    if (!vertical) {
      gap = clamp(W * 0.028, 20, 40); pad = W < 1000 ? 16 : 22; traceH = clamp(H * 0.13, 40, 56);
      var pw = (W - 2 * gap) / 3;
      for (i = 0; i < 3; i++) rects.push({ x: i * (pw + gap), y: 0, w: pw, h: H });
    } else {
      gap = 32; pad = 18; traceH = 40;
      var bh = (H - 2 * gap) / 3;
      for (i = 0; i < 3; i++) rects.push({ x: 0, y: i * (bh + gap), w: W, h: bh });
    }
    this.gap = gap; this.rects = rects;
    var headH = 44, tissueTop = pad + headH + 6;
    var tissueH = rects[0].h - tissueTop - 14 - traceH - pad;
    var s = clamp(tissueH / 5.9, 20, 34);
    // tight cards on phones use the short names
    var tight = !vertical && rects[0].w < 300;
    for (i = 0; i < 3; i++) {
      var rc = rects[i], cs = this.cards[i].style;
      cs.left = rc.x + 'px'; cs.top = rc.y + 'px'; cs.width = rc.w + 'px'; cs.height = rc.h + 'px';
      var tissue = { x: rc.x + pad, y: rc.y + tissueTop, w: rc.w - 2 * pad, h: tissueH };
      var trace = { x: rc.x + pad, y: rc.y + rc.h - pad - traceH, w: rc.w - 2 * pad, h: traceH };
      rc.tissue = tissue; rc.trace = trace;
      this.panels[i].build(tissue, trace, s);
      var hs = this.heads[i].el.style;
      hs.left = (rc.x + pad) + 'px'; hs.top = (rc.y + pad) + 'px'; hs.width = (rc.w - 2 * pad) + 'px';
      this.heads[i].name.textContent = tight ? SHORT[i] : NAMES[i];
    }
  };
  Widget.prototype.reset = function (keepTime) {
    if (!keepTime) this.T = 0;
    if (this.reduce) this.T = STILL;
    for (var i = 0; i < 3; i++) {
      var p = this.panels[i];
      if (p.mode === 'restore') {
        var Tc = this.T - mod(this.T, RC);
        p.init(Tc);
        for (var t = Tc + 1 / 60; t <= this.T + 1e-6; t += 1 / 60) p.step(t, 1 / 60);
      } else p.init(this.T);
      p.geomValid = false;
    }
  };
  Widget.prototype.frame = function (now) {
    if (!this.running) return;
    var dt = clamp((now - this.last) / 1000, 0, 0.05); this.last = now;
    var n = Math.max(1, Math.ceil(dt * 60 - 1e-6)), h = dt / n;
    for (var s = 0; s < n; s++) { this.T += h; for (var i = 0; i < 3; i++) this.panels[i].step(this.T, h); }
    this.render();
    requestAnimationFrame(this.loop);
  };

  /* ---------------- drawing ---------------- */
  Widget.prototype.render = function () {
    var ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    var cyc = mod(this.T, RC);
    for (var i = 0; i < 3; i++) {
      var p = this.panels[i];
      this.drawTissue(p, cyc);
      this.drawTrace(p);
    }
    this.drawArrows();
    // card 03 rule: how much of the tissue is back in step
    var pr = this.panels[2], mc = 0;
    for (var k = 0; k < pr.cells.length; k++) mc += pr.cells[k].c;
    mc = Math.round(mc / pr.cells.length * 200) / 200;
    if (mc !== this.lastFill) { this.lastFill = mc; this.heads[2].fill.style.transform = 'scaleX(' + mc.toFixed(3) + ')'; }
  };
  Widget.prototype.drawTissue = function (p, cyc) {
    var ctx = this.ctx, T = this.T, cells = p.cells, s = p.s, i;
    var OR = this.OR, AM = this.AM, LOST = this.LOST, SKY = this.SKY;
    p.geometry(T);
    // soft warm wash behind the tissue when it pulses together (normal compositing)
    var mv = 0;
    for (i = 0; i < cells.length; i++) mv += volt(cells[i].phi) * p.coh(cells[i]);
    mv /= cells.length;
    if (mv > 0.01) {
      var t = p.tissue;
      ctx.save(); ctx.translate(p.cx, p.cy); ctx.scale(t.w * 0.6, t.h * 0.72);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, rgba(AM, 0.16 * mv)); g.addColorStop(0.6, rgba(AM, 0.06 * mv)); g.addColorStop(1, rgba(AM, 0));
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }
    var rr = s * 0.24, nr = Math.max(1.6, s * 0.075);
    ctx.lineJoin = 'round';
    for (i = 0; i < cells.length; i++) {
      var ce = cells[i]; if (ce.n < 3) continue;
      var c = p.coh(ce), v = volt(ce.phi), l = 1 - c;
      var warm = mixc(AM, OR, sstep(0.15, 0.9, v));
      // two translucent layers instead of an RGB mix: slate fades out as warmth fades in (no muddy browns)
      ctx.beginPath(); roundPoly(ctx, ce.poly, ce.n, rr);
      if (l > 0.004) { ctx.fillStyle = rgba(LOST, (0.1 + 0.06 * v) * l); ctx.fill(); }
      if (c > 0.004) { ctx.fillStyle = rgba(warm, (0.1 + 0.42 * v) * c); ctx.fill(); }
      ctx.lineWidth = 1;
      if (l > 0.004) { ctx.strokeStyle = rgba(LOST, 0.55 * l * (1 - 0.6 * c)); ctx.stroke(); }
      if (c > 0.004) { ctx.strokeStyle = rgba(warm, (0.42 + 0.5 * v) * c); ctx.stroke(); }
      var flash = p.mode === 'restore' ? Math.exp(-(T - ce.hit) * 2.4) : 0;
      if (flash > 0.02) {
        ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(SKY, 0.85 * flash); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(ce.x, ce.y, nr * (0.9 + 0.3 * v * c), 0, TAU);
      if (l > 0.004) { ctx.fillStyle = rgba(this.LOSTN, 0.55 * l); ctx.fill(); }
      if (c > 0.004) { ctx.fillStyle = rgba(this.ORD, (0.45 + 0.55 * v) * c); ctx.fill(); }
    }
    if (p.mode === 'restore') this.drawSignal(p, cyc);
  };
  Widget.prototype.drawSignal = function (p, cyc) {
    var ctx = this.ctx, t = p.tissue, SKY = this.SKY, SKYD = this.SKYD;
    if (cyc >= DECAY) return;
    ctx.save();
    ctx.beginPath(); for (var b = 0; b < p.bn; b++) { if (b) ctx.lineTo(p.bp[b * 2], p.bp[b * 2 + 1]); else ctx.moveTo(p.bp[0], p.bp[1]); } ctx.closePath(); ctx.clip();
    ctx.lineCap = 'round';
    for (var k = 0; k < PT.length; k++) {
      var tau = cyc - PT[k];
      if (tau <= 0) continue;
      var r = p.r0 + p.pv * tau, u = (r - p.r0) / t.w;
      var a = sstep(0, 0.12, tau) * (1 - sstep(REACH[k] - 0.1, REACH[k] + 0.14, u)) * (1 - sstep(0.88, 1.08, u));
      if (a <= 0.003) continue;
      var span = Math.asin(Math.min(1, (t.h * 0.6) / r));
      // soft trailing band (light sky), then a crisp leading front
      var gb = ctx.createRadialGradient(p.sx, p.sy, Math.max(0, r - 26), p.sx, p.sy, r);
      gb.addColorStop(0, rgba(SKY, 0)); gb.addColorStop(1, rgba(SKY, 0.16 * a));
      ctx.beginPath(); ctx.arc(p.sx, p.sy, r, -span, span); ctx.arc(p.sx, p.sy, Math.max(1, r - 26), span, -span, true); ctx.closePath();
      ctx.fillStyle = gb; ctx.fill();
      ctx.beginPath(); ctx.arc(p.sx, p.sy, r, -span, span);
      ctx.strokeStyle = rgba(SKYD, 0.9 * a); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(1, r - 9), -span * 0.92, span * 0.92);
      ctx.strokeStyle = rgba(SKY, 0.35 * a); ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  };
  Widget.prototype.drawTrace = function (p) {
    var ctx = this.ctx, tr = p.trace, T = this.T, OR = this.OR, AM = this.AM, LOST = this.LOSTN;
    var pps = tr.w / TRACE_SEC, right = tr.x + tr.w, n = p.bt.length;
    if (!n) return;
    var top = tr.y + 4, hh = tr.h - 8;
    ctx.fillStyle = rgba(this.LINE, 1); ctx.fillRect(tr.x, tr.y + tr.h - 0.5, tr.w, 1);
    function X(t) { return right - 4 - (T - t) * pps; }
    function Y(v) { return top + hh - v * hh; }
    function col(c) { return mixc(LOST, OR, c); }
    function grad(cs, al, lo) {
      var g = ctx.createLinearGradient(tr.x, 0, right, 0), step = Math.max(1, Math.floor(n / 12));
      for (var i = 0; i < n; i += step) {
        var x = (X(p.bt[i]) - tr.x) / tr.w; if (x < 0 || x > 1) continue;
        g.addColorStop(x, rgba(col(cs[i]), al * lerp(lo, 1, cs[i]) * sstep(0, 0.16, x)));
      }
      g.addColorStop(1, rgba(col(cs[n - 1]), al * lerp(lo, 1, cs[n - 1])));
      if (X(p.bt[0]) > tr.x) g.addColorStop(0, rgba(OR, 0));
      return g;
    }
    function line(vals) {
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < n; i++) {
        var x = X(p.bt[i]); if (x < tr.x - 6) continue;
        if (!started) { ctx.moveTo(x, Y(vals[i])); started = true; } else ctx.lineTo(x, Y(vals[i]));
      }
      return started;
    }
    ctx.save(); ctx.beginPath(); ctx.rect(tr.x, tr.y - 2, tr.w, tr.h + 2); ctx.clip();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 1;
    for (var k = 0; k < p.bs.length; k++) { line(p.bs[k]); ctx.strokeStyle = grad(p.bsc[k], 0.3, 0.9); ctx.stroke(); }
    // soft area under the mean rhythm
    if (line(p.bm)) {
      ctx.lineTo(X(p.bt[n - 1]), tr.y + tr.h); ctx.lineTo(tr.x - 6, tr.y + tr.h); ctx.closePath();
      ctx.fillStyle = grad(p.bc, 0.1, 0.5); ctx.fill();
    }
    line(p.bm); ctx.lineWidth = 1.5; ctx.strokeStyle = grad(p.bc, 1, 0.85); ctx.stroke();
    ctx.restore();
    var lx = X(p.bt[n - 1]), ly = Y(p.bm[n - 1]), lc = col(p.bc[n - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(lc, 1); ctx.stroke();
  };
  Widget.prototype.drawArrows = function () {
    var ctx = this.ctx, r = this.rects;
    ctx.strokeStyle = rgba(this.LINE2, 1); ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < 2; i++) {
      ctx.beginPath();
      if (!this.vertical) {
        var x = r[i].x + r[i].w + this.gap / 2, y = r[i].tissue.y + r[i].tissue.h / 2;
        ctx.moveTo(x - 2.5, y - 5); ctx.lineTo(x + 2.5, y); ctx.lineTo(x - 2.5, y + 5);
      } else {
        var cx = this.W / 2, cy = r[i].y + r[i].h + this.gap / 2;
        ctx.moveTo(cx - 5, cy - 2.5); ctx.lineTo(cx, cy + 2.5); ctx.lineTo(cx + 5, cy - 2.5);
      }
      ctx.stroke();
    }
  };

  function boot() { mounts.forEach(function (m) { try { new Widget(m); } catch (e) { /* never break the page */ } }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

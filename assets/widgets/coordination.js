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
  var singleMQ = mq('(max-width: 560px)');  // phones: one panel that plays the three stages in turn
  var DUR = [4.4, 4.6, 7.4];                 // phones: seconds each stage plays before the next
  var HOLD = 6;                              // extra seconds a stage stays after it is picked
  var XF_OUT = 0.16, XF_IN = 0.3;            // phones: fade between stages (seconds)
  var REVEAL_HOLD = 450;                     // ms after the section's reveal before the clock starts

  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, al) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + clamp(al, 0, 1).toFixed(3) + ')'; }
  function mod(a, n) { return ((a % n) + n) % n; }
  /* OKLab mixing: a straight sRGB lerp between mauve-slate and orange passes through tan and brown,
     which reads as decay; OKLab keeps lightness and hue honest */
  function toLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function toSrgb(c) { c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return clamp(c * 255, 0, 255); }
  function oklab(c) {
    var r = toLin(c[0]), g = toLin(c[1]), b = toLin(c[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function fromOklab(o) {
    var l = o[0] + 0.3963377774 * o[1] + 0.2158037573 * o[2], m = o[0] - 0.1055613458 * o[1] - 0.0638541728 * o[2], s = o[0] - 0.0894841775 * o[1] - 1.2914855480 * o[2];
    l = l * l * l; m = m * m * m; s = s * s * s;
    return [toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
  }
  function mixOK(a, b, t) { var A = oklab(a), B = oklab(b); return fromOklab([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  /* colour c at alpha al as it appears over bg (opaque) */
  function over(c, al, bg) { return mixc(bg, c, al); }
  /* back to a translucent colour that shows as P over bg, using at least alpha a */
  function under(P, a, bg) {
    for (var k = 0; k < 3; k++) if (bg[k] > 0 && P[k] < bg[k]) a = Math.max(a, 1 - P[k] / bg[k]);
    a = clamp(a, 0.001, 1);
    return rgba([(P[0] - (1 - a) * bg[0]) / a, (P[1] - (1 - a) * bg[1]) / a, (P[2] - (1 - a) * bg[2]) / a], a);
  }
  /* coherence c: lost -> neutral -> warm, so a cell first desaturates and then warms */
  function via(lost, neut, warm, c) { return c < 0.5 ? mixOK(lost, neut, c * 2) : mixOK(neut, warm, (c - 0.5) * 2); }
  var CQ = 10, VQ = 12, FQ = 8;           // quantisation for batched drawing
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
  /* where the restore loop is at time T. On phones the stage starts its own cycle (t0) and holds the
     restored state instead of letting the cells drift apart again. */
  Panel.prototype.cycAt = function (T) {
    return this.t0 != null ? clamp(T - this.t0, 0, DECAY - 1e-3) : mod(T, RC);
  };
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
      var cyc = this.cycAt(T), prev = this.cycAt(T - dt);
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
    /* the drawing carries the image role, so the stage buttons (phones) can sit beside it in the mount */
    var label = mount.getAttribute('aria-label') || 'Three views of the same tissue: cells in step, cells out of step, and an incoming signal bringing them back into step.';
    mount.removeAttribute('role'); mount.removeAttribute('aria-label');
    mount.innerHTML = '';
    var root = document.createElement('div'); root.className = 'cw'; root.setAttribute('role', 'img'); root.setAttribute('aria-label', label);
    var track = document.createElement('div'); track.className = 'cw-track'; root.appendChild(track);
    this.cards = []; this.heads = [];
    var i;
    for (i = 0; i < 3; i++) {
      var card = document.createElement('div'); card.className = 'cw-card';
      track.appendChild(card); this.cards.push(card);
    }
    var cv = document.createElement('canvas'); cv.className = 'cw-canvas';
    track.appendChild(cv);
    for (i = 0; i < 3; i++) {
      var h = document.createElement('div'); h.className = 'cw-head cw-s' + i;
      h.innerHTML = '<span class="cw-label"><span class="cw-num">0' + (i + 1) + '</span><span class="cw-name">' + NAMES[i] + '</span></span><span class="cw-rule"><span class="cw-fill"></span></span>';
      track.appendChild(h); this.heads.push({ el: h, name: h.querySelector('.cw-name'), fill: h.querySelector('.cw-fill') });
    }
    /* phones: the stage indicator. Each segment names a stage and fills while it plays; tapping one
       jumps to that stage and lets it play longer before moving on. Hidden (so not focusable) on wider screens. */
    var steps = document.createElement('div'); steps.className = 'cw-steps'; steps.setAttribute('role', 'group'); steps.setAttribute('aria-label', 'Stages');
    this.steps = [];
    for (i = 0; i < 3; i++) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cw-step cw-t' + i;
      b.innerHTML = '<span class="cw-sl"><span class="cw-num">0' + (i + 1) + '</span><span class="cw-sn">' + SHORT[i] + '</span></span><span class="cw-bar"><span class="cw-bf"></span></span>';
      b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.addEventListener('click', this.pick.bind(this, i));
      steps.appendChild(b); this.steps.push({ el: b, fill: b.querySelector('.cw-bf'), k: -1 });
    }
    mount.appendChild(steps);
    mount.appendChild(root);
    this.root = root; this.track = track; this.cv = cv; this.ctx = cv.getContext('2d');
    this.panels = [new Panel(0), new Panel(1), new Panel(2)];
    this.T = 0; this.hiddenAt = 0; this.running = false; this.visible = false; this.W = 0; this.H = 0; this.lastFill = -1;
    this.stage = 0; this.prevStage = -1; this.stageT = 0; this.stageDur = DUR[0]; this.xf = 1;
    this.reduce = !!(reduceMQ && reduceMQ.matches);
    /* hold the clock until the section has faded in, so the first pulses are not spent while it is still rising */
    this.revealedAt = 0;
    var rv = mount.closest ? mount.closest('.reveal') : null;
    if (!rv || rv.classList.contains('in')) this.revealedAt = -1;
    else if (window.MutationObserver) {
      var mo = new MutationObserver(function () {
        if (!rv.classList.contains('in')) return;
        mo.disconnect();
        if (self.revealedAt === 0) { self.revealedAt = performance.now(); self.update(); }
      });
      mo.observe(rv, { attributes: true, attributeFilter: ['class'] });
    } else this.revealedAt = -1;
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
        var en = es[es.length - 1], vis = en.isIntersecting;
        if (vis && !self.visible) self.replay(); else if (!vis && self.visible) self.hiddenAt = performance.now();
        // phones: the stages only move on while most of the figure is in view
        self.inView = vis && en.intersectionRatio >= 0.55;
        self.visible = vis; self.update();
      }, { rootMargin: '0px', threshold: [0, 0.55] }).observe(mount);
    } else this.visible = true;
    document.addEventListener('visibilitychange', function () { self.update(); });
    document.addEventListener('site:unlocked', function () { self.readColors(); self.onResize(true); self.update(); });
    if (reduceMQ) {
      var onRM = function () {
        self.reduce = reduceMQ.matches; self.xf = 1; self.prevStage = -1; self.reset();
        if (self.single) { self.showHead(self.stage); self.syncSteps(); }
        self.render(); self.update();
      };
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
    this.BG = v('--bg', [255, 255, 255]);
    // desaturated slate with a soft red tint for cells that have lost the rhythm
    this.LOST = mixc(mixc(this.MU, this.LINE2, 0.3), this.RED, 0.24);
    this.LOSTN = mixc(this.MU, this.RED, 0.2);
    this.ORD = mixc(this.OR, [154, 52, 18], 0.28);   // deeper orange for nuclei
    this.buildPalette();
  };
  /* every (coherence, voltage) state a cell can show, resolved once into fill, stroke and nucleus styles.
     Mixing happens on the colours as seen over the card, in OKLab, through a light neutral. */
  Widget.prototype.buildPalette = function () {
    var BG = this.BG, N1 = [244, 244, 245], N3 = [212, 212, 216], N4 = [161, 161, 170];   // true neutrals: a slate midpoint reads blue beside orange
    var pal = [], ci, vi;
    for (ci = 0; ci <= CQ; ci++) {
      var c = ci / CQ;
      for (vi = 0; vi <= VQ; vi++) {
        var v = vi / VQ, warm = mixOK(this.AM, this.OR, sstep(0.15, 0.9, v));
        // fill swings gently (the nucleus and trace carry the full beat)
        var fa = lerp(0.1 + 0.06 * v, 0.17 + 0.21 * v, c), sa = lerp(0.55, 0.5 + 0.3 * v, c), na = lerp(0.55, 0.45 + 0.55 * v, c);
        var fP = via(over(this.LOST, 0.1 + 0.06 * v, BG), N1, over(warm, 0.17 + 0.21 * v, BG), c);
        var sP = via(over(this.LOST, 0.55, BG), N3, over(warm, 0.5 + 0.3 * v, BG), c);
        var nP = via(over(this.LOSTN, 0.55, BG), N4, over(this.ORD, 0.45 + 0.55 * v, BG), c);
        pal.push({ fill: under(fP, fa, BG), stroke: under(sP, sa, BG), nuc: under(nP, na, BG), nr: 0.9 + 0.3 * v * c });
      }
    }
    this.pal = pal;
    this.flashS = [];
    for (var f = 0; f <= FQ; f++) this.flashS.push(rgba(this.SKY, 0.85 * f / FQ));
    // trace colours by coherence: lost -> slate -> orange
    this.traceC = [];
    for (ci = 0; ci <= 32; ci++) this.traceC.push(via(this.LOSTN, N3, this.OR, ci / 32));
    this.gcache = {};
  };
  /* coming back on screen after a while with card 03 already restored (or drifting apart):
     restart its loop so the viewer sees the signal re-entrain the tissue within a few seconds */
  Widget.prototype.replay = function () {
    if (this.reduce || !this.hiddenAt || performance.now() - this.hiddenAt < 1500) return;
    if (this.single) {
      // phones: away for a while, start the story again from stage 01
      if (performance.now() - this.hiddenAt > 4000 && (this.stage || this.stageT > 0.5)) this.restart(0);
      return;
    }
    if (mod(this.T, RC) < 4.6) return;
    // done on the next frame, not inside the IntersectionObserver callback
    this.restart();
  };
  Widget.prototype.restart = function (stage) {
    var self = this;
    if (this.replayPending) return;
    this.replayPending = true;
    requestAnimationFrame(function () {
      self.replayPending = false;
      if (self.single) { self.goStage(stage || 0, false, true); return; }
      self.T = Math.ceil(self.T / RC) * RC; self.reset(true); self.render();
    });
  };
  /* phones: a stage button was pressed */
  Widget.prototype.pick = function (i) {
    if (!this.single) return;
    this.goStage(i, true, false);
  };
  /* phones: show stage i. Its panel starts fresh (stage 03 from the first signal wave); a picked stage
     plays for longer before the cycle moves on. instant skips the fade. */
  Widget.prototype.goStage = function (i, picked, instant) {
    var p = this.panels[i];
    if (i !== this.stage) { this.prevStage = instant || this.reduce ? -1 : this.stage; this.xf = instant || this.reduce ? 1 : 0; }
    else if (instant) { this.prevStage = -1; this.xf = 1; }
    this.stage = i; this.stageT = 0; this.stageDur = DUR[i] + (picked ? HOLD : 0);
    if (!this.reduce) {
      if (p.mode === 'restore') p.t0 = this.T;
      p.init(this.T); p.geomValid = false;
    }
    // the old name fades with its tissue; the new one comes in with the new tissue
    this.showHead(this.xf >= 1 ? i : -1);
    this.syncSteps();
    if (!this.running) this.render();
  };
  Widget.prototype.showHead = function (i) {
    for (var k = 0; k < 3; k++) this.heads[k].el.classList.toggle('on', k === i);
  };
  Widget.prototype.syncSteps = function () {
    for (var k = 0; k < 3; k++) {
      var st = this.steps[k], on = k === this.stage;
      var f = k < this.stage ? 1 : k > this.stage ? 0 : (this.reduce ? 1 : clamp(this.stageT / this.stageDur, 0, 1));
      f = Math.round(f * 400) / 400;
      if (f !== st.k) { st.k = f; st.fill.style.transform = 'scaleX(' + f.toFixed(4) + ')'; }
      if (st.on !== on) { st.on = on; st.el.classList.toggle('on', on); st.el.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    }
  };
  Widget.prototype.locked = function () { return document.documentElement.classList.contains('gate-locked'); };
  Widget.prototype.update = function () {
    var want = !this.reduce && this.visible && !document.hidden && !this.locked();
    if (want && this.revealedAt !== -1) {
      // the section has not faded in yet (or only just): keep the opening frame and start a beat later
      var self = this;
      if (!this.revealedAt) {
        want = false;
        // never wait on a reveal that does not come
        if (!this.revealGuard) this.revealGuard = setTimeout(function () { if (!self.revealedAt) { self.revealedAt = -1; self.update(); } }, 1600);
      } else {
        var wait = REVEAL_HOLD - (performance.now() - this.revealedAt);
        if (wait > 0) { want = false; clearTimeout(this.revealTimer); this.revealTimer = setTimeout(function () { self.update(); }, wait + 16); }
        else this.revealedAt = -1;
      }
    }
    if (want && !this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.loop); }
    else if (!want) this.running = false;
  };
  Widget.prototype.onResize = function (force) {
    var w = this.root.clientWidth, h = this.root.clientHeight;
    if (!force && w === this.W && h === this.H) return;
    this.layout(); this.reset(true); this.render();
  };
  Widget.prototype.layout = function () {
    var single = !!(singleMQ && singleMQ.matches), was = this.single;
    this.single = single; this.mount.classList.toggle('cw-single', single);
    var W = Math.max(1, this.root.clientWidth), H = Math.max(1, this.root.clientHeight);
    this.W = W; this.H = H;
    var dpr = Math.min(window.devicePixelRatio || 1, 2); this.dpr = dpr;
    var vertical = !single && ((mobileMQ && mobileMQ.matches) || W < 640);
    this.vertical = vertical;
    var rects = [], i, gap, pad, traceH, CW = W, headH = 44;
    if (single) {
      // one card the width of the column; the three stages take turns in it
      gap = 0; pad = 16; traceH = 40; headH = 26;
      for (i = 0; i < 3; i++) rects.push({ x: 0, y: 0, w: W, h: H });
    } else if (!vertical) {
      gap = clamp(W * 0.028, 20, 40); pad = W < 1000 ? 16 : 22; traceH = clamp(H * 0.13, 40, 56);
      var pw = (W - 2 * gap) / 3;
      for (i = 0; i < 3; i++) rects.push({ x: i * (pw + gap), y: 0, w: pw, h: H });
    } else {
      gap = 32; pad = 18; traceH = 40;
      var bh = (H - 2 * gap) / 3;
      for (i = 0; i < 3; i++) rects.push({ x: 0, y: i * (bh + gap), w: W, h: bh });
    }
    this.CW = CW;
    this.cv.width = Math.round(CW * dpr); this.cv.height = Math.round(H * dpr);
    this.gap = gap; this.rects = rects; this.gcache = {};
    var tissueTop = pad + headH + 6;
    var tissueH = rects[0].h - tissueTop - 14 - traceH - pad;
    var s = clamp(tissueH / 5.9, 20, 34);
    // tight cards on phones use the short names
    var tight = !vertical && !single && rects[0].w < 300;
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
    if (single !== was) {
      // entering the phone layout starts at stage 01; leaving it gives card 03 back its own loop
      if (single) { this.stage = 0; this.prevStage = -1; this.xf = 1; this.stageT = 0; this.stageDur = DUR[0]; }
      this.panels[2].t0 = single && !this.reduce ? this.T : null;
      for (i = 0; i < 3; i++) this.heads[i].el.classList.remove('on');
    }
    if (single) { this.showHead(this.xf < 1 && this.prevStage >= 0 && this.xf < XF_OUT / (XF_OUT + XF_IN) ? -1 : this.stage); this.syncSteps(); }
  };
  Widget.prototype.reset = function (keepTime) {
    if (!keepTime) this.T = 0;
    if (this.reduce) this.T = STILL;
    var pr = this.panels[2];
    pr.t0 = this.single && !this.reduce ? (pr.t0 != null && this.stage === 2 && pr.t0 <= this.T ? pr.t0 : this.T) : null;
    for (var i = 0; i < 3; i++) {
      var p = this.panels[i];
      if (p.mode === 'restore') {
        var Tc = p.t0 != null ? p.t0 : this.T - mod(this.T, RC);
        p.init(Tc);
        for (var t = Tc + 1 / 60; t <= this.T + 1e-6; t += 1 / 60) p.step(t, 1 / 60);
      } else p.init(this.T);
      p.geomValid = false;
    }
  };
  Widget.prototype.frame = function (now) {
    if (!this.running) return;
    var dt = clamp((now - this.last) / 1000, 0, 0.05); this.last = now;
    var n = Math.max(1, Math.ceil(dt * 60 - 1e-6)), h = dt / n, s, i;
    if (this.single) {
      // only the stage on show (and the one fading out) is simulated
      var outgoing = this.xf < 1 ? this.prevStage : -1;
      for (s = 0; s < n; s++) {
        this.T += h; this.panels[this.stage].step(this.T, h);
        if (outgoing >= 0) this.panels[outgoing].step(this.T, h);
      }
      if (this.xf < 1) {
        var a = XF_OUT / (XF_OUT + XF_IN), was = this.xf;
        this.xf = Math.min(1, this.xf + dt / (XF_OUT + XF_IN));
        if (was < a && this.xf >= a) this.showHead(this.stage);
        if (this.xf >= 1) this.prevStage = -1;
      } else if (this.inView !== false) {
        this.stageT += dt;
        if (this.stageT >= this.stageDur) this.goStage((this.stage + 1) % 3, false, false);
      }
      this.syncSteps();
    } else {
      for (s = 0; s < n; s++) { this.T += h; for (i = 0; i < 3; i++) this.panels[i].step(this.T, h); }
    }
    this.render();
    requestAnimationFrame(this.loop);
  };

  /* ---------------- drawing ---------------- */
  Widget.prototype.render = function () {
    var ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.CW, this.H);
    if (this.single) {
      // fade the outgoing stage out, then the new one in
      var a = XF_OUT / (XF_OUT + XF_IN), x = this.xf, show = this.stage, al = 1;
      if (x < 1 && this.prevStage >= 0) {
        if (x < a) { show = this.prevStage; al = 1 - x / a; } else al = (x - a) / (1 - a);
        al = al * al * (3 - 2 * al);
      }
      ctx.globalAlpha = al;
      this.drawTissue(this.panels[show]);
      this.drawTrace(this.panels[show]);
      ctx.globalAlpha = 1;
    } else {
      for (var i = 0; i < 3; i++) { this.drawTissue(this.panels[i]); this.drawTrace(this.panels[i]); }
      this.drawArrows();
    }
    // card 03 rule: how much of the tissue is back in step
    var pr = this.panels[2], mc = 0;
    for (var k = 0; k < pr.cells.length; k++) mc += pr.cells[k].c;
    mc = Math.round(mc / pr.cells.length * 200) / 200;
    if (mc !== this.lastFill) { this.lastFill = mc; this.heads[2].fill.style.transform = 'scaleX(' + mc.toFixed(3) + ')'; }
  };
  Widget.prototype.drawTissue = function (p) {
    var ctx = this.ctx, T = this.T, cells = p.cells, s = p.s, i, cyc = p.cycAt(T);
    var AM = this.AM;
    p.geometry(T);
    // soft warm wash behind the tissue when it pulses together (normal compositing)
    var mv = 0;
    for (i = 0; i < cells.length; i++) mv += volt(cells[i].phi) * p.coh(cells[i]);
    mv /= cells.length;
    if (mv > 0.01) {
      var t = p.tissue;
      ctx.save(); ctx.translate(p.cx, p.cy); ctx.scale(t.w * 0.6, t.h * 0.72);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, rgba(AM, 0.12 * mv)); g.addColorStop(0.6, rgba(AM, 0.045 * mv)); g.addColorStop(1, rgba(AM, 0));
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }
    var rr = s * 0.24, nr = Math.max(1.6, s * 0.075), pal = this.pal;
    /* batch: one path per palette entry, so a frame is a few dozen fills and strokes instead of hundreds */
    var cellB = this.cellB || (this.cellB = []), nucB = this.nucB || (this.nucB = []), flB = this.flB || (this.flB = []), used = [], fused = [];
    for (i = 0; i < cells.length; i++) {
      var ce = cells[i]; if (ce.n < 3) continue;
      var c = p.coh(ce), v = volt(ce.phi);
      var key = Math.round(c * CQ) * (VQ + 1) + Math.round(v * VQ);
      if (!cellB[key]) { cellB[key] = new Path2D(); nucB[key] = new Path2D(); used.push(key); }
      roundPoly(cellB[key], ce.poly, ce.n, rr);
      var r = nr * pal[key].nr;
      nucB[key].moveTo(ce.x + r, ce.y); nucB[key].arc(ce.x, ce.y, r, 0, TAU);
      if (p.mode === 'restore') {
        var fq = Math.round(Math.exp(-(T - ce.hit) * 2.4) * FQ);
        if (fq > 0) { if (!flB[fq]) { flB[fq] = new Path2D(); fused.push(fq); } roundPoly(flB[fq], ce.poly, ce.n, rr); }
      }
    }
    ctx.lineJoin = 'round'; ctx.lineWidth = 1;
    for (i = 0; i < used.length; i++) { ctx.fillStyle = pal[used[i]].fill; ctx.fill(cellB[used[i]]); }
    for (i = 0; i < used.length; i++) { ctx.strokeStyle = pal[used[i]].stroke; ctx.stroke(cellB[used[i]]); }
    if (fused.length) {
      ctx.lineWidth = 1.5;
      for (i = 0; i < fused.length; i++) { ctx.strokeStyle = this.flashS[fused[i]]; ctx.stroke(flB[fused[i]]); flB[fused[i]] = null; }
    }
    for (i = 0; i < used.length; i++) { ctx.fillStyle = pal[used[i]].nuc; ctx.fill(nucB[used[i]]); cellB[used[i]] = nucB[used[i]] = null; }
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
    var ctx = this.ctx, tr = p.trace, T = this.T, TC = this.traceC, gcache = this.gcache;
    var pps = tr.w / TRACE_SEC, right = tr.x + tr.w, n = p.bt.length;
    if (!n) return;
    var top = tr.y + 4, hh = tr.h - 8;
    ctx.fillStyle = rgba(this.LINE, 1); ctx.fillRect(tr.x, tr.y + tr.h - 0.5, tr.w, 1);
    function X(t) { return right - 4 - (T - t) * pps; }
    function Y(v) { return top + hh - v * hh; }
    function col(c) { return TC[Math.round(clamp(c, 0, 1) * 32)]; }
    var full = X(p.bt[0]) <= tr.x;
    /* coloured by coherence along time; a window of constant coherence reuses a cached gradient */
    function grad(cs, al, lo, kind) {
      var mn = 1, mx = 0, i;
      for (i = 0; i < n; i++) { if (cs[i] < mn) mn = cs[i]; if (cs[i] > mx) mx = cs[i]; }
      var key = null, g;
      if (full && mx - mn < 0.004) {
        key = kind + Math.round(mx * 32) + ':' + tr.x + ':' + right;
        if (gcache[key]) return gcache[key];
        var cc = col(mx), aa = al * lerp(lo, 1, mx);
        g = ctx.createLinearGradient(tr.x, 0, right, 0);
        for (var q = 0; q <= 4; q++) g.addColorStop(q * 0.04, rgba(cc, aa * sstep(0, 0.16, q * 0.04)));
        g.addColorStop(1, rgba(cc, aa));
        gcache[key] = g; return g;
      }
      g = ctx.createLinearGradient(tr.x, 0, right, 0);
      var step = Math.max(1, Math.floor(n / 12));
      for (i = 0; i < n; i += step) {
        var x = (X(p.bt[i]) - tr.x) / tr.w; if (x < 0 || x > 1) continue;
        g.addColorStop(x, rgba(col(cs[i]), al * lerp(lo, 1, cs[i]) * sstep(0, 0.16, x)));
      }
      g.addColorStop(1, rgba(col(cs[n - 1]), al * lerp(lo, 1, cs[n - 1])));
      if (!full) g.addColorStop(0, rgba(col(cs[0]), 0));
      return g;
    }
    function line(vals, keep) {
      if (!keep) ctx.beginPath();
      var started = false;
      for (var i = 0; i < n; i++) {
        var x = X(p.bt[i]); if (x < tr.x - 6) continue;
        if (!started) { ctx.moveTo(x, Y(vals[i])); started = true; } else ctx.lineTo(x, Y(vals[i]));
      }
      return started;
    }
    ctx.save(); ctx.beginPath(); ctx.rect(tr.x, tr.y - 2, tr.w, tr.h + 2); ctx.clip();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 1;
    // the faint per-cell lines share one path and take the tissue's mean coherence
    ctx.beginPath();
    for (var k = 0; k < p.bs.length; k++) line(p.bs[k], true);
    ctx.strokeStyle = grad(p.bc, 0.3, 0.9, 'l'); ctx.stroke();
    // soft area under the mean rhythm
    ctx.beginPath();
    if (line(p.bm, true)) {
      ctx.lineTo(X(p.bt[n - 1]), tr.y + tr.h); ctx.lineTo(tr.x - 6, tr.y + tr.h); ctx.closePath();
      ctx.fillStyle = grad(p.bc, 0.1, 0.5, 'a'); ctx.fill();
    }
    ctx.beginPath(); line(p.bm, true); ctx.lineWidth = 1.5; ctx.strokeStyle = grad(p.bc, 1, 0.85, 'm'); ctx.stroke();
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

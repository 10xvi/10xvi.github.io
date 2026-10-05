/* 10X Vital Intelligence: "conversation" and "path" widgets.
   Plain script, no dependencies. Renders into [data-widget="conversation"] and [data-widget="path"]. */
(function () {
  'use strict';
  if (window.__cpWidgetsLoaded) return;
  window.__cpWidgetsLoaded = true;

  var doc = document, root = doc.documentElement;
  var TAU = Math.PI * 2;
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(mq && mq.matches); }
  function locked() { return root.classList.contains('gate-locked'); }

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function easeInOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }

  function parseColor(str, fb) {
    str = (str || '').trim();
    var m = /^#([0-9a-f]{6})$/i.exec(str);
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /^#([0-9a-f]{3})$/i.exec(str);
    if (m) { return [0, 1, 2].map(function (i) { return parseInt(m[1][i] + m[1][i], 16); }); }
    m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(str);
    if (m) return [+m[1], +m[2], +m[3]];
    return fb;
  }
  var COL = {};
  function readColors() {
    var cs = getComputedStyle(root);
    COL.orange = parseColor(cs.getPropertyValue('--orange'), [249, 115, 22]);
    COL.amber = parseColor(cs.getPropertyValue('--amber'), [245, 158, 11]);
    COL.sky = parseColor(cs.getPropertyValue('--sky'), [14, 165, 233]);
    COL.skyDeep = parseColor(cs.getPropertyValue('--sky-deep'), [2, 132, 199]);
    COL.head = parseColor(cs.getPropertyValue('--head'), [15, 23, 42]);
    COL.text = parseColor(cs.getPropertyValue('--text'), [71, 85, 105]);
    COL.muted = parseColor(cs.getPropertyValue('--muted'), [100, 116, 139]);
    COL.line = parseColor(cs.getPropertyValue('--line'), [226, 232, 240]);
    COL.line2 = parseColor(cs.getPropertyValue('--line-2'), [203, 213, 225]);
    COL.bg = parseColor(cs.getPropertyValue('--bg'), [255, 255, 255]);
    COL.orangeSoft = parseColor(cs.getPropertyValue('--orange-soft'), [255, 247, 237]);
    COL.skySoft = parseColor(cs.getPropertyValue('--sky-soft'), [240, 249, 255]);
    // shared ink tokens for small text on white (AA)
    COL.orangeInk = parseColor(cs.getPropertyValue('--orange-ink'), [194, 65, 12]);
    COL.skyInk = parseColor(cs.getPropertyValue('--sky-ink'), [3, 105, 161]);
    COL.white = [255, 255, 255];
  }
  function softShadow(ctx, blur, dy, a) {
    ctx.shadowColor = 'rgba(15,23,42,' + a + ')'; ctx.shadowBlur = blur; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = dy;
  }
  function noShadow(ctx) { ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  function chevron(ctx, ln, s, size) {
    var o = laneAt(ln, s, {}), p = laneAt(ln, s - 2, {});
    var tx = o.x - p.x, ty = o.y - p.y, tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    ctx.beginPath();
    ctx.moveTo(o.x - tx * size - ty * size * 0.8, o.y - ty * size + tx * size * 0.8);
    ctx.lineTo(o.x, o.y);
    ctx.lineTo(o.x - tx * size + ty * size * 0.8, o.y - ty * size - tx * size * 0.8);
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a < 0 ? 0 : a > 1 ? 1 : +a.toFixed(3)) + ')'; }
  function mix(c1, c2, t) { return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))]; }

  var MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  var DISP = '"Space Grotesk", system-ui, -apple-system, sans-serif';

  /* letter-spaced text (canvas letterSpacing is not universal) */
  function spacedWidth(ctx, s, ls) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += ctx.measureText(s[i]).width;
    return w + ls * (s.length - 1);
  }
  function fillSpaced(ctx, s, x, y, ls, align) {
    var w = spacedWidth(ctx, s, ls);
    var px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    var a = ctx.textAlign; ctx.textAlign = 'left';
    for (var i = 0; i < s.length; i++) { ctx.fillText(s[i], px, y); px += ctx.measureText(s[i]).width + ls; }
    ctx.textAlign = a;
    return w;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  /* soft glow: one cached radial sprite per colour, blitted with globalAlpha (no per-frame gradient) */
  var glowCache = {}, glowCount = 0;
  function glowSprite(col) {
    // colours are quantised so tints that drift with distance reuse a small, bounded set of sprites
    col = col.map(function (v) { return Math.min(255, Math.round(v / 6) * 6); });
    var key = col.join(',');
    if (glowCache[key]) return glowCache[key];
    if (++glowCount > 64) { glowCache = {}; glowCount = 1; }
    var c = doc.createElement('canvas'), S = 128; c.width = c.height = S;
    var x = c.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.3, rgba(col, 0.62)); g.addColorStop(0.62, rgba(col, 0.2)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return (glowCache[key] = c);
  }
  function glowDot(ctx, x, y, r, col, a) {
    if (a <= 0.003) return;
    var ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * clamp(a, 0, 1);
    ctx.drawImage(glowSprite(col), x - r, y - r, 2 * r, 2 * r);
    ctx.globalAlpha = ga;
  }
  /* offscreen layers at the host's backing size; drawn 1:1 in device pixels */
  function makeLayer(h, w, hh, ox, oy) {
    var c = doc.createElement('canvas');
    var dpr = h.dpr;
    w = w == null ? h.w : w; hh = hh == null ? h.h : hh; ox = ox || 0; oy = oy || 0;
    c.width = Math.max(1, Math.ceil(w * dpr)); c.height = Math.max(1, Math.ceil(hh * dpr));
    var x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, -ox * dpr, -oy * dpr);
    return { c: c, ctx: x, ox: ox, oy: oy, w: c.width / dpr, h: c.height / dpr };
  }
  function blitLayer(h, ctx, L, alpha) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(L.c, Math.round(L.ox * h.dpr), Math.round(L.oy * h.dpr));
    ctx.restore();
  }
  /* draw a sprite baked around its own origin at (x, y), snapped to device pixels */
  function blitAt(h, ctx, L, x, y, alpha) {
    var d = h.dpr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(L.c, Math.round((x + L.ox) * d), Math.round((y + L.oy) * d));
    ctx.restore();
  }
  /* a sprite whose top-left sits on a whole device pixel, so baked text stays crisp */
  function makeSprite(h, x0, y0, x1, y1) {
    var d = h.dpr, ox = Math.floor(x0 * d) / d, oy = Math.floor(y0 * d) / d;
    return makeLayer(h, x1 - ox, y1 - oy, ox, oy);
  }

  /* ---------- widget host: canvas, sizing, visibility, shared loop ---------- */
  var widgets = [];
  function Host(mount, impl) {
    this.mount = mount; this.impl = impl; this.st = {};
    this.w = 0; this.h = 0; this.dpr = 1; this.visible = false; this.leftAt = 0;
    var stage = doc.createElement('div'); stage.className = 'cpw-stage';
    var cv = doc.createElement('canvas'); cv.className = 'cpw-canvas'; cv.setAttribute('aria-hidden', 'true');
    stage.appendChild(cv);
    mount.appendChild(stage);
    this.stage = stage; this.cv = cv; this.ctx = cv.getContext('2d');
    if (impl.decorate) impl.decorate(this);
    impl.init(this);
  }
  Host.prototype.bake = function () { if (this.w && this.impl.bake) this.impl.bake(this); };
  Host.prototype.resize = function (force) {
    var r = this.stage.getBoundingClientRect();
    var w = Math.round(r.width), h = Math.round(r.height);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w < 4 || h < 4) return false;
    if (!force && w === this.w && h === this.h && dpr === this.dpr) return false;
    this.w = w; this.h = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.impl.layout(this);
    this.bake();
    if (reduced()) this.impl.still(this);
    return true;
  };
  Host.prototype.render = function () {
    if (!this.w) return;
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.impl.draw(this, ctx);
  };

  var raf = 0, last = 0;
  function wantRun() {
    if (reduced() || locked() || doc.hidden) return false;
    for (var i = 0; i < widgets.length; i++) if (widgets[i].visible && widgets[i].w) return true;
    return false;
  }
  function tick(now) {
    raf = 0;
    if (!wantRun()) return;
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    for (var i = 0; i < widgets.length; i++) {
      var h = widgets[i];
      if (h.visible && h.w) { h.impl.update(h, dt); h.render(); }
    }
    raf = requestAnimationFrame(tick);
  }
  function kick() {
    if (!raf && wantRun()) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function renderAll(force) {
    widgets.forEach(function (h) { h.resize(force); h.render(); });
  }

  /* =====================================================================
     A. CONVERSATION: Body (orange, organic) <-> Intelligence (sky, geometric)
     ===================================================================== */
  var SIGNALS = ['Light', 'Sound', 'Temperature', 'Breath', 'Currents'];
  var SIG_AMP = [5, 8.5, 9, 8.5, 6];
  function sigWave(k, x, ph) {
    switch (k) {
      case 0: return Math.sin(x * 0.44 - ph * 7.0);                                   // light: fine, fast
      case 1: return Math.sin(x * 0.26 - ph * 4.2) * (0.7 + 0.3 * Math.sin(x * 0.05 + 0.6)); // sound: beating
      case 2: return Math.sin(x * 0.034 - ph * 0.8 - 0.4);                              // temperature: slow swell
      case 3: return Math.sin(x * 0.072 - ph * 1.5);                                   // breath: long, rounded
      default: var s = Math.sin(x * 0.13 - ph * 2.6); return Math.tanh(s * 3.4) / 0.9978; // currents: pulse train
    }
  }
  function respWave(k, x, ph, att) {
    var organic = 0.62 * Math.sin(x * 0.085 - ph * 1.7) + 0.38 * Math.sin(x * 0.19 + 1.3 - ph * 2.9);
    var echo = sigWave(k, x * 0.85, ph * 0.8);
    return lerp(organic, 0.55 * organic + 0.45 * echo, att);
  }

  function buildLane(p0, c, p2, ctr) {
    var N = 360, xs = [], ys = [], len = [0], i, t, x, y;
    for (i = 0; i <= N; i++) {
      t = i / N;
      x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x;
      y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y;
      xs.push(x); ys.push(y);
      if (i) len.push(len[i - 1] + Math.hypot(x - xs[i - 1], y - ys[i - 1]));
    }
    var L = len[N], step = 1, n = Math.ceil(L / step), X = new Float32Array(n + 1), Y = new Float32Array(n + 1),
      NX = new Float32Array(n + 1), NY = new Float32Array(n + 1), j = 0;
    for (i = 0; i <= n; i++) {
      var s = Math.min(L, i * step);
      while (j < N - 1 && len[j + 1] < s) j++;
      var f = (s - len[j]) / ((len[j + 1] - len[j]) || 1);
      X[i] = lerp(xs[j], xs[j + 1], f); Y[i] = lerp(ys[j], ys[j + 1], f);
      var tx = xs[j + 1] - xs[j], ty = ys[j + 1] - ys[j], tl = Math.hypot(tx, ty) || 1;
      var nx = -ty / tl, ny = tx / tl;
      if (nx * (X[i] - ctr.x) + ny * (Y[i] - ctr.y) < 0) { nx = -nx; ny = -ny; }
      NX[i] = nx; NY[i] = ny;
    }
    return { len: L, n: n, X: X, Y: Y, NX: NX, NY: NY };
  }
  function laneAt(l, s, o) {
    var f = clamp(s, 0, l.len), i = Math.min(l.n - 1, Math.floor(f)), r = f - i;
    o.x = lerp(l.X[i], l.X[i + 1], r); o.y = lerp(l.Y[i], l.Y[i + 1], r);
    o.nx = lerp(l.NX[i], l.NX[i + 1], r); o.ny = lerp(l.NY[i], l.NY[i + 1], r);
    return o;
  }

  var Conversation = {
    decorate: function (h) {
      var cap = doc.createElement('div');
      cap.className = 'cpw-caption';
      cap.setAttribute('aria-hidden', 'true');
      cap.innerHTML = '<span>A continuous two-way conversation</span>';
      h.mount.appendChild(cap);
    },
    init: function (h) {
      var st = h.st;
      st.t = 0; st.att = 0.12; st.sig = 0; st.packets = []; st.timers = []; st.fx = [];
      st.scan = 2; st.bodyHit = 0; st.intelHit = 0;
    },
    reset: function (h) { this.init(h); this.warm(h); },
    warm: function (h) {
      var st = h.st; this.emit(h, 0, 0);
      for (var i = 0; i < 70; i++) this.update(h, 1 / 30);
    },
    emit: function (h, lane, k) {
      var st = h.st;
      st.packets.push({ lane: lane, k: k, hp: 0, arrived: false, born: st.t });
    },
    layout: function (h) {
      var st = h.st, W = h.w, H = h.h, cx = W / 2;
      st.mode = W < 440 ? 'v' : 'h';
      var A, B, a0, a1, b0, b1, R, ctr, aoff, ctrlA, ctrlB, P = function (p, r, ang) { return { x: p.x + r * Math.cos(ang), y: p.y + r * Math.sin(ang) }; };
      if (st.mode === 'h') {
        R = clamp(W * 0.07, 36, 60);
        var cy = Math.round(H * 0.5);
        // a centred, tighter figure on wide screens: the two poles about 560px apart
        var span = Math.min(W - 2 * (R * 1.85 + 4), 570); // keeps each pole's glow and ripple inside the stage
        A = { x: cx - span / 2, y: cy }; B = { x: cx + span / 2, y: cy };
        ctr = { x: cx, y: cy };
        aoff = Math.min(clamp(span * 0.16, 64, 96), H / 2 - 20);
        var ea = 0.62; // edge angle from axis
        // lane 0: outbound, intelligence -> body, along the top
        b0 = P(B, R + 8, Math.PI + ea); a0 = P(A, R + 8, -ea);
        ctrlA = { x: cx, y: 2 * (cy - aoff) - b0.y };
        // lane 1: response, body -> intelligence, along the bottom
        a1 = P(A, R + 8, ea); b1 = P(B, R + 8, Math.PI - ea);
        ctrlB = { x: cx, y: 2 * (cy + aoff) - a1.y };
        st.lanes = [buildLane(b0, ctrlA, a0, ctr), buildLane(a1, ctrlB, b1, ctr)];
        st.labels = [{ x: A.x, y: A.y + R + 34, t: 'Body', c: COL.orange }, { x: B.x, y: B.y + R + 34, t: 'Intelligence', c: COL.sky }];
        st.tagInside = false;
      } else {
        R = clamp(W * 0.1, 30, 38);
        A = { x: cx, y: R + 50 }; B = { x: cx, y: H - R - 52 };
        ctr = { x: cx, y: (A.y + B.y) / 2 };
        aoff = clamp(W * 0.25, 74, 104);
        var eb = 0.72;
        // outbound on the right, response on the left
        b0 = P(B, R + 8, -Math.PI / 2 + eb); a0 = P(A, R + 8, Math.PI / 2 - eb);
        ctrlA = { x: 2 * (cx + aoff) - b0.x, y: ctr.y };
        a1 = P(A, R + 8, Math.PI / 2 + eb); b1 = P(B, R + 8, -Math.PI / 2 - eb);
        ctrlB = { x: 2 * (cx - aoff) - a1.x, y: ctr.y };
        st.lanes = [buildLane(b0, ctrlA, a0, ctr), buildLane(a1, ctrlB, b1, ctr)];
        st.labels = [{ x: A.x, y: A.y - R - 22, t: 'Body', c: COL.orange }, { x: B.x, y: B.y + R + 36, t: 'Intelligence', c: COL.sky }];
        st.tagInside = true;
      }
      st.A = A; st.B = B; st.R = R; st.ctr = ctr; st.aoff = aoff;
      var L0 = st.lanes[0].len;
      st.Lp = clamp(L0 * 0.36, 120, 230);
      st.speed = (L0 + st.Lp * 0.15) / 3.1;
      st.seedBlob = st.seedBlob || [Math.random() * 6, Math.random() * 6, Math.random() * 6];
      if (!st.warmed) { st.warmed = true; this.warm(h); }
    },
    bake: function (h) {
      var st = h.st, A = st.A, B = st.B, R = st.R, sky = COL.sky, orange = COL.orange, amber = COL.amber, i, k, ctx;
      var l0 = st.lanes[0], l1 = st.lanes[1];
      // field, at the strongest attunement; drawn with a lower alpha per frame
      var F = makeLayer(h); ctx = F.ctx;
      var fieldA = 0.085, fe = st.mode === 'h' ? 0.07 : 0.1;
      var g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
      g.addColorStop(0, rgba(amber, 0)); g.addColorStop(fe, rgba(amber, 0)); g.addColorStop(fe + 0.14, rgba(amber, fieldA)); g.addColorStop(0.5, rgba(COL.line, 0.3));
      g.addColorStop(0.86 - fe, rgba(sky, fieldA)); g.addColorStop(1 - fe, rgba(sky, 0)); g.addColorStop(1, rgba(sky, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(l0.X[0], l0.Y[0]);
      for (i = 4; i <= l0.n; i += 4) ctx.lineTo(l0.X[i], l0.Y[i]);
      for (i = 0; i <= l1.n; i += 4) ctx.lineTo(l1.X[i], l1.Y[i]);
      ctx.closePath(); ctx.fill();
      st.fieldLayer = F;
      // tracks: a solid tinted hairline per lane, faded at both ends, with a clear arrowhead
      var T = makeLayer(h); ctx = T.ctx;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (k = 0; k < 2; k++) {
        var ln = st.lanes[k], col = k === 0 ? sky : orange;
        var tg = ctx.createLinearGradient(ln.X[0], ln.Y[0], ln.X[ln.n], ln.Y[ln.n]);
        var f0 = Math.min(0.2, 30 / ln.len);
        tg.addColorStop(0, rgba(col, 0)); tg.addColorStop(f0, rgba(col, 0.3)); tg.addColorStop(1 - f0 * 0.5, rgba(col, 0.32)); tg.addColorStop(1, rgba(col, 0.32));
        ctx.lineWidth = 1.25; ctx.strokeStyle = tg;
        ctx.beginPath(); ctx.moveTo(ln.X[0], ln.Y[0]);
        for (i = 3; i <= ln.n; i += 3) ctx.lineTo(ln.X[i], ln.Y[i]);
        ctx.lineTo(ln.X[ln.n], ln.Y[ln.n]); ctx.stroke();
        chevron(ctx, ln, ln.len - 1, 8);
        ctx.lineWidth = 1.75; ctx.strokeStyle = rgba(col, 0.95); ctx.stroke();
      }
      st.trackLayer = T;
      // node shadows: baked once, blitted under the live shapes (no per-frame blur)
      function shadowSprite(shape, dy) {
        var pad = 30, sp = makeSprite(h, -R - pad, -R - pad, R + pad, R + pad), c2 = sp.ctx;
        shape(c2); softShadow(c2, 14, dy, 0.1); c2.fillStyle = '#fff'; c2.fill(); noShadow(c2);
        return sp;
      }
      st.bodyShadow = shadowSprite(function (c2) { c2.beginPath(); c2.arc(0, 0, R * 0.93, 0, TAU); }, 4);
      st.intelShadow = shadowSprite(function (c2) {
        c2.beginPath();
        for (var q = 0; q <= 6; q++) { var a = -Math.PI / 2 + q * TAU / 6, rr = R * 0.97; if (q) c2.lineTo(rr * Math.cos(a), rr * Math.sin(a)); else c2.moveTo(rr * Math.cos(a), rr * Math.sin(a)); }
        c2.closePath();
      }, 0); // the offset is applied when drawn, so it stays below the hexagon as it turns
      // static gradients
      st.grad = {};
      st.grad.bodyCore = (function () { var c2 = h.ctx, gg = c2.createLinearGradient(A.x - R * 0.4, A.y - R * 0.4, A.x + R * 0.4, A.y + R * 0.4); gg.addColorStop(0, rgba(amber, 0.95)); gg.addColorStop(1, rgba(orange, 0.95)); return gg; })();
      st.grad.intelCore = (function () { var c2 = h.ctx, gg = c2.createLinearGradient(B.x - R * 0.2, B.y - R * 0.2, B.x + R * 0.2, B.y + R * 0.2); gg.addColorStop(0, rgba(sky, 1)); gg.addColorStop(1, rgba(COL.skyDeep, 1)); return gg; })();
      // tag pills: one sprite per word (shadow, border, dot, ink text)
      st.tags = {};
      var words = SIGNALS.map(function (w, j) { return [w.toUpperCase(), 0, j]; }).concat([['RESPONSE', 1, 0]]);
      words.forEach(function (wd) {
        var text = wd[0], lane = wd[1];
        var col = lane === 0 ? COL.sky : COL.orange, ink = lane === 0 ? COL.skyInk : COL.orangeInk;
        var m = h.ctx; m.font = '500 11px ' + MONO;
        var ls = 1.4, tw = spacedWidth(m, text, ls), pw = Math.round(tw + 26), ph = 24, pad = 14;
        var sp = makeSprite(h, -pw / 2 - pad, -ph / 2 - pad, pw / 2 + pad, ph / 2 + pad), c2 = sp.ctx;
        c2.font = '500 11px ' + MONO;
        roundRect(c2, -pw / 2, -ph / 2, pw, ph, ph / 2);
        softShadow(c2, 10, 3, 0.1); c2.fillStyle = '#fff'; c2.fill(); noShadow(c2);
        c2.lineWidth = 1; c2.strokeStyle = rgba(mix(COL.line, col, 0.22), 1); c2.stroke();
        c2.fillStyle = rgba(col, 1); c2.beginPath(); c2.arc(-pw / 2 + 11, 0, 2.5, 0, TAU); c2.fill();
        c2.fillStyle = rgba(ink, 1); c2.textBaseline = 'middle';
        fillSpaced(c2, text, -pw / 2 + 18, 0.5, ls, 'left');
        st.tags[lane + ':' + text] = { sp: sp, pw: pw, ph: ph };
      });
    },
    still: function (h) {
      var st = h.st;
      st.t = 3.4; st.att = 0.6; st.fx = []; st.timers = []; st.scan = 2;
      // stacked layout centres both tags on one axis, so stagger the two packets there to keep the tags apart
      var f = st.tagInside ? 0.63 : 0.5;
      st.packets = [
        { lane: 0, k: 0, hp: st.lanes[0].len * f + st.Lp * 0.5, arrived: false, born: 0 },
        { lane: 1, k: 4, hp: st.lanes[1].len * f + st.Lp * 0.5, arrived: false, born: 0 }
      ];
    },
    update: function (h, dt) {
      var st = h.st, self = this;
      st.t += dt;
      for (var i = st.timers.length - 1; i >= 0; i--) {
        if (st.t >= st.timers[i].at) { var fn = st.timers[i].fn; st.timers.splice(i, 1); fn(); }
      }
      for (i = st.packets.length - 1; i >= 0; i--) {
        var p = st.packets[i], lane = st.lanes[p.lane];
        p.hp += st.speed * dt;
        if (!p.arrived && p.hp >= lane.len) {
          p.arrived = true;
          if (p.lane === 0) {
            st.fx.push({ who: 0, t0: st.t, dur: 1.8 });
            st.bodyHit = 1;
            (function (k) { st.timers.push({ at: st.t + 0.5, fn: function () { self.emit(h, 1, k); } }); })(p.k);
          } else {
            st.fx.push({ who: 1, t0: st.t, dur: 1.8 });
            st.intelHit = 1; st.scan = 0;
            st.att = Math.min(0.97, st.att + (1 - st.att) * 0.2);
            st.timers.push({ at: st.t + 0.65, fn: function () { st.sig = (st.sig + 1) % SIGNALS.length; self.emit(h, 0, st.sig); } });
          }
        }
        if (p.hp - st.Lp > lane.len) st.packets.splice(i, 1);
      }
      for (i = st.fx.length - 1; i >= 0; i--) if (st.t - st.fx[i].t0 > st.fx[i].dur) st.fx.splice(i, 1);
      st.bodyHit = Math.max(0, st.bodyHit - dt / 1.6);
      st.intelHit = Math.max(0, st.intelHit - dt / 1.6);
      st.scan = Math.min(2, st.scan + dt / 1.1);
    },
    draw: function (h, ctx) {
      var st = h.st, t = st.t, att = st.att, A = st.A, B = st.B, R = st.R;
      var sky = COL.sky, orange = COL.orange, amber = COL.amber;
      // common rhythm: both poles breathe on the same period; the body's phase lag closes as they attune
      var beat = TAU * t / 5.2;
      var bodyBreath = Math.sin(beat - (1 - att) * 1.9);
      var intelBreath = Math.sin(beat);
      if (!st.fieldLayer) this.bake(h);

      // soft field between the lanes (baked at full strength, faded in as the two attune)
      blitLayer(h, ctx, st.fieldLayer, (0.045 + 0.04 * att) / 0.085);
      // lane tracks and arrowheads (baked), then the slow carrier dots
      blitLayer(h, ctx, st.trackLayer);
      var i;
      for (var k = 0; k < 2; k++) {
        var ln = st.lanes[k], col = k === 0 ? sky : orange;
        var gap = 16, off = (t * 16) % gap;
        ctx.fillStyle = rgba(col, 0.75);
        ctx.beginPath();
        for (var s = off; s < ln.len - 18; s += gap) {
          var e = smooth(0, 40, s) * smooth(ln.len - 18, ln.len - 50, s);
          if (e < 0.05) continue;
          var ii = Math.round(s), rr = 1.5 * Math.sqrt(e);
          ctx.moveTo(ln.X[ii] + rr, ln.Y[ii]); ctx.arc(ln.X[ii], ln.Y[ii], rr, 0, TAU);
        }
        ctx.fill();
      }

      // packets
      for (i = 0; i < st.packets.length; i++) this.drawPacket(h, ctx, st.packets[i]);

      // arrival ripples
      for (i = 0; i < st.fx.length; i++) {
        var f = st.fx[i], u = (t - f.t0) / f.dur, P = f.who === 0 ? A : B, c = f.who === 0 ? orange : sky;
        var eu = easeOut(u);
        ctx.lineWidth = 1.25; ctx.strokeStyle = rgba(c, 0.55 * (1 - u) * (1 - u));
        ctx.beginPath(); ctx.arc(P.x, P.y, R * (1.08 + 0.7 * eu), 0, TAU); ctx.stroke();
      }

      this.h = h;
      this.drawBody(ctx, A.x, A.y, R, t, att, bodyBreath, st);
      this.drawIntel(ctx, B.x, B.y, R, t, att, intelBreath, st);

      // tags last so they sit above everything
      for (i = 0; i < st.packets.length; i++) this.drawTag(h, ctx, st.packets[i]);

      // pole names
      ctx.textBaseline = 'alphabetic';
      ctx.font = '600 15px ' + DISP;
      for (i = 0; i < 2; i++) {
        var lb = st.labels[i];
        ctx.fillStyle = rgba(COL.head, 1);
        ctx.textAlign = 'center';
        var tw = ctx.measureText(lb.t).width;
        ctx.fillText(lb.t, lb.x + 7, lb.y);
        ctx.fillStyle = rgba(lb.c, 1);
        ctx.beginPath(); ctx.arc(lb.x + 7 - tw / 2 - 11, lb.y - 5, 3, 0, TAU); ctx.fill();
      }
    },
    drawPacket: function (h, ctx, p) {
      var st = h.st, ln = st.lanes[p.lane], L = ln.len, Lp = st.Lp, hp = p.hp;
      var s0 = Math.max(0, hp - Lp), s1 = Math.min(L, hp);
      if (s1 - s0 < 2) return;
      var col = p.lane === 0 ? COL.sky : COL.orange;
      var col2 = p.lane === 0 ? COL.skyDeep : COL.amber;
      var amp = p.lane === 0 ? SIG_AMP[p.k] : 9;
      var ph = st.t, att = st.att, o = {};
      var pts = [];
      for (var s = s0; s <= s1; s += 1.25) {
        var u = (hp - s) / Lp;
        var env = Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 2);
        var edge = smooth(0, 34, s) * smooth(L, L - 34, s);
        var x = hp - s;
        var v = p.lane === 0 ? sigWave(p.k, x, ph) : respWave(p.k, x, ph, att);
        laneAt(ln, s, o);
        var d = amp * env * edge * v;
        pts.push(o.x + o.nx * d, o.y + o.ny * d);
      }
      if (pts.length < 4) return;
      var tail = laneAt(ln, s0, {}), head = laneAt(ln, s1, {});
      var gr = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      gr.addColorStop(0, rgba(col2, 0)); gr.addColorStop(0.4, rgba(col2, 0.9)); gr.addColorStop(1, rgba(col, 1));
      var gg = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      gg.addColorStop(0, rgba(col, 0)); gg.addColorStop(0.5, rgba(col, 0.12)); gg.addColorStop(1, rgba(col, 0.1));
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.strokeStyle = gg; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = gr; ctx.lineWidth = 1.6; ctx.stroke();
      // leading point
      if (hp < L) {
        var fade = smooth(0, 24, hp) * smooth(L, L - 20, hp);
        glowDot(ctx, head.x, head.y, 10, col, 0.22 * fade);
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(head.x, head.y, 3, 0, TAU); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(col, 1); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },
    drawTag: function (h, ctx, p) {
      var st = h.st, ln = st.lanes[p.lane], L = ln.len;
      var c = clamp(p.hp - st.Lp * 0.5, 0, L);
      var a = st.tagInside ? smooth(L * 0.16, L * 0.32, c) * smooth(L * 0.84, L * 0.68, c)
                           : smooth(L * 0.15, L * 0.27, c) * smooth(L * 0.86, L * 0.74, c);
      if (a < 0.01) return;
      var o = laneAt(ln, c, {});
      var text = (p.lane === 0 ? SIGNALS[p.k] : 'Response').toUpperCase();
      var tag = st.tags[p.lane + ':' + text];
      if (!tag) return;
      var amp = p.lane === 0 ? SIG_AMP[p.k] : 9, pw = tag.pw, ph = tag.ph;
      var x, y;
      if (st.tagInside) {
        // stacked layout: the pill rides level with its own packet, on the inside of the lens,
        // so the word stays tied to its lane (outbound on the right, response on the left)
        var side = o.x < st.ctr.x ? 1 : -1;
        x = o.x + side * (amp + 10 + pw / 2); y = o.y;
      } else { var dd = amp + 9 + ph / 2; x = o.x - o.nx * dd; y = o.y - o.ny * dd; } // inside the lens, between the two lanes
      x = clamp(x, pw / 2 + 4, h.w - pw / 2 - 4);
      blitAt(h, ctx, tag.sp, x, y, a);
    },
    // radial washes, cached per small step of attunement
    wash: function (st, key, x, y, R, c0, c1, a1) {
      var q = Math.round(a1 * 100), id = key + q, c = st.grad[id];
      if (c) return c;
      var g = this.h.ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R * 1.1);
      g.addColorStop(0, rgba(c0, 1)); g.addColorStop(1, rgba(c1, q / 100));
      return (st.grad[id] = g);
    },
    drawBody: function (ctx, x, y, R, t, att, breath, st) {
      var orange = COL.orange, amber = COL.amber, sd = st.seedBlob, hit = st.bodyHit;
      glowDot(ctx, x, y, R * 1.85, amber, 0.12 + 0.05 * att + 0.08 * hit);
      var rings = 4, k, i, N = 120, paths = [];
      for (k = 0; k < rings; k++) {
        var rk = R * (1 - k * 0.2) * (1 + 0.035 * breath * (1 - k * 0.15)) * (1 + 0.04 * hit * (1 - k * 0.25));
        var na = R * lerp(0.085, 0.03, att) * (1 - k * 0.12);
        var pts = [];
        for (i = 0; i <= N; i++) {
          var a = i / N * TAU;
          var n = 0.55 * Math.sin(3 * a + t * 0.33 + sd[0] + k * 0.7) +
                  0.3 * Math.sin(5 * a - t * 0.27 + sd[1] + k * 1.1) +
                  0.15 * Math.sin(2 * a + t * 0.19 + sd[2] - k * 0.4);
          var r = rk + na * n;
          pts.push(x + r * Math.cos(a), y + r * Math.sin(a));
        }
        paths.push(pts);
      }
      function trace(pts) {
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
        for (var j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j], pts[j + 1]);
        ctx.closePath();
      }
      // outer membrane: white body with a soft shadow, then a warm wash
      blitAt(this.h, ctx, st.bodyShadow, x, y);
      trace(paths[0]);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.fillStyle = this.wash(st, 'b', x, y, R, COL.orangeSoft, amber, 0.16 + 0.06 * att); ctx.fill();
      for (k = 0; k < rings; k++) {
        trace(paths[k]);
        if (k === rings - 1) {
          ctx.fillStyle = st.grad.bodyCore; ctx.fill();
        }
        ctx.lineWidth = k === 0 ? 1.6 : 1;
        ctx.strokeStyle = rgba(k === 0 ? orange : mix(orange, amber, 0.4), [1, 0.55, 0.42, 0.9][k] + 0.05 * hit);
        ctx.stroke();
      }
      // highlight on the core
      ctx.fillStyle = 'rgba(255,255,255,' + (0.75 + 0.2 * hit) + ')';
      ctx.beginPath(); ctx.arc(x - R * 0.08, y - R * 0.08, 2.4, 0, TAU); ctx.fill();
    },
    drawIntel: function (ctx, x, y, R, t, att, breath, st) {
      var sky = COL.sky, deep = COL.skyDeep, hit = st.intelHit, i, j;
      glowDot(ctx, x, y, R * 1.85, sky, 0.1 + 0.05 * att + 0.08 * hit);
      var rot = -Math.PI / 2 + t * 0.045, rr = R * (1 + 0.025 * breath);
      var V = [], Vi = [];
      for (i = 0; i < 6; i++) {
        var a = rot + i * TAU / 6;
        V.push([x + rr * Math.cos(a), y + rr * Math.sin(a)]);
        var ai = a + TAU / 12;
        Vi.push([x + rr * 0.52 * Math.cos(ai), y + rr * 0.52 * Math.sin(ai)]);
      }
      function hex(P) {
        ctx.beginPath();
        for (var q = 0; q <= 6; q++) { var m = q % 6; if (q) ctx.lineTo(P[m][0], P[m][1]); else ctx.moveTo(P[m][0], P[m][1]); }
        ctx.closePath();
      }
      // face: white with soft shadow, then a cool wash
      var sh = st.intelShadow;
      ctx.save(); ctx.translate(x, y + 4 / this.h.dpr); ctx.rotate(rot + Math.PI / 2);
      ctx.drawImage(sh.c, sh.ox, sh.oy, sh.w, sh.h);
      ctx.restore();
      hex(V);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.fillStyle = this.wash(st, 'i', x, y, R, COL.skySoft, sky, 0.14 + 0.06 * att); ctx.fill();
      // learned structure: chords appear as the two become attuned
      var nCh = Math.round(clamp((att - 0.1) / 0.8, 0, 1) * 6);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(sky, 0.38);
      ctx.beginPath();
      for (i = 0; i < nCh; i++) { var p0 = V[i], p1 = V[(i + 2) % 6]; ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
      ctx.stroke();
      // spokes
      ctx.strokeStyle = rgba(sky, 0.42);
      ctx.beginPath();
      for (i = 0; i < 6; i++) { ctx.moveTo(x, y); ctx.lineTo(V[i][0], V[i][1]); }
      ctx.stroke();
      // inner hexagon
      hex(Vi); ctx.strokeStyle = rgba(deep, 0.6); ctx.stroke();
      // outer hexagon
      hex(V); ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(deep, 1); ctx.stroke();
      // vertices: a scan passes around after each response is measured
      for (i = 0; i < 6; i++) {
        var sc = st.scan <= 1.2 ? Math.max(0, 1 - Math.abs(st.scan * 6 / 1.2 - i - 0.5) / 1.2) : 0;
        if (sc > 0.02) glowDot(ctx, V[i][0], V[i][1], 10, sky, 0.35 * sc);
        ctx.beginPath(); ctx.arc(V[i][0], V[i][1], 2.6 + 0.9 * sc, 0, TAU);
        ctx.fillStyle = rgba(mix(COL.white, sky, sc), 1); ctx.fill();
        ctx.lineWidth = 1.25; ctx.strokeStyle = rgba(deep, 1); ctx.stroke();
      }
      // core
      var core = st.grad.intelCore;
      var cr = R * 0.17 * (1 + 0.15 * hit);
      ctx.fillStyle = core;
      ctx.beginPath();
      for (i = 0; i <= 6; i++) { var ca = rot + i * TAU / 6; if (i) ctx.lineTo(x + cr * Math.cos(ca), y + cr * Math.sin(ca)); else ctx.moveTo(x + cr * Math.cos(ca), y + cr * Math.sin(ca)); }
      ctx.closePath(); ctx.fill();
    }
  };

  /* =====================================================================
     B. PATH: home at the center, two rooms, then the wider settings
     ===================================================================== */
  var PATH_NODES = [
    { t: 'Bedroom', ring: 1, ang: 180 },
    { t: 'Bathroom', ring: 1, ang: 0 },
    { t: 'Wearables', ring: 2, ang: -128 },
    { t: 'Clinics', ring: 2, ang: -52 },
    { t: 'Hospitals', ring: 2, ang: 52 },
    { t: 'Wellness centers', short: 'Wellness', ring: 2, ang: 128 }
  ];
  var PERIOD = 7.4;
  /* emphasis per group (0 the home, 1 the two rooms, 2 the wider settings) for each stage of the text */
  var STAGE_EM = [[1, 0.5, 0.35], [0.7, 1, 0.35], [0.6, 0.6, 1]];
  var STAGE_INK = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  var EM_DUR = 0.4; // --dur-3

  function inBoxes(boxes, x, y) {
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (x > b[0] && x < b[2] && y > b[1] && y < b[3]) return true;
    }
    return false;
  }
  function maskedCircle(ctx, cx, cy, r, boxes) {
    var step = Math.max(0.003, 1.5 / r), on = false, a, x, y;
    ctx.beginPath();
    for (a = 0; a <= TAU + step; a += step) {
      x = cx + r * Math.cos(a); y = cy + r * Math.sin(a);
      if (inBoxes(boxes, x, y)) { on = false; continue; }
      if (on) ctx.lineTo(x, y); else { ctx.moveTo(x, y); on = true; }
    }
  }
  function maskedSegment(ctx, x0, y0, x1, y1, boxes) {
    var L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(L / 1.5)), on = false;
    for (var i = 0; i <= n; i++) {
      var x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n);
      if (inBoxes(boxes, x, y)) { on = false; continue; }
      if (on) ctx.lineTo(x, y); else { ctx.moveTo(x, y); on = true; }
    }
  }

  var Path = {
    init: function (h) {
      var st = h.st;
      st.t = 0.2; st.lit = PATH_NODES.map(function () { return 0; }); st.ringLit = [0, 0, 0]; st.home = 0.4;
      st.returns = []; st.cycle = -1; st.fired = {};
      st.stage = st.stage || 0; st.emT = 1;
      st.em = STAGE_EM[st.stage].slice(); st.ink = STAGE_INK[st.stage].slice();
    },
    // the reader moved to another stage of the text: ease the emphasis over and send one soft pulse
    setStage: function (h, k) {
      var st = h.st;
      if (k === st.stage) return;
      st.stage = k;
      st.emFrom = st.em.slice(); st.inkFrom = st.ink.slice(); st.emT = 0;
      if (reduced() || locked() || doc.hidden || !h.visible || !h.w) {
        st.em = STAGE_EM[k].slice(); st.ink = STAGE_INK[k].slice(); st.emT = 1;
        if (reduced() && st.nodes) this.still(h);
        h.render();
        return;
      }
      if (k === 0) st.home = 1;
      for (var i = 0; i < st.nodes.length; i++) if (st.nodes[i].ring === k) st.lit[i] = 1;
      if (k) st.ringLit[k] = 1;
      kick();
    },
    // emphasis of the figure at a distance r from the centre
    zoneEm: function (st, r) {
      var e = st.em;
      return r <= st.r1 ? lerp(e[0], e[1], smooth(st.rh, st.r1, r)) : lerp(e[1], e[2], smooth(st.r1, st.r2, r));
    },
    layout: function (h) {
      var st = h.st, W = h.w, H = h.h, S = Math.min(W, H), cx = W / 2, cy = H / 2;
      st.cx = cx; st.cy = cy; st.S = S;
      st.fs = S < 430 ? 11 : 12;
      // narrow figures: the outer labels sit at the corners, reading outward, a little tighter
      st.narrow = S < 480;
      st.ls = st.fs * (st.narrow ? 0.08 : 0.12);
      st.lh = st.fs + 4;
      st.rh = clamp(S * 0.11, 42, 54);
      st.r1 = S * 0.245;
      st.r2 = S * 0.385;
      st.rEdge = S * 0.5 - 4;
      var ctx = h.ctx, pad = 4;
      st.homeFs = S < 400 ? 14 : 16;
      ctx.font = '600 ' + st.homeFs + 'px ' + DISP;
      while (st.homeFs > 12 && ctx.measureText('The Home').width > st.rh * 1.62) { st.homeFs--; ctx.font = '600 ' + st.homeFs + 'px ' + DISP; }
      ctx.font = '500 ' + st.fs + 'px ' + MONO;
      st.boxes = [];
      st.nodes = PATH_NODES.map(function (nd) {
        var r = nd.ring === 1 ? st.r1 : st.r2, a = nd.ang * Math.PI / 180;
        var x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        var lines = [nd.t.toUpperCase()];
        var tw = spacedWidth(ctx, lines[0], st.ls);
        var nr = nd.ring === 1 ? 6 : 5;
        var lx, ly, box, align = 'center', bh;
        if (st.narrow && nd.ring === 2) {
          // corner label: anchored on the diagonal 10px past the node, clear of the tick band,
          // left-aligned on the right side and right-aligned on the left side
          var right = Math.cos(a) > 0, up = Math.sin(a) < 0;
          var ax = x + Math.cos(a) * (nr + 10), ay = y + Math.sin(a) * (nr + 10);
          var avail = right ? W - pad - ax : ax - pad;
          if (tw > avail && lines[0].indexOf(' ') > 0) {
            lines = lines[0].split(' ');
            tw = Math.max(spacedWidth(ctx, lines[0], st.ls), spacedWidth(ctx, lines[1], st.ls));
          }
          bh = st.lh * (lines.length - 1);
          var x0 = clamp(right ? ax : ax - tw, pad, W - pad - tw);
          align = right ? 'left' : 'right';
          lx = right ? x0 : x0 + tw;
          // ly = baseline of the first line; upper labels rest on the anchor, lower ones hang from it
          ly = up ? ay - bh - st.fs * 0.22 : ay + st.fs * 0.78;
          box = [x0 - 5, ly - st.fs * 0.78 - 4, x0 + tw + 5, ly + bh + st.fs * 0.22 + 4];
        } else {
          // on narrow figures, wrap a long label onto two lines instead of shrinking it
          if (tw > S * 0.34 && lines[0].indexOf(' ') > 0) {
            lines = lines[0].split(' ');
            tw = Math.max(spacedWidth(ctx, lines[0], st.ls), spacedWidth(ctx, lines[1], st.ls));
          }
          var below = nd.ring === 1 || Math.sin(a) > 0;
          var gapY = nr + 13;
          bh = st.lh * (lines.length - 1);
          ly = below ? y + gapY + st.fs * 0.72 : y - gapY - bh;
          lx = clamp(x, tw / 2 + pad, W - tw / 2 - pad);
          box = [lx - tw / 2 - 7, ly - st.fs * 0.78 - 5, lx + tw / 2 + 7, ly + bh + st.fs * 0.22 + 5];
        }
        st.boxes.push(box);
        return { x: x, y: y, r: r, a: a, nr: nr, ring: nd.ring, lines: lines, lx: lx, ly: ly, align: align };
      });
      // keep line work out from under the home label too
      st.homeBox = [cx - st.rh, cy - st.rh, cx + st.rh, cy + st.rh];
    },
    still: function (h) {
      var st = h.st;
      // a still frame of the stage being read: its group lit, the rest at rest
      var k = st.stage || 0;
      st.t = 2.15; st.returns = [];
      st.lit = PATH_NODES.map(function (nd) { return nd.ring === k ? 0.85 : 0.3; });
      st.ringLit = [0.5, k === 1 ? 0.7 : 0.2, k === 2 ? 0.6 : 0.2]; st.home = k === 0 ? 0.8 : 0.4;
      st.em = STAGE_EM[k].slice(); st.ink = STAGE_INK[k].slice(); st.emT = 1;
      st.stillFront = true;
    },
    front: function (st, tc) {
      // wavefront radius as a function of time in cycle
      var u = clamp((tc - 0.5) / 3.6, 0, 1);
      var e = 0.55 * u + 0.45 * easeInOut(u);
      return st.rh + e * (st.rEdge - st.rh);
    },
    // colour by distance from the home: warm at the centre, sky further out
    // (passes through a pale tone instead of a muddy orange/sky mix)
    tint: function (st, r) {
      var u = smooth(st.r1 + 6, st.r1 + (st.r2 - st.r1) * 0.55, r);
      return u < 0.5 ? mix(COL.orange, COL.white, u * 1.2) : mix(COL.sky, COL.white, (1 - u) * 1.2);
    },
    update: function (h, dt) {
      var st = h.st;
      st.stillFront = false;
      st.t += dt;
      if (st.emT < 1) {
        st.emT = Math.min(1, st.emT + dt / EM_DUR);
        var ee = easeInOut(st.emT), tgE = STAGE_EM[st.stage], tgI = STAGE_INK[st.stage];
        for (var g = 0; g < 3; g++) { st.em[g] = lerp(st.emFrom[g], tgE[g], ee); st.ink[g] = lerp(st.inkFrom[g], tgI[g], ee); }
      }
      var cyc = Math.floor(st.t / PERIOD), tc = st.t - cyc * PERIOD;
      if (cyc !== st.cycle) { st.cycle = cyc; st.fired = {}; st.home = 1; }
      var rho = this.front(st, tc);
      for (var i = 0; i < st.nodes.length; i++) {
        var n = st.nodes[i];
        if (!st.fired[i] && rho >= n.r) {
          st.fired[i] = true; st.lit[i] = 1; st.ringLit[n.ring] = 1;
          if (n.ring === 2) st.returns.push({ i: i, t0: st.t + 0.9 + i * 0.12, dur: 2.0 });
        }
        st.lit[i] = Math.max(0.0, st.lit[i] - dt / 3.4);
      }
      for (i = 0; i < 3; i++) st.ringLit[i] = Math.max(0, st.ringLit[i] - dt / 1.6);
      st.home = Math.max(0, st.home - dt / 2.2);
      for (i = st.returns.length - 1; i >= 0; i--) {
        var r = st.returns[i];
        if (st.t > r.t0 + r.dur) { st.returns.splice(i, 1); st.home = Math.max(st.home, 0.75); }
      }
    },
    nodeCol: function (n) { return n.ring === 1 ? mix(COL.orange, COL.amber, 0.25) : COL.sky; },
    // static parts are baked once per layout: base (ground, rings, ticks, spokes) and top (discs, home, labels)
    bake: function (h) {
      var st = h.st, cx = st.cx, cy = st.cy, sky = COL.sky, orange = COL.orange, i, n, ctx;
      var boxes = st.boxes, self = this;
      // each group is baked on its own layer so the stage being read can be brought forward:
      // the wider settings (full size), the two rooms and the home (cropped around the centre)
      var rr = st.r1 + 26;
      var baseOuter = makeLayer(h), baseRooms = makeSprite(h, cx - rr, cy - rr, cx + rr, cy + rr);
      ctx = baseOuter.ctx;
      var g0 = ctx.createRadialGradient(cx, cy, st.rh, cx, cy, st.r2 + 14);
      g0.addColorStop(0, rgba(sky, 0.02)); g0.addColorStop(0.75, rgba(sky, 0.055)); g0.addColorStop(1, rgba(sky, 0.0));
      ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(cx, cy, st.r2 + 14, 0, TAU); ctx.fill();
      maskedCircle(ctx, cx, cy, st.r2, boxes);
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(COL.line2, 1); ctx.stroke();
      ctx.strokeStyle = rgba(COL.line2, 0.8); ctx.lineWidth = 1; ctx.beginPath();
      for (i = 0; i < 120; i++) {
        var ta = i / 120 * TAU, r0 = st.r2 + 7, r1t = st.r2 + (i % 5 === 0 ? 12 : 10);
        var tx0 = cx + r0 * Math.cos(ta), ty0 = cy + r0 * Math.sin(ta), tx1 = cx + r1t * Math.cos(ta), ty1 = cy + r1t * Math.sin(ta);
        if (inBoxes(boxes, tx0, ty0) || inBoxes(boxes, tx1, ty1)) continue;
        ctx.moveTo(tx0, ty0); ctx.lineTo(tx1, ty1);
      }
      ctx.stroke();
      ctx = baseRooms.ctx;
      var g1 = ctx.createRadialGradient(cx, cy, st.rh * 0.8, cx, cy, st.r1 + 8);
      g1.addColorStop(0, rgba(COL.amber, 0.1)); g1.addColorStop(0.85, rgba(COL.amber, 0.05)); g1.addColorStop(1, rgba(COL.amber, 0));
      ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(cx, cy, st.r1 + 8, 0, TAU); ctx.fill();
      maskedCircle(ctx, cx, cy, st.r1, boxes);
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(COL.line2, 1); ctx.stroke();
      [baseRooms.ctx, baseOuter.ctx].forEach(function (c2) { c2.setLineDash([2, 4]); c2.lineWidth = 1; c2.strokeStyle = rgba(COL.muted, 0.5); });
      for (i = 0; i < st.nodes.length; i++) {
        n = st.nodes[i];
        ctx = n.ring === 1 ? baseRooms.ctx : baseOuter.ctx;
        ctx.beginPath();
        maskedSegment(ctx, cx + Math.cos(n.a) * (st.rh + 6), cy + Math.sin(n.a) * (st.rh + 6),
          n.x - Math.cos(n.a) * (n.nr + 5), n.y - Math.sin(n.a) * (n.nr + 5), boxes);
        ctx.stroke();
      }
      baseRooms.ctx.setLineDash([]); baseOuter.ctx.setLineDash([]);
      st.baseOuter = baseOuter; st.baseRooms = baseRooms;

      var topOuter = makeLayer(h), topRooms = makeSprite(h, cx - rr, cy - rr, cx + rr, cy + rr);
      for (i = 0; i < st.nodes.length; i++) {
        n = st.nodes[i];
        ctx = n.ring === 1 ? topRooms.ctx : topOuter.ctx;
        var nc = self.nodeCol(n);
        if (n.ring === 1) {
          ctx.beginPath(); ctx.arc(n.x, n.y, n.nr + 5, 0, TAU);
          ctx.lineWidth = 1; ctx.strokeStyle = rgba(nc, 0.3); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, n.nr, 0, TAU);
        softShadow(ctx, 6, 1.5, 0.12);
        ctx.fillStyle = rgba(mix(COL.white, nc, 0.12), 1); ctx.fill();
        noShadow(ctx);
        ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(nc, 1); ctx.stroke();
      }
      st.topOuter = topOuter; st.topRooms = topRooms;
      var hr = st.rh + 34, home = makeSprite(h, cx - hr, cy - hr, cx + hr, cy + hr); ctx = home.ctx;
      ctx.beginPath(); ctx.arc(cx, cy, st.rh, 0, TAU);
      softShadow(ctx, 18, 6, 0.12);
      ctx.fillStyle = '#fff'; ctx.fill();
      noShadow(ctx);
      var hg = ctx.createRadialGradient(cx, cy - st.rh * 0.4, st.rh * 0.1, cx, cy, st.rh);
      hg.addColorStop(0, rgba(COL.orangeSoft, 1)); hg.addColorStop(1, rgba(COL.amber, 0.24));
      ctx.fillStyle = hg; ctx.fill();
      var hs = ctx.createLinearGradient(cx - st.rh, cy - st.rh, cx + st.rh, cy + st.rh);
      hs.addColorStop(0, rgba(COL.amber, 1)); hs.addColorStop(1, rgba(orange, 1));
      ctx.lineWidth = 2; ctx.strokeStyle = hs; ctx.stroke();
      var rw = st.rh * 0.26, ry = cy - st.homeFs * 0.95;
      ctx.beginPath(); ctx.moveTo(cx - rw, ry + rw * 0.55); ctx.lineTo(cx, ry - rw * 0.15); ctx.lineTo(cx + rw, ry + rw * 0.55);
      ctx.lineWidth = 1.75; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(orange, 1); ctx.stroke();
      ctx.font = '600 ' + st.homeFs + 'px ' + DISP; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(COL.head, 1);
      ctx.fillText('The Home', cx, cy + st.homeFs * 0.42);
      st.homeLayer = home;

      // each label baked twice, slate and ink; lit labels cross-fade by alpha, never by channel mixing
      st.labelSprites = st.nodes.map(function (nd, k) {
        var b = boxes[k], out = [];
        [COL.muted, nd.ring === 1 ? COL.orangeInk : COL.skyInk].forEach(function (col) {
          var sp = makeSprite(h, b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2), c2 = sp.ctx;
          c2.font = '500 ' + st.fs + 'px ' + MONO; c2.textBaseline = 'alphabetic';
          c2.fillStyle = rgba(col, 1);
          for (var li = 0; li < nd.lines.length; li++) fillSpaced(c2, nd.lines[li], nd.lx, nd.ly + li * st.lh, st.ls, nd.align);
          out.push(sp);
        });
        return out;
      });
    },
    draw: function (h, ctx) {
      var st = h.st, cx = st.cx, cy = st.cy, orange = COL.orange, i, n;
      if (!st.baseOuter) this.bake(h);
      var em = st.em;
      var tc = st.stillFront ? 2.15 : st.t - Math.floor(st.t / PERIOD) * PERIOD;
      var rho = this.front(st, tc);

      blitLayer(h, ctx, st.baseOuter, em[2]);
      blitLayer(h, ctx, st.baseRooms, em[1]);

      // trailing band of the propagating pulse (quieter where the figure is held back)
      var fa = smooth(st.rh, st.rh + 20, rho) * (1 - smooth(st.r2 + 6, st.rEdge, rho)) * this.zoneEm(st, rho);
      var fc = this.tint(st, rho);
      if (fa > 0.01) {
        var inner = Math.max(st.rh, rho - st.S * 0.12);
        var g = ctx.createRadialGradient(cx, cy, inner, cx, cy, rho);
        g.addColorStop(0, rgba(fc, 0)); g.addColorStop(1, rgba(fc, 0.1 * fa));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rho, 0, TAU); ctx.arc(cx, cy, inner, 0, TAU, true); ctx.fill();
      }

      // lit rings
      var rings = [st.r1, st.r2];
      for (i = 0; i < 2; i++) {
        var rl = st.ringLit[i + 1] * em[i + 1];
        if (rl > 0.01) {
          maskedCircle(ctx, cx, cy, rings[i], st.boxes);
          ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(this.tint(st, rings[i]), 0.7 * rl); ctx.stroke();
        }
      }

      // pulse segments travelling out along the spokes
      if (fa > 0.01) {
        ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (i = 0; i < st.nodes.length; i++) {
          n = st.nodes[i];
          var d0 = st.rh + 6, d1 = n.r - n.nr - 5;
          if (rho > d0 && rho < d1 + 30) {
            var hd = Math.min(rho, d1), tl = Math.max(d0, rho - 46);
            if (hd > tl) {
              var gx0 = cx + Math.cos(n.a) * tl, gy0 = cy + Math.sin(n.a) * tl, gx1 = cx + Math.cos(n.a) * hd, gy1 = cy + Math.sin(n.a) * hd;
              var sg = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
              sg.addColorStop(0, rgba(fc, 0)); sg.addColorStop(1, rgba(fc, 0.95 * (1 - smooth(d1, d1 + 30, rho)) * this.zoneEm(st, hd)));
              ctx.strokeStyle = sg;
              ctx.beginPath(); ctx.moveTo(gx0, gy0); ctx.lineTo(gx1, gy1); ctx.stroke();
            }
          }
        }
        // the wavefront itself
        maskedCircle(ctx, cx, cy, rho, st.boxes.concat([st.homeBox]));
        ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(fc, 0.7 * fa); ctx.stroke();
      }

      // results travelling back to the home (the loop closes)
      for (i = 0; i < st.returns.length; i++) {
        var rt = st.returns[i], u = (st.t - rt.t0) / rt.dur;
        if (u < 0 || u > 1) continue;
        n = st.nodes[rt.i];
        var e = easeInOut(u), dist = lerp(n.r - n.nr - 6, st.rh + 6, e);
        var px = cx + Math.cos(n.a) * dist, py = cy + Math.sin(n.a) * dist;
        var ra = Math.sin(Math.PI * u) * this.zoneEm(st, dist), rc = this.tint(st, dist);
        glowDot(ctx, px, py, 9, rc, 0.22 * ra);
        ctx.globalAlpha = ra;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 2.6, 0, TAU); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(rc, 1); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // glows sit under the baked discs
      for (i = 0; i < st.nodes.length; i++) {
        n = st.nodes[i];
        if (st.lit[i] > 0.01) glowDot(ctx, n.x, n.y, n.nr + 16, this.nodeCol(n), 0.24 * st.lit[i] * em[n.ring]);
      }
      var hm = st.home;
      glowDot(ctx, cx, cy, st.rh * 1.75, orange, (0.1 + 0.12 * hm) * em[0]);
      if (hm > 0.01) {
        ctx.beginPath(); ctx.arc(cx, cy, st.rh + 7 + 8 * easeOut(1 - hm), 0, TAU);
        ctx.lineWidth = 1.25; ctx.strokeStyle = rgba(orange, 0.45 * hm * em[0]); ctx.stroke();
      }

      blitLayer(h, ctx, st.topOuter, em[2]);
      blitLayer(h, ctx, st.topRooms, em[1]);
      blitLayer(h, ctx, st.homeLayer, em[0]);

      // lit discs and labels
      for (i = 0; i < st.nodes.length; i++) {
        n = st.nodes[i];
        var lit = st.lit[i], nc = this.nodeCol(n), ge = em[n.ring];
        ctx.globalAlpha = ge;
        if (lit > 0.01) {
          if (n.ring === 1) {
            ctx.beginPath(); ctx.arc(n.x, n.y, n.nr + 5, 0, TAU);
            ctx.lineWidth = 1; ctx.strokeStyle = rgba(nc, 0.35 * lit); ctx.stroke();
          }
          ctx.beginPath(); ctx.arc(n.x, n.y, n.nr, 0, TAU);
          ctx.fillStyle = rgba(mix(COL.white, nc, 0.12 + 0.88 * lit), 1); ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(nc, 1); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // the active stage's labels hold their ink colour; the rest light up as the pulse passes
        // (held-back labels keep a readable floor)
        var k = Math.max(smooth(0.22, 0.68, lit), st.ink[n.ring]), sp = st.labelSprites[i], la = 0.3 + 0.7 * ge;
        if (k < 0.995) blitLayer(h, ctx, sp[0], (1 - k) * la);
        if (k > 0.005) blitLayer(h, ctx, sp[1], k * la);
      }
    }
  };

  /* ---------- the path follows the three stages of the text beside (or below) it ---------- */
  function bindStages(h) {
    var wrap = h.mount.closest ? h.mount.closest('.path') : null;
    var items = wrap ? wrap.querySelectorAll('.stages li') : [];
    if (items.length < 2) return;
    wrap.classList.add('cpw-staged');
    // phones and portrait tablets pin the figure under the nav (see conversation-path.css), so the
    // reading line sits below the pinned figure instead of in the middle of the screen
    var pinMq = window.matchMedia ? window.matchMedia('(max-width: 960px) and (min-height: 600px)') : null;
    var near = true, queued = 0, cur = -1;
    function measure() {
      queued = 0;
      var vh = window.innerHeight || root.clientHeight, line = vh * 0.42;
      if (pinMq && pinMq.matches) {
        var fb = h.mount.getBoundingClientRect().bottom;
        line = Math.min(vh * 0.85, Math.max(line, fb + Math.max(40, (vh - fb) * 0.3)));
      }
      var k = 0;
      for (var i = 1; i < items.length && i < 3; i++) if (items[i].getBoundingClientRect().top <= line) k = i;
      if (k !== cur) {
        cur = k;
        for (i = 0; i < items.length; i++) items[i].classList.toggle('is-active', i === k);
      }
      Path.setStage(h, k);
    }
    function queue() { if (near && !queued) queued = requestAnimationFrame(measure); }
    if ('IntersectionObserver' in window) {
      near = false;
      new IntersectionObserver(function (es) {
        near = es[es.length - 1].isIntersecting;
        if (near) queue();
      }, { rootMargin: '25% 0px' }).observe(wrap);
    }
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    measure();
  }

  /* ---------- boot ---------- */
  function setup() {
    readColors();
    var found = [];
    Array.prototype.forEach.call(doc.querySelectorAll('[data-widget="conversation"]'), function (m) { found.push([m, Conversation]); });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-widget="path"]'), function (m) { found.push([m, Path]); });
    found.forEach(function (f) {
      if (f[0].__cpw) return;
      var h = new Host(f[0], f[1]); f[0].__cpw = h;
      f[0].classList.add(f[1] === Conversation ? 'cpw-conv' : 'cpw-path');
      widgets.push(h);
      if (f[1] === Path) bindStages(h);
    });
    if (!widgets.length) return;

    widgets.forEach(function (h) { h.resize(true); h.render(); });

    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function (entries) {
        entries.forEach(function (e) {
          var hst = e.target.__cpwHost;
          if (hst && hst.resize()) hst.render();
        });
      });
      widgets.forEach(function (h) { h.stage.__cpwHost = h; ro.observe(h.stage); });
    } else {
      window.addEventListener('resize', function () { renderAll(false); });
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var hst = e.target.__cpw;
          if (!hst) return;
          var was = hst.visible;
          hst.visible = e.isIntersecting;
          if (!was && hst.visible && hst.leftAt && performance.now() - hst.leftAt > 20000 && hst.impl.reset && !reduced()) {
            hst.impl.reset(hst); hst.render();
          }
          if (was && !hst.visible) hst.leftAt = performance.now();
        });
        kick();
      }, { rootMargin: '60px 0px' });
      widgets.forEach(function (h) { io.observe(h.mount); });
    } else {
      widgets.forEach(function (h) { h.visible = true; });
    }

    doc.addEventListener('visibilitychange', kick);
    doc.addEventListener('site:unlocked', function () { renderAll(true); kick(); });
    if ('MutationObserver' in window) {
      new MutationObserver(function () { if (!locked()) { kick(); } }).observe(root, { attributes: true, attributeFilter: ['class'] });
    }
    if (mq) {
      var onMq = function () {
        widgets.forEach(function (h) { if (reduced()) h.impl.still(h); h.render(); });
        kick();
      };
      if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    }
    if (doc.fonts && doc.fonts.load) {
      Promise.all([
        doc.fonts.load('500 12px "JetBrains Mono"'),
        doc.fonts.load('600 15px "Space Grotesk"')
      ]).then(function () { renderAll(true); }, function () {});
      if (doc.fonts.ready) doc.fonts.ready.then(function () { renderAll(true); }, function () {});
    }
    kick();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', setup);
  else setup();
})();

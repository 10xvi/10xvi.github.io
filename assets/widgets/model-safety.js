/* 10X Vital Intelligence: "A Vital World Model" + "How It Stays Safe" widgets.
   Plain script, no dependencies. Renders into [data-widget="world-model"] and [data-widget="safety"]. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var forcedMQ = window.matchMedia ? window.matchMedia('(forced-colors: active)') : null;
  /* site.css swaps --line, --line-2, --muted and --text for stronger values in this mode */
  var contrastMQ = window.matchMedia ? window.matchMedia('(prefers-contrast: more)') : null;
  var FC = false; /* forced colors: the canvas draws in system colours only, no glows or tints */
  var TAU = Math.PI * 2;
  var widgets = [];
  var rafId = 0;
  var lastT = 0;

  function reduced() { return !!(reduceMQ && reduceMQ.matches); }
  function locked() { return root.classList.contains('gate-locked'); }
  /* the site-wide "Pause animations" control (WCAG 2.2.2): html.motion-paused + "site:motion" */
  function paused() { return root.classList.contains('motion-paused'); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function smooth01(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

  /* ---------- first-view entrance (the shared one): the figure eases in over about 600 ms, once,
     when it first scrolls into view. Nothing under reduced motion or pause; pausing or switching to
     reduced motion part-way completes it at once, and it never replays. ---------- */
  var ENT_MS = 600; /* wall-clock time, so slow frames do not stretch it */
  function armIntro(w, node) {
    w.intro = -1; /* -1: armed, waiting to come into view; then the start time */
    w.introNode = reduced() || paused() ? null : node;
    if (w.introNode) w.introNode.style.opacity = '0';
  }
  function endIntro(w) {
    if (!w.introNode) return;
    w.introNode.style.opacity = '';
    w.introNode = null;
  }
  function stepIntro(w, now) {
    if (!w.introNode) return;
    if (w.intro < 0) {
      /* the IntersectionObserver wakes the loop 80px early; the entrance waits for the real view */
      var r = w.mount.getBoundingClientRect(), vh = window.innerHeight || root.clientHeight;
      if (r.top > vh - Math.min(96, r.height * 0.25) || r.bottom < 64) return;
      w.intro = now;
    }
    var k = (now - w.intro) / ENT_MS;
    if (k >= 1) endIntro(w);
    else w.introNode.style.opacity = smooth01(k).toFixed(3);
  }

  /* ---------- palette, read from the page's CSS variables ---------- */
  function hexRgb(str, fb) {
    str = (str || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
    if (!m) {
      var r = /rgba?\(([^)]+)\)/i.exec(str);
      if (r) { var q = r[1].split(',').map(parseFloat); if (q.length >= 3) return [q[0], q[1], q[2]]; }
      return fb;
    }
    var hx = m[1];
    if (hx.length === 3) hx = hx[0] + hx[0] + hx[1] + hx[1] + hx[2] + hx[2];
    return [parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16)];
  }
  function mix(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
  var COL = {};
  /* a system colour's actual value in the active forced-colors theme */
  function sysRgb(name, fb) {
    var pr = document.createElement('span');
    pr.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;color:' + name;
    (document.body || root).appendChild(pr);
    var c = hexRgb(getComputedStyle(pr).color, fb);
    pr.parentNode.removeChild(pr);
    return c;
  }
  function readColors() {
    FC = !!(forcedMQ && forcedMQ.matches);
    if (FC) {
      /* text and structure in CanvasText on Canvas, the shared model and its updates in Highlight;
         the four signals keep their own waveforms, which is what tells them apart */
      var cv = sysRgb('Canvas', [0, 0, 0]), ct = sysRgb('CanvasText', [255, 255, 255]);
      var hl = sysRgb('Highlight', [26, 235, 255]), gt = sysRgb('GrayText', [128, 128, 128]);
      COL.bg = cv; COL.bgAlt = cv; COL.line = gt; COL.line2 = gt; COL.head = ct; COL.muted = ct;
      COL.orange = ct; COL.amber = ct; COL.sky = hl; COL.skyDeep = hl; COL.red = ct;
      for (var f = 0; f < KINDS.length; f++) KINDS[f].rgb = ct;
      return;
    }
    var cs = window.getComputedStyle ? getComputedStyle(root) : null;
    function v(n, fb) { return cs ? hexRgb(cs.getPropertyValue(n), fb) : fb; }
    COL.bg = v('--bg', [255, 255, 255]);
    COL.bgAlt = v('--bg-alt', [248, 250, 252]);
    COL.line = v('--line', [226, 232, 240]);
    COL.line2 = v('--line-2', [203, 213, 225]);
    COL.head = v('--head', [15, 23, 42]);
    COL.muted = v('--muted', [100, 116, 139]);
    COL.orange = v('--orange', [249, 115, 22]);
    COL.amber = v('--amber', [245, 158, 11]);
    COL.sky = v('--sky', [14, 165, 233]);
    COL.skyDeep = v('--sky-deep', [2, 132, 199]);
    COL.red = v('--red', [239, 68, 68]);
    /* body signals stay warm, but each pair is a visible step apart:
       heart = orange, breathing = amber, sleep = deep orange, temperature = pale orange */
    KINDS[0].rgb = COL.orange;
    KINDS[1].rgb = COL.amber;
    KINDS[2].rgb = mix(COL.orange, v('--orange-ink', [194, 65, 12]), 0.8);
    KINDS[3].rgb = mix(COL.orange, [255, 255, 255], 0.22);
  }

  /* ---------- shared signal kinds (from the page copy) ----------
     Orange always means "body signal"; the waveform carries the type. The legend glyph and the
     packets on the spokes are drawn from the same samples, at the same length-to-height ratio. */
  var KINDS = [
    { name: 'Heart rhythm', rgb: [249, 115, 22], a: 1 },
    { name: 'Breathing',    rgb: [245, 158, 11], a: 1 },
    { name: 'Sleep',        rgb: [207, 78, 15],  a: 1 },
    { name: 'Temperature',  rgb: [250, 147, 79], a: 0.7 }
  ];
  function gauss(x, m, s) { var d = (x - m) / s; return Math.exp(-0.5 * d * d); }
  function tri(x, c, hw) { var d = Math.abs(x - c) / hw; return d < 1 ? 1 - d : 0; }
  /* wave(kind, u) with u in [0,1] along a packet; displacement, roughly [-1, 1] */
  function wave(k, u) {
    if (k === 0) { /* heart rhythm: a flat line, a small P, the sharp QRS spike, then T */
      return 0.16 * gauss(u, 0.2, 0.045) - 0.14 * tri(u, 0.43, 0.03) + 1.0 * tri(u, 0.485, 0.045) -
        0.42 * tri(u, 0.55, 0.035) + 0.26 * gauss(u, 0.75, 0.055);
    }
    if (k === 1) return 0.78 * Math.sin(TAU * u);                       /* breathing: one wide, slow breath */
    if (k === 2) return (u < 0.24 || u >= 0.62) ? 0.62 : -0.62;          /* sleep: slow square steps */
    return 0.08 * (u - 0.5) + 0.72 * gauss(u, 0.56, 0.12) - 0.18;       /* temperature: near flat, one bump */
  }
  /* each kind's samples, centred on its own mid-line; the hard edges of the spike and the
     steps are sampled exactly so they stay crisp at any size */
  var WAVES = (function () {
    var out = [], extra = [[0.4, 0.43, 0.46, 0.485, 0.51, 0.53, 0.55, 0.585], [], [0.24, 0.62], []];
    for (var k = 0; k < 4; k++) {
      var us = [], j;
      for (j = 0; j <= 28; j++) us.push(j / 28);
      us = us.concat(extra[k]).sort(function (a, b) { return a - b; });
      var u = [], y = [], lo = 1e9, hi = -1e9;
      for (j = 0; j < us.length; j++) {
        if (j && us[j] - us[j - 1] < 1e-4) continue;
        if (k === 2 && extra[2].indexOf(us[j]) >= 0) { /* a vertical step: both levels at the same u */
          u.push(us[j]); y.push(wave(2, us[j] - 1e-4));
        }
        var v = wave(k, us[j]);
        u.push(us[j]); y.push(v);
        if (v < lo) lo = v; if (v > hi) hi = v;
      }
      var mid = (lo + hi) / 2;
      for (j = 0; j < y.length; j++) y[j] -= mid;
      out.push({ u: u, y: y, pp: hi - lo });
    }
    return out;
  })();
  /* one ratio for legend and spokes: packet height (peak to peak units) per unit of length */
  var WAVE_RATIO = 0.19;
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }

  /* =====================================================================
     (a) VITAL WORLD MODEL
     ===================================================================== */
  function WorldModel(mount) {
    var self = this;
    this.mount = mount;
    this.visible = false;
    mount.classList.add('ms-wm');
    mount.textContent = '';

    var stage = el('div', 'ms-wm-stage');
    stage.setAttribute('aria-hidden', 'true');
    var canvas = el('canvas', 'ms-wm-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    stage.appendChild(canvas);
    var lblShared = el('div', 'ms-lbl ms-lbl-shared');
    lblShared.textContent = 'Shared model';
    var lblYours = el('div', 'ms-lbl ms-lbl-yours');
    lblYours.innerHTML = '<span>Your model</span>';
    stage.appendChild(lblShared);
    stage.appendChild(lblYours);

    var legend = el('div', 'ms-wm-legend');
    legend.setAttribute('aria-hidden', 'true');
    KINDS.forEach(function (k, i) {
      var item = el('span', 'ms-wm-key');
      var wv = WAVES[i], pts = [], A = 22 * WAVE_RATIO; /* 22 x 10 glyph, same ratio as the spokes */
      for (var j = 0; j < wv.u.length; j++) pts.push((wv.u[j] * 22).toFixed(2) + ',' + (5 - wv.y[j] * A).toFixed(2));
      item.innerHTML = '<svg viewBox="0 0 22 10" width="22" height="10"><polyline fill="none" stroke="' + rgba(k.rgb, 1) +
        '" stroke-opacity="' + k.a + '" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" points="' + pts.join(' ') + '"/></svg><span>' + k.name + '</span>';
      legend.appendChild(item);
    });

    mount.appendChild(stage);
    mount.appendChild(legend);

    this.stage = stage;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lblShared = lblShared;
    this.lblYours = lblYours;
    armIntro(this, stage); /* the drawing and its labels; the card frame and legend arrive with the section */
    this.w = 0; this.h = 0;
    this.time = 0;
    this.learn = 0.3;    /* how much the shared model has learned: drives its glow */
    this.energy = 0;     /* short pulse when a signal arrives */
    this.arrivals = 0;
    this.ring = -1;      /* broadcast ring progress (0..1), -1 when idle */
    this.bcT = 1;        /* seconds until the shared model next sends what it learned back out */
    this.inb = [];
    this.outb = [];
    this.sparks = [];
    this.nodes = [];
    this.buildLattice();
  }

  WorldModel.prototype.buildLattice = function () {
    var M = 30, pts = [], i, j;
    var ga = Math.PI * (3 - Math.sqrt(5));
    for (i = 0; i < M; i++) {
      var y = 1 - (i + 0.5) * 2 / M;
      var r = Math.sqrt(1 - y * y);
      pts.push([Math.cos(ga * i) * r, y, Math.sin(ga * i) * r]);
    }
    var edges = [], seen = {};
    for (i = 0; i < M; i++) {
      var d = [];
      for (j = 0; j < M; j++) {
        if (i === j) continue;
        var dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], dz = pts[i][2] - pts[j][2];
        d.push([dx * dx + dy * dy + dz * dz, j]);
      }
      d.sort(function (a, b) { return a[0] - b[0]; });
      for (var k = 0; k < 3; k++) {
        var a = Math.min(i, d[k][1]), b = Math.max(i, d[k][1]), key = a + '-' + b;
        if (!seen[key]) { seen[key] = 1; edges.push([a, b]); }
      }
    }
    this.lat = pts;
    this.latEdges = edges;
    this.latProj = pts.map(function () { return [0, 0, 0]; });
    this.latFlash = pts.map(function () { return 0; });
  };

  WorldModel.prototype.layout = function () {
    /* legend: one row when there is room, otherwise a tidy 2 x 2 grid (set before measuring the stage) */
    var wide = this.mount.clientWidth >= 640;
    if (wide !== this._wide) { this._wide = wide; this.mount.classList.toggle('ms-wm-wide', wide); }
    var w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (w < 40 || h < 40) return false;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    if (w !== this.w || h !== this.h || this.canvas.width !== Math.round(w * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.w = w; this.h = h;
    var small = w < 440;
    this.small = small;
    /* on narrow plates the core is a big share of the figure: shorter packets clear its halo sooner */
    this.narrow = this.mount.clientWidth < 420;
    var cx = w / 2, cy = h * 0.47;
    this.cx = cx; this.cy = cy;
    var Rc = clamp(Math.min(w, h) * 0.125, 30, 54);
    this.Rc = Rc;

    var N = w < 380 ? 10 : (w < 520 ? 12 : 14);
    var padX = small ? 22 : 30;
    var rx = w / 2 - padX;
    var ryTop = cy - 20;
    var ryBot = h - cy - 36; /* leave room below for the "Your model" label */
    var startA = small ? 2.3 : 2.2; /* your model sits lower left */
    var old = this.nodes;
    var nodes = [];
    for (var i = 0; i < N; i++) {
      var a = startA + i * TAU / N;
      var jit = i === 0 ? 1 : 0.84 + 0.16 * (0.5 + 0.5 * Math.sin(i * 12.9898 + 4.1));
      var sa = Math.sin(a), ca = Math.cos(a);
      var x = cx + ca * rx * jit;
      var y = cy + sa * (sa > 0 ? ryBot : ryTop) * jit;
      var prev = old[i];
      nodes.push({
        x: x, y: y, mine: i === 0,
        r: i === 0 ? (small ? 8 : 9) : (small ? 5 : 5.5),
        s: prev ? prev.s : rand(0.08, 0.4),
        f: prev ? prev.f : 0,
        timer: prev ? prev.timer : rand(0.2, 4.5),
        /* each person sends one kind of signal for a while (a run of 2 to 3 packets), so a spoke reads
           as "this person's sleep"; then moves on to the next kind */
        kind: prev ? prev.kind : (i * 3 + 1) % 4,
        run: prev ? prev.run : 1 + (i % 3),
        land: prev ? prev.land : 1
      });
    }
    this.nodes = nodes;
    this.layerOk = false;
    /* paths: a gentle, consistent swirl from each person into the shared model */
    var swirl = 0.38;
    for (i = 0; i < N; i++) {
      var n = nodes[i];
      var vx = n.x - cx, vy = n.y - cy;
      var ang = Math.atan2(vy, vx);
      var ea = ang + swirl * 0.9;
      var ex = cx + Math.cos(ea) * Rc * 1.12, ey = cy + Math.sin(ea) * Rc * 1.12;
      var c = Math.cos(swirl), s = Math.sin(swirl);
      var qx = cx + (vx * c - vy * s) * 0.5, qy = cy + (vx * s + vy * c) * 0.5;
      var sx = n.x - Math.cos(ang) * (n.r + 3), sy = n.y - Math.sin(ang) * (n.r + 3);
      var S = 72, pts = [], len = [0], L = 0;
      for (var k = 0; k <= S; k++) {
        var t = k / S, it = 1 - t;
        var px = it * it * sx + 2 * it * t * qx + t * t * ex;
        var py = it * it * sy + 2 * it * t * qy + t * t * ey;
        if (k > 0) { L += Math.hypot(px - pts[k - 1][0], py - pts[k - 1][1]); len.push(L); }
        pts.push([px, py]);
      }
      n.path = { pts: pts, len: len, L: L };
    }
    /* labels */
    var mine = nodes[0];
    var sy = Math.round(cy + Rc * 1.42 + 2);
    this.lblShared.style.transform = 'translate(' + Math.round(cx) + 'px,' + sy + 'px) translate(-50%,0)';
    /* the "Shared model" label's box, 6px larger on every side: packets that touch it fade right down */
    var lw = this.lblShared.offsetWidth, lh = this.lblShared.offsetHeight;
    this.lblRect = lw ? [Math.round(cx) - lw / 2 - 6, sy - 6, Math.round(cx) + lw / 2 + 6, sy + lh + 6] : null;
    this.fadeGrads = null;
    var ly = Math.round(mine.y + mine.r + 8);
    var lx = Math.round(clamp(mine.x, 52, w - 52));
    this.lblYours.style.transform = 'translate(' + lx + 'px,' + ly + 'px) translate(-50%,0)';
    /* drop packets whose node no longer exists */
    this.inb = this.inb.filter(function (p) { return p.n < N; });
    this.outb = this.outb.filter(function (p) { return p.n < N; });
    return true;
  };

  WorldModel.prototype.buildLayer = function () {
    var w = this.w, h = this.h, dpr = this.dpr;
    /* two offscreen canvases for the life of the widget: resized in place, never replaced */
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (!this.glow) this.glow = document.createElement('canvas');
    if (!this.layer) this.layer = document.createElement('canvas');
    if (this.glow.width !== W) this.glow.width = W;
    if (this.glow.height !== H) this.glow.height = H;
    if (this.layer.width !== W) this.layer.width = W;
    if (this.layer.height !== H) this.layer.height = H;
    /* (1) a soft sky pool around the shared model (normal compositing) */
    var g = this.glow.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var gR = this.Rc * 3.2, cx = this.cx, cy = this.cy;
    if (!FC) {
      var gr = g.createRadialGradient(cx, cy, 0, cx, cy, gR);
      gr.addColorStop(0, rgba(COL.sky, 0.16));
      gr.addColorStop(0.42, rgba(COL.sky, 0.06));
      gr.addColorStop(1, rgba(COL.sky, 0));
      g.fillStyle = gr;
      g.fillRect(cx - gR, cy - gR, gR * 2, gR * 2);
    }
    /* (2) channels, then soft drop shadows under the core and under every personal model */
    var c = this.layer.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.lineWidth = 1;
    c.lineCap = 'round';
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i], pts = n.path.pts;
      c.strokeStyle = n.mine ? rgba(COL.orange, 0.42) : rgba(COL.line2, 0.95);
      if (n.mine) c.setLineDash([]); else c.setLineDash([2, 4]);
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (var j = 1; j < pts.length; j++) c.lineTo(pts[j][0], pts[j][1]);
      c.stroke();
    }
    c.setLineDash([]);
    c.save();
    c.shadowColor = FC ? 'rgba(0,0,0,0)' : 'rgba(15,23,42,0.10)';
    c.shadowBlur = 22;
    c.shadowOffsetY = 8;
    c.fillStyle = rgba(COL.bg, 1);
    c.beginPath(); c.arc(cx, cy, this.Rc * 1.12, 0, TAU); c.fill();
    c.shadowBlur = 8;
    c.shadowOffsetY = 3;
    c.shadowColor = FC ? 'rgba(0,0,0,0)' : 'rgba(15,23,42,0.12)';
    for (i = 0; i < this.nodes.length; i++) {
      n = this.nodes[i];
      c.beginPath(); c.arc(n.x, n.y, n.r + (n.mine ? 3.5 : 2.5), 0, TAU); c.fill();
    }
    c.restore();
    this.layerOk = true;
  };

  /* point on a sampled path at distance d (clamped), with unit normal */
  function pathAt(path, d, out) {
    var len = path.len, pts = path.pts, n = len.length - 1;
    if (d <= 0) d = 0; else if (d >= path.L) d = path.L - 0.001;
    var lo = 0, hi = n;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (len[mid] <= d) lo = mid; else hi = mid; }
    var seg = len[hi] - len[lo] || 1, t = (d - len[lo]) / seg;
    var ax = pts[lo][0], ay = pts[lo][1], bx = pts[hi][0], by = pts[hi][1];
    var tx = bx - ax, ty = by - ay, tl = Math.hypot(tx, ty) || 1;
    out[0] = ax + tx * t; out[1] = ay + ty * t; out[2] = -ty / tl; out[3] = tx / tl;
    return out;
  }

  WorldModel.prototype.spawnIn = function (ni, progress) {
    var n = this.nodes[ni];
    if (n.run <= 0) { n.kind = (n.kind + 1) % 4; n.run = 2 + ((Math.random() * 2) | 0); }
    n.run--;
    var dur = n.mine ? rand(4.2, 5) : rand(4.4, 6.2);
    this.inb.push({ n: ni, k: n.kind, d: (progress || 0) * n.path.L, v: n.path.L / dur, len: this.narrow ? 24 : this.small ? 26 : 30 });
  };
  /* t is in seconds since launch; a negative t is the wait before it leaves the core */
  WorldModel.prototype.spawnOut = function (ni, t) {
    this.outb.push({ n: ni, t: t || 0 });
  };
  /* one learned update, sent back along the same channels the signals came in on:
     a short ring starts the wave at the core, then one small sky dot runs down every spoke,
     farther people a little later, and a fine ring opens where each one lands */
  var BC_EVERY = 4.8, BC_DUR = 0.9, BC_SPREAD = 0.25, BC_LAND = 0.6;
  /* 0 for the nearest person, 1 for the farthest: farther people hear back a little later */
  WorldModel.prototype.reach = function (i) {
    var lo = 1e9, hi = 0, k, L;
    for (k = 0; k < this.nodes.length; k++) { L = this.nodes[k].path.L; if (L < lo) lo = L; if (L > hi) hi = L; }
    return hi - lo > 1 ? (this.nodes[i].path.L - lo) / (hi - lo) : 0;
  };
  WorldModel.prototype.broadcast = function () {
    this.ring = 0;
    this.energy = Math.min(1.2, this.energy + 0.25);
    for (var i = 0; i < this.nodes.length; i++) this.spawnOut(i, -this.reach(i) * BC_SPREAD);
  };
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  WorldModel.prototype.seedStatic = function (full) {
    /* a complete, calm frame: signals mid-flight, a learned update on its way back out */
    this.inb = []; this.outb = []; this.ring = -1;
    var N = this.nodes.length, i;
    for (i = 0; i < N; i++) {
      this.nodes[i].land = 1; this.nodes[i].f = 0;
      /* the still frame is the same every time it is redrawn (resize, scroll in/out, font load) */
      if (full) { this.nodes[i].kind = (i * 3 + 1) % 4; this.nodes[i].run = 1 + (i % 3); }
    }
    for (i = 0; i < N; i++) {
      /* inbound traces sit on the outer half of each channel, clear of the returning comets */
      var p = full ? 0.1 + 0.3 * ((i * 0.37) % 1) : ((i * 0.37) % 1) * 0.75 + 0.12;
      this.spawnIn(i, p);
      var pk = this.inb[this.inb.length - 1];
      pk.d = Math.min(Math.max(pk.d, pk.len + 8), this.nodes[i].path.L * 0.85); /* whole, never cut by the person's disc */
      if (full) { this.nodes[i].s = 0.55 + 0.45 * ((i * 0.618) % 1); }
    }
    if (full) {
      /* the update half way down every spoke */
      for (i = 0; i < N; i++) this.spawnOut(i, BC_DUR * 0.5 - this.reach(i) * BC_SPREAD * 0.5);
      this.nodes[0].s = 1;
      this.learn = 1;
    } else {
      /* the first update leaves the core just after the figure comes into view */
      this.bcT = 0.7;
    }
  };

  WorldModel.prototype.step = function (dt) {
    this.time += dt;
    var nodes = this.nodes, N = nodes.length, i;
    for (i = 0; i < N; i++) {
      var n = nodes[i];
      n.timer -= dt;
      if (n.timer <= 0) { this.spawnIn(i, 0); n.timer = n.mine ? rand(2.4, 3.6) : rand(3.4, 7.5); }
      n.f = Math.max(0, n.f - dt * 1.25);
      if (n.s > 0.42) n.s = Math.max(0.42, n.s - dt * 0.012);
    }
    for (i = this.inb.length - 1; i >= 0; i--) {
      var p = this.inb[i];
      p.d += p.v * dt;
      if (p.d - p.len >= nodes[p.n].path.L) {
        this.inb.splice(i, 1);
        this.arrive(p);
      }
    }
    this.bcT -= dt;
    if (this.bcT <= 0) { this.bcT += BC_EVERY; this.broadcast(); }
    if (this.ring >= 0) { this.ring += dt / 0.9; if (this.ring >= 1) this.ring = -1; }
    for (i = this.outb.length - 1; i >= 0; i--) {
      var o = this.outb[i];
      o.t += dt;
      if (o.t >= BC_DUR) {
        var tn = nodes[o.n];
        tn.s = Math.min(1, tn.s + 0.42); tn.f = 1; tn.land = 0;
        this.outb.splice(i, 1);
      }
    }
    for (i = 0; i < N; i++) if (nodes[i].land < 1) nodes[i].land = Math.min(1, nodes[i].land + dt / BC_LAND);
    this.energy *= Math.exp(-dt * 1.4);
    for (i = 0; i < this.latFlash.length; i++) this.latFlash[i] = Math.max(0, this.latFlash[i] - dt * 0.8);
  };

  WorldModel.prototype.arrive = function (p) {
    this.arrivals++;
    this.learn = Math.min(1, this.learn + 0.035);
    this.energy = Math.min(1.2, this.energy + 0.35);
    /* light the lattice point facing the incoming signal */
    var n = this.nodes[p.n], ang = Math.atan2(n.y - this.cy, n.x - this.cx) + 0.34;
    var best = -1, bd = 1e9, proj = this.latProj;
    for (var j = 0; j < proj.length; j++) {
      if (proj[j][2] < -0.1) continue;
      var a = Math.atan2(proj[j][1], proj[j][0]);
      var dd = Math.abs(Math.atan2(Math.sin(a - ang), Math.cos(a - ang)));
      if (dd < bd) { bd = dd; best = j; }
    }
    if (best >= 0) this.latFlash[best] = 1;
  };

  WorldModel.prototype.draw = function () {
    var ctx = this.ctx, w = this.w, h = this.h, dpr = this.dpr;
    if (!w) return;
    var cx = this.cx, cy = this.cy, Rc = this.Rc, L = this.learn, E = this.energy, T = this.time;
    var nodes = this.nodes, i, j, k, n;
    var SKY = COL.sky, SKYD = COL.skyDeep, OR = COL.orange, BG = COL.bg;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    /* soft sky pool of the shared model (cached): fuller as it learns */
    if (!this.layerOk) this.buildLayer();
    ctx.globalAlpha = clamp(0.45 + 0.4 * L + 0.25 * E, 0, 1);
    ctx.drawImage(this.glow, 0, 0, w, h);
    ctx.globalAlpha = 1;
    /* channels + soft shadows (cached) */
    ctx.drawImage(this.layer, 0, 0, w, h);

    /* incoming body data: each packet is the legend's own waveform, drawn at the same ratio of
       length to height. Packets are batched by kind and quantised opacity to keep draw calls low. */
    var q = [0, 0, 0, 0], qe = [0, 0, 0, 0];
    var LV = 6, buckets = this.buckets || (this.buckets = []);
    for (i = 0; i < KINDS.length * LV; i++) { if (buckets[i]) buckets[i].length = 0; else buckets[i] = []; }
    var lr = this.lblRect;
    for (i = 0; i < this.inb.length; i++) {
      var p = this.inb[i];
      n = nodes[p.n];
      var path = n.path, PL = path.L;
      var head = p.d, tail = p.d - p.len;
      if (head <= 0 || tail >= PL) continue;
      /* fades in as it leaves the person, slips under the core's rim as it is absorbed */
      var al0 = (n.mine ? 1 : 0.86) * clamp(head / 18, 0, 1) * clamp((PL + p.len * 0.35 - tail) / (p.len * 0.9), 0, 1);
      if (al0 <= 0.04) continue;
      var wv = WAVES[p.k], A = p.len * WAVE_RATIO, pts = [];
      var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      pathAt(path, PL, qe);
      for (j = 0; j < wv.u.length; j++) {
        var d = tail + wv.u[j] * p.len;
        if (d < 0) continue;
        if (d > PL) { /* carry on straight into the core (hidden under its disc) */
          var ex = d - PL;
          q[0] = qe[0] + qe[3] * ex; q[1] = qe[1] - qe[2] * ex; q[2] = qe[2]; q[3] = qe[3];
        } else pathAt(path, d, q);
        var off = wv.y[j] * A, gx = q[0] + q[2] * off, gy = q[1] + q[3] * off;
        pts.push(gx, gy);
        if (gx < bx0) bx0 = gx; if (gx > bx1) bx1 = gx;
        if (gy < by0) by0 = gy; if (gy > by1) by1 = gy;
      }
      if (pts.length < 4) continue;
      /* a packet that reaches the "Shared model" label fades down to 15% over its last 10px */
      if (lr) {
        var sx2 = Math.max(lr[0] - bx1, bx0 - lr[2], 0), sy2 = Math.max(lr[1] - by1, by0 - lr[3], 0);
        al0 *= 0.15 + 0.85 * smooth01(Math.sqrt(sx2 * sx2 + sy2 * sy2) / 10);
        if (al0 <= 0.04) continue;
      }
      var lv = Math.min(LV - 1, Math.floor(al0 * LV));
      buckets[p.k * LV + lv].push(pts);
    }
    /* each bucket strokes with a radial gradient centred on the core: clear inside 1.30 Rc, full
       from 1.62 Rc out (smoothstep between). The dashed halo sits at 1.36 Rc, where a packet is
       already down to about 9%, so it dissolves into the halo as it is absorbed instead of being
       drawn over the rings. Built once per layout. */
    var fg = this.fadeGrads;
    if (!fg) {
      fg = this.fadeGrads = [];
      for (i = 0; i < KINDS.length * LV; i++) {
        var kd0 = KINDS[(i / LV) | 0], a0 = kd0.a * Math.min(1, ((i % LV) + 1) / LV);
        var gr0 = ctx.createRadialGradient(cx, cy, Rc * 1.30, cx, cy, Rc * 1.62);
        for (k = 0; k <= 4; k++) gr0.addColorStop(k / 4, rgba(kd0.rgb, a0 * smooth01(k / 4)));
        fg.push(gr0);
      }
    }
    ctx.lineWidth = 1.75;
    for (i = 0; i < buckets.length; i++) {
      var bk = buckets[i];
      if (!bk.length) continue;
      ctx.strokeStyle = fg[i];
      ctx.beginPath();
      for (j = 0; j < bk.length; j++) {
        var pp = bk[j];
        ctx.moveTo(pp[0], pp[1]);
        for (k = 2; k < pp.length; k += 2) ctx.lineTo(pp[k], pp[k + 1]);
      }
      ctx.stroke();
    }

    /* the shared model: a slowly turning lattice inside a crisp sky ring */
    var cg = ctx.createRadialGradient(cx, cy, Rc * 0.1, cx, cy, Rc * 1.12);
    cg.addColorStop(0, rgba(SKY, 0.03 + 0.04 * L + 0.05 * E));
    cg.addColorStop(1, rgba(SKY, 0.09 + 0.05 * L));
    ctx.fillStyle = rgba(BG, 1);
    ctx.beginPath(); ctx.arc(cx, cy, Rc * 1.12, 0, TAU); ctx.fill();
    if (!FC) { ctx.fillStyle = cg; ctx.fill(); }
    var rot = T * 0.16, tilt = 0.42;
    var ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(rot), sr = Math.sin(rot);
    var R = Rc * 0.78, proj = this.latProj, lat = this.lat;
    for (j = 0; j < lat.length; j++) {
      var X = lat[j][0], Y = lat[j][1], Z = lat[j][2];
      var x1 = X * cr + Z * sr, z1 = -X * sr + Z * cr;
      var y2 = Y * ct - z1 * st, z2 = Y * st + z1 * ct;
      proj[j][0] = x1 * R; proj[j][1] = y2 * R; proj[j][2] = z2;
    }
    var lum = 0.55 + 0.45 * L;
    ctx.lineWidth = 1;
    var EL = 6, eb = this.ebuckets || (this.ebuckets = []);
    for (j = 0; j < EL; j++) { if (eb[j]) eb[j].length = 0; else eb[j] = []; }
    for (j = 0; j < this.latEdges.length; j++) {
      var e = this.latEdges[j], A = proj[e[0]], B = proj[e[1]];
      var dep = ((A[2] + B[2]) * 0.5 + 1) * 0.5;
      var fl = Math.max(this.latFlash[e[0]], this.latFlash[e[1]]);
      var ea = Math.min(0.8, (0.1 + 0.42 * dep * dep) * lum + 0.3 * fl);
      eb[Math.min(EL - 1, Math.floor(ea / 0.8 * EL))].push(cx + A[0], cy + A[1], cx + B[0], cy + B[1]);
    }
    for (j = 0; j < EL; j++) {
      var ebk = eb[j];
      if (!ebk.length) continue;
      ctx.strokeStyle = rgba(SKYD, (j + 0.6) / EL * 0.8);
      ctx.beginPath();
      for (k = 0; k < ebk.length; k += 4) { ctx.moveTo(ebk[k], ebk[k + 1]); ctx.lineTo(ebk[k + 2], ebk[k + 3]); }
      ctx.stroke();
    }
    for (j = 0; j < proj.length; j++) {
      var P = proj[j], dp = (P[2] + 1) * 0.5, f2 = this.latFlash[j];
      if (f2 > 0.02) {
        ctx.fillStyle = rgba(SKY, 0.16 * f2);
        ctx.beginPath(); ctx.arc(cx + P[0], cy + P[1], 4 + 5 * f2, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = rgba(f2 > 0.02 ? SKY : SKYD, Math.min(1, (0.3 + 0.7 * dp) * lum + 0.5 * f2));
      ctx.beginPath(); ctx.arc(cx + P[0], cy + P[1], 0.9 + 1.1 * dp + 0.9 * f2, 0, TAU); ctx.fill();
    }
    /* core rings */
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(SKY, 0.55 + 0.3 * L + 0.15 * E);
    ctx.beginPath(); ctx.arc(cx, cy, Rc * 1.12, 0, TAU); ctx.stroke();
    ctx.save();
    ctx.lineWidth = 1.25;
    ctx.setLineDash([1.5, 5]);
    ctx.lineDashOffset = -T * 4;
    ctx.strokeStyle = rgba(SKY, 0.4 + 0.2 * L);
    ctx.beginPath(); ctx.arc(cx, cy, Rc * 1.36, 0, TAU); ctx.stroke();
    ctx.restore();

    /* the learned update leaving the core: a short sky ring that starts the wave */
    if (this.ring >= 0) {
      var rg = this.ring, re = 1 - (1 - rg) * (1 - rg) * (1 - rg);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = rgba(SKY, 0.5 * (1 - rg));
      ctx.beginPath(); ctx.arc(cx, cy, Rc * (1.12 + 0.23 * re), 0, TAU); ctx.stroke();
    }

    /* ...carried back down the same channels: one small sky dot per spoke, with a short fading trail */
    var dots = this.odots || (this.odots = []), trails = this.otrails || (this.otrails = []);
    dots.length = 0; trails.length = 0;
    var TR = this.small ? 10 : 12;
    for (i = 0; i < this.outb.length; i++) {
      var o = this.outb[i];
      if (o.t <= 0) continue;
      n = nodes[o.n];
      /* it runs on into the person's own disc (drawn on top), so it never parks beside it */
      var pth = n.path, ue = easeInOutCubic(clamp(o.t / BC_DUR, 0, 1)), ext = n.r + 3 + (n.mine ? 2 : 0);
      var hd = pth.L - (pth.L + ext) * ue;
      pathAt(pth, hd, q);
      if (hd < 0) { q[0] += q[3] * hd; q[1] -= q[2] * hd; }
      dots.push(q[0], q[1]);
      /* the trail follows the dot into the person's disc rather than lingering beside it */
      var tEnd = Math.min(hd + TR, pth.L), tStart = Math.max(0, hd);
      if (tEnd - tStart > 1.5) {
        var x0 = q[0], y0 = q[1];
        if (hd < 0) { pathAt(pth, 0, q); x0 = q[0]; y0 = q[1]; }
        pathAt(pth, tEnd, q); trails.push(x0, y0, q[0], q[1]);
      }
    }
    if (dots.length) {
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = rgba(SKY, 0.32);
      ctx.beginPath();
      for (k = 0; k < trails.length; k += 4) { ctx.moveTo(trails[k], trails[k + 1]); ctx.lineTo(trails[k + 2], trails[k + 3]); }
      ctx.stroke();
      ctx.fillStyle = rgba(SKY, 1);
      ctx.beginPath();
      for (k = 0; k < dots.length; k += 2) { ctx.moveTo(dots[k] + 2.5, dots[k + 1]); ctx.arc(dots[k], dots[k + 1], 2.5, 0, TAU); }
      ctx.fill();
    }

    /* personal models: soft rings that come into focus as refinement arrives */
    var SL = COL.muted, AM = COL.amber;
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      var s = n.s, r = n.r, spread = (1 - s) * (n.mine ? 4 : 3.2);
      var a = n.mine ? 0.55 + 0.45 * s : 0.35 + 0.5 * s;
      var RC = n.mine ? OR : SL;
      if (n.mine && !FC) {
        ctx.fillStyle = rgba(OR, 0.08 + 0.06 * n.f);
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 13, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = rgba(BG, 1);
      ctx.beginPath(); ctx.arc(n.x, n.y, r + spread + 1.5, 0, TAU); ctx.fill();
      for (j = -1; j <= 1; j++) {
        ctx.lineWidth = j === 0 ? (n.mine ? 1.75 : 1.25) : 1;
        ctx.strokeStyle = rgba(RC, j === 0 ? a * (0.55 + 0.45 * s) : a * 0.4 * (1 - s * 0.6));
        ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(1, r + j * spread), 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = rgba(n.mine ? OR : AM, 0.45 + 0.55 * s);
      ctx.beginPath(); ctx.arc(n.x, n.y, n.mine ? 2.8 : 1.9, 0, TAU); ctx.fill();
      if (n.mine) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(OR, 0.38);
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 6.5, 0, TAU); ctx.stroke();
      }
      /* the update lands: a fine sky ring opens from r+2 to r+7 and fades (0.6 s) */
      if (n.land < 1) {
        var lo = 1 - (1 - n.land) * (1 - n.land), base = n.mine ? r + 4.5 : r;
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(SKY, 0.7 * (1 - n.land));
        ctx.beginPath(); ctx.arc(n.x, n.y, base + 2 + 5 * lo, 0, TAU); ctx.stroke();
      }
    }
  };

  WorldModel.prototype.resize = function () {
    if (!this.layout()) return;
    if (!this.started) {
      this.started = true;
      /* paused before it ever moved: open on the complete, calm frame; play resumes from it */
      this.seedStatic(reduced() || paused());
    }
    this.draw();
  };
  WorldModel.prototype.tick = function (dt) { this.step(dt); this.draw(); };
  WorldModel.prototype.renderStatic = function () {
    if (!this.layout()) return;
    this.seedStatic(true);
    this.time = 7;
    this.draw();
  };

  /* =====================================================================
     (b) SAFETY: action size follows certainty, always under a fixed limit
     ===================================================================== */
  var SVGNS = 'http://www.w3.org/2000/svg';
  var uid = 0;
  function Safety(mount) {
    this.mount = mount;
    this.visible = false;
    this.id = 'ms' + (++uid);
    mount.classList.add('ms-sf');
    mount.textContent = '';
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'ms-sf-svg');
    var plot = el('div', 'ms-sf-plot');
    plot.setAttribute('aria-hidden', 'true');
    plot.appendChild(svg);
    mount.appendChild(plot);
    this.plot = plot;
    this.svg = svg;
    armIntro(this, plot);
    this.time = 0;
    this.c = certaintyAt(0); /* the first frame is the loop's own first frame: no jump when play starts */
    this.w = 0; this.h = 0;
  }
  /* one sweep low -> high -> low every 13 s */
  function certaintyAt(t) { return 0.5 - 0.44 * Math.cos(TAU * (t + 2.2) / 13); }
  /* normalized logistic: f(0)=0, rises with certainty, levels off at M below the limit */
  function sizeOf(c) {
    var k = 7.2, c0 = 0.5;
    var s = function (x) { return 1 / (1 + Math.exp(-k * (x - c0))); };
    return (s(c) - s(0)) / (s(1) - s(0));
  }
  Safety.prototype.layout = function () {
    var w = this.plot.clientWidth, h = this.plot.clientHeight;
    if (w < 60 || h < 60) return false;
    if (w === this.w && h === this.h) return true;
    this.w = w; this.h = h;
    var small = w < 440;
    var padL = 2, padR = small ? 4 : 8, padT = 34, padB = 34;
    var x0 = padL + 1.5, x1 = w - padR;
    var yB = Math.round(h - padB) + 0.5, yT = padT;
    var yLim = Math.round(yT + (yB - yT) * 0.16) + 0.5;
    var M = 0.74;
    var px0 = x0 + (small ? 15 : 20), px1 = x1 - (small ? 6 : 8);
    var self = this;
    this.X = function (c) { return px0 + c * (px1 - px0); };
    this.Y = function (v) { return yB - v * M * (yB - yLim); };
    this.g = { x0: x0, x1: x1, yB: yB, yT: yT, yLim: yLim };
    var id = this.id, i, d = '', area = '';
    for (i = 0; i <= 120; i++) {
      var c = i / 120, x = this.X(c), y = this.Y(sizeOf(c));
      d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    area = d + 'L' + this.X(1).toFixed(2) + ' ' + yB + 'L' + this.X(0).toFixed(2) + ' ' + yB + 'Z';
    var midX = (px0 + px1) / 2;
    var SKY = rgba(COL.sky, 1), RED = rgba(COL.red, 1);
    var s = '';
    s += '<defs>' +
      '<pattern id="' + id + 'h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<line class="ms-sf-hatch-line" x1="0" y1="0" x2="0" y2="7" stroke="' + RED + '" stroke-opacity=".22" stroke-width="1"/></pattern>' +
      '<linearGradient id="' + id + 'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + SKY + '" stop-opacity=".16"/><stop offset="1" stop-color="' + SKY + '" stop-opacity=".02"/></linearGradient>' +
      '<linearGradient id="' + id + 'c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + SKY + '" stop-opacity=".55"/><stop offset=".55" stop-color="' + SKY + '" stop-opacity="1"/></linearGradient>' +
      '<radialGradient id="' + id + 'g"><stop offset="0" stop-color="' + SKY + '" stop-opacity=".22"/><stop offset="1" stop-color="' + SKY + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + id + 'r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + RED + '" stop-opacity=".02"/><stop offset="1" stop-color="' + RED + '" stop-opacity=".07"/></linearGradient>' +
      '</defs>';
    /* beyond the limit: a soft red, hatched zone that nothing enters */
    s += '<rect class="ms-sf-zone" x="' + (x0 + 0.5) + '" y="' + (yT + 2) + '" width="' + (x1 - x0 - 0.5) + '" height="' + (yLim - yT - 2) + '" fill="url(#' + id + 'r)"/>';
    s += '<rect class="ms-sf-hatch" x="' + (x0 + 0.5) + '" y="' + (yT + 2) + '" width="' + (x1 - x0 - 0.5) + '" height="' + (yLim - yT - 2) + '" fill="url(#' + id + 'h)"/>';
    /* fine guides */
    s += '<g class="ms-sf-grid">';
    for (i = 1; i <= 3; i++) {
      var gy = Math.round(yB - (yB - yLim) * i / 4) + 0.5;
      s += '<line x1="' + (x0 + 1) + '" x2="' + x1 + '" y1="' + gy + '" y2="' + gy + '"/>';
    }
    for (i = 1; i <= 3; i++) {
      var gx = Math.round(this.X(i / 4)) + 0.5;
      s += '<line x1="' + gx + '" x2="' + gx + '" y1="' + (yLim + 1) + '" y2="' + yB + '"/>';
    }
    s += '</g>';
    /* area under the curve */
    s += '<path class="ms-sf-area" d="' + area + '" fill="url(#' + id + 'a)"/>';
    /* axes */
    s += '<g class="ms-sf-axis" fill="none" stroke-width="1">' +
      '<path d="M' + x0 + ' ' + (yT - 10) + 'V' + yB + 'H' + x1 + '"/>' +
      '<path d="M' + (x0 - 3.5) + ' ' + (yT - 5.5) + 'L' + x0 + ' ' + (yT - 10) + 'L' + (x0 + 3.5) + ' ' + (yT - 5.5) + '"/>' +
      '<path d="M' + (x1 - 4.5) + ' ' + (yB - 3.5) + 'L' + x1 + ' ' + yB + 'L' + (x1 - 4.5) + ' ' + (yB + 3.5) + '"/>' +
      '</g>';
    /* fixed limit: a short red tick across the y-axis, then the dashes (a small gap keeps the tick on its own) */
    s += '<line class="ms-sf-limit" x1="' + (x0 + 7) + '" x2="' + x1 + '" y1="' + yLim + '" y2="' + yLim + '"/>';
    s += '<line class="ms-sf-limit-cap" x1="' + (x0 - 2.5) + '" x2="' + (x0 + 2.5) + '" y1="' + yLim + '" y2="' + yLim + '"/>';
    /* curve */
    s += '<path class="ms-sf-curve" d="' + d + '" stroke="url(#' + id + 'c)"/>';
    /* moving marker */
    s += '<g class="ms-sf-mark">' +
      '<line class="ms-sf-drop" data-r="drop"/>' +
      '<line class="ms-sf-across" data-r="across"/>' +
      '<circle class="ms-sf-tick" data-r="tick" r="3"/>' +
      '<circle class="ms-sf-tick" data-r="ytick" r="3"/>' +
      '<circle class="ms-sf-halo" data-r="halo" fill="url(#' + id + 'g)"/>' +
      '<circle class="ms-sf-halo-ring" data-r="ring"/>' +
      '<circle class="ms-sf-dot" data-r="dot" r="3.5"/>' +
      '</g>';
    /* labels */
    s += '<text class="ms-sf-t ms-sf-title" x="' + (x0 + 12) + '" y="' + (yT - 6) + '">Size of action</text>';
    s += '<rect class="ms-sf-plate" data-r="plate" rx="4"/>';
    s += '<text class="ms-sf-t ms-sf-red" data-r="limit" x="' + (x1 - 1) + '" y="' + (yLim - 9) + '" text-anchor="end">Fixed limit</text>';
    s += '<text class="ms-sf-t" x="' + px0 + '" y="' + (yB + 24) + '">Low</text>';
    s += '<text class="ms-sf-t ms-sf-title" x="' + midX + '" y="' + (yB + 24) + '" text-anchor="middle">Certainty</text>';
    s += '<text class="ms-sf-t" x="' + px1 + '" y="' + (yB + 24) + '" text-anchor="end">High</text>';
    this.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);
    this.svg.innerHTML = s;
    var r = {};
    Array.prototype.forEach.call(this.svg.querySelectorAll('[data-r]'), function (n) { r[n.getAttribute('data-r')] = n; });
    this.r = r;
    this.plate(x1, yT, yLim);
    return true;
  };
  /* size the white plate under "Fixed limit" from the rendered text (4px clear on every side) */
  Safety.prototype.plate = function (x1, yT, yLim) {
    var r = this.r, bb = null;
    try { bb = r.limit.getBBox(); } catch (e) { bb = null; }
    var tw = bb && bb.width > 0 ? bb.width : 90, ty = bb && bb.height > 0 ? bb.y : yLim - 20, th = bb && bb.height > 0 ? bb.height : 13;
    var top = Math.max(yT + 3, Math.floor(ty) - 3), bot = Math.min(yLim - 2.5, Math.ceil(ty + th) + 2);
    var right = x1, left = Math.floor(x1 - 1 - tw) - 4;
    r.plate.setAttribute('x', left); r.plate.setAttribute('y', top);
    r.plate.setAttribute('width', Math.max(0, right - left)); r.plate.setAttribute('height', Math.max(0, bot - top));
  };
  Safety.prototype.place = function (c) {
    var r = this.r, g = this.g;
    if (!r) return;
    var v = sizeOf(c), x = this.X(c), y = this.Y(v);
    var X = x.toFixed(2), Y = y.toFixed(2);
    r.drop.setAttribute('x1', X); r.drop.setAttribute('x2', X);
    r.drop.setAttribute('y1', (y + 5).toFixed(2)); r.drop.setAttribute('y2', g.yB);
    r.across.setAttribute('x1', g.x0 + 5); r.across.setAttribute('x2', (x - 5).toFixed(2));
    r.across.setAttribute('y1', Y); r.across.setAttribute('y2', Y);
    /* one 6px sky dot on each axis: certainty under the point, size of action where the guide meets the y-axis
       (the y dot fades out over its last 6px so it never sits as a blob in the corner) */
    var bh = Math.max(0, g.yB - y);
    r.tick.setAttribute('cx', X); r.tick.setAttribute('cy', g.yB);
    r.ytick.setAttribute('cx', g.x0); r.ytick.setAttribute('cy', Y);
    r.ytick.style.opacity = bh < 6 ? (bh / 6).toFixed(2) : '';
    /* the less sure it is, the wider and softer the halo */
    var hr = 6 + 16 * (1 - c);
    r.halo.setAttribute('cx', X); r.halo.setAttribute('cy', Y); r.halo.setAttribute('r', hr.toFixed(2));
    r.ring.setAttribute('cx', X); r.ring.setAttribute('cy', Y); r.ring.setAttribute('r', (hr * 0.72).toFixed(2));
    r.ring.style.opacity = (0.15 + 0.35 * (1 - c)).toFixed(3);
    r.dot.setAttribute('cx', X); r.dot.setAttribute('cy', Y);
  };
  Safety.prototype.resize = function () {
    this.w = 0;
    if (this.layout()) this.place(this.c);
  };
  Safety.prototype.tick = function (dt) {
    this.time += dt;
    this.c = certaintyAt(this.time);
    if (this.layout()) this.place(this.c);
  };
  Safety.prototype.renderStatic = function () {
    this.c = 0.3;
    this.w = 0;
    if (this.layout()) this.place(this.c);
  };

  /* =====================================================================
     controller: one loop for every mount, paused off screen / hidden / locked / by the visitor.
     Stopping the loop leaves the last drawn frame in place; play resumes from that same state.
     ===================================================================== */
  function anyActive() {
    if (reduced() || paused() || locked() || document.hidden) return false;
    for (var i = 0; i < widgets.length; i++) if (widgets[i].visible) return true;
    return false;
  }
  function frame(t) {
    rafId = 0;
    if (!anyActive()) { lastT = 0; return; }
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    for (var i = 0; i < widgets.length; i++) if (widgets[i].visible) { stepIntro(widgets[i], t); widgets[i].tick(dt); }
    rafId = requestAnimationFrame(frame);
  }
  function kick() {
    if (reduced() || paused()) widgets.forEach(endIntro);
    if (reduced()) { widgets.forEach(function (w) { w.renderStatic(); }); return; }
    if (!rafId && anyActive()) { lastT = 0; rafId = requestAnimationFrame(frame); }
  }

  function init() {
    var mounts = document.querySelectorAll('[data-widget="world-model"], [data-widget="safety"]');
    if (!mounts.length) return;
    readColors();
    Array.prototype.forEach.call(mounts, function (m) {
      if (m.__msWidget) return;
      var wdg = m.getAttribute('data-widget') === 'world-model' ? new WorldModel(m) : new Safety(m);
      m.__msWidget = wdg;
      widgets.push(wdg);
    });

    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function (entries) {
        entries.forEach(function (en) { var w = en.target.__msWidget; if (w) { reduced() ? w.renderStatic() : w.resize(); } });
      });
      widgets.forEach(function (w) { ro.observe(w.mount); });
    } else {
      window.addEventListener('resize', function () { widgets.forEach(function (w) { w.resize(); }); });
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { var w = en.target.__msWidget; if (w) w.visible = en.isIntersecting; });
        kick();
      }, { rootMargin: '80px 0px' });
      widgets.forEach(function (w) { io.observe(w.mount); });
    } else {
      widgets.forEach(function (w) { w.visible = true; });
    }

    widgets.forEach(function (w) { reduced() ? w.renderStatic() : w.resize(); });

    if (document.fonts && document.fonts.ready) {
      /* re-measure once the mono face is in: the limit plate and the label keep-out box follow the text */
      document.fonts.ready.then(function () { widgets.forEach(function (w) { reduced() ? w.renderStatic() : w.resize(); }); });
    }
    document.addEventListener('visibilitychange', kick);
    /* the class change alone restarts or stops the loop (observer below); the event is a second,
       explicit cue, read after the toggle has settled */
    document.addEventListener('site:motion', function () { setTimeout(kick, 0); });
    document.addEventListener('site:unlocked', function () {
      widgets.forEach(function (w) { reduced() ? w.renderStatic() : w.resize(); });
      kick();
    });
    if ('MutationObserver' in window) {
      new MutationObserver(kick).observe(root, { attributes: true, attributeFilter: ['class'] });
    }
    /* forced colours or more contrast: re-read the palette, re-bake the cached layers and redraw,
       so the hairlines and labels pick up the new values */
    var onColors = function () {
      readColors();
      widgets.forEach(function (w) { w.layerOk = false; w.fadeGrads = null; w.w = 0; reduced() ? w.renderStatic() : w.resize(); });
    };
    [forcedMQ, contrastMQ].forEach(function (mq) {
      if (!mq) return;
      if (mq.addEventListener) mq.addEventListener('change', onColors); else if (mq.addListener) mq.addListener(onColors);
    });
    if (reduceMQ) {
      var onRM = function () { widgets.forEach(function (w) { w.started = false; reduced() ? w.renderStatic() : w.resize(); }); kick(); };
      if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onRM); else if (reduceMQ.addListener) reduceMQ.addListener(onRM);
    }
    kick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

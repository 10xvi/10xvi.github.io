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

  /* ---------- shared sprites (soft radial fills, normal compositing) ---------- */
  var SPR = null;
  function sprite(col, kind) {
    var S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
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
    g.fillRect(0, 0, S, S);
    return c;
  }
  function sprites() {
    if (SPR) return SPR;
    var P0 = palette();
    SPR = {
      hS: sprite(P0.sky, 'halo'), hO: sprite(P0.orange, 'halo'), hA: sprite(P0.amber, 'halo'),
      zR: sprite(P0.red, 'haze'), zS: sprite(P0.slate, 'haze'), zK: sprite(P0.sky, 'haze'),
      bA: sprite(P0.amber, 'bokeh'), bS: sprite(P0.sky, 'bokeh'), bO: sprite(P0.orange, 'bokeh')
    };
    return SPR;
  }

  /* ---------- one field per canvas ---------- */
  function Field(cv) {
    var ctx = cv.getContext('2d');
    var calm = cv.getAttribute('data-mode') === 'calm';
    var sp = sprites();
    var W = 0, H = 0, dpr = 1, mobile = false, s = 60, gain = calm ? .42 : 1, PLc = palette();
    var cells = [], links = [], back = [], backPath = null, bokeh = [];
    var srcPos = [], Ts = [], Tb = [], Tk = [], maxT = 1, speed = 100, P = calm ? 6.2 : 4.2;
    var F = null, NW = 0, kmin = 0;
    var t = 0, running = false, raf = 0, last = 0, visible = true, shown = false;
    var ev = { st: 'idle', until: calm ? 9 : 3.5, t0: 0, rec: 0, cx: 0, cy: 0, R: 1 };
    var ptr = { x: -1e5, y: -1e5, lx: null, ly: null, e: 0, tx: 0, ty: 0, ox: 0, oy: 0 };

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
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (W * H * dpr * dpr > 7.5e6) dpr = Math.max(1, Math.sqrt(7.5e6 / (W * H)));
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
            bx: x, by: y, x: x, y: y, w: weight(x, y),
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
          links.push({ a: lo, b: hi, c: (hash(lo, hi) - .5) * .44, w: (cells[lo].w + cells[hi].w) / 2 });
          cells[lo].nb.push(hi); cells[hi].nb.push(lo);
        }
      }

      /* pacemakers */
      var sp0 = calm ? [[1.04, .5], [-.04, .45], [.5, -.06]]
        : mobile ? [[.82, .1], [1.08, .42], [.12, .04]]
        : [[.8, .3], [1.06, .82], [.6, -.06]];
      srcPos = sp0.map(function (p) { return [p[0] * W, p[1] * H]; });
      speed = speed;
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
          back.push({ x: bx, y: by, w: weight(bx, by), r: .8 + g1 * 1.1, j: (g2 - .5) * .1, k: g3 < .3 ? 0 : g3 < .52 ? 1 : 2 });
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

      /* front layer: a few large out-of-focus cells drifting close to the lens */
      bokeh = [];
      var nb = calm ? 0 : mobile ? 2 : 5;
      for (i = 0; i < nb; i++) {
        var k1 = hash(i + 41, 5), k2 = hash(i + 17, 23), k3 = hash(i + 3, 61);
        bokeh.push({
          x: mobile ? (.1 + .9 * k1) * W : (.5 + .55 * k1) * W,
          y: mobile ? (-.05 + .4 * k2) * H : (-.05 + 1.1 * k2) * H,
          r: (.035 + .045 * k3) * Math.max(W, H), p: k3 * TAU
        });
      }
      Tk = srcPos.map(function (p) { return bokeh.map(function (b) { return Math.hypot(b.x - p[0], b.y - p[1]) * 1.15 / speed; }); });

      if (t < maxT + 2 * P) t = maxT + 2 * P + (calm ? 1.3 : .6);
      ev.st = 'idle';
      ev.until = t + (calm ? 8 : 2.5);
      cells.forEach(function (c) { c.d = 0; c.rw = 0; c.fl = 0; });
    }

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

    function render() {
      var PL = palette();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      var camX = ev.camX || 0, camY = ev.camY || 0;
      var i, w, c, a, b;
      var SKY = rgb(PL.sky), SLATE = rgb(PL.slate), LINE = rgb(PL.slate);

      /* --- back layer: a fine, colourful particle field (the site's signature) --- */
      ctx.save();
      ctx.translate(camX * .45, camY * .45);
      ctx.strokeStyle = 'rgba(' + rgb(PL.line2) + ',' + (calm ? .22 : .3) + ')';
      ctx.lineWidth = .6;
      ctx.stroke(backPath);
      var srcB = [];
      for (w = 0; w < NW; w++) srcB.push(srcOf(kmin + w));
      /* 3 hues x 4 levels, one path each */
      var buckets = [];
      for (i = 0; i < 12; i++) buckets.push([]);
      var haloB = [];
      for (i = 0; i < back.length; i++) {
        var bp = back[i], act = 0;
        for (w = 0; w < NW; w++) {
          var tt = t - ((kmin + w) * P + Tb[srcB[w]][i]);
          if (tt < -.3 || tt > 3) continue;
          a = tt < 0 ? .2 * Math.exp(tt * 14) : Math.exp(-tt * 1.8);
          if (a > act) act = a;
        }
        var lv = bp.w * (.3 + .7 * act);
        buckets[bp.k * 4 + Math.min(3, Math.floor(lv * 4))].push(bp);
        if (act > .35 && bp.w > .35 && bp.k === 2) haloB.push(bp, act);
      }
      var hues = [PL.orange, PL.amber, PL.sky];
      for (var bk = 0; bk < 12; bk++) {
        var list = buckets[bk];
        if (!list.length) continue;
        var lev = bk % 4;
        ctx.fillStyle = 'rgba(' + rgb(hues[(bk / 4) | 0]) + ',' + q((.16 + lev * .17) * gain) + ')';
        ctx.beginPath();
        for (i = 0; i < list.length; i++) { var rr0 = list[i].r * (1 + lev * .12); ctx.moveTo(list[i].x + rr0, list[i].y); ctx.arc(list[i].x, list[i].y, rr0, 0, TAU); }
        ctx.fill();
      }
      for (i = 0; i < haloB.length; i += 2) {
        var gp = haloB[i], gs = 4 + gp.r * 4;
        ctx.globalAlpha = q(haloB[i + 1] * gp.w * .22 * gain);
        ctx.drawImage(sp.hS, gp.x - gs, gp.y - gs, gs * 2, gs * 2);
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
        ctx.drawImage(sp.zR, ev.cx - hz, ev.cy - hz, hz * 2, hz * 2);
        ctx.globalAlpha = q(.22 * ev.amt * gain * wv);
        ctx.drawImage(sp.zS, ev.cx - hz * .8, ev.cy - hz * .8, hz * 1.6, hz * 1.6);
        ctx.globalAlpha = 1;
      }

      /* resting links: fine slate hairlines, three bands */
      var bands = [new Path2D(), new Path2D(), new Path2D()];
      for (i = 0; i < L; i++) {
        lk = links[i]; a = cells[lk.a]; b = cells[lk.b];
        var mx = (a.x + b.x) / 2 - (b.y - a.y) * lk.c, my = (a.y + b.y) / 2 + (b.x - a.x) * lk.c;
        lk.cx = mx; lk.cy = my;
        var ex = mx - a.x, ey = my - a.y, el = Math.sqrt(ex * ex + ey * ey) || 1;
        lk.x0 = a.x + ex / el * a.r * 1.18; lk.y0 = a.y + ey / el * a.r * 1.18;
        ex = mx - b.x; ey = my - b.y; el = Math.sqrt(ex * ex + ey * ey) || 1;
        lk.x1 = b.x + ex / el * b.r * 1.18; lk.y1 = b.y + ey / el * b.r * 1.18;
        var dl0 = (a.d + b.d) / 2;
        if (dl0 > .25) continue; /* drawn broken below */
        var bandIdx = lk.w < .35 ? 0 : lk.w < .7 ? 1 : 2;
        bands[bandIdx].moveTo(lk.x0, lk.y0);
        bands[bandIdx].quadraticCurveTo(mx, my, lk.x1, lk.y1);
      }
      ctx.lineWidth = 1;
      var bandA = [.14, .26, .38];
      for (i = 0; i < 3; i++) { ctx.strokeStyle = 'rgba(' + LINE + ',' + q(bandA[i] * gain) + ')'; ctx.stroke(bands[i]); }
      /* links inside a patch that has lost step break up */
      ctx.setLineDash([2, 4]);
      for (i = 0; i < L; i++) {
        lk = links[i]; a = cells[lk.a]; b = cells[lk.b];
        var dl = (a.d + b.d) / 2;
        if (dl <= .25) continue;
        ctx.strokeStyle = 'rgba(' + SLATE + ',' + q(.42 * lk.w * gain) + ')';
        ctx.beginPath(); ctx.moveTo(lk.x0, lk.y0); ctx.quadraticCurveTo(lk.cx, lk.cy, lk.x1, lk.y1); ctx.stroke();
      }
      ctx.setLineDash([]);

      /* sky signals travelling along links */
      ctx.lineCap = 'round';
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
          var col = dAvg > .02 ? rgb(lerp3(PL.sky, PL.slate, sm(0, .7, dAvg))) : SKY;
          var wake = .16 * I * Math.sin(Math.min(p / 1.5, 1) * Math.PI);
          ctx.strokeStyle = 'rgba(' + col + ',' + q(wake) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(lk.x0, lk.y0); ctx.quadraticCurveTo(lk.cx, lk.cy, lk.x1, lk.y1); ctx.stroke();
          bez(lk.x0, lk.y0, lk.cx, lk.cy, lk.x1, lk.y1, ut, pt);
          var tx = pt[0], ty = pt[1];
          bez(lk.x0, lk.y0, lk.cx, lk.cy, lk.x1, lk.y1, uh, pt);
          var hx = pt[0], hy = pt[1];
          if (Math.abs(hx - tx) + Math.abs(hy - ty) < .5) continue;
          var gr = ctx.createLinearGradient(tx, ty, hx, hy);
          gr.addColorStop(0, 'rgba(' + col + ',0)');
          gr.addColorStop(1, 'rgba(' + col + ',' + q(.95 * I) + ')');
          ctx.strokeStyle = gr;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          for (var sg = 1; sg <= 6; sg++) {
            bez(lk.x0, lk.y0, lk.cx, lk.cy, lk.x1, lk.y1, ut + (uh - ut) * sg / 6, pt);
            ctx.lineTo(pt[0], pt[1]);
          }
          ctx.stroke();
          if (p <= 1) heads.push(hx, hy, I, dAvg);
        }
      }
      for (i = 0; i < heads.length; i += 4) {
        var hI = heads[i + 2], hd = heads[i + 3], hs = 6;
        if (hd < .3) {
          ctx.globalAlpha = q(.32 * hI * (1 - hd));
          ctx.drawImage(sp.hS, heads[i] - hs, heads[i + 1] - hs, hs * 2, hs * 2);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(' + (hd > .02 ? rgb(lerp3(PL.sky, PL.slate, sm(0, .7, hd))) : SKY) + ',' + q(.95 * hI) + ')';
        ctx.beginPath(); ctx.arc(heads[i], heads[i + 1], 1.5, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* cells */
      var n = cells.length;
      /* warm bloom as a wave passes (soft radial fill, normal compositing) */
      for (i = 0; i < n; i++) {
        c = cells[i];
        if (c.act < .04 || c.x < -60 || c.x > W + 60 || c.y < -60 || c.y > H + 60) continue;
        var Ib = c.w * gain * (1 - c.d);
        if (Ib < .02) continue;
        var gsz = c.r * (2 + 1.5 * c.act);
        ctx.globalAlpha = q(.2 * c.act * Ib);
        ctx.drawImage(c.hu < .5 ? sp.hO : sp.hA, c.x - gsz, c.y - gsz, gsz * 2, gsz * 2);
      }
      /* restoration: a sky flash where a wave pulls a cell back into step */
      for (i = 0; i < n; i++) {
        c = cells[i];
        if (c.fl < .03) continue;
        var fz = c.r * 3.4;
        ctx.globalAlpha = q(.32 * c.fl * c.w * gain);
        ctx.drawImage(sp.hS, c.x - fz, c.y - fz, fz * 2, fz * 2);
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      for (i = 0; i < n; i++) {
        c = cells[i];
        if (c.x < -60 || c.x > W + 60 || c.y < -60 || c.y > H + 60) continue;
        var I2 = c.w * gain;
        var base = c.d > .01 ? lerp3(c.col, PL.slate, sm(0, .85, c.d)) : c.col;
        var cc = rgb(base);
        var br = 1 + .1 * c.act;
        var rx = c.r * br, ry = c.r * c.ay * br, rot = c.rot + t * .02 * c.fq;
        /* cytoplasm */
        ctx.fillStyle = 'rgba(' + cc + ',' + q((.1 + .28 * c.act) * I2 * (1 - .35 * c.d)) + ')';
        ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, rot, 0, TAU); ctx.fill();
        /* membrane */
        ctx.strokeStyle = 'rgba(' + cc + ',' + q((.36 + .5 * c.act) * I2) + ')';
        ctx.stroke();
        /* depolarisation ring: the sky signal leaving the cell */
        if (c.tau < 1.8) {
          var rr = c.r * 1.1 + s * .22 * (1 - Math.exp(-c.tau * 2.1));
          var ra = .42 * Math.exp(-c.tau * 2.3) * I2 * (1 - .7 * c.d);
          if (ra > .015) {
            ctx.strokeStyle = 'rgba(' + (c.d > .05 ? SLATE : SKY) + ',' + q(ra) + ')';
            ctx.beginPath(); ctx.ellipse(c.x, c.y, rr, rr * (.9 + .1 * c.ay), c.rot, 0, TAU); ctx.stroke();
          }
        }
        if (c.fl > .03) {
          var fr2 = c.r * 1.1 + s * .34 * (1 - c.fl);
          ctx.strokeStyle = 'rgba(' + SKY + ',' + q(.7 * c.fl * c.w * gain) + ')';
          ctx.lineWidth = 1.25;
          ctx.beginPath(); ctx.arc(c.x, c.y, fr2, 0, TAU); ctx.stroke();
          ctx.lineWidth = 1;
        }
        /* nucleus */
        var nc = c.d > .01 ? lerp3(c.nuc, PL.slate, sm(0, .85, c.d)) : c.nuc;
        ctx.fillStyle = 'rgba(' + rgb(nc) + ',' + q((.5 + .45 * c.act) * I2) + ')';
        ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(1.1, c.r * .17) + .6 * c.act, 0, TAU); ctx.fill();
      }
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
          ctx.drawImage(i % 3 === 1 ? sp.bS : i % 3 === 2 ? sp.bO : sp.bA, bx2 - bo.r, by2 - bo.r, bo.r * 2, bo.r * 2);
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
    function evaluate() {
      if (!W) return;
      var locked = isLocked(), reduce = isReduced();
      var should = visible && !document.hidden && !locked && !reduce;
      if (should && !running) {
        running = true;
        last = performance.now();
        if (!raf) raf = requestAnimationFrame(frame);
      } else if (!should && running) {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }
      if (!locked && !shown) {
        shown = true;
        if (reduce) renderStatic(); else { update(1 / 60); render(); }
        requestAnimationFrame(function () { cv.style.opacity = '1'; });
      }
    }
    this.evaluate = evaluate;

    var rt = 0, lastW = 0, lastH = 0;
    function relayout() {
      var r = cv.getBoundingClientRect();
      var nw = Math.round(r.width), nh = Math.round(r.height);
      if (nw === lastW && nh === lastH) return;
      lastW = nw; lastH = nh;
      if (!nw || !nh) return;
      build();
      if (isReduced()) renderStatic(); else { update(1 / 60); render(); }
      evaluate();
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
    }
    if (mqReduce) {
      var onMQ = function () { if (isReduced()) { evaluate(); renderStatic(); } else evaluate(); };
      if (mqReduce.addEventListener) mqReduce.addEventListener('change', onMQ);
      else if (mqReduce.addListener) mqReduce.addListener(onMQ);
    }

    /* pointer: moving the cursor gently excites nearby cells (desktop, hero only) */
    if (finePointer && !calm) {
      window.addEventListener('pointermove', function (e) {
        if (!running || e.pointerType !== 'mouse') return;
        var r = cv.getBoundingClientRect();
        var x = e.clientX - r.left, y = e.clientY - r.top;
        if (x < 0 || y < 0 || x > r.width || y > r.height) { ptr.lx = null; return; }
        if (ptr.lx !== null) ptr.e = Math.min(1, ptr.e + Math.hypot(x - ptr.lx, y - ptr.ly) * .006);
        ptr.lx = x; ptr.ly = y;
        ptr.x = x; ptr.y = y;
        ptr.tx = -(x / r.width - .5) * 16;
        ptr.ty = -(y / r.height - .5) * 10;
      }, { passive: true });
    }
  }

  /* ---------- boot ---------- */
  var fields = [];
  function evalAll() { for (var i = 0; i < fields.length; i++) fields[i].evaluate(); }
  function boot() {
    var nodes = document.querySelectorAll('canvas[data-widget="hero-field"]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].__heroField) continue;
      if (!nodes[i].getContext) continue;
      nodes[i].__heroField = new Field(nodes[i]);
      fields.push(nodes[i].__heroField);
    }
    evalAll();
  }
  document.addEventListener('site:unlocked', function () { setTimeout(evalAll, 0); });
  document.addEventListener('visibilitychange', evalAll);
  if ('MutationObserver' in window) {
    new MutationObserver(evalAll).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

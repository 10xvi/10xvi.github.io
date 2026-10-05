/* 10X Vital Intelligence: "The closed loop" widget (light).
   Mount: <div data-widget="loop" role="img" aria-label="...">
   Syncs with <ol id="loop-steps"><li data-step="1..6">.
   Plain script, no dependencies, no network. */
(function () {
  'use strict';

  var NAMES = ['Sense', 'Understand', 'Plan', 'Act', 'Verify', 'Learn'];
  var VARS = ['--red', '--orange', '--amber', '--sky', '--indigo', '--blue'];
  var FALLBACK = ['#ef4444', '#f97316', '#f59e0b', '#0ea5e9', '#6366f1', '#3b82f6'];
  // text-safe twins of the step hues (shared -ink tokens) for small numbers on white or the tint
  var INK_VARS = ['--red-ink', '--orange-ink', '--amber-ink', '--sky-ink', '--indigo-ink', '--blue-ink'];
  var INK_FALLBACK = ['#b91c1c', '#c2410c', '#b45309', '#0369a1', '#4338ca', '#1d4ed8'];
  // phones and portrait tablets: the ring pins above the list and scrolling drives the active step
  var PIN_MQ = '(max-width: 960px) and (min-height: 600px)';
  var TAU = Math.PI * 2;
  var A0 = -Math.PI / 2;            // station 0 (Sense) at 12 o'clock
  var LEARN = 5;
  var DWELL = 2.1;                  // seconds resting on a station
  var TRAVEL = 1.3;                 // seconds between stations
  var NT = 120;                     // dial ticks

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { return 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1)); }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function mod(n, m) { return ((n % m) + m) % m; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- colour ---------- */
  function parseColor(s, fb) {
    s = (s || '').trim();
    var m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) {
      var h = m[1];
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    }
    m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
    if (m) return [+m[1], +m[2], +m[3]];
    return fb ? parseColor(fb) : [100, 116, 139];
  }
  function cssVar(name, fb) {
    var v = '';
    try { v = getComputedStyle(document.documentElement).getPropertyValue(name); } catch (e) { /* ignore */ }
    return parseColor(v, fb);
  }
  function toLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function toSrgb(l) { var v = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055; return Math.round(clamp(v, 0, 1) * 255); }
  function mixLin(a, b, t) {
    // mix in linear light so warm-to-cool transitions stay clean, not muddy
    return [
      toSrgb(toLin(a[0]) + (toLin(b[0]) - toLin(a[0])) * t),
      toSrgb(toLin(a[1]) + (toLin(b[1]) - toLin(a[1])) * t),
      toSrgb(toLin(a[2]) + (toLin(b[2]) - toLin(a[2])) * t)
    ];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')'; }
  function rgbStr(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  ready(function () {
    var mounts = document.querySelectorAll('[data-widget="loop"]');
    for (var i = 0; i < mounts.length; i++) {
      try { init(mounts[i], i === 0); } catch (e) { /* never break the page */ }
    }
  });

  function init(mount, ownsList) {
    if (mount.__loopInit) return;
    mount.__loopInit = true;

    // read live: turning the OS setting on mid-session stills the ring at once
    var rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduced = !!(rmq && rmq.matches);
    // forced colours (Windows contrast themes): the canvas is not recoloured by the browser, so the
    // figure redraws itself in the system palette, read live
    var fcq = window.matchMedia ? window.matchMedia('(forced-colors: active)') : null;
    var fc = !!(fcq && fcq.matches);

    /* ---------- palette ---------- */
    var C = [], INK = [], SLATE, LINE, LINE2, MUTED, HEAD, SKY, SKYD, BG, BGALT;
    var FG = [0, 0, 0], HL = [0, 0, 0];      // forced colours: CanvasText and Highlight
    var probe = null;
    function sysColor(name, fb) {
      // resolve a CSS system colour to rgb through a hidden probe that opts out of forcing
      if (!probe) {
        probe = document.createElement('span');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;forced-color-adjust:none;';
        mount.appendChild(probe);
      }
      probe.style.color = fb;
      probe.style.color = name;
      var v = '';
      try { v = getComputedStyle(probe).color; } catch (e) { /* ignore */ }
      return parseColor(v, fb);
    }
    function readPalette() {
      fc = !!(fcq && fcq.matches);
      for (var k = 0; k < 6; k++) {
        C[k] = cssVar(VARS[k], FALLBACK[k]);
        INK[k] = cssVar(INK_VARS[k], INK_FALLBACK[k]);
      }
      SLATE = cssVar('--muted', '#64748b');
      MUTED = SLATE;
      LINE = cssVar('--line', '#e2e8f0');
      LINE2 = cssVar('--line-2', '#cbd5e1');
      HEAD = cssVar('--head', '#0f172a');
      SKY = cssVar('--sky', '#0ea5e9');
      SKYD = cssVar('--sky-deep', '#0284c7');
      BG = cssVar('--bg', '#ffffff');
      BGALT = cssVar('--bg-alt', '#f8fafc');
      if (fc) {
        // structure in CanvasText (secondary hairlines in GrayText), the signal and the active step in
        // Highlight, fills in Canvas so nothing paints an opaque light disc on a dark theme
        FG = sysColor('CanvasText', '#ffffff');
        HL = sysColor('Highlight', '#1aebff');
        var can = sysColor('Canvas', '#000000');
        var gray = sysColor('GrayText', '#a0a0a0');
        for (k = 0; k < 6; k++) C[k] = HL;
        SLATE = MUTED = HEAD = SKYD = FG;
        LINE = LINE2 = gray;
        SKY = HL;
        BG = BGALT = can;
      }
    }
    readPalette();
    // colour of the signal at loop position pos: holds a station's colour, then blends into the next on approach
    function colorAt(pos) {
      var f0 = Math.floor(pos), k = mod(f0, 6), f = pos - f0;
      var t = clamp((f - 0.45) / 0.5, 0, 1);
      t = t * t * (3 - 2 * t);
      if (t <= 0) return C[k];
      if (t >= 1) return C[(k + 1) % 6];
      return mixLin(C[k], C[(k + 1) % 6], t);
    }

    /* ---------- DOM ---------- */
    var stage = document.createElement('div');
    stage.className = 'lp-stage';
    stage.setAttribute('aria-hidden', 'true');
    var canvas = document.createElement('canvas');
    canvas.className = 'lp-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    stage.appendChild(canvas);

    var labels = [];
    for (var i = 0; i < 6; i++) {
      var lb = document.createElement('div');
      lb.className = 'lp-label lp-pos-' + (i === 0 ? 'top' : i === 3 ? 'bottom' : (i < 3 ? 'right' : 'left'));
      var num = document.createElement('span');
      num.className = 'lp-num';
      num.textContent = pad2(i + 1);
      var nm = document.createElement('span');
      nm.className = 'lp-name';
      nm.textContent = NAMES[i];
      lb.appendChild(num);
      lb.appendChild(nm);
      stage.appendChild(lb);
      labels.push(lb);
    }
    var core = document.createElement('div');
    core.className = 'lp-core';
    core.innerHTML = '<span>Vital World</span> <span>Model</span>';
    stage.appendChild(core);
    mount.appendChild(stage);

    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var bg = document.createElement('canvas');     // static layer, redrawn on layout only
    var bctx = bg.getContext('2d');

    var list = ownsList ? document.getElementById('loop-steps') : null;
    var items = list ? Array.prototype.slice.call(list.querySelectorAll('li')) : [];
    items.sort(function (a, b) {
      return (parseInt(a.getAttribute('data-step'), 10) || 0) - (parseInt(b.getAttribute('data-step'), 10) || 0);
    });
    items = items.slice(0, 6);

    function applyStepColors() {
      for (var k = 0; k < 6; k++) {
        labels[k].style.setProperty('--lp-c', rgbStr(C[k]));
        labels[k].style.setProperty('--lp-ink', rgbStr(INK[k]));
        if (items[k]) {
          items[k].style.setProperty('--lp-c', rgbStr(C[k]));
          items[k].style.setProperty('--lp-ink', rgbStr(INK[k]));
          items[k].style.setProperty('--lp-soft', rgba(C[k], 0.07));
          items[k].style.setProperty('--lp-soft-0', rgba(C[k], 0));
        }
      }
    }
    applyStepColors();

    /* ---------- geometry ---------- */
    var W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 100, r0 = 40, Rf = 120, compact = false, bare = false, inner = false, sc = 1, s = 1;
    var sx = [], sy = [];

    function stationAngle(q) { return A0 + q * TAU / 6; }
    var POS = ['top', 'bottom', 'left', 'right'];
    function setPos(lb, pos) {
      for (var q = 0; q < 4; q++) lb.classList.toggle('lp-pos-' + POS[q], POS[q] === pos);
    }

    function layout() {
      var rect = mount.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      bg.width = canvas.width;
      bg.height = canvas.height;
      cx = W / 2; cy = H / 2;

      // a short, wide mount (the pinned ring on phones): the numbers move inside the track,
      // so the dial can use the whole height instead of giving a row above and below to labels
      inner = W > H * 1.3;
      mount.classList.toggle('lp-inner', inner);
      compact = inner || W < 440;
      mount.classList.toggle('lp-compact', compact);

      // measure labels so the dial is as large as the labels allow
      var leftW = 0, rightW = 0, topH = 0, botH = 0;
      for (var i = 0; i < 6; i++) {
        var w = labels[i].offsetWidth, h = labels[i].offsetHeight;
        if (i === 0) topH = h;
        else if (i === 3) botH = h;
        else if (i < 3) rightW = Math.max(rightW, w);
        else leftW = Math.max(leftW, w);
      }
      var pad = 4, clear = compact ? 7 : 10;
      // with names beside the ring, keep a clear margin to the column edge on both sides and centre the
      // ring together with its labels: 'Understand' on the right is far wider than 'Verify' on the left,
      // so the dial moves a little toward the shorter side (by at most 24px, so the well stays central)
      var padX = compact ? pad : 16;
      var shift = compact ? 0 : clamp((leftW - rightW) / 2, -24, 24);
      var faceExt = function (r) { return Math.max(17, 22 * Math.max(0.8, r / 200)); };
      R = Math.min(W, H) * 0.4;
      for (var it = 0; it < 4; it++) {
        var fe = faceExt(R);
        var gapV = fe + clear;
        var gapS = Math.sqrt(Math.pow(R + fe + clear, 2) - Math.pow(R / 2, 2)) - R * Math.cos(Math.PI / 6);
        var room = Math.min(W / 2 - padX - rightW - shift, W / 2 - padX - leftW + shift);
        var rH = (room - gapS) / Math.cos(Math.PI / 6);
        var rV = Math.min(H / 2 - pad - gapV - topH, H / 2 - pad - gapV - botH);
        R = Math.max(60, Math.min(rH, rV, Math.min(W, H) * 0.4));
      }
      cx = W / 2 + shift;
      if (inner) {
        pad = 8;
        R = Math.min(W, H) / 2 - pad - 17;
        for (it = 0; it < 3; it++) R = Math.min(W, H) / 2 - pad - faceExt(R);
        R = Math.max(36, R);
      }
      s = R / 200;
      sc = Math.max(0.8, s);
      Rf = R + faceExt(R);
      r0 = R * (inner ? 0.42 : compact ? 0.55 : 0.47);
      var gV = Rf + clear - R;
      var gS = Math.sqrt(Math.pow(Rf + clear, 2) - Math.pow(R / 2, 2)) - R * Math.cos(Math.PI / 6);

      var gIn = 12;
      for (i = 0; i < 6; i++) {
        var a = stationAngle(i);
        sx[i] = cx + Math.cos(a) * R;
        sy[i] = cy + Math.sin(a) * R;
        var lx = sx[i], ly = sy[i], pos;
        if (inner) {
          // inside the track, clear of the bead's glow; side numbers lean away from the radial feed line
          if (i === 0) { ly += gIn; pos = 'bottom'; }
          else if (i === 3) { ly -= gIn; pos = 'top'; }
          else if (i < 3) { lx -= gIn; ly += i === 1 ? -2 : 2; pos = 'left'; }
          else { lx += gIn; ly += i === 5 ? -2 : 2; pos = 'right'; }
        } else {
          if (i === 0) { ly -= gV; pos = 'top'; }
          else if (i === 3) { ly += gV; pos = 'bottom'; }
          else if (i < 3) { lx += gS; pos = 'right'; }
          else { lx -= gS; pos = 'left'; }
        }
        setPos(labels[i], pos);
        labels[i].style.left = lx.toFixed(1) + 'px';
        labels[i].style.top = ly.toFixed(1) + 'px';
      }
      // a well too small for the caption (the pinned ring on phones) shows the model alone, centred
      bare = inner || r0 * 2 < 100;
      mount.classList.toggle('lp-bare', bare);
      core.style.left = cx + 'px';
      core.style.top = (cy + r0 * (compact ? 0.52 : 0.56)) + 'px';
      core.style.width = Math.max(96, r0 * 1.5) + 'px';

      buildModel();
      drawStatic();
      draw();
    }

    /* ---------- the Vital World Model: a slowly turning point mesh ---------- */
    var NM = 46, mPts = [], mEdges = [];
    (function seedModel() {
      var golden = Math.PI * (3 - Math.sqrt(5)), k, j;
      for (k = 0; k < NM; k++) {
        var y = 1 - (k + 0.5) / NM * 2, r = Math.sqrt(1 - y * y), ph = k * golden;
        mPts.push({ x: Math.cos(ph) * r, y: y, z: Math.sin(ph) * r, d: 0, df: 0, dt: 0 });
      }
      var seen = {};
      for (k = 0; k < NM; k++) {
        var near = [];
        for (j = 0; j < NM; j++) {
          if (j === k) continue;
          var dx = mPts[j].x - mPts[k].x, dy = mPts[j].y - mPts[k].y, dz = mPts[j].z - mPts[k].z;
          near.push([dx * dx + dy * dy + dz * dz, j]);
        }
        near.sort(function (u, v) { return u[0] - v[0]; });
        for (j = 0; j < 3; j++) {
          var key = Math.min(k, near[j][1]) + '-' + Math.max(k, near[j][1]);
          if (!seen[key]) { seen[key] = 1; mEdges.push([k, near[j][1]]); }
        }
      }
    })();
    var modelSeed = 7;
    function rand() { modelSeed = (modelSeed * 16807) % 2147483647; return (modelSeed - 1) / 2147483646; }
    function retargetModel() {
      for (var k = 0; k < NM; k++) {
        var n = mPts[k];
        n.df = n.d;
        n.dt = (rand() - 0.5) * 0.16;
      }
      modelMorph = 0;
    }
    var rc = 20, mcx = 0, mcy = 0;
    function buildModel() {
      rc = r0 * (inner ? 0.58 : bare ? 0.5 : compact ? 0.34 : 0.4);
      mcx = cx;
      mcy = bare ? cy : cy - r0 * (compact ? 0.2 : 0.17);
    }

    /* ---------- motion state ---------- */
    var p = 0, tail = 0, prevP = 0;          // head position in station units (continuous)
    var mode = 'dwell';                       // dwell | travel | hold
    var tMode = 0, fromP = 0, toP = 0, travelDur = TRAVEL;
    var active = 0;
    var tickGlow = new Float32Array(NT);
    var chevGlow = new Float32Array(6);
    var stGlow = [1, 0, 0, 0, 0, 0];
    var arrive = [0, 0, 0, 0, 0, 0];          // arrival ripple progress (0 = none)
    var feed = -1;                            // Learn -> model pulse progress, -1 idle
    var feedDelay = 0;
    var modelPulse = 0, ripple = -1, modelMorph = 1, clock = 0;
    var hovering = -1;

    function nearest() { return mod(Math.round(p), 6); }

    function setActive(i) {
      if (i === active && labels[i].classList.contains('is-active')) return;
      active = i;
      for (var k = 0; k < 6; k++) {
        labels[k].classList.toggle('is-active', k === i);
        if (items[k]) {
          items[k].classList.toggle('is-active', k === i);
          if (k === i) items[k].setAttribute('aria-current', 'step');
          else items[k].removeAttribute('aria-current');
        }
      }
    }

    function onArrive(i) {
      arrive[i] = 0.0001;
      if (i === LEARN) { feedDelay = 0.25; feed = -2; }
    }

    function goTo(k) {
      // shortest way round to station k
      var base = Math.round(p);
      // ties (three stations away) go forward, in the direction the loop runs
      var dlt = mod(k - mod(base, 6), 6); if (dlt > 3) dlt -= 6;
      var cand = base + dlt;
      if (Math.abs(cand - p) < 0.001 && mode !== 'travel') { mode = 'hold'; return; }
      fromP = p; toP = cand; tMode = 0;
      travelDur = 0.45 + 0.16 * Math.abs(cand - p);
      mode = 'travel';
    }

    function step(dt) {
      clock += dt;
      prevP = p;
      tMode += dt;

      if (mode === 'dwell') {
        if (hovering < 0 && tMode >= DWELL) {
          fromP = Math.round(p); toP = fromP + 1; tMode = 0; travelDur = TRAVEL; mode = 'travel';
        }
      }
      if (mode === 'travel') {
        var t = tMode / travelDur;
        p = fromP + (toP - fromP) * ease(t);
        if (t >= 1) {
          p = toP;
          onArrive(mod(toP, 6));
          mode = hovering >= 0 ? 'hold' : 'dwell';
          tMode = 0;
        }
      }
      // keep numbers small
      if (p >= 6 && mode !== 'travel') { p -= 6; prevP -= 6; tail -= 6; fromP -= 6; toP -= 6; }
      if (p < 0 && mode !== 'travel') { p += 6; prevP += 6; tail += 6; fromP += 6; toP += 6; }

      // trail tail chases head
      tail += (p - tail) * (1 - Math.exp(-dt / 0.34));
      if (Math.abs(p - tail) < 0.0005) tail = p;

      // ticks and chevrons light as the head passes
      var decayT = Math.exp(-dt / 1.1), decayC = Math.exp(-dt / 0.9);
      for (var i = 0; i < NT; i++) tickGlow[i] *= decayT;
      for (i = 0; i < 6; i++) chevGlow[i] *= decayC;
      var a = prevP * NT / 6, b = p * NT / 6;
      if (Math.abs(b - a) > 1e-4) {
        var lo = Math.min(a, b), hi = Math.max(a, b);
        for (var tk = Math.ceil(lo); tk <= Math.floor(hi); tk++) tickGlow[mod(tk, NT)] = 1;
        var ca = prevP - 0.5, cb = p - 0.5;
        var clo = Math.min(ca, cb), chi = Math.max(ca, cb);
        for (var ck = Math.ceil(clo); ck <= Math.floor(chi); ck++) chevGlow[mod(ck, 6)] = 1;
      }

      // station state follows the head physically
      for (i = 0; i < 6; i++) {
        var d = Math.abs(p - i); d = Math.min(mod(d, 6), 6 - mod(d, 6));
        var target = clamp(1 - d / 0.42, 0, 1);
        stGlow[i] += (target - stGlow[i]) * (1 - Math.exp(-dt / 0.12));
        if (arrive[i] > 0) { arrive[i] += dt / 1.4; if (arrive[i] >= 1) arrive[i] = 0; }
      }
      // a hovered/focused step stays lit in the list at once; the head still travels to it
      setActive(hovering >= 0 ? hovering : nearest());

      // Learn feeds the model
      if (feed === -2) {
        feedDelay -= dt;
        if (feedDelay <= 0) feed = 0;
      } else if (feed >= 0) {
        feed += dt / 1.05;
        if (feed >= 1) {
          feed = -1; modelPulse = 1; ripple = 0; retargetModel();
        }
      }
      modelPulse *= Math.exp(-dt / 1.3);
      if (ripple >= 0) { ripple += dt / 1.8; if (ripple >= 1) ripple = -1; }
      if (modelMorph < 1) modelMorph = Math.min(1, modelMorph + dt / 1.8);
      var mm = ease(modelMorph);
      for (i = 0; i < NM; i++) mPts[i].d = mPts[i].df + (mPts[i].dt - mPts[i].df) * mm;
    }

    /* ---------- drawing ---------- */
    function polar(r, a) { return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }

    function chevronPath(c, ang, size) {
      var x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R;
      var tx = -Math.sin(ang), ty = Math.cos(ang);   // clockwise tangent
      var nx = Math.cos(ang), ny = Math.sin(ang);    // outward normal
      var tipx = x + tx * size * 0.55, tipy = y + ty * size * 0.55;
      c.beginPath();
      c.moveTo(tipx - tx * size + nx * size * 0.8, tipy - ty * size + ny * size * 0.8);
      c.lineTo(tipx, tipy);
      c.lineTo(tipx - tx * size - nx * size * 0.8, tipy - ty * size - ny * size * 0.8);
    }

    var tickR = { t1: 0, minor: 0, major: 0 };

    /* static layer: dial plate, scale, coloured track, direction marks, model well */
    function drawStatic() {
      var c = bctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, bg.width, bg.height);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      var i, a, pt, pt2;

      // dial plate: white, soft layered shadow, slate hairline (forced colours: the outline alone)
      if (!fc) {
        c.save();
        c.beginPath(); c.arc(cx, cy, Rf, 0, TAU);
        c.fillStyle = rgbStr(BG);
        c.shadowColor = 'rgba(15,23,42,0.10)';
        c.shadowBlur = 30 * sc * dpr;
        c.shadowOffsetY = 12 * sc * dpr;
        c.fill();
        c.shadowColor = 'rgba(15,23,42,0.06)';
        c.shadowBlur = 3 * dpr;
        c.shadowOffsetY = 1 * dpr;
        c.fill();
        c.restore();
        // faint warm-to-sky wash so the plate is not flat white
        var wash = c.createLinearGradient(cx - Rf, cy - Rf, cx + Rf, cy + Rf);
        wash.addColorStop(0, rgba(C[1], 0.035));
        wash.addColorStop(0.5, rgba(BG, 0));
        wash.addColorStop(1, rgba(SKY, 0.035));
        c.beginPath(); c.arc(cx, cy, Rf, 0, TAU);
        c.fillStyle = wash; c.fill();
      }
      c.beginPath(); c.arc(cx, cy, Rf, 0, TAU);
      c.lineWidth = 1;
      c.strokeStyle = rgbStr(LINE);
      c.stroke();
      // inner bezel hairline (decorative: left out in forced colours)
      if (!fc) {
        c.beginPath(); c.arc(cx, cy, Rf - 4 * sc, 0, TAU);
        c.strokeStyle = rgba(LINE, 0.7);
        c.stroke();
      }

      // scale ticks
      tickR.t1 = R + 7 * sc;
      tickR.minor = R + 11 * sc;
      tickR.major = R + 15.5 * sc;
      c.lineCap = 'butt';
      c.beginPath();
      for (i = 0; i < NT; i++) {
        if (i % (NT / 6) === 0) continue;
        a = A0 + i / NT * TAU;
        var r2 = (i % 5 === 0) ? tickR.minor + 2 : tickR.minor;
        pt = polar(tickR.t1, a); pt2 = polar(r2, a);
        c.moveTo(pt[0], pt[1]); c.lineTo(pt2[0], pt2[1]);
      }
      c.strokeStyle = rgba(LINE2, 0.95);
      c.lineWidth = 1;
      c.stroke();
      // station index ticks in each step's colour
      for (i = 0; i < 6; i++) {
        a = stationAngle(i);
        pt = polar(tickR.t1, a); pt2 = polar(tickR.major, a);
        c.beginPath(); c.moveTo(pt[0], pt[1]); c.lineTo(pt2[0], pt2[1]);
        c.strokeStyle = fc ? rgbStr(FG) : rgba(C[i], 0.9);
        c.lineWidth = 1.5;
        c.stroke();
      }
      c.lineCap = 'round';

      // base track: neutral hairline with each step's colour washed in
      c.beginPath(); c.arc(cx, cy, R, 0, TAU);
      if (fc) {
        // forced colours: one solid CanvasText track, no colour wash
        c.strokeStyle = rgbStr(FG);
        c.lineWidth = 1.5;
        c.stroke();
      } else {
        c.strokeStyle = rgbStr(LINE);
        c.lineWidth = 3 * sc;
        c.stroke();
      }
      if (fc) { /* no wash */ } else if (c.createConicGradient) {
        var g = c.createConicGradient(A0, cx, cy);
        for (i = 0; i <= 48; i++) g.addColorStop(i / 48, rgba(colorAt(i / 8), 0.55));
        c.beginPath(); c.arc(cx, cy, R, 0, TAU);
        c.strokeStyle = g;
        c.lineWidth = 1.5;
        c.stroke();
      } else {
        for (i = 0; i < 6; i++) {
          c.beginPath(); c.arc(cx, cy, R, stationAngle(i), stationAngle(i + 1));
          c.strokeStyle = rgba(C[i], 0.55);
          c.lineWidth = 1.5;
          c.stroke();
        }
      }

      // direction chevrons midway between stations
      var chev = Math.max(3.2, 4.2 * s);
      for (i = 0; i < 6; i++) {
        chevronPath(c, stationAngle(i + 0.5), chev);
        c.strokeStyle = rgba(SLATE, fc ? 0.9 : 0.55);
        c.lineWidth = 1.25;
        c.stroke();
      }

      // Learn -> model feed line
      var la = stationAngle(LEARN);
      var f0 = polar(R - 10 * sc, la), f1 = polar(r0 + 7, la);
      c.save();
      c.setLineDash([1.5, 4.5]);
      c.beginPath(); c.moveTo(f0[0], f0[1]); c.lineTo(f1[0], f1[1]);
      c.strokeStyle = rgba(SLATE, 0.5);
      c.lineWidth = 1;
      c.stroke();
      c.restore();
      var ux = -Math.cos(la), uy = -Math.sin(la), px = -uy, py = ux, sz = Math.max(3, 3.6 * s);
      c.beginPath();
      c.moveTo(f1[0] - ux * sz + px * sz * 0.75, f1[1] - uy * sz + py * sz * 0.75);
      c.lineTo(f1[0], f1[1]);
      c.lineTo(f1[0] - ux * sz - px * sz * 0.75, f1[1] - uy * sz - py * sz * 0.75);
      c.strokeStyle = fc ? rgbStr(FG) : rgba(C[LEARN], 0.75);
      c.lineWidth = 1.25;
      c.stroke();

      if (fc) {
        // forced colours: the well is an outline only, no light fill and no shadows
        c.beginPath(); c.arc(cx, cy, r0, 0, TAU);
        c.strokeStyle = rgbStr(LINE);
        c.lineWidth = 1;
        c.stroke();
        return;
      }

      // station bead shadows (beads themselves are drawn per frame)
      var srS = Math.max(5, 6.8 * s);
      c.save();
      c.shadowColor = 'rgba(15,23,42,0.18)';
      c.shadowBlur = 4 * dpr;
      c.shadowOffsetY = 1 * dpr;
      c.fillStyle = rgbStr(BG);
      for (i = 0; i < 6; i++) { c.beginPath(); c.arc(sx[i], sy[i], srS, 0, TAU); c.fill(); }
      c.restore();

      // model well: a recessed light disc
      var wg = c.createRadialGradient(cx, cy - r0 * 0.25, r0 * 0.1, cx, cy, r0);
      wg.addColorStop(0, rgbStr(BG));
      wg.addColorStop(1, rgbStr(BGALT));
      c.beginPath(); c.arc(cx, cy, r0, 0, TAU);
      c.fillStyle = wg; c.fill();
      c.save();
      c.clip();
      // inset shadow along the top rim
      c.beginPath(); c.arc(cx, cy, r0 + 12, 0, TAU);
      c.arc(cx, cy + 1, r0, 0, TAU, true);
      c.shadowColor = 'rgba(15,23,42,0.07)';
      c.shadowBlur = 8 * dpr;
      c.shadowOffsetY = 2 * dpr;
      c.fillStyle = rgbStr(BG);
      c.fill();
      c.restore();
      c.beginPath(); c.arc(cx, cy, r0, 0, TAU);
      c.strokeStyle = rgbStr(LINE);
      c.lineWidth = 1;
      c.stroke();
    }

    function softDot(x, y, r, col, a) {
      if (a <= 0.004 || fc) return;        // decorative glow: none in forced colours
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }

    function draw() {
      if (!W) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      var i, a, pt, pt2;

      /* lit scale ticks */
      ctx.lineCap = 'butt';
      ctx.lineWidth = 1.25;
      for (i = 0; i < NT; i++) {
        if (tickGlow[i] < 0.02 || i % (NT / 6) === 0) continue;
        a = A0 + i / NT * TAU;
        var r3 = (i % 5 === 0) ? tickR.minor + 2 : tickR.minor;
        pt = polar(tickR.t1, a); pt2 = polar(r3, a);
        ctx.beginPath(); ctx.moveTo(pt[0], pt[1]); ctx.lineTo(pt2[0], pt2[1]);
        ctx.strokeStyle = rgba(colorAt(i * 6 / NT), 0.9 * tickGlow[i]);
        ctx.stroke();
      }
      ctx.lineCap = 'round';

      /* lit chevrons */
      var chev = Math.max(3.2, 4.2 * s);
      for (i = 0; i < 6; i++) {
        if (chevGlow[i] < 0.02) continue;
        chevronPath(ctx, stationAngle(i + 0.5), chev);
        ctx.strokeStyle = rgba(colorAt(i + 0.5), chevGlow[i]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      /* Learn -> model pulse */
      if (feed >= 0) {
        var la = stationAngle(LEARN);
        var f0 = polar(R - 10 * sc, la), f1 = polar(r0 + 7, la);
        var fe = ease(feed);
        var ex = f0[0] + (f1[0] - f0[0]) * fe, ey = f0[1] + (f1[1] - f0[1]) * fe;
        var bt = Math.max(0, fe - 0.25);
        var bx = f0[0] + (f1[0] - f0[0]) * bt, by = f0[1] + (f1[1] - f0[1]) * bt;
        var lg = ctx.createLinearGradient(bx, by, ex, ey);
        lg.addColorStop(0, rgba(C[LEARN], 0));
        lg.addColorStop(1, rgba(C[LEARN], 0.95));
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey);
        ctx.strokeStyle = lg; ctx.lineWidth = 2; ctx.stroke();
        var fade = Math.min(1, (1 - feed) * 6);
        softDot(ex, ey, 8, C[LEARN], 0.22 * fade);
        ctx.beginPath(); ctx.arc(ex, ey, 2.6, 0, TAU);
        ctx.fillStyle = rgba(C[LEARN], fade); ctx.fill();
      }

      /* trail: takes on each station's colour as it passes */
      var span = p - tail;
      if (Math.abs(span) > 0.004) {
        var cw = span > 0;
        var lo = cw ? tail : p, hi = cw ? p : tail;
        var start = stationAngle(lo), end = stationAngle(hi);
        var frac = (end - start) / TAU;
        ctx.lineCap = 'butt';
        if (ctx.createConicGradient) {
          var grad = ctx.createConicGradient(start, cx, cy);
          var n = 12;
          for (var j = 0; j <= n; j++) {
            var f = j / n;
            var al = cw ? Math.pow(f, 1.3) : Math.pow(1 - f, 1.3);
            grad.addColorStop(f * frac, rgba(colorAt(lo + f * (hi - lo)), al));
          }
          grad.addColorStop(Math.min(1, frac + 0.0005), rgba(BG, 0));
          ctx.beginPath(); ctx.arc(cx, cy, R, start, end);
          ctx.strokeStyle = grad;
          ctx.globalAlpha = 0.18; ctx.lineWidth = 7 * sc; ctx.stroke();
          ctx.globalAlpha = 1; ctx.lineWidth = 2.25; ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(cx, cy, R, start, end);
          ctx.strokeStyle = rgba(colorAt(p), 0.8); ctx.lineWidth = 2.25; ctx.stroke();
        }
        ctx.lineCap = 'round';
      }

      /* stations */
      var sr = Math.max(5, 6.8 * s);
      for (i = 0; i < 6; i++) {
        var gv = stGlow[i];
        var x = sx[i], y = sy[i], col = C[i];
        if (arrive[i] > 0) {
          var ar = easeOut(arrive[i]);
          ctx.beginPath(); ctx.arc(x, y, sr + 3 + ar * 18 * sc, 0, TAU);
          ctx.strokeStyle = rgba(col, 0.5 * (1 - arrive[i]));
          ctx.lineWidth = 1.25; ctx.stroke();
        }
        if (gv > 0.01) {
          softDot(x, y, 20 * sc, col, 0.16 * gv);
          ctx.beginPath(); ctx.arc(x, y, sr + 5.5 * sc, 0, TAU);
          ctx.strokeStyle = rgba(col, 0.38 * gv); ctx.lineWidth = 1; ctx.stroke();
        }
        // white bead (its drop shadow lives in the static layer)
        ctx.beginPath(); ctx.arc(x, y, sr, 0, TAU);
        ctx.fillStyle = rgbStr(BG); ctx.fill();
        // fill rises with activity
        if (gv > 0.01) {
          ctx.beginPath(); ctx.arc(x, y, sr, 0, TAU);
          ctx.fillStyle = rgba(col, gv); ctx.fill();
        }
        // forced colours: resting stations in CanvasText, the lit one in Highlight
        var ring = fc && gv <= 0.5 ? FG : col;
        ctx.beginPath(); ctx.arc(x, y, sr - 0.75, 0, TAU);
        ctx.strokeStyle = rgbStr(ring); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.6, sr * 0.32), 0, TAU);
        ctx.fillStyle = gv > 0.5 ? rgba(BG, gv) : rgba(ring, 1 - gv * 2);
        ctx.fill();
      }
      /* dwell sweep around the resting station */
      if (mode === 'dwell' && !reduced) {
        var dp = clamp(tMode / DWELL, 0, 1);
        var fadeIn = clamp(tMode / 0.3, 0, 1) * clamp((DWELL - tMode) / 0.15, 0, 1);
        var st = nearest();
        ctx.beginPath(); ctx.arc(sx[st], sy[st], sr + 5.5 * sc, -Math.PI / 2, -Math.PI / 2 + dp * TAU);
        ctx.strokeStyle = rgba(C[st], 0.95 * fadeIn); ctx.lineWidth = 1.5; ctx.stroke();
      }

      /* head: the signal, in the colour of where it is */
      var hc = colorAt(p);
      var ha = stationAngle(p);
      var hx = cx + Math.cos(ha) * R, hy = cy + Math.sin(ha) * R;
      var moving = Math.abs(p - Math.round(p)) > 0.02;
      if (moving) {
        softDot(hx, hy, 13 * sc, hc, 0.28);
        ctx.beginPath(); ctx.arc(hx, hy, Math.max(3.4, 4.2 * s), 0, TAU);
        ctx.fillStyle = rgbStr(hc); ctx.fill();
        ctx.beginPath(); ctx.arc(hx, hy, Math.max(3.4, 4.2 * s), 0, TAU);
        ctx.strokeStyle = rgbStr(BG); ctx.lineWidth = 1.5; ctx.stroke();
      }

      drawModel();
    }

    function drawModel() {
      var mp = modelPulse;
      if (mp > 0.01) {
        ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU);
        ctx.strokeStyle = rgba(SKY, 0.7 * mp); ctx.lineWidth = 1 + 1.25 * mp; ctx.stroke();
      }
      // fine inner dial, slowly turning
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(clock * 0.035);
      ctx.setLineDash([1, 5]);
      ctx.beginPath(); ctx.arc(0, 0, r0 - 7, 0, TAU);
      ctx.strokeStyle = rgba(SLATE, 0.35 + 0.25 * mp); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      // ripple landing
      if (ripple >= 0) {
        var rr = easeOut(ripple);
        ctx.beginPath(); ctx.arc(cx, cy, r0 * (0.2 + 0.8 * rr), 0, TAU);
        ctx.strokeStyle = rgba(SKY, 0.5 * (1 - ripple)); ctx.lineWidth = 1.25; ctx.stroke();
      }
      // the model: a point mesh turning slowly on a tilted axis
      var rot = clock * 0.16 + 0.6, tilt = -0.42;
      var cr = Math.cos(rot), sn = Math.sin(rot), ct = Math.cos(tilt), st = Math.sin(tilt);
      var scale = rc * (1 + 0.05 * mp);
      var X = [], Y = [], Z = [];
      for (var k = 0; k < NM; k++) {
        var nn = mPts[k], f = 1 + nn.d;
        var x = nn.x * f, y = nn.y * f, z = nn.z * f;
        var x1 = x * cr + z * sn, z1 = -x * sn + z * cr;
        var y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
        X[k] = mcx + x1 * scale; Y[k] = mcy + y2 * scale; Z[k] = (z2 + 1) / 2;
      }
      softDot(mcx, mcy, scale * 1.35, SKY, 0.07 + 0.1 * mp);
      ctx.lineWidth = 1;
      for (k = 0; k < mEdges.length; k++) {
        var e0 = mEdges[k][0], e1 = mEdges[k][1];
        var dz = (Z[e0] + Z[e1]) / 2;
        ctx.beginPath(); ctx.moveTo(X[e0], Y[e0]); ctx.lineTo(X[e1], Y[e1]);
        ctx.strokeStyle = dz > 0.5
          ? rgba(SKYD, (0.12 + 0.42 * (dz - 0.5) * 2) * (1 + 0.6 * mp))
          : rgba(SLATE, 0.08 + 0.18 * dz);
        ctx.stroke();
      }
      for (k = 0; k < NM; k++) {
        var zz = Z[k];
        ctx.beginPath(); ctx.arc(X[k], Y[k], 0.7 + 1.15 * zz, 0, TAU);
        ctx.fillStyle = zz > 0.45 ? rgba(SKYD, 0.25 + 0.7 * zz * zz + 0.15 * mp) : rgba(SLATE, 0.18 + 0.3 * zz);
        ctx.fill();
      }
    }

    /* ---------- run control ---------- */
    var raf = 0, last = 0, inView = true;
    function locked() { return document.documentElement.classList.contains('gate-locked'); }
    // the site-wide "Pause animations" control (html.motion-paused, announced by 'site:motion')
    function paused() { return document.documentElement.classList.contains('motion-paused'); }
    function shouldRun() { return !reduced && !paused() && inView && !locked() && !document.hidden && W > 0; }
    function frame(now) {
      raf = 0;
      if (!shouldRun()) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }
    function update() {
      if (shouldRun()) {
        if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
      } else if (raf) {
        cancelAnimationFrame(raf); raf = 0;
      }
    }

    /* static frame for reduced motion: Learn has just closed the loop into Sense */
    function staticFrame(k) {
      p = k; tail = k - 0.7; prevP = p;
      for (var i = 0; i < NT; i++) {
        var tp = i * 6 / NT;
        var d = mod(p - tp, 6);
        tickGlow[i] = d <= 0.7 ? (1 - d / 0.7) * 0.9 : 0;
      }
      for (i = 0; i < 6; i++) {
        var dc = mod(p - (i + 0.5), 6);
        chevGlow[i] = dc <= 0.7 ? 0.8 : 0;
        stGlow[i] = i === mod(k, 6) ? 1 : 0;
        arrive[i] = 0;
      }
      modelPulse = 0.35; ripple = -1; feed = -1;
      setActive(mod(k, 6));
      draw();
    }

    /* ---------- interaction ---------- */
    function hoverStation(k) {
      hovering = k;
      if (reduced) { staticFrame(k); return; }
      if (paused()) {
        // paused: no travel, the ring shows the chosen step at once and stays there
        staticFrame(k); mode = 'hold'; tMode = 0;
        return;
      }
      goTo(k);
      setActive(k);
      if (!raf) draw();
    }
    function release(k) {
      if (hovering !== k) return;
      hovering = -1;
      if (reduced) return;
      if (mode === 'hold') { mode = 'dwell'; tMode = 0; }
    }
    // pointer or focus let go: fall back to the step that scrolling has pinned, if any
    var scrollK = -1;
    function letGo(k) {
      release(k);
      if (hovering < 0 && scrollK >= 0) hoverStation(scrollK);
    }
    // the list stays in natural reading order: pointer hover syncs the ring, no extra tab stops
    items.forEach(function (li, k) {
      li.addEventListener('mouseenter', function () { hoverStation(k); });
      li.addEventListener('mouseleave', function () { if (document.activeElement !== li && !li.contains(document.activeElement)) letGo(k); });
      li.addEventListener('focusin', function () { hoverStation(k); });
      li.addEventListener('focusout', function () { if (!li.matches(':hover')) letGo(k); });
    });
    // hovering a station on the ring works the same way (pointer only)
    var ringHover = -1;
    mount.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var rect = mount.getBoundingClientRect();
      var x = e.clientX - rect.left, y = e.clientY - rect.top;
      var best = -1, bd = 30 * 30;
      for (var i = 0; i < 6; i++) {
        var dx = x - sx[i], dy = y - sy[i], d = dx * dx + dy * dy;
        var lr = labels[i].getBoundingClientRect();
        var inLabel = e.clientX >= lr.left - 4 && e.clientX <= lr.right + 4 && e.clientY >= lr.top - 4 && e.clientY <= lr.bottom + 4;
        if (inLabel) { best = i; break; }
        if (d < bd) { bd = d; best = i; }
      }
      if (best !== ringHover) {
        if (ringHover >= 0) letGo(ringHover);
        ringHover = best;
        if (best >= 0) hoverStation(best);
      }
      mount.classList.toggle('lp-pointing', best >= 0);
    });
    mount.addEventListener('pointerleave', function () {
      if (ringHover >= 0) letGo(ringHover);
      ringHover = -1;
      mount.classList.remove('lp-pointing');
    });

    /* ---------- pinned ring on narrow screens: scroll position drives the step ---------- */
    var pinMq = window.matchMedia ? window.matchMedia(PIN_MQ) : null;
    var scrollRaf = 0;
    function scrollPick() {
      if (!items.length || !pinMq || !pinMq.matches || locked()) return -1;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var mr = mount.getBoundingClientRect();
      if (mr.bottom <= 0 || mr.top >= vh) return -1;           // ring off screen
      var ringB = mr.bottom;
      var focusY = ringB + Math.min(140, Math.max(48, (vh - ringB) * 0.3));
      var first = items[0].getBoundingClientRect(), lastR = items[items.length - 1].getBoundingClientRect();
      if (first.top > focusY || lastR.bottom < ringB + 24) return -1;
      var k = 0;
      for (var i = 0; i < items.length; i++) {
        if (items[i].getBoundingClientRect().top <= focusY) k = i;
      }
      return k;
    }
    function onScrollFrame() {
      scrollRaf = 0;
      var k = scrollPick();
      if (k === scrollK) return;
      var prevK = scrollK;
      scrollK = k;
      if (k >= 0) hoverStation(k);
      else if (prevK >= 0) release(prevK);
    }
    function onScroll() { if (!scrollRaf) scrollRaf = requestAnimationFrame(onScrollFrame); }
    if (pinMq && items.length) {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      var onMq = function () { onScroll(); };
      if (pinMq.addEventListener) pinMq.addEventListener('change', onMq);
      else if (pinMq.addListener) pinMq.addListener(onMq);
    }

    /* ---------- observers ---------- */
    setActive(0);
    stGlow = [1, 0, 0, 0, 0, 0];
    layout();
    // reduced motion, or paused before anything has moved: the still where Learn has just closed the loop
    if (reduced || paused()) staticFrame(0); else draw();

    function relayout() {
      readPalette();
      applyStepColors();
      layout();
      if (reduced) staticFrame(hovering >= 0 ? hovering : 0);
    }
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () {
        var r = mount.getBoundingClientRect();
        if (Math.round(r.width) !== W || Math.round(r.height) !== H) { layout(); if (reduced) staticFrame(hovering >= 0 ? hovering : 0); }
      });
      ro.observe(mount);
    } else {
      window.addEventListener('resize', function () { layout(); });
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        inView = es[es.length - 1].isIntersecting;
        update();
      }, { rootMargin: '80px 0px' });
      io.observe(mount);
    }
    document.addEventListener('visibilitychange', update);
    if (rmq) {
      var onReduced = function () {
        reduced = rmq.matches;
        if (reduced) {
          staticFrame(hovering >= 0 ? hovering : scrollK >= 0 ? scrollK : active);
        } else {
          mode = hovering >= 0 ? 'hold' : 'dwell'; tMode = 0; last = 0;
          draw();
        }
        update();
      };
      if (rmq.addEventListener) rmq.addEventListener('change', onReduced);
      else if (rmq.addListener) rmq.addListener(onReduced);
    }
    if (fcq) {
      var onForced = function () { relayout(); };
      if (fcq.addEventListener) fcq.addEventListener('change', onForced);
      else if (fcq.addListener) fcq.addListener(onForced);
    }
    // pausing keeps the frame on screen as it is; resuming carries on from that same state
    var wasPaused = paused();
    function syncPause() {
      var pz = paused();
      if (pz !== wasPaused) {
        wasPaused = pz;
        if (!pz && !reduced && mode === 'hold' && hovering < 0) { mode = 'dwell'; tMode = 0; }
      }
      update();
    }
    document.addEventListener('site:motion', syncPause);
    document.addEventListener('site:unlocked', function () { relayout(); update(); onScroll(); });
    if ('MutationObserver' in window) {
      new MutationObserver(syncPause).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(relayout);
    }
    update();
  }
})();

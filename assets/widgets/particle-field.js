/* particle-field: the original 10x.vi background, a soft field of orange, gold and sky
   particles drifting in slow waves. Same field as the original page (2,500 particles,
   the same camera, sizes, colours and motion), drawn with plain WebGL instead of Three.js.
   It only runs while the visitor has chosen the original background (html.bg-original). */
(function () {
  'use strict';
  var root = document.documentElement;
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function isLocked() { return root.classList.contains('gate-locked'); }
  function isStill() { return (mqReduce && mqReduce.matches) || root.classList.contains('motion-paused'); }
  function isChosen() { return root.classList.contains('bg-original'); }

  var PALETTE = [[0.976, 0.451, 0.086], [1.0, 0.843, 0.0], [0.055, 0.647, 0.914]]; /* #f97316 #ffd700 #0ea5e9 */
  var STEP = 0.003;      /* the original advanced its clock by 0.003 every frame; kept per frame so it feels the same on any display */
  var SIZE = 1.2;        /* point size in world units, as in the original material */
  var FOV = 75, NEAR = 0.1, FAR = 1000;

  var VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aCol;',
    'uniform float uTime;',
    'uniform float uSize;',
    'uniform mat4 uProj;',
    'varying vec3 vCol;',
    'void main() {',
    /* the original nudged y each frame by .02 * (sin(2t + .1x) + cos(1.5t + .1z)); this is that motion in closed form */
    '  float y = aPos.y - 3.3333 * (cos(2.0 * uTime + 0.1 * aPos.x) - cos(0.1 * aPos.x))',
    '                   + 4.4444 * (sin(1.5 * uTime + 0.1 * aPos.z) - sin(0.1 * aPos.z));',
    '  float r = uTime * 0.05;',
    '  float c = cos(r), s = sin(r);',
    '  vec3 p = vec3(aPos.x * c + aPos.z * s, y, -aPos.x * s + aPos.z * c);',
    '  vec4 v = vec4(p - vec3(0.0, 5.0, 25.0), 1.0);', /* camera at (0, 5, 25), looking down -z */
    '  gl_Position = uProj * v;',
    '  gl_PointSize = uSize / max(-v.z, 0.0001);',
    '  vCol = aCol;',
    '}'
  ].join('\n');
  var FS = [
    'precision mediump float;',
    'uniform float uOpacity;',
    'varying vec3 vCol;',
    'void main() {',
    '  float d = length(gl_PointCoord - 0.5) * 2.0;',
    '  if (d > 1.0) discard;',
    /* the original sprite: 1 at the centre, .8 at .2, .2 at .5, 0 at the edge */
    '  float a = d < 0.2 ? mix(1.0, 0.8, d / 0.2) : (d < 0.5 ? mix(0.8, 0.2, (d - 0.2) / 0.3) : mix(0.2, 0.0, (d - 0.5) / 0.5));',
    '  gl_FragColor = vec4(vCol, a * uOpacity);',
    '}'
  ].join('\n');

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function Field(cv) {
    var calm = cv.getAttribute('data-mode') === 'calm';
    var COUNT = calm ? 1100 : 2500;
    var OPACITY = calm ? 0.5 : 0.9;
    var gl = null, prog = null, loc = {}, lost = false, failed = false;
    var w = 0, h = 0, dpr = 1;
    var visible = false, running = false, raf = 0, t = 0, shownOnce = false;

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function setup() {
      if (lost) return false;   /* wait for webglcontextrestored */
      if (gl) return true;
      if (failed) return false;
      try {
        gl = gl || cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: false }) ||
          cv.getContext('experimental-webgl');
        if (!gl) throw new Error('no webgl');
        prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);
        ['uTime', 'uSize', 'uProj', 'uOpacity'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
        var rand = rng(calm ? 7331 : 1337);
        var data = new Float32Array(COUNT * 6);
        for (var i = 0; i < COUNT; i++) {
          var c = PALETTE[Math.floor(rand() * 3)];
          data[i * 6] = (rand() - 0.5) * 120;
          data[i * 6 + 1] = (rand() - 0.5) * 40;
          data[i * 6 + 2] = (rand() - 0.5) * 60;
          data[i * 6 + 3] = c[0]; data[i * 6 + 4] = c[1]; data[i * 6 + 5] = c[2];
        }
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        var aPos = gl.getAttribLocation(prog, 'aPos'), aCol = gl.getAttribLocation(prog, 'aCol');
        gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 24, 12);
        gl.uniform1f(loc.uOpacity, OPACITY);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE); /* additive, like the original */
        gl.clearColor(0, 0, 0, 0);
        lost = false;
        w = h = 0;
        return true;
      } catch (e) {
        var transient = gl && gl.isContextLost && gl.isContextLost();
        gl = null;
        if (transient) return false; /* a lost context is temporary: try again when it is restored */
        failed = true;
        /* no WebGL here: keep the new background and hide the switch (focus moves to the pause switch beside it) */
        var f = document.activeElement;
        if (f && f.hasAttribute && f.hasAttribute('data-bg-toggle')) {
          var m = f.parentNode.querySelector('[data-motion-toggle]');
          if (m) m.focus();
        }
        root.classList.add('no-webgl');
        return false;
      }
    }
    function size() {
      var r = cv.getBoundingClientRect();
      var cw = Math.round(r.width), ch = Math.round(r.height);
      if (!cw || !ch) return false;
      var nd = Math.min(window.devicePixelRatio || 1, 2);
      if (cw === w && ch === h && nd === dpr) return true;
      w = cw; h = ch; dpr = nd;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      gl.viewport(0, 0, cv.width, cv.height);
      var f = 1 / Math.tan(FOV * Math.PI / 360), a = w / h;
      gl.uniformMatrix4fv(loc.uProj, false, new Float32Array([
        f / a, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (FAR + NEAR) / (NEAR - FAR), -1,
        0, 0, (2 * FAR * NEAR) / (NEAR - FAR), 0
      ]));
      gl.uniform1f(loc.uSize, SIZE * dpr * h * 0.5); /* the original scaled points by half the canvas height */
      return true;
    }
    function draw() {
      if (!gl || lost) return;
      gl.uniform1f(loc.uTime, t);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, COUNT);
      if (!shownOnce) { shownOnce = true; cv.classList.add('is-on'); }
    }
    function frame() {
      raf = 0;
      if (!running) return;
      t += STEP;
      draw();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function evaluate() {
      var active = isChosen() && !isLocked() && visible && !document.hidden;
      if (!active) { stop(); return; }
      if (!setup() || !size()) { stop(); return; }
      if (isStill()) { stop(); draw(); return; }
      if (!running) { running = true; raf = requestAnimationFrame(frame); }
    }
    this.evaluate = evaluate;

    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; stop(); });
    cv.addEventListener('webglcontextrestored', function () { lost = false; gl = null; evaluate(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[es.length - 1].isIntersecting; evaluate(); }, { rootMargin: '80px 0px' }).observe(cv);
    } else { visible = true; }
    if ('ResizeObserver' in window) {
      var rt = 0;
      new ResizeObserver(function () {
        clearTimeout(rt);
        rt = setTimeout(function () { if (gl && !lost && size() && !running) { if (isChosen() && visible) draw(); } evaluate(); }, 120);
      }).observe(cv);
    } else {
      window.addEventListener('resize', evaluate);
    }
  }

  var fields = [];
  function evalAll() { for (var i = 0; i < fields.length; i++) fields[i].evaluate(); }
  function boot() {
    var nodes = document.querySelectorAll('canvas[data-widget="particle-field"]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].__particleField) continue;
      nodes[i].__particleField = new Field(nodes[i]);
      fields.push(nodes[i].__particleField);
    }
    evalAll();
  }
  document.addEventListener('site:unlocked', evalAll);
  document.addEventListener('site:motion', evalAll);
  document.addEventListener('site:bg', evalAll);
  document.addEventListener('visibilitychange', evalAll);
  if (mqReduce) {
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', evalAll);
    else if (mqReduce.addListener) mqReduce.addListener(evalAll);
  }
  if ('MutationObserver' in window) {
    new MutationObserver(evalAll).observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

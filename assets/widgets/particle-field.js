/* particle-field: the original 10x.vi background, copied exactly. The same Three.js r128 scene
   as the original page: 2,500 orange, gold and sky points in the same box, the same camera,
   sprite, material, slow turn and per-frame breathing waves. It runs only while the original
   background is chosen (html.bg-original), after the password screen, while on screen and while
   motion is allowed. Three.js is fetched only when this background is shown. */
(function () {
  'use strict';
  var root = document.documentElement;
  var THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function isLocked() { return root.classList.contains('gate-locked'); }
  function isStill() { return (mqReduce && mqReduce.matches) || root.classList.contains('motion-paused'); }
  function isChosen() { return root.classList.contains('bg-original') && !root.classList.contains('no-webgl'); }

  var threeLoad = null;
  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threeLoad) return threeLoad;
    threeLoad = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = THREE_SRC;
      s.async = true;
      s.onload = function () { if (window.THREE) resolve(window.THREE); else reject(new Error('three.js missing')); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return threeLoad;
  }

  /* no WebGL or no Three.js: keep the new background and hide the switch (focus moves to the pause switch beside it) */
  function fallback() {
    var f = document.activeElement;
    if (f && f.hasAttribute && f.hasAttribute('data-bg-toggle')) {
      var m = f.parentNode.querySelector('[data-motion-toggle]');
      if (m) m.focus();
    }
    root.classList.add('no-webgl');
  }

  /* the original page's sprite, verbatim */
  function getTexture(THREE) {
    var canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    var context = canvas.getContext('2d');
    var gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    var texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  function Field(cv) {
    var calm = cv.getAttribute('data-mode') === 'calm';
    /* the hero is the original field; the closing invitation gets a sparser, paler copy of it */
    var particleCount = calm ? 1100 : 2500;
    var opacity = calm ? 0.5 : 0.9;
    var scene, camera, renderer, particles, ready = false, failed = false, pending = false;
    var visible = false, running = false, raf = 0, time = 0, w = 0, h = 0, shownOnce = false;

    function setup(THREE) {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      camera.position.z = 25;
      camera.position.y = 5;
      renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);

      var geometry = new THREE.BufferGeometry();
      var positions = new Float32Array(particleCount * 3);
      var colors = new Float32Array(particleCount * 3);
      var colorPalette = [
        new THREE.Color(0xf97316), /* Vitality Orange */
        new THREE.Color(0xffd700), /* Solar Gold */
        new THREE.Color(0x0ea5e9)  /* Electric Blue */
      ];
      for (var i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 120;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
        var color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      var material = new THREE.PointsMaterial({
        size: 1.2,
        map: getTexture(THREE),
        vertexColors: true,
        transparent: true,
        opacity: opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      particles = new THREE.Points(geometry, material);
      scene.add(particles);
      ready = true;
    }

    function resize() {
      var r = cv.getBoundingClientRect();
      var cw = Math.round(r.width), ch = Math.round(r.height);
      if (!cw || !ch) return false;
      if (cw === w && ch === h) return true;
      w = cw; h = ch;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      return true;
    }

    /* the original page's animation step, verbatim: time advances 0.003 every frame */
    function step() {
      time += 0.003;
      particles.rotation.y = time * 0.05;
      var positions = particles.geometry.attributes.position.array;
      for (var i = 0; i < particleCount; i++) {
        var x = positions[i * 3];
        var z = positions[i * 3 + 2];
        positions[i * 3 + 1] += Math.sin(time * 2 + x * 0.1) * 0.02 +
                                Math.cos(time * 1.5 + z * 0.1) * 0.02;
      }
      particles.geometry.attributes.position.needsUpdate = true;
    }
    function render() {
      renderer.render(scene, camera);
      if (!shownOnce) { shownOnce = true; cv.classList.add('is-on'); }
    }
    function animate() {
      raf = 0;
      if (!running) return;
      raf = requestAnimationFrame(animate);
      step();
      render();
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function evaluate() {
      var active = isChosen() && !isLocked() && visible && !document.hidden;
      if (!active) { stop(); return; }
      if (!ready) {
        if (failed || pending) return;
        pending = true;
        loadThree().then(function (THREE) {
          pending = false;
          try { setup(THREE); } catch (e) { failed = true; fallback(); return; }
          evaluate();
        }, function () { pending = false; failed = true; fallback(); });
        return;
      }
      if (!resize()) { stop(); return; }
      if (isStill()) { stop(); render(); return; }
      if (!running) { running = true; raf = requestAnimationFrame(animate); }
    }
    this.evaluate = evaluate;

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[es.length - 1].isIntersecting; evaluate(); }, { rootMargin: '80px 0px' }).observe(cv);
    } else { visible = true; }
    if ('ResizeObserver' in window) {
      var rt = 0;
      new ResizeObserver(function () {
        clearTimeout(rt);
        rt = setTimeout(function () {
          if (ready && resize() && !running && isChosen() && visible && !isLocked()) render();
          evaluate();
        }, 120);
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
    /* fetch Three.js while the password screen is up, so the field is ready the moment it unlocks */
    if (isChosen() && isLocked()) {
      var idle = window.requestIdleCallback || function (f) { setTimeout(f, 200); };
      idle(function () { loadThree().catch(function () {}); });
    }
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

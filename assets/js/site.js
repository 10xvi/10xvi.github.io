// Page behaviour: nav state and progress, mobile menu, the motion pause, hero entrance,
// reveal on scroll, in-page jumps, and the current-section marks (desktop links, tablet and phone chip).
(function () {
    window.__siteReady = true;

    // ---------- Lookups, media queries and values shared with the CSS ----------
    var root = document.documentElement;
    var nav = document.getElementById('nav');
    var menuBtn = document.getElementById('menu-btn');
    var menu = document.getElementById('mobile-menu');
    var menuLinks = menu.querySelectorAll('a');
    var where = document.getElementById('where');
    var motionBtns = document.querySelectorAll('[data-motion-toggle]');
    var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    var desktopMQ = window.matchMedia('(min-width: 73.8125em)'); // 1181px at the default text size
    var shortMQ = window.matchMedia('(max-height: 480px)');
    function cssMs(name, fallback) {
        var v = parseFloat(getComputedStyle(root).getPropertyValue(name));
        return isNaN(v) ? fallback : v;
    }
    // The bar height lives in CSS (--nav-h, used by scroll-padding-top).
    function navH() { return parseFloat(getComputedStyle(root).scrollPaddingTop) || 68; }
    var T_EXIT = cssMs('--t-exit', 160);
    var T_SWAP = cssMs('--dur-1', 150);

    function paused() { return root.classList.contains('motion-paused'); }
    // The on-page pause counts as reduced motion everywhere on the page.
    function reduced() { return reduceMQ.matches || paused(); }
    function locked() { return root.classList.contains('gate-locked'); }
    function onChange(mq, fn) {
        if (mq.addEventListener) mq.addEventListener('change', fn);
        else if (mq.addListener) mq.addListener(fn);
    }
    // '#id' (possibly percent-encoded) to its element, or null.
    function targetFor(hash) {
        var id = (hash || '').replace(/^#/, '');
        try { id = decodeURIComponent(id); } catch (err) {}
        return (id && document.getElementById(id)) || null;
    }

    // ---------- Bar state and reading progress (one rAF per scroll burst) ----------
    var ticking = false;
    var lastY = window.scrollY;
    function paint() {
        ticking = false;
        var y = window.scrollY;
        var max = root.scrollHeight - window.innerHeight;
        nav.classList.toggle('scrolled', y > 24);
        nav.style.setProperty('--p', max > 0 ? Math.min(1, Math.max(0, y / max)).toFixed(4) : '0');
        // Short viewports (landscape phones, 400% zoom): the bar steps aside while reading down
        // and comes back on the way up. The CSS applies the class only under (max-height: 480px).
        var dy = y - lastY;
        if (y < 80 || dy < -6) nav.classList.remove('tuck');
        else if (dy > 6 && !menu.classList.contains('open')) nav.classList.add('tuck');
        lastY = y;
    }
    function onScroll() {
        if (ticking || locked()) return;
        ticking = true;
        requestAnimationFrame(paint);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    paint();

    // ---------- Mobile menu ----------
    var closeTimer = 0;
    function isOpen() { return menu.classList.contains('open') && !menu.classList.contains('closing'); }
    function finishClose() {
        clearTimeout(closeTimer);
        menu.classList.remove('open', 'closing');
    }
    menu.addEventListener('animationend', function () {
        if (menu.classList.contains('closing')) finishClose();
    });

    function setMenu(open, opts) {
        // Hand focus back to the button before the menu (and the focused link in it) disappears.
        if (!open && ((opts && opts.refocus) || menu.contains(document.activeElement))) menuBtn.focus();
        clearTimeout(closeTimer);
        if (open) {
            nav.classList.remove('tuck');
            menu.classList.remove('closing');
            menu.classList.add('open');
        } else if (menu.classList.contains('open')) {
            if (reduced() || desktopMQ.matches) {
                finishClose();
            } else {
                // Play the exit; the page underneath is scrollable again straight away.
                // The timer is a fallback for a missed animationend.
                menu.classList.add('closing');
                closeTimer = setTimeout(finishClose, T_EXIT + 60);
            }
        }
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        menuBtn.textContent = open ? 'Close' : 'Menu';
        root.classList.toggle('menu-open', open);
    }
    menuBtn.addEventListener('click', function () {
        setMenu(!isOpen());
    });

    document.addEventListener('keydown', function (e) {
        if (!isOpen()) return;
        if (e.key === 'Escape') {
            setMenu(false, { refocus: true });
            return;
        }
        // Keep Tab inside the open menu: button, then the links, then back to the button.
        if (e.key === 'Tab') {
            var first = menuLinks[0];
            var last = menuLinks[menuLinks.length - 1];
            if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                menuBtn.focus();
            } else if (e.shiftKey && document.activeElement === menuBtn) {
                e.preventDefault();
                last.focus();
            } else if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                menuBtn.focus();
            } else if (!menu.contains(document.activeElement) && document.activeElement !== menuBtn) {
                e.preventDefault();
                first.focus();
            }
        }
    });
    // Capture phase, so it runs before the jump handler below: a tap outside the open menu
    // only closes it and never reaches the page underneath.
    document.addEventListener('click', function (e) {
        if (isOpen() && !e.target.closest('#nav')) {
            e.preventDefault();
            e.stopPropagation();
            setMenu(false);
        }
    }, true);
    // Leaving the phone layout (rotation, resize) closes the menu so the scroll lock never sticks.
    onChange(desktopMQ, function () { if (desktopMQ.matches && menu.classList.contains('open')) setMenu(false); });
    onChange(shortMQ, function () { nav.classList.remove('tuck'); });

    // ---------- Motion pause: one switch for every moving figure (WCAG 2.2.2) ----------
    function syncMotion() {
        var p = paused();
        var label = p ? 'Play animations' : 'Pause animations';
        motionBtns.forEach(function (b) {
            var text = b.querySelector('.motion-label');
            if (text) text.textContent = label;
            else b.setAttribute('aria-label', label);
            b.classList.toggle('is-paused', p);
        });
    }
    function setMotion(p) {
        root.classList.toggle('motion-paused', p);
        if (p) root.classList.remove('hero-enter');
        try {
            if (p) localStorage.setItem('10x-motion', 'paused');
            else localStorage.removeItem('10x-motion');
        } catch (err) {}
        syncMotion();
        // Widgets listen on document; bubbles so a window listener hears it too.
        document.dispatchEvent(new CustomEvent('site:motion', { bubbles: true, detail: { paused: p } }));
    }
    motionBtns.forEach(function (b) {
        b.addEventListener('click', function () { setMotion(!paused()); });
    });
    syncMotion();

    // ---------- Reveal on scroll ----------
    var reveals = document.querySelectorAll('.reveal');
    var revealer = null;
    // The one way a block is revealed: instantly (it was jumped over) or with an optional stagger delay.
    function show(el, opts) {
        if (el.classList.contains('in')) return;
        var instant = opts && opts.instant;
        var delay = (opts && opts.delay) || 0;
        if (instant) el.classList.add('skip-reveal');
        else if (delay) {
            el.style.transitionDelay = delay + 'ms';
            el.addEventListener('transitionend', function clear() {
                el.style.transitionDelay = '';
                el.removeEventListener('transitionend', clear);
            });
        }
        el.classList.add('in');
        if (revealer) revealer.unobserve(el);
    }
    // Content that sits above the viewport after a jump is simply present, so it never rises against the scroll.
    function settleAbove() {
        reveals.forEach(function (el) {
            if (!el.classList.contains('in') && el.getBoundingClientRect().bottom < 0) show(el, { instant: true });
        });
    }

    if ('IntersectionObserver' in window) {
        revealer = new IntersectionObserver(function (entries) {
            var i = 0;
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                // Blocks arriving together (side by side, or a figure and its list) start one after another.
                show(entry.target, { delay: Math.min(i++, 3) * 90 });
            });
        }, { rootMargin: '0px 0px -10% 0px' });
        reveals.forEach(function (el) { revealer.observe(el); });
    } else {
        reveals.forEach(function (el) { el.classList.add('in'); });
    }

    // ---------- In-page jumps: a short glide, and the destination is already readable on arrival ----------
    // After a jump, move keyboard focus to the section's heading without scrolling again.
    function focusTarget(target) {
        var heading = target.querySelector('h2') || target;
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        setTimeout(function () { heading.focus({ preventScroll: true }); }, 0);
    }
    function jumpTo(target) {
        // Start the destination's fade now, so it is readable when the glide ends (sections only, not #top).
        if (target.tagName === 'SECTION') target.querySelectorAll('.reveal').forEach(function (el) { show(el); });
        var d = target.getBoundingClientRect().top - navH();
        var far = 2.5 * window.innerHeight;
        if (!reduced() && Math.abs(d) > far) {
            window.scrollTo({ top: window.scrollY + d - Math.sign(d) * 0.75 * window.innerHeight, behavior: 'instant' });
            settleAbove();
        }
        target.scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth', block: 'start' });
        if (reduced()) settleAbove();
    }

    // Bubble phase, after the capture-phase outside-tap handler above has had its say.
    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest('a[href^="#"]');
        if (!a || a.classList.contains('skip')) return;
        var hash = a.getAttribute('href');
        var inMenu = menu.contains(a);
        if (inMenu) setMenu(false);
        var target = hash.length > 1 && targetFor(hash);
        if (!target) return;
        jumpTo(target);
        e.preventDefault();
        if (location.hash !== hash) history.pushState(null, '', hash);
        if (inMenu || a.closest('.links') || a.closest('.actions')) focusTarget(target);
    });

    // ---------- Unlock: hero entrance, or a settled page under a deep link ----------
    document.addEventListener('site:unlocked', function () {
        paint();
        if (targetFor(location.hash)) {
            // The gate scrolls to the target right after this event; settle what lies above it.
            requestAnimationFrame(function () { settleAbove(); paint(); });
            return;
        }
        if (reduced()) return;
        root.classList.add('hero-enter');
        // Drop the class once every entrance animation has finished (a slow first frame delays them all).
        var done = function () { root.classList.remove('hero-enter'); };
        var anims = document.getAnimations ? document.getAnimations().filter(function (a) {
            return a.animationName === 'hero-rise' || a.animationName === 'hero-fade';
        }) : [];
        if (anims.length) Promise.all(anims.map(function (a) { return a.finished; })).then(done, done);
        setTimeout(done, 3000);
    });

    // ---------- Current section: desktop links, the menu, and the bar chip ----------
    if (!('IntersectionObserver' in window)) return;
    var byId = {};
    var order = [];
    document.querySelectorAll('.links a[href^="#"], .mobile-menu a[href^="#"]:not(.go)').forEach(function (a) {
        var id = a.getAttribute('href').slice(1);
        if (!byId[id]) { byId[id] = []; order.push(id); }
        byId[id].push(a);
    });
    var sections = order.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var inBand = {};
    var current = null;
    var swapTimer = 0;

    function chipText(section) {
        var n = section.querySelector('.label .n');
        var link = menu.querySelector('a[href="#' + section.id + '"]');
        return [n ? n.textContent : '', link ? link.textContent : ''];
    }
    function setChip(section) {
        clearTimeout(swapTimer);
        if (!where) return;
        if (!section) {
            where.classList.remove('on');
            nav.classList.remove('has-where');
            return;
        }
        var parts = chipText(section);
        var apply = function () {
            where.querySelector('.n').textContent = parts[0];
            where.querySelector('.t').textContent = parts[1];
            where.classList.add('on');
            nav.classList.add('has-where');
        };
        if (where.classList.contains('on') && !reduced()) {
            // Cross-fade: out, swap the words, back in.
            where.classList.remove('on');
            swapTimer = setTimeout(apply, T_SWAP);
        } else {
            apply();
        }
    }
    function setCurrent(section) {
        if (section === current) return;
        current = section;
        Object.keys(byId).forEach(function (id) {
            var on = !!section && section.id === id;
            byId[id].forEach(function (link) {
                link.classList.toggle('current', on);
                if (on) link.setAttribute('aria-current', 'location');
                else link.removeAttribute('aria-current');
            });
        });
        setChip(section);
    }
    var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { inBand[entry.target.id] = entry.isIntersecting; });
        var next = null;
        sections.forEach(function (s) { if (inBand[s.id]) next = s; });
        if (!next) {
            // Between sections (the footer) keep the last one; above the first one (the hero) clear it.
            var first = sections[0];
            if (first && first.getBoundingClientRect().top > window.innerHeight * 0.45) next = null;
            else next = current;
        }
        setCurrent(next);
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
})();

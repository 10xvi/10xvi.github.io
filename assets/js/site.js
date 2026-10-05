// Page behaviour: nav state and progress, mobile menu, hero entrance, reveal on scroll,
// in-page jumps, and the current-section marks (desktop links, tablet and phone chip).
(function () {
    window.__siteReady = true;

    var root = document.documentElement;
    var nav = document.getElementById('nav');
    var menuBtn = document.getElementById('menu-btn');
    var menu = document.getElementById('mobile-menu');
    var menuLinks = menu.querySelectorAll('a');
    var where = document.getElementById('where');
    var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    function reduced() { return reduceMQ.matches; }
    function locked() { return root.classList.contains('gate-locked'); }

    // ---------- Bar state and reading progress (one rAF per scroll burst) ----------
    var ticking = false;
    function paint() {
        ticking = false;
        var y = window.scrollY;
        var max = document.documentElement.scrollHeight - window.innerHeight;
        nav.classList.toggle('scrolled', y > 24);
        nav.style.setProperty('--p', max > 0 ? Math.min(1, Math.max(0, y / max)).toFixed(4) : '0');
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

    function setMenu(open) {
        // Hand focus back to the button before the menu (and the focused link in it) disappears.
        if (!open && menu.contains(document.activeElement)) menuBtn.focus();
        clearTimeout(closeTimer);
        if (open) {
            menu.classList.remove('closing');
            menu.classList.add('open');
        } else if (menu.classList.contains('open')) {
            if (reduced() || desktop.matches) {
                finishClose();
            } else {
                // Play the exit; the page underneath is scrollable again straight away.
                menu.classList.add('closing');
                closeTimer = setTimeout(finishClose, 220);
            }
        }
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        menuBtn.textContent = open ? 'Close' : 'Menu';
        root.classList.toggle('menu-open', open);
    }
    menuBtn.addEventListener('click', function () {
        setMenu(!isOpen());
    });

    // After an in-page jump, move keyboard focus to the section's heading without scrolling again.
    function focusTarget(hash) {
        var id = hash.slice(1);
        var target = id && document.getElementById(id);
        if (!target) return;
        var heading = target.querySelector('h2') || target;
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        setTimeout(function () { heading.focus({ preventScroll: true }); }, 0);
    }

    document.addEventListener('keydown', function (e) {
        if (!isOpen()) return;
        if (e.key === 'Escape') {
            setMenu(false);
            menuBtn.focus();
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
    // A tap outside the open menu closes it instead of reaching the page underneath.
    document.addEventListener('click', function (e) {
        if (isOpen() && !e.target.closest('#nav')) {
            e.preventDefault();
            e.stopPropagation();
            setMenu(false);
        }
    }, true);
    // Leaving the phone layout (rotation, resize) closes the menu so the scroll lock never sticks.
    var desktop = window.matchMedia('(min-width: 1181px)');
    var onLayout = function () { if (desktop.matches && menu.classList.contains('open')) setMenu(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onLayout);
    else if (desktop.addListener) desktop.addListener(onLayout);

    // ---------- Reveal on scroll ----------
    var reveals = document.querySelectorAll('.reveal');
    var revealer = null;
    function show(el, instant) {
        if (el.classList.contains('in')) return;
        if (instant) el.classList.add('skip-reveal');
        el.classList.add('in');
        if (revealer) revealer.unobserve(el);
    }
    // Content that sits above the viewport after a jump is simply present, so it never rises against the scroll.
    function settleAbove() {
        reveals.forEach(function (el) {
            if (!el.classList.contains('in') && el.getBoundingClientRect().bottom < 0) show(el, true);
        });
    }

    if ('IntersectionObserver' in window) {
        revealer = new IntersectionObserver(function (entries) {
            var i = 0;
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                // Blocks arriving together (side by side, or a figure and its list) start one after another.
                var d = Math.min(i++, 3) * 90;
                if (d) {
                    el.style.transitionDelay = d + 'ms';
                    el.addEventListener('transitionend', function clear() {
                        el.style.transitionDelay = '';
                        el.removeEventListener('transitionend', clear);
                    });
                }
                el.classList.add('in');
                revealer.unobserve(el);
            });
        }, { rootMargin: '0px 0px -10% 0px' });
        reveals.forEach(function (el) { revealer.observe(el); });
    } else {
        reveals.forEach(function (el) { el.classList.add('in'); });
    }

    // ---------- In-page jumps: a short glide, and the destination is already readable on arrival ----------
    function jumpTo(hash) {
        var id = hash.slice(1);
        var target = id && document.getElementById(id);
        if (!target) return false;
        // Start the destination's fade now, so it is readable when the glide ends (sections only, not #top).
        if (target.tagName === 'SECTION') target.querySelectorAll('.reveal').forEach(function (el) { show(el); });
        var d = target.getBoundingClientRect().top - 68;
        var far = 2.5 * window.innerHeight;
        if (!reduced() && Math.abs(d) > far) {
            window.scrollTo({ top: window.scrollY + d - Math.sign(d) * 0.75 * window.innerHeight, behavior: 'instant' });
            settleAbove();
        }
        target.scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth', block: 'start' });
        if (reduced()) settleAbove();
        return true;
    }

    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest('a[href^="#"]');
        if (!a || a.classList.contains('skip')) return;
        var hash = a.getAttribute('href');
        var inMenu = menu.contains(a);
        if (inMenu) setMenu(false);
        if (hash.length < 2 || !jumpTo(hash)) return;
        e.preventDefault();
        if (location.hash !== hash) history.pushState(null, '', hash);
        if (inMenu || a.closest('.links') || a.closest('.actions')) focusTarget(hash);
    });

    // ---------- Unlock: hero entrance, or a settled page under a deep link ----------
    document.addEventListener('site:unlocked', function () {
        paint();
        var id = location.hash.slice(1);
        try { id = decodeURIComponent(id); } catch (err) {}
        if (id && document.getElementById(id)) {
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
            swapTimer = setTimeout(apply, 150);
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

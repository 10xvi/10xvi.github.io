// Page behaviour: nav state, mobile menu, reveal on scroll, current-section link.
(function () {
    window.__siteReady = true;

    var root = document.documentElement;
    var nav = document.getElementById('nav');
    var menuBtn = document.getElementById('menu-btn');
    var menu = document.getElementById('mobile-menu');
    var menuLinks = menu.querySelectorAll('a');

    function onScroll() {
        nav.classList.toggle('scrolled', window.scrollY > 24);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    function isOpen() { return menu.classList.contains('open'); }

    function setMenu(open) {
        // Hand focus back to the button before the menu (and the focused link in it) disappears.
        if (!open && menu.contains(document.activeElement)) menuBtn.focus();
        menu.classList.toggle('open', open);
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
        // Run after the browser's own fragment navigation, which would otherwise reset focus.
        setTimeout(function () { heading.focus({ preventScroll: true }); }, 0);
    }

    menu.addEventListener('click', function (e) {
        var a = e.target.closest('a');
        if (!a) return;
        setMenu(false);
        focusTarget(a.getAttribute('href'));
    });
    document.querySelectorAll('.links a[href^="#"]').forEach(function (a) {
        a.addEventListener('click', function () { focusTarget(a.getAttribute('href')); });
    });

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
    var onLayout = function () { if (desktop.matches && isOpen()) setMenu(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onLayout);
    else if (desktop.addListener) desktop.addListener(onLayout);

    var reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
        var revealer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in');
                    revealer.unobserve(entry.target);
                }
            });
        }, { rootMargin: '0px 0px -10% 0px' });
        reveals.forEach(function (el) { revealer.observe(el); });

        var byId = {};
        document.querySelectorAll('.links a[href^="#"]:not(.cta), .mobile-menu a[href^="#"]:not(.go)').forEach(function (a) {
            var id = a.getAttribute('href').slice(1);
            (byId[id] = byId[id] || []).push(a);
        });
        var spy = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                (byId[entry.target.id] || []).forEach(function (link) {
                    link.classList.toggle('current', entry.isIntersecting);
                    if (entry.isIntersecting) link.setAttribute('aria-current', 'true');
                    else link.removeAttribute('aria-current');
                });
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        Object.keys(byId).forEach(function (id) {
            var section = document.getElementById(id);
            if (section) spy.observe(section);
        });
    } else {
        reveals.forEach(function (el) { el.classList.add('in'); });
    }
})();

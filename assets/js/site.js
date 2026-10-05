// Page behaviour: nav state, mobile menu, reveal on scroll, current-section link.
(function () {
    if (window.lucide) window.lucide.createIcons();

    var nav = document.getElementById('nav');
    var menuBtn = document.getElementById('menu-btn');
    var menu = document.getElementById('mobile-menu');

    function onScroll() {
        nav.classList.toggle('scrolled', window.scrollY > 24);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    function setMenu(open) {
        menu.classList.toggle('open', open);
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        menuBtn.textContent = open ? 'Close' : 'Menu';
    }
    menuBtn.addEventListener('click', function () {
        setMenu(!menu.classList.contains('open'));
    });
    menu.addEventListener('click', function (e) {
        if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menu.classList.contains('open')) setMenu(false);
    });

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

        var links = document.querySelectorAll('.links a[href^="#"]:not(.cta)');
        var byId = {};
        links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
        var spy = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                var link = byId[entry.target.id];
                if (link) link.classList.toggle('current', entry.isIntersecting);
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

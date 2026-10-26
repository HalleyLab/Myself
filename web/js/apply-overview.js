document.addEventListener('click', function(event) {
    const step = event.target.closest('button[data-flow-tab]');
    if (!step) return;
    const category = document.querySelector('.subnav-bar .menu-btn[data-tab="' + step.dataset.flowTab + '"]');
    if (!category) return;
    category.click();
    category.focus();
    const panel = document.getElementById(step.dataset.flowTab);
    if (panel) panel.scrollIntoView({block: 'start'});
});

(function() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
    const overview = document.getElementById('tab0');
    if (!overview) return;
    const drawings = overview.querySelectorAll('.flow-doodle');
    let frame = 0;

    function updateParallax() {
        frame = 0;
        if (reducedMotion.matches || !overview.classList.contains('active')) return;
        const offsets = Array.from(drawings, function(drawing) {
            const bounds = drawing.parentElement.getBoundingClientRect();
            return Math.max(-28, Math.min(28, (window.innerHeight / 2 - bounds.top - bounds.height / 2) * .075));
        });
        drawings.forEach(function(drawing, index) {
            drawing.style.setProperty('--parallax-y', offsets[index] + 'px');
        });
    }

    function queueParallax() {
        if (!frame) frame = window.requestAnimationFrame(updateParallax);
    }

    const observer = new window.IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
        queueParallax();
    }, {threshold: .12, rootMargin: '0px 0px -5% 0px'});

    overview.querySelectorAll('.flow-step, .flow-parallel, .flow-decisions').forEach(function(step) {
        step.classList.add('flow-reveal');
        observer.observe(step);
    });
    overview.classList.add('flow-motion');
    window.addEventListener('scroll', queueParallax, {passive: true});
    window.addEventListener('resize', queueParallax, {passive: true});
    queueParallax();
})();

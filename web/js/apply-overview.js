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

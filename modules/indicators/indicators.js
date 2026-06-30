// UI-only bootstrap for the dashboard shell. This file is already referenced by index.html.
(function loadMacDockDashboardStyles(){
  var stylesheets = [
    './assets/macos-dock-dashboard.css?v=mobile-menu-task-center-20260630',
    './assets/mobile-task-center-fixes.css?v=mobile-menu-task-center-20260630'
  ];
  document.documentElement.classList.add('macos-dock-ui');
  stylesheets.forEach(function(href, index){
    var marker = index === 0 ? 'macos-dock-dashboard' : 'mobile-task-center-fixes';
    if (document.querySelector('link[data-ui-only="' + marker + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.uiOnly = marker;
    document.head.appendChild(link);
  });
})();

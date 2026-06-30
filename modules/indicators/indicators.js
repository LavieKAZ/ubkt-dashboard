// UI-only bootstrap for the dashboard shell. This file is already referenced by index.html.
(function loadMacDockDashboardStyles(){
  var baseHref = './assets/macos-dock-dashboard.css';
  if (document.querySelector('link[data-ui-only="macos-dock-dashboard"]')) return;
  document.documentElement.classList.add('macos-dock-ui');
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = baseHref + '?v=mobile-overlay-fix-20260630';
  link.dataset.uiOnly = 'macos-dock-dashboard';
  document.head.appendChild(link);
})();

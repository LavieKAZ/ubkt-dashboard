// UI-only bootstrap for the dashboard shell. This file is already referenced by index.html.
(function loadMacDockDashboardStyles(){
  var href = './assets/macos-dock-dashboard.css';
  if (document.querySelector('link[href="' + href + '"]')) return;
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.uiOnly = 'macos-dock-dashboard';
  document.head.appendChild(link);
})();

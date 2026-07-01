// UI-only bootstrap for the dashboard shell and supplemental modules referenced by index.html.
(function loadDashboardEnhancements(){
  var stylesheets = [
    { href: './assets/macos-dock-dashboard.css?v=ai-one-page-report-20260630', marker: 'macos-dock-dashboard' },
    { href: './assets/mobile-task-center-fixes.css?v=ai-one-page-report-20260630', marker: 'mobile-task-center-fixes' },
    { href: './modules/ai-one-page-report/ai_one_page_report.css?v=ai-one-page-report-20260630', marker: 'ai-one-page-report' }
  ];
  var scripts = [
    { src: './modules/ai-one-page-report/ai_one_page_report.js?v=ai-one-page-report-20260630', marker: 'ai-one-page-report' }
  ];

  document.documentElement.classList.add('macos-dock-ui');

  stylesheets.forEach(function(item){
    if (document.querySelector('link[data-ui-only="' + item.marker + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = item.href;
    link.dataset.uiOnly = item.marker;
    document.head.appendChild(link);
  });

  scripts.forEach(function(item){
    if (document.querySelector('script[data-ui-only="' + item.marker + '"]')) return;
    var script = document.createElement('script');
    script.src = item.src;
    script.defer = true;
    script.dataset.uiOnly = item.marker;
    document.head.appendChild(script);
  });
})();

// Cấu hình Supabase cho UBKT Dashboard - production
// Chỉ dùng publishable/anon key ở frontend. Không dùng service_role key trong trình duyệt.
window.UBKT_SUPABASE_URL = "https://hbygfheibcrqaqzoaass.supabase.co";
window.UBKT_SUPABASE_ANON_KEY = "sb_publishable_jGSrZLhYPIwvpVZ_j4yo5g_LuVhs0Jh";
window.UBKT_AUTH_MODE = "supabase";
window.UBKT_TASK_SYSTEM_URL = "https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Asia%2FHo_Chi_Minh&hl=vi&src=MDQwNDAxMjQwMDgyQHN0LmJ1aC5lZHUudm4&src=Y19mYmIxYzcwNDFlYmRiNmFkYTI5M2U4NjIxNGU3N2U2MDU2NWE3MTE0MTJiMTU5NmQwMzkzYWMyMGIyOTg2MzNiQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20&src=Y19jbGFzc3Jvb20yNzYxM2RmYUBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&src=ZW4udmlldG5hbWVzZSNob2xpZGF5QGdyb3VwLnYuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&src=dmkudmlldG5hbWVzZSNob2xpZGF5QGdyb3VwLnYuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&color=%23039be5&color=%23ef6c00&color=%23137333&color=%230b8043&color=%230b8043";
window.UBKT_TASK_SYSTEM_APP_URL = "https://ubkt-dashboard-qycx.vercel.app";
window.UBKT_RESOLUTION_SHEET_URL = "https://docs.google.com/spreadsheets/d/1T9MJqrWKxlEHPqZWDFFHEgh_4Urry9eD8tkZq-WI_ME/edit";

(function installDashboardIntegration(){
  const ICONS={
    chart:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V5"/><path d="M4 19.5h16"/><rect x="7" y="11" width="2.8" height="6.5" rx="1.2"/><rect x="11" y="7" width="2.8" height="10.5" rx="1.2"/><rect x="15" y="13" width="2.8" height="4.5" rx="1.2"/></svg>',
    tasks:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.8h7.2l3.8 3.8v12.6H7z"/><path d="M14 3.8v4.4h4.4"/><path d="M9.5 12.2h5.8"/><path d="M9.5 15.8h4.2"/></svg>',
    chat:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v9.2H9.2L5 18.5z"/><path d="M8.5 9.2h7"/><path d="M8.5 12h4.6"/></svg>',
    checkdoc:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7.4L18 7.1v13.4H7z"/><path d="M14 3.5v4h4"/><path d="M9.3 13l2 2 4.1-5"/><path d="M9.3 18h5.4"/></svg>',
    target:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2"/><path d="M12 19.2v2"/><path d="M2.8 12h2"/><path d="M19.2 12h2"/></svg>',
    grid:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.3" height="6.3" rx="1.6"/><rect x="13.7" y="4" width="6.3" height="6.3" rx="1.6"/><rect x="4" y="13.7" width="6.3" height="6.3" rx="1.6"/><rect x="13.7" y="13.7" width="6.3" height="6.3" rx="1.6"/></svg>',
    folder:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.8 7.2h6.1l2 2.1h8.3v9.2a2 2 0 0 1-2 2H5.8a2 2 0 0 1-2-2z"/><path d="M3.8 7.2v-1a2 2 0 0 1 2-2h3.3l1.8 2"/></svg>',
    report:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7.1L18 7.4v13.1H7z"/><path d="M14 3.5v4.3h4.3"/><path d="M9.4 12h5.7"/><path d="M9.4 15.4h5.7"/><path d="M9.4 18.4h3.8"/></svg>',
    pin:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6.6-6.5 6.6-12a6.6 6.6 0 1 0-13.2 0C5.4 14.5 12 21 12 21z"/><circle cx="12" cy="9" r="2.4"/></svg>',
    bell:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 16.5h11l-1.4-2.2v-4.1a4.1 4.1 0 0 0-8.2 0v4.1z"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/></svg>',
    clock:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7.8v4.7l3 1.8"/></svg>',
    csv:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.8h7.5L18 7.3v12.9H7z"/><path d="M14 3.8v4h4"/><path d="M9 12.2h6"/><path d="M9 15.5h6"/><path d="M9 18.2h3"/></svg>',
    code:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 8-4 4 4 4"/><path d="m15.5 8 4 4-4 4"/><path d="m13.5 5.8-3 12.4"/></svg>',
    restore:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 8.2H4V5"/><path d="M5.2 8.1a7.4 7.4 0 1 1-.5 6"/><path d="M12 8v4.4l3.1 1.8"/></svg>',
    plusdoc:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.8h7.4L18 7.4v12.8H7z"/><path d="M14 3.8v4h4"/><path d="M12.5 11.5v5"/><path d="M10 14h5"/></svg>',
    calendar:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2.4"/><path d="M8 3.5v4"/><path d="M16 3.5v4"/><path d="M4 10h16"/><path d="M8 14h3"/><path d="M13.5 14h2.5"/></svg>',
    menu:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/></svg>',
    close:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10"/><path d="M17 7 7 17"/></svg>',
    single:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.8h7.4L18 7.4v12.8H7z"/><path d="M14 3.8v4h4"/><path d="M9.5 12h5"/><path d="M9.5 15.5h3"/></svg>',
    bulk:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16"/><path d="M9 5v14"/><path d="M15 5v14"/><path d="M4 14.5h16"/></svg>',
    sheet:'<svg class="ubkt-sf-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>'
  };

  function setIcon(el,name){if(el&&ICONS[name]&&el.dataset.ubktIcon!==name){el.innerHTML=ICONS[name];el.dataset.ubktIcon=name;}}
  function prependIcon(button,name){if(!button||!ICONS[name]||button.querySelector(':scope > .ubkt-sf-icon')) return;button.insertAdjacentHTML('afterbegin',ICONS[name]);}
  function installSystemIcons(){
    const navIcons={};
    Object.entries(navIcons).forEach(([page,name])=>setIcon(document.querySelector(`.nav-item[data-page="${page}"] .nav-ico`),name));
    document.querySelectorAll('.tool-strip .tool-btn').forEach((btn)=>{const text=(btn.textContent||'').toLowerCase();if(text.includes('cảnh báo')) prependIcon(btn,'bell');else if(text.includes('nhật ký')) prependIcon(btn,'clock');else if(text.includes('csv')) prependIcon(btn,'csv');else if(text.includes('json')) prependIcon(btn,'code');else if(text.includes('khôi phục')) prependIcon(btn,'restore');});
    prependIcon(document.getElementById('headerTaskBtn'),'plusdoc');
    document.querySelectorAll('.icon-btn').forEach((btn)=>{if((btn.textContent||'').trim()==='✕'){btn.textContent='';prependIcon(btn,'close');}});
    const single=document.querySelector('.tool-card[onclick="chooseSingleTaskInput()"] > div:first-child');setIcon(single,'single');single?.classList.add('ubkt-icon-tile');
    const bulk=document.querySelector('.tool-card[onclick="chooseBulkTaskInput()"] > div:first-child');setIcon(bulk,'bulk');bulk?.classList.add('ubkt-icon-tile');
    const sheet=document.querySelector('.tool-card[onclick="chooseGoogleSheetInput()"] > div:first-child');setIcon(sheet,'sheet');sheet?.classList.add('ubkt-icon-tile');
    return true;
  }

  function installDataBootPatch(){if(window.__ubktDataBootPatchInstalled) return true;if(typeof window.login!=="function") return false;const originalLogin=window.login;window.login=async function patchedLogin(){const shouldWaitForDatabase=typeof window.isSupabaseConfigured==="function"&&window.isSupabaseConfigured();if(shouldWaitForDatabase) document.documentElement.classList.add("ubkt-db-booting");try{return await originalLogin.apply(this,arguments);}finally{if(shouldWaitForDatabase) document.documentElement.classList.remove("ubkt-db-booting");}};window.__ubktDataBootPatchInstalled=true;return true;}
  document.addEventListener("DOMContentLoaded",()=>{installSystemIcons();installDataBootPatch();});
})();

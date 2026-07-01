// Cấu hình Supabase cho UBKT Dashboard - production
// Chỉ dùng publishable/anon key ở frontend. Không dùng service_role key trong trình duyệt.

window.UBKT_SUPABASE_URL = "https://hbygfheibcrqaqzoaass.supabase.co";

// Dùng publishable key mới của Supabase
window.UBKT_SUPABASE_ANON_KEY = "sb_publishable_jGSrZLhYPIwvpVZ_j4yo5g_LuVhs0Jh";

// Chạy chính thức bằng Supabase Auth
window.UBKT_AUTH_MODE = "supabase";

// Lịch công tác hiển thị trực tiếp trong tab Dashboard cũ.
window.UBKT_TASK_SYSTEM_URL = "https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Asia%2FHo_Chi_Minh&hl=vi&src=MDQwNDAxMjQwMDgyQHN0LmJ1aC5lZHUudm4&src=Y19mYmIxYzcwNDFlYmRiNmFkYTI5M2U4NjIxNGU3N2U2MDU2NWE3MTE0MTJiMTU5NmQwMzkzYWMyMGIyOTg2MzNiQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20&src=Y19jbGFzc3Jvb20yNzYxM2RmYUBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&src=ZW4udmlldG5hbWVzZSNob2xpZGF5QGdyb3VwLnYuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&src=dmkudmlldG5hbWVzZSNob2xpZGF5QGdyb3VwLnYuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&color=%23039be5&color=%23ef6c00&color=%23137333&color=%230b8043&color=%230b8043";
window.UBKT_TASK_SYSTEM_APP_URL = "https://ubkt-dashboard-qycx.vercel.app";

(function installDashboardIntegration(){
  const TASK_SYSTEM_TITLE = "Hệ thống theo dõi nhiệm vụ";
  const TASK_SYSTEM_URL = window.UBKT_TASK_SYSTEM_URL;
  const TASK_SYSTEM_APP_URL = window.UBKT_TASK_SYSTEM_APP_URL || TASK_SYSTEM_URL;

  const style = document.createElement("style");
  style.textContent = `
    html.ubkt-db-booting #appScreen.active main{opacity:.08;pointer-events:none;transition:opacity .2s ease}
    html.ubkt-db-booting #appScreen.active::after{
      content:"Đang tải dữ liệu từ cơ sở dữ liệu...";
      position:fixed;inset:0;z-index:9999;display:grid;place-items:center;
      background:rgba(248,250,252,.72);backdrop-filter:blur(10px);
      color:#0f172a;font-weight:800;font-size:16px;letter-spacing:.01em;
    }
    .ubkt-task-system-embed{margin:18px 0}
    .ubkt-task-system-toolbar{display:flex;justify-content:flex-end;margin-bottom:10px}
    .ubkt-task-system-frame{height:min(72vh,760px);min-height:520px;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0;background:#fff}
    .ubkt-task-system-frame iframe{width:100%;height:100%;border:0;background:#fff}
  `;
  document.head.appendChild(style);

  function patchDashboardShell(){
    const navLabel = document.querySelector('[data-page="dashboard"] .nav-label');
    if(navLabel) navLabel.textContent = TASK_SYSTEM_TITLE;

    const pageTitle = document.getElementById("pageTitle");
    if(pageTitle && /dashboard|chốt kỳ|giám sát|kiểm tra|hệ thống/i.test(pageTitle.textContent || "")){
      pageTitle.textContent = TASK_SYSTEM_TITLE;
    }

    const periodMovedTitle = Array.from(document.querySelectorAll("h3")).find((el)=>/Chốt kỳ đã chuyển vào Dashboard/i.test(el.textContent || ""));
    if(periodMovedTitle) periodMovedTitle.textContent = "Chốt kỳ đã chuyển vào Hệ thống theo dõi nhiệm vụ";

    const dashboard = document.getElementById("page-dashboard");
    if(!dashboard || document.getElementById("ubktTaskSystemEmbed")) return;

    const calendarMarkup = `
      <div id="ubktTaskSystemEmbed" class="card rounded-3xl p-4 reveal ubkt-task-system-embed">
        <div class="ubkt-task-system-toolbar">
          <a href="${TASK_SYSTEM_APP_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost py-2 px-4 text-sm">Mở hệ thống</a>
        </div>
        <div class="ubkt-task-system-frame">
          <iframe src="${TASK_SYSTEM_URL}" title="${TASK_SYSTEM_TITLE} tích hợp" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
      </div>
    `;

    const firstDashboardBlock = dashboard.querySelector(":scope > .bento");
    if(firstDashboardBlock) firstDashboardBlock.insertAdjacentHTML("afterend", calendarMarkup);
    else dashboard.insertAdjacentHTML("beforeend", calendarMarkup);
  }

  function installSwitchPagePatch(){
    if(window.__ubktSwitchPagePatchInstalled) return true;
    if(typeof window.switchPage !== "function") return false;
    const originalSwitchPage = window.switchPage;
    window.switchPage = function patchedSwitchPage(page){
      const result = originalSwitchPage.apply(this, arguments);
      setTimeout(patchDashboardShell, 0);
      setTimeout(patchDashboardShell, 80);
      return result;
    };
    window.__ubktSwitchPagePatchInstalled = true;
    return true;
  }

  function installDataBootPatch(){
    if(window.__ubktDataBootPatchInstalled) return true;
    if(typeof window.login !== "function") return false;

    const originalLogin = window.login;
    window.login = async function patchedLogin(){
      const shouldWaitForDatabase = typeof window.isSupabaseConfigured === "function" && window.isSupabaseConfigured();
      if(shouldWaitForDatabase) document.documentElement.classList.add("ubkt-db-booting");
      try{
        return await originalLogin.apply(this, arguments);
      }finally{
        if(shouldWaitForDatabase) document.documentElement.classList.remove("ubkt-db-booting");
        patchDashboardShell();
      }
    };

    window.__ubktDataBootPatchInstalled = true;
    return true;
  }

  document.addEventListener("DOMContentLoaded",()=>{
    patchDashboardShell();
    const installTimer = setInterval(()=>{
      patchDashboardShell();
      const okLogin = installDataBootPatch();
      const okSwitch = installSwitchPagePatch();
      if(okLogin && okSwitch) clearInterval(installTimer);
    }, 120);
    setTimeout(()=>clearInterval(installTimer), 6000);
  });
})();
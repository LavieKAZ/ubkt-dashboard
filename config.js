// Cấu hình Supabase cho UBKT Dashboard - production
// Chỉ dùng publishable/anon key ở frontend. Không dùng service_role key trong trình duyệt.

window.UBKT_SUPABASE_URL = "https://hbygfheibcrqaqzoaass.supabase.co";

// Dùng publishable key mới của Supabase
window.UBKT_SUPABASE_ANON_KEY = "sb_publishable_jGSrZLhYPIwvpVZ_j4yo5g_LuVhs0Jh";

// Chạy chính thức bằng Supabase Auth
window.UBKT_AUTH_MODE = "supabase";

// Hệ thống lịch/nhiệm vụ tích hợp hiển thị trong tab Dashboard cũ.
window.UBKT_TASK_SYSTEM_URL = "https://ubkt-dashboard-qycx.vercel.app";

(function installDashboardIntegration(){
  const TASK_SYSTEM_TITLE = "Hệ thống theo dõi nhiệm vụ";
  const TASK_SYSTEM_URL = window.UBKT_TASK_SYSTEM_URL;

  const style = document.createElement("style");
  style.textContent = `
    html.ubkt-db-booting #appScreen.active main{opacity:.08;pointer-events:none;transition:opacity .2s ease}
    html.ubkt-db-booting #appScreen.active::after{
      content:"Đang tải dữ liệu từ cơ sở dữ liệu...";
      position:fixed;inset:0;z-index:9999;display:grid;place-items:center;
      background:rgba(248,250,252,.72);backdrop-filter:blur(10px);
      color:#0f172a;font-weight:800;font-size:16px;letter-spacing:.01em;
    }
    .ubkt-task-system-embed{margin-bottom:18px}
    .ubkt-task-system-frame{height:min(72vh,760px);min-height:520px;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0;background:#fff}
    .ubkt-task-system-frame iframe{width:100%;height:100%;border:0;background:#fff}
  `;
  document.head.appendChild(style);

  function patchDashboardShell(){
    const navLabel = document.querySelector('[data-page="dashboard"] .nav-label');
    if(navLabel) navLabel.textContent = TASK_SYSTEM_TITLE;

    const pageTitle = document.getElementById("pageTitle");
    if(pageTitle && /dashboard|chốt kỳ|giám sát|kiểm tra/i.test(pageTitle.textContent || "")){
      pageTitle.textContent = TASK_SYSTEM_TITLE;
    }

    const periodMovedTitle = Array.from(document.querySelectorAll("h3")).find((el)=>/Chốt kỳ đã chuyển vào Dashboard/i.test(el.textContent || ""));
    if(periodMovedTitle) periodMovedTitle.textContent = "Chốt kỳ đã chuyển vào Hệ thống theo dõi nhiệm vụ";

    const dashboard = document.getElementById("page-dashboard");
    if(!dashboard || document.getElementById("ubktTaskSystemEmbed")) return;

    dashboard.insertAdjacentHTML("afterbegin", `
      <div id="ubktTaskSystemEmbed" class="card rounded-3xl p-4 reveal ubkt-task-system-embed">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
          <div>
            <h3 class="font-extrabold text-lg">${TASK_SYSTEM_TITLE}</h3>
            <p class="text-sm text-slate-500 mt-1">Theo dõi lịch công tác, nhắc việc và điều phối nhiệm vụ trên hệ thống tích hợp.</p>
          </div>
          <a href="${TASK_SYSTEM_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost py-2 px-4 text-sm">Mở toàn màn hình</a>
        </div>
        <div class="ubkt-task-system-frame">
          <iframe src="${TASK_SYSTEM_URL}" title="${TASK_SYSTEM_TITLE} tích hợp" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
      </div>
    `);
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
      if(installDataBootPatch()) clearInterval(installTimer);
    }, 120);
    setTimeout(()=>clearInterval(installTimer), 6000);
  });
})();

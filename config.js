// Cấu hình Supabase cho UBKT Dashboard - production
// Chỉ dùng publishable/anon key ở frontend. Không dùng service_role key trong trình duyệt.

window.UBKT_SUPABASE_URL = "https://hbygfheibcrqaqzoaass.supabase.co";
window.UBKT_SUPABASE_ANON_KEY = "sb_publishable_jGSrZLhYPIwvpVZ_j4yo5g_LuVhs0Jh";
window.UBKT_AUTH_MODE = "supabase";

window.UBKT_TASK_SYSTEM_URL = "https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Asia%2FHo_Chi_Minh&hl=vi&src=MDQwNDAxMjQwMDgyQHN0LmJ1aC5lZHUudm4&src=Y19mYmIxYzcwNDFlYmRiNmFkYTI5M2U4NjIxNGU3N2U2MDU2NWE3MTE0MTJiMTU5NmQwMzkzYWMyMGIyOTg2MzNiQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20&src=Y19jbGFzc3Jvb20yNzYxM2RmYUBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&src=ZW4udmlldG5hbWVzZSNob2xpZGF5QGdyb3VwLnYuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&src=dmkudmlldG5hbWVzZSNob2xpZGF5QGdyb3VwLnYuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&color=%23039be5&color=%23ef6c00&color=%23137333&color=%230b8043&color=%230b8043";
window.UBKT_TASK_SYSTEM_APP_URL = "https://ubkt-dashboard-qycx.vercel.app";
window.UBKT_GEMINI_MODEL = "gemini-2.0-flash";

(function installDashboardIntegration(){
  const TASK_SYSTEM_TITLE = "Hệ thống theo dõi nhiệm vụ";
  const TASK_SYSTEM_URL = window.UBKT_TASK_SYSTEM_URL;
  const TASK_SYSTEM_APP_URL = window.UBKT_TASK_SYSTEM_APP_URL || TASK_SYSTEM_URL;

  const style = document.createElement("style");
  style.textContent = `
    html.ubkt-db-booting #appScreen.active main{opacity:.08;pointer-events:none;transition:opacity .2s ease}
    html.ubkt-db-booting #appScreen.active::after{content:"Đang tải dữ liệu từ cơ sở dữ liệu...";position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(248,250,252,.72);backdrop-filter:blur(10px);color:#0f172a;font-weight:800;font-size:16px;letter-spacing:.01em}
    .ubkt-task-system-embed{margin:18px 0}.ubkt-task-system-toolbar{display:flex;justify-content:flex-end;margin-bottom:10px}.ubkt-task-system-frame{height:min(72vh,760px);min-height:520px;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0;background:#fff}.ubkt-task-system-frame iframe{width:100%;height:100%;border:0;background:#fff}
    #pendingTableCard.ubkt-collapsed .ubkt-pending-body{display:none!important}#pendingTableCard .ubkt-pending-toggle{white-space:nowrap}

    #page-dashboard>.bento>.kpi-bento.card,#page-dashboard>.bento>.card.b-span-3.reveal:not(.bento-card){position:relative!important;overflow:hidden!important;min-height:188px;border-radius:30px!important;background:linear-gradient(145deg,rgba(255,255,255,.80),rgba(245,250,255,.48))!important;border:1px solid rgba(255,255,255,.78)!important;box-shadow:0 24px 60px rgba(31,42,68,.13),inset 0 1px 0 rgba(255,255,255,.92),inset 0 -1px 0 rgba(148,163,184,.16)!important;backdrop-filter:blur(28px) saturate(1.22)!important;-webkit-backdrop-filter:blur(28px) saturate(1.22)!important;transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease!important}
    #page-dashboard>.bento>.kpi-bento.card:hover,#page-dashboard>.bento>.card.b-span-3.reveal:not(.bento-card):hover{transform:translateY(-3px);box-shadow:0 30px 76px rgba(31,42,68,.17),inset 0 1px 0 rgba(255,255,255,.96)!important;border-color:rgba(255,255,255,.95)!important}
    #page-dashboard>.bento>.kpi-bento.card::before,#page-dashboard>.bento>.card.b-span-3.reveal:not(.bento-card)::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 16% 8%,rgba(255,255,255,.85),transparent 34%),linear-gradient(120deg,rgba(255,255,255,.42),transparent 42%);pointer-events:none;z-index:0}
    #page-dashboard>.bento>.kpi-bento.card::after,#page-dashboard>.bento>.card.b-span-3.reveal:not(.bento-card)::after{content:"";position:absolute;width:108px;height:108px;border-radius:50%;right:-26px;bottom:-28px;background:radial-gradient(circle,rgba(107,203,119,.18),rgba(107,203,119,.05) 58%,transparent 72%);filter:blur(.2px);pointer-events:none;z-index:0}
    #page-dashboard>.bento>.kpi-bento.card:nth-child(2)::after{background:radial-gradient(circle,rgba(77,150,255,.18),rgba(77,150,255,.05) 58%,transparent 72%)}
    #page-dashboard>.bento>.kpi-bento.card:nth-child(3)::after{background:radial-gradient(circle,rgba(255,107,107,.18),rgba(255,107,107,.05) 58%,transparent 72%)}
    #page-dashboard>.bento>.kpi-bento.card>* ,#page-dashboard>.bento>.card.b-span-3.reveal:not(.bento-card)>*{position:relative;z-index:1}
    #page-dashboard .kpi-bento{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;text-align:center!important;padding:22px 18px!important;gap:6px!important}
    #page-dashboard .kb-label,#page-dashboard .km-label{font-size:11px!important;letter-spacing:.08em!important;color:#8aa0ba!important;font-weight:950!important;text-transform:uppercase!important;line-height:1.2!important}
    #page-dashboard .kb-val{font-size:48px!important;line-height:.95!important;font-weight:950!important;letter-spacing:-.02em!important;text-shadow:0 8px 22px rgba(31,42,68,.08)!important}
    #page-dashboard .kb-sub,#page-dashboard .km-sub{font-size:12px!important;color:#a3b2c6!important;font-weight:800!important;line-height:1.25!important}
    #page-dashboard .kb-bar{width:100%!important;height:4px!important;margin-top:12px!important;background:rgba(226,232,240,.68)!important;border-radius:999px!important;overflow:hidden!important}.kb-bar-fill{height:100%!important;border-radius:999px!important;box-shadow:0 0 18px currentColor!important}
    #page-dashboard .kb-glow{opacity:.05!important;width:120px!important;height:120px!important;right:-36px!important;bottom:-40px!important;filter:blur(0)!important}
    #page-dashboard>.bento>.card.b-span-3.reveal:not(.bento-card){padding:0!important;display:grid!important;grid-template-rows:1.05fr .86fr!important;gap:0!important}
    #page-dashboard>.bento>.card.b-span-3.reveal:not(.bento-card)>button.kpi-mini{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;text-align:center!important;padding:18px 14px 14px!important;gap:4px!important}
    #page-dashboard>.bento>.card.b-span-3.reveal:not(.bento-card)>div{display:grid!important;grid-template-columns:1fr 1fr!important;border-top:1px solid rgba(226,232,240,.70)!important;background:rgba(255,255,255,.22)!important;min-height:78px!important}
    #page-dashboard>.bento>.card.b-span-3.reveal:not(.bento-card)>div>button.kpi-mini{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;text-align:center!important;padding:12px 8px!important;gap:3px!important;border-color:rgba(226,232,240,.70)!important}
    #page-dashboard .km-val{font-size:40px!important;line-height:1!important;font-weight:950!important;letter-spacing:-.02em!important}#page-dashboard>.bento>.card.b-span-3.reveal:not(.bento-card)>div .km-val{font-size:24px!important}
    #page-dashboard .ai-digest-icon{background:linear-gradient(135deg,rgba(66,133,244,.18),rgba(52,168,83,.16))!important;color:#1a73e8!important}.ai-badge{background:rgba(66,133,244,.10)!important;color:#1a73e8!important;border-color:rgba(66,133,244,.22)!important}
  `;
  document.head.appendChild(style);

  function patchDashboardShell(){
    const navLabel = document.querySelector('[data-page="dashboard"] .nav-label');
    if(navLabel) navLabel.textContent = TASK_SYSTEM_TITLE;
    const pageTitle = document.getElementById("pageTitle");
    if(pageTitle && /dashboard|chốt kỳ|giám sát|kiểm tra|hệ thống/i.test(pageTitle.textContent || "")) pageTitle.textContent = TASK_SYSTEM_TITLE;
    const periodMovedTitle = Array.from(document.querySelectorAll("h3")).find((el)=>/Chốt kỳ đã chuyển vào Dashboard/i.test(el.textContent || ""));
    if(periodMovedTitle) periodMovedTitle.textContent = "Chốt kỳ đã chuyển vào Hệ thống theo dõi nhiệm vụ";
    const dashboard = document.getElementById("page-dashboard");
    if(!dashboard || document.getElementById("ubktTaskSystemEmbed")) return;
    const calendarMarkup = `<div id="ubktTaskSystemEmbed" class="card rounded-3xl p-4 reveal ubkt-task-system-embed"><div class="ubkt-task-system-toolbar"><a href="${TASK_SYSTEM_APP_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost py-2 px-4 text-sm">Mở hệ thống</a></div><div class="ubkt-task-system-frame"><iframe src="${TASK_SYSTEM_URL}" title="${TASK_SYSTEM_TITLE} tích hợp" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div>`;
    const firstDashboardBlock = dashboard.querySelector(":scope > .bento");
    if(firstDashboardBlock) firstDashboardBlock.insertAdjacentHTML("afterend", calendarMarkup);
    else dashboard.insertAdjacentHTML("beforeend", calendarMarkup);
  }

  function patchPendingSection(){
    const card = document.getElementById("pendingTableCard");
    if(!card) return false;
    const title = Array.from(card.querySelectorAll(".bento-hd")).find((el)=>/Nhiệm vụ tồn đọng/i.test(el.textContent || ""));
    if(!title) return false;
    if(!card.dataset.ubktPendingPatched){
      Array.from(card.children).forEach((child, index)=>{ if(index > 0) child.classList.add("ubkt-pending-body"); });
      const actionWrap = card.querySelector(".bento-hd-row > div:last-child");
      if(actionWrap && !card.querySelector(".ubkt-pending-toggle")){
        const button = document.createElement("button");
        button.type = "button"; button.className = "btn btn-primary py-1 px-3 text-sm ubkt-pending-toggle"; button.textContent = "Xem chi tiết";
        button.addEventListener("click",()=>{ const collapsed = card.classList.toggle("ubkt-collapsed"); button.textContent = collapsed ? "Xem chi tiết" : "Ẩn chi tiết"; });
        actionWrap.prepend(button);
      }
      card.dataset.ubktPendingPatched = "1"; card.classList.add("ubkt-collapsed");
    }
    const toggle = card.querySelector(".ubkt-pending-toggle");
    if(toggle) toggle.textContent = card.classList.contains("ubkt-collapsed") ? "Xem chi tiết" : "Ẩn chi tiết";
    return true;
  }

  function patchAiDigestUi(){
    const keyLabel = document.querySelector('label[for="aiApiKey"], .ai-config-item label.ai-config-label:last-of-type');
    const keyInput = document.getElementById('aiApiKey');
    if(keyInput){
      const item = keyInput.closest('.ai-config-item');
      const label = item?.querySelector('.ai-config-label');
      if(label) label.textContent = 'Gemini API Key';
      keyInput.placeholder = 'AIza...';
      keyInput.setAttribute('autocomplete','off');
    } else if(keyLabel && /Claude|Anthropic/i.test(keyLabel.textContent||'')) keyLabel.textContent = 'Gemini API Key';
    document.querySelectorAll('.ai-badge').forEach((el)=>{ el.textContent = '✦ Gemini AI'; });
  }

  function installGeminiDigestPatch(){
    if(window.__ubktGeminiDigestPatchInstalled) return true;
    if(typeof window.buildDigestPrompt !== 'function' || typeof window.runAIDigest !== 'function') return false;

    window.runAIDigest = async function runGeminiDigest(){
      const key = (document.getElementById('aiApiKey')?.value || (typeof loadApiKey === 'function' ? loadApiKey() : '') || '').trim();
      if(!key || key.length < 20 || key.startsWith('sk-ant-')){
        alert('Vui lòng nhập Gemini API Key hợp lệ. Có thể lấy key tại Google AI Studio.');
        document.getElementById('aiApiKey')?.focus();
        return;
      }
      if(typeof saveApiKey === 'function') saveApiKey(key);

      const btn=document.getElementById('aiDigestBtn');
      const status=document.getElementById('aiDigestStatus');
      const statusText=document.getElementById('aiDigestStatusText');
      const typingWrap=document.getElementById('aiTypingWrap');
      const typingMsg=document.getElementById('aiTypingMsg');
      const output=document.getElementById('aiDigestOutput');
      const streamBox=document.getElementById('aiStreamBox');
      const progressFill=document.getElementById('aiProgressFill');
      const copyBtn=document.getElementById('aiCopyBtn');
      const resetBtn=document.getElementById('aiResetBtn');
      const contentEl=document.getElementById('aiDigestContent');
      const meta=document.getElementById('aiDigestMeta');

      if(btn) btn.disabled=true;
      if(output) output.style.display='none';
      if(typingWrap) typingWrap.style.display='block';
      if(streamBox) streamBox.textContent='';
      if(status) status.className='ai-status-chip ai-status-running';
      if(statusText) statusText.textContent='Đang tạo bằng Gemini...';

      const msgs=['Gemini đang đọc dữ liệu...','Phân tích tiến độ đơn vị...','Xác định tồn đọng cần xử lý...','Soạn thảo tóm tắt triển khai...'];
      let mi=0;
      const progInterval=setInterval(()=>{
        if(typingMsg) typingMsg.textContent=msgs[mi%msgs.length]; mi++;
        if(progressFill) progressFill.style.width=Math.min(88,parseInt(progressFill.style.width||0)+Math.random()*16)+'%';
      },850);

      try{
        const prompt = window.buildDigestPrompt();
        const model = window.UBKT_GEMINI_MODEL || 'gemini-2.0-flash';
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            contents:[{role:'user',parts:[{text:prompt}]}],
            generationConfig:{temperature:0.25,maxOutputTokens:1400}
          })
        });
        clearInterval(progInterval);
        if(progressFill) progressFill.style.width='100%';
        if(!resp.ok){
          const err=await resp.json().catch(()=>({}));
          throw new Error(err?.error?.message || `HTTP ${resp.status}`);
        }
        const data=await resp.json();
        const text=(data?.candidates?.[0]?.content?.parts||[]).map((part)=>part.text||'').join('\n').trim() || 'Không có phản hồi.';
        if(typingMsg) typingMsg.textContent='Hoàn tất!';
        await new Promise(r=>setTimeout(r,350));
        if(typingWrap) typingWrap.style.display='none';
        if(output) output.style.display='block';
        if(contentEl){
          const words=text.split(' '); contentEl.textContent=''; let i=0;
          const typeInterval=setInterval(()=>{ if(i>=words.length){clearInterval(typeInterval);return;} const chunk=words.slice(i,i+4).join(' '); contentEl.textContent+=(i===0?'':' ')+chunk; i+=4; contentEl.scrollTop=contentEl.scrollHeight; },30);
        }
        const total=document.getElementById('mTotal')?.textContent || '?';
        const now=new Date().toLocaleString('vi-VN');
        if(meta) meta.textContent=`Tạo lúc ${now} · ${total} nhiệm vụ · Gemini ${data?.usageMetadata?.totalTokenCount || '?'} tokens`;
        if(status) status.className='ai-status-chip ai-status-done';
        if(statusText) statusText.textContent='Đã tạo xong';
        if(copyBtn) copyBtn.style.display='';
        if(resetBtn) resetBtn.style.display='';
        window._aiDigestText=text;
      }catch(err){
        clearInterval(progInterval);
        if(typingWrap) typingWrap.style.display='none';
        if(status) status.className='ai-status-chip ai-status-idle';
        if(statusText) statusText.textContent='Lỗi';
        const errMsg=err?.message||String(err);
        alert('Lỗi khi gọi Gemini API:\n'+errMsg+'\n\nKiểm tra lại Gemini API Key và quyền sử dụng model.');
        console.error('[Gemini AI Digest]',err);
      }finally{
        if(btn) btn.disabled=false;
      }
    };

    window.__ubktGeminiDigestPatchInstalled = true;
    return true;
  }

  function installSwitchPagePatch(){
    if(window.__ubktSwitchPagePatchInstalled) return true;
    if(typeof window.switchPage !== "function") return false;
    const originalSwitchPage = window.switchPage;
    window.switchPage = function patchedSwitchPage(page){
      const result = originalSwitchPage.apply(this, arguments);
      setTimeout(patchDashboardShell, 0); setTimeout(patchDashboardShell, 80); setTimeout(patchPendingSection, 120); setTimeout(patchAiDigestUi, 140);
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
      try{ return await originalLogin.apply(this, arguments); }
      finally{ if(shouldWaitForDatabase) document.documentElement.classList.remove("ubkt-db-booting"); patchDashboardShell(); patchPendingSection(); patchAiDigestUi(); installGeminiDigestPatch(); }
    };
    window.__ubktDataBootPatchInstalled = true;
    return true;
  }

  document.addEventListener("DOMContentLoaded",()=>{
    patchDashboardShell(); patchPendingSection(); patchAiDigestUi();
    const installTimer = setInterval(()=>{
      patchDashboardShell(); patchPendingSection(); patchAiDigestUi();
      const okLogin = installDataBootPatch();
      const okSwitch = installSwitchPagePatch();
      const okGemini = installGeminiDigestPatch();
      if(okLogin && okSwitch && okGemini) clearInterval(installTimer);
    }, 120);
    setTimeout(()=>clearInterval(installTimer), 7000);
  });
})();
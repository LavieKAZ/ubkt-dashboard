// Cấu hình Supabase cho UBKT Dashboard - production
// Chỉ dùng publishable/anon key ở frontend. Không dùng service_role key trong trình duyệt.
window.UBKT_SUPABASE_URL = "https://hbygfheibcrqaqzoaass.supabase.co";
window.UBKT_SUPABASE_ANON_KEY = "sb_publishable_jGSrZLhYPIwvpVZ_j4yo5g_LuVhs0Jh";
window.UBKT_AUTH_MODE = "supabase";
window.UBKT_GEMINI_MODEL = "gemini-2.0-flash";
window.UBKT_TASK_SYSTEM_URL = "https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Asia%2FHo_Chi_Minh&hl=vi&src=MDQwNDAxMjQwMDgyQHN0LmJ1aC5lZHUudm4&src=Y19mYmIxYzcwNDFlYmRiNmFkYTI5M2U4NjIxNGU3N2U2MDU2NWE3MTE0MTJiMTU5NmQwMzkzYWMyMGIyOTg2MzNiQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20&src=Y19jbGFzc3Jvb20yNzYxM2RmYUBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&src=ZW4udmlldG5hbWVzZSNob2xpZGF5QGdyb3VwLnYuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&src=dmkudmlldG5hbWVzZSNob2xpZGF5QGdyb3VwLnYuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&color=%23039be5&color=%23ef6c00&color=%23137333&color=%230b8043&color=%230b8043";
window.UBKT_TASK_SYSTEM_APP_URL = "https://ubkt-dashboard-qycx.vercel.app";

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
    #page-dashboard .ai-digest-icon{background:linear-gradient(135deg,rgba(66,133,244,.18),rgba(52,168,83,.16))!important;color:#1a73e8!important}.ai-badge{background:rgba(66,133,244,.10)!important;color:#1a73e8!important;border-color:rgba(66,133,244,.22)!important}
    .ubkt-sf-icon{width:1.18em;height:1.18em;display:inline-block;flex:0 0 auto;color:currentColor;fill:none;stroke:currentColor;stroke-width:2.15;stroke-linecap:round;stroke-linejoin:round;opacity:1!important;filter:none!important;transform:none!important;visibility:visible!important;overflow:visible;vertical-align:-.18em;pointer-events:none}
    .ubkt-sf-icon .fill{fill:currentColor;stroke:none}.nav-ico .ubkt-sf-icon{width:20px;height:20px}.nav-ico{color:inherit;display:inline-grid;place-items:center;min-width:24px}.nav-item:hover .ubkt-sf-icon,.nav-item.active .ubkt-sf-icon,.tool-btn:hover .ubkt-sf-icon,.tool-card:hover .ubkt-sf-icon{opacity:1!important;filter:none!important;visibility:visible!important}
    #page-dashboard .tool-strip{display:flex!important;align-items:center;gap:10px;flex-wrap:wrap;padding:8px;border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.82),rgba(248,250,252,.72));border:1px solid rgba(226,232,240,.84);box-shadow:inset 0 1px 0 rgba(255,255,255,.9)}
    #page-dashboard .tool-btn{display:inline-flex!important;align-items:center;justify-content:center;gap:8px;min-height:38px;line-height:1.15;white-space:nowrap}.tool-btn .ubkt-sf-icon{width:17px;height:17px}.btn .ubkt-sf-icon{width:16px;height:16px}.icon-btn .ubkt-sf-icon{width:18px;height:18px}
    .ubkt-icon-tile{font-size:22px!important}.ubkt-icon-tile .ubkt-sf-icon{width:24px;height:24px}.tool-card .ubkt-sf-icon{opacity:1!important;filter:none!important;visibility:visible!important}
    .modal{z-index:5000!important;padding:1rem 1rem calc(1rem + env(safe-area-inset-bottom,0px))!important}.modal.open{display:flex!important}.modal-card{max-height:calc(100vh - 2rem - env(safe-area-inset-bottom,0px))!important}
    #taskModal.modal{align-items:flex-start!important;overflow-y:auto!important;padding-top:18px!important;padding-bottom:132px!important}#taskModal .modal-card{max-height:calc(100vh - 150px)!important;margin-bottom:108px!important}#taskModal .modal-card>.p-5.border-t{position:sticky;bottom:0;z-index:5;background:rgba(255,255,255,.96);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 -12px 28px rgba(15,23,42,.08)}
    @media(min-width:768px){#taskModal.modal{padding-bottom:96px!important}#taskModal .modal-card{max-height:calc(100vh - 114px)!important;margin-bottom:72px!important}}
  `;
  document.head.appendChild(style);

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

  function patchDashboardShell(){
    const navLabel=document.querySelector('[data-page="dashboard"] .nav-label');
    if(navLabel) navLabel.textContent=TASK_SYSTEM_TITLE;
    const pageTitle=document.getElementById('pageTitle');
    if(pageTitle&&/dashboard|chốt kỳ|giám sát|kiểm tra|hệ thống/i.test(pageTitle.textContent||'')) pageTitle.textContent=TASK_SYSTEM_TITLE;
    const periodMovedTitle=Array.from(document.querySelectorAll('h3')).find((el)=>/Chốt kỳ đã chuyển vào Dashboard/i.test(el.textContent||''));
    if(periodMovedTitle) periodMovedTitle.textContent='Chốt kỳ đã chuyển vào Hệ thống theo dõi nhiệm vụ';
    const dashboard=document.getElementById('page-dashboard');
    if(!dashboard||document.getElementById('ubktTaskSystemEmbed')) return;
    const calendarMarkup=`<div id="ubktTaskSystemEmbed" class="card rounded-3xl p-4 reveal ubkt-task-system-embed"><div class="ubkt-task-system-toolbar"><a href="${TASK_SYSTEM_APP_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost py-2 px-4 text-sm">Mở hệ thống</a></div><div class="ubkt-task-system-frame"><iframe src="${TASK_SYSTEM_URL}" title="${TASK_SYSTEM_TITLE} tích hợp" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div>`;
    const firstDashboardBlock=dashboard.querySelector(':scope > .bento');
    if(firstDashboardBlock) firstDashboardBlock.insertAdjacentHTML('afterend',calendarMarkup); else dashboard.insertAdjacentHTML('beforeend',calendarMarkup);
  }

  function setIcon(el,name){if(el&&ICONS[name]&&el.dataset.ubktIcon!==name){el.innerHTML=ICONS[name];el.dataset.ubktIcon=name;}}
  function prependIcon(button,name){if(!button||!ICONS[name]||button.querySelector(':scope > .ubkt-sf-icon')) return;button.insertAdjacentHTML('afterbegin',ICONS[name]);}
  function installSystemIcons(){
    const navIcons={dashboard:'chart',tasks:'tasks',opinion:'chat',conclusions:'checkdoc',indicators:'target',kpReports:'grid',dossiers:'folder',reports:'report'};
    Object.entries(navIcons).forEach(([page,name])=>setIcon(document.querySelector(`.nav-item[data-page="${page}"] .nav-ico`),name));
    const mapIcon=document.querySelector('.nav-item[onclick*="ban-do-ktgs"] .nav-ico');setIcon(mapIcon,'pin');
    document.querySelectorAll('.tool-strip .tool-btn').forEach((btn)=>{const text=(btn.textContent||'').toLowerCase();if(text.includes('cảnh báo')) prependIcon(btn,'bell');else if(text.includes('nhật ký')) prependIcon(btn,'clock');else if(text.includes('csv')) prependIcon(btn,'csv');else if(text.includes('json')) prependIcon(btn,'code');else if(text.includes('khôi phục')) prependIcon(btn,'restore');});
    prependIcon(document.getElementById('headerTaskBtn'),'plusdoc');prependIcon(document.getElementById('headerPeriodBtn'),'calendar');prependIcon(document.querySelector('button[onclick="toggleSidebar()"]'),'menu');
    document.querySelectorAll('.icon-btn').forEach((btn)=>{if((btn.textContent||'').trim()==='✕'){btn.textContent='';prependIcon(btn,'close');}});
    const single=document.querySelector('.tool-card[onclick="chooseSingleTaskInput()"] > div:first-child');setIcon(single,'single');single?.classList.add('ubkt-icon-tile');
    const bulk=document.querySelector('.tool-card[onclick="chooseBulkTaskInput()"] > div:first-child');setIcon(bulk,'bulk');bulk?.classList.add('ubkt-icon-tile');
    const sheet=document.querySelector('.tool-card[onclick="chooseGoogleSheetInput()"] > div:first-child');setIcon(sheet,'sheet');sheet?.classList.add('ubkt-icon-tile');
    return true;
  }

  function patchPendingSection(){
    const card=document.getElementById('pendingTableCard'); if(!card) return false;
    const title=Array.from(card.querySelectorAll('.bento-hd')).find((el)=>/Nhiệm vụ tồn đọng/i.test(el.textContent||'')); if(!title) return false;
    if(!card.dataset.ubktPendingPatched){
      Array.from(card.children).forEach((child,index)=>{if(index>0) child.classList.add('ubkt-pending-body');});
      const actionWrap=card.querySelector('.bento-hd-row > div:last-child');
      if(actionWrap&&!card.querySelector('.ubkt-pending-toggle')){const button=document.createElement('button');button.type='button';button.className='btn btn-primary py-1 px-3 text-sm ubkt-pending-toggle';button.textContent='Xem chi tiết';button.addEventListener('click',()=>{const collapsed=card.classList.toggle('ubkt-collapsed');button.textContent=collapsed?'Xem chi tiết':'Ẩn chi tiết';});actionWrap.prepend(button);}
      card.dataset.ubktPendingPatched='1';card.classList.add('ubkt-collapsed');
    }
    const toggle=card.querySelector('.ubkt-pending-toggle'); if(toggle) toggle.textContent=card.classList.contains('ubkt-collapsed')?'Xem chi tiết':'Ẩn chi tiết'; return true;
  }

  function patchAiDigestUi(){const keyInput=document.getElementById('aiApiKey');if(keyInput){const item=keyInput.closest('.ai-config-item');const label=item?.querySelector('.ai-config-label');if(label) label.textContent='Gemini API Key';keyInput.placeholder='AIza...';keyInput.setAttribute('autocomplete','off');}document.querySelectorAll('.ai-badge').forEach((el)=>{el.textContent='✦ Gemini AI';});}

  function installGeminiDigestPatch(){
    if(window.__ubktGeminiDigestPatchInstalled) return true;
    if(typeof window.buildDigestPrompt!=='function'||typeof window.runAIDigest!=='function') return false;
    window.runAIDigest=async function runGeminiDigest(){
      const key=(document.getElementById('aiApiKey')?.value||(typeof loadApiKey==='function'?loadApiKey():'')||'').trim();
      if(!key||key.length<20||key.startsWith('sk-ant-')){alert('Vui lòng nhập Gemini API Key hợp lệ. Có thể lấy key tại Google AI Studio.');document.getElementById('aiApiKey')?.focus();return;}
      if(typeof saveApiKey==='function') saveApiKey(key);
      const btn=document.getElementById('aiDigestBtn'),status=document.getElementById('aiDigestStatus'),statusText=document.getElementById('aiDigestStatusText'),typingWrap=document.getElementById('aiTypingWrap'),typingMsg=document.getElementById('aiTypingMsg'),output=document.getElementById('aiDigestOutput'),streamBox=document.getElementById('aiStreamBox'),progressFill=document.getElementById('aiProgressFill'),copyBtn=document.getElementById('aiCopyBtn'),resetBtn=document.getElementById('aiResetBtn'),contentEl=document.getElementById('aiDigestContent'),meta=document.getElementById('aiDigestMeta');
      if(btn) btn.disabled=true;if(output) output.style.display='none';if(typingWrap) typingWrap.style.display='block';if(streamBox) streamBox.textContent='';if(status) status.className='ai-status-chip ai-status-running';if(statusText) statusText.textContent='Đang tạo bằng Gemini...';
      const msgs=['Gemini đang đọc dữ liệu...','Phân tích tiến độ đơn vị...','Xác định tồn đọng cần xử lý...','Soạn thảo tóm tắt triển khai...'];let mi=0;const progInterval=setInterval(()=>{if(typingMsg) typingMsg.textContent=msgs[mi%msgs.length];mi++;if(progressFill) progressFill.style.width=Math.min(88,parseInt(progressFill.style.width||0)+Math.random()*16)+'%';},850);
      try{const model=window.UBKT_GEMINI_MODEL||'gemini-2.0-flash';const resp=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:window.buildDigestPrompt()}]}],generationConfig:{temperature:0.25,maxOutputTokens:1400}})});clearInterval(progInterval);if(progressFill) progressFill.style.width='100%';if(!resp.ok){const err=await resp.json().catch(()=>({}));throw new Error(err?.error?.message||`HTTP ${resp.status}`);}const data=await resp.json();const text=(data?.candidates?.[0]?.content?.parts||[]).map((part)=>part.text||'').join('\n').trim()||'Không có phản hồi.';if(typingMsg) typingMsg.textContent='Hoàn tất!';await new Promise(r=>setTimeout(r,350));if(typingWrap) typingWrap.style.display='none';if(output) output.style.display='block';if(contentEl){const words=text.split(' ');contentEl.textContent='';let i=0;const typeInterval=setInterval(()=>{if(i>=words.length){clearInterval(typeInterval);return;}const chunk=words.slice(i,i+4).join(' ');contentEl.textContent+=(i===0?'':' ')+chunk;i+=4;contentEl.scrollTop=contentEl.scrollHeight;},30);}const total=document.getElementById('mTotal')?.textContent||'?';const now=new Date().toLocaleString('vi-VN');if(meta) meta.textContent=`Tạo lúc ${now} · ${total} nhiệm vụ · Gemini ${data?.usageMetadata?.totalTokenCount||'?'} tokens`;if(status) status.className='ai-status-chip ai-status-done';if(statusText) statusText.textContent='Đã tạo xong';if(copyBtn) copyBtn.style.display='';if(resetBtn) resetBtn.style.display='';window._aiDigestText=text;}catch(err){clearInterval(progInterval);if(typingWrap) typingWrap.style.display='none';if(status) status.className='ai-status-chip ai-status-idle';if(statusText) statusText.textContent='Lỗi';alert('Lỗi khi gọi Gemini API:\n'+(err?.message||String(err))+'\n\nKiểm tra lại Gemini API Key và quyền sử dụng model.');console.error('[Gemini AI Digest]',err);}finally{if(btn) btn.disabled=false;}
    };
    window.__ubktGeminiDigestPatchInstalled=true;return true;
  }

  function installSwitchPagePatch(){if(window.__ubktSwitchPagePatchInstalled) return true;if(typeof window.switchPage!=="function") return false;const originalSwitchPage=window.switchPage;window.switchPage=function patchedSwitchPage(page){const result=originalSwitchPage.apply(this,arguments);setTimeout(patchDashboardShell,0);setTimeout(patchDashboardShell,80);setTimeout(patchPendingSection,120);setTimeout(patchAiDigestUi,140);setTimeout(installSystemIcons,160);return result;};window.__ubktSwitchPagePatchInstalled=true;return true;}
  function installDataBootPatch(){if(window.__ubktDataBootPatchInstalled) return true;if(typeof window.login!=="function") return false;const originalLogin=window.login;window.login=async function patchedLogin(){const shouldWaitForDatabase=typeof window.isSupabaseConfigured==="function"&&window.isSupabaseConfigured();if(shouldWaitForDatabase) document.documentElement.classList.add("ubkt-db-booting");try{return await originalLogin.apply(this,arguments);}finally{if(shouldWaitForDatabase) document.documentElement.classList.remove("ubkt-db-booting");patchDashboardShell();patchPendingSection();patchAiDigestUi();installGeminiDigestPatch();installSystemIcons();}};window.__ubktDataBootPatchInstalled=true;return true;}
  document.addEventListener("DOMContentLoaded",()=>{patchDashboardShell();patchPendingSection();patchAiDigestUi();installSystemIcons();const installTimer=setInterval(()=>{patchDashboardShell();patchPendingSection();patchAiDigestUi();installSystemIcons();const okLogin=installDataBootPatch();const okSwitch=installSwitchPagePatch();const okGemini=installGeminiDigestPatch();if(okLogin&&okSwitch&&okGemini) clearInterval(installTimer);},120);setTimeout(()=>clearInterval(installTimer),7000);});
})();
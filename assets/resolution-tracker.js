(function resolutionTrackerModule(){
  const state={payload:null,syncedAt:null,period:"",query:"",loading:false,loaded:false};
  const sheetUrl=window.UBKT_RESOLUTION_SHEET_URL||"https://docs.google.com/spreadsheets/d/1T9MJqrWKxlEHPqZWDFFHEgh_4Urry9eD8tkZq-WI_ME/edit";

  function esc(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));}
  function normalize(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
  function currentPeriod(){
    const periods=state.payload?.periods||[];
    return periods.find(period=>period.key===state.period)||periods[periods.length-1]||{key:"",label:"Chưa có kỳ"};
  }
  function periodValue(item,key){return (item.periods||[]).find(period=>period.key===key)||{};}
  function statusClass(status){const value=normalize(status);if(value.includes("hoan thanh"))return"is-done";if(value.includes("dang thuc hien"))return"is-doing";if(value.includes("kho khan")||value.includes("vuong mac"))return"is-blocked";return"";}
  function isUpdated(status){return !!status&&normalize(status)!=="chua cap nhat";}
  function authHeaders(){
    const token=window.__UBKT_RESOLUTION_ACCESS_TOKEN__||"";
    return token?{Authorization:`Bearer ${token}`} : {};
  }
  async function refreshToken(){
    if(typeof getSupabaseClient!=="function")return"";
    const {data}=await getSupabaseClient().auth.getSession();
    const token=data?.session?.access_token||"";
    window.__UBKT_RESOLUTION_ACCESS_TOKEN__=token;
    return token;
  }
  function formatTime(value){if(!value)return"Chưa đồng bộ";try{return new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(value));}catch{return value;}}
  function setLoading(loading){state.loading=loading;document.getElementById("resolutionSyncButton")?.classList.toggle("rq-syncing",loading);const button=document.getElementById("resolutionSyncButton");if(button)button.textContent=loading?"Đang đồng bộ...":"Đồng bộ từ Google Sheets";}

  async function loadSnapshot(){
    if(state.loading)return;
    setLoading(true);
    try{
      await refreshToken();
      const response=await fetch("/api/resolutions",{headers:authHeaders(),cache:"no-store"});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Không đọc được dữ liệu đã đồng bộ.");
      state.payload=result.payload||null;
      state.syncedAt=result.synced_at||null;
      state.period=state.payload?.periods?.at(-1)?.key||"";
      state.loaded=true;
    }catch(error){
      state.loaded=true;
      window.__ubktResolutionSnapshotRequested=false;
      showModuleToast?.("Chưa đọc được dữ liệu Nghị quyết",error.message);
    }finally{setLoading(false);render();}
  }

  async function syncNow(){
    if(state.loading)return;
    setLoading(true);
    try{
      await refreshToken();
      const response=await fetch("/api/resolutions",{method:"POST",headers:{...authHeaders(),"Content-Type":"application/json"},body:"{}"});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Không đồng bộ được dữ liệu.");
      state.payload=result.payload;
      state.syncedAt=result.synced_at;
      state.period=state.payload?.periods?.at(-1)?.key||"";
      showModuleToast?.("Đã đồng bộ dữ liệu",`Dashboard đã nhận ${state.payload.resolutions.length} Nghị quyết từ Google Sheets.`);
    }catch(error){showModuleToast?.("Chưa đồng bộ được",error.message);}finally{setLoading(false);render();}
  }

  function render(){
    const page=document.getElementById("page-resolutions");if(!page)return;
    const payload=state.payload;
    const period=currentPeriod();
    const resolutions=payload?.resolutions||[];
    const items=resolutions.flatMap(resolution=>resolution.items||[]);
    const values=items.map(item=>periodValue(item,period.key));
    const updated=values.filter(value=>isUpdated(value.status)).length;
    const done=values.filter(value=>normalize(value.status).includes("hoan thanh")).length;
    const query=normalize(state.query);
    const filtered=resolutions.filter(resolution=>!query||normalize(`${resolution.number} ${resolution.title}`).includes(query));
    const ready=!!payload;
    document.getElementById("resolutionSyncState")?.classList.toggle("is-ready",ready);
    const stateText=document.getElementById("resolutionSyncText");if(stateText)stateText.textContent=ready?`Đồng bộ gần nhất: ${formatTime(state.syncedAt)}`:"Chưa có bản đồng bộ từ Google Sheets";
    const kpis={resolutionKpiCount:resolutions.length,resolutionKpiItems:items.length,resolutionKpiUpdated:updated,resolutionKpiDone:done};
    Object.entries(kpis).forEach(([id,value])=>{const element=document.getElementById(id);if(element)element.textContent=value;});
    const periodSelect=document.getElementById("resolutionPeriodFilter");
    if(periodSelect){periodSelect.innerHTML=(payload?.periods||[]).map(item=>`<option value="${esc(item.key)}" ${item.key===period.key?"selected":""}>${esc(item.label)}${item.locked?" · Đã khóa":""}</option>`).join("")||'<option value="">Chưa có kỳ</option>';}
    const grid=document.getElementById("resolutionGrid");if(!grid)return;
    if(!ready){grid.innerHTML='<div class="rq-empty"><b>Chưa có dữ liệu đồng bộ</b><p>Admin mở Google Sheets để nhập dữ liệu, sau đó quay lại đây và bấm “Đồng bộ từ Google Sheets”. Dashboard không tự chạy nền.</p></div>';return;}
    grid.innerHTML=filtered.map(resolution=>{
      const total=resolution.items?.length||0;
      const count=(resolution.items||[]).filter(item=>isUpdated(periodValue(item,period.key).status)).length;
      const resolutionBlocked=(resolution.items||[]).filter(item=>{const value=normalize(periodValue(item,period.key).status);return value.includes("kho khan")||value.includes("vuong mac");}).length;
      const percent=total?Math.round(count/total*100):0;
      return `<article class="rq-card"><div class="rq-card-head"><div><div class="rq-card-code">${esc(resolution.number)}</div><h4>${esc(resolution.shortTitle||resolution.title)}</h4></div><small>${count}/${total} nội dung</small></div><div class="rq-progress" aria-label="Đã cập nhật ${percent}%"><span style="width:${percent}%"></span></div><div class="rq-card-foot"><span>${resolutionBlocked?`${resolutionBlocked} nội dung cần lưu ý`:esc(period.label)}</span><button type="button" data-resolution-id="${esc(resolution.id)}" onclick="openResolutionDetail(this.dataset.resolutionId)">Xem chi tiết</button></div></article>`;
    }).join("")||'<div class="rq-empty"><b>Không tìm thấy Nghị quyết phù hợp</b><p>Hãy thử từ khóa khác.</p></div>';
  }

  function openDetail(id){
    const resolution=state.payload?.resolutions?.find(item=>String(item.id)===String(id));if(!resolution)return;
    const period=currentPeriod();
    document.getElementById("resolutionDialogTitle").textContent=resolution.number;
    document.getElementById("resolutionDialogSubtitle").textContent=`${period.label} · ${resolution.title}`;
    document.getElementById("resolutionDialogBody").innerHTML=(resolution.items||[]).map(item=>{
      const value=periodValue(item,period.key);const evidence=String(value.evidence||"").trim();
      return `<tr><td>${esc(item.id)}</td><td>${esc(item.content)}</td><td>${esc(item.unit||"—")}</td><td><span class="rq-status ${statusClass(value.status)}">${esc(value.status||"Chưa cập nhật")}</span></td><td>${esc(value.result||"—")}</td><td>${/^https?:\/\//i.test(evidence)?`<a class="rq-evidence" href="${esc(evidence)}" target="_blank" rel="noopener noreferrer">Mở minh chứng</a>`:esc(evidence||"—")}</td></tr>`;
    }).join("");
    document.getElementById("resolutionDetailDialog")?.showModal();
  }

  window.renderResolutionTracker=render;
  window.syncResolutionTracker=syncNow;
  window.openResolutionSheet=()=>window.open(sheetUrl,"_blank","noopener,noreferrer");
  window.setResolutionQuery=value=>{state.query=value;render();};
  window.setResolutionPeriod=value=>{state.period=value;render();};
  window.openResolutionDetail=openDetail;
  window.closeResolutionDetail=()=>document.getElementById("resolutionDetailDialog")?.close();
  window.loadResolutionSnapshot=loadSnapshot;
  document.addEventListener("DOMContentLoaded",()=>{document.getElementById("resolutionSheetLink")?.setAttribute("href",sheetUrl);});
})();

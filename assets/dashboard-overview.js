/* =====================================================================
   Dashboard "Tổng quan nhiệm vụ" (04/10/2026)
   - Một nguồn dữ liệu: mảng `tasks` đã tải cho Tab Nhiệm vụ (không gọi Supabase riêng).
   - Một hàm tổng hợp duy nhất: summarizeDashboard() chạy 1 vòng qua nhiệm vụ.
   - Trạng thái theo "Đánh giá của VPĐU" (taskFinalAssessment / taskStatusGroup
     định nghĩa trong task-grid-final.js), KHÔNG dùng "Tự đánh giá của đơn vị".
   - Mỗi khối chỉ vẽ lại khi nội dung HTML của nó thay đổi.
   ===================================================================== */
(function(){
  "use strict";

  const UPCOMING_WINDOW_DAYS=30;
  const UPCOMING_PREVIEW=5;
  const BACKLOG_PAGE=50;

  /* Màu thống nhất: xanh lá hoàn thành · xanh dương đang xử lý · vàng chưa thẩm định · đỏ trễ hạn · xám tạm dừng */
  const SEGMENTS=[
    {key:"done",label:"Hoàn thành",filter:"Hoàn thành"},
    {key:"processing",label:"Đang xử lý",filter:"Đang xử lý"},
    {key:"unappraised",label:"Chưa thẩm định",filter:"Chưa thẩm định"},
    {key:"late",label:"Trễ hạn / Không hoàn thành",filter:"group:late"},
    {key:"paused",label:"Tạm dừng",filter:"Tạm dừng"}
  ];

  const ICONS={
    total:'<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    done:'<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    processing:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    late:'<path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
    unappraised:'<path d="M9 5h6M9 3h6v4H9z"/><path d="M7 5H5v16h14V5h-2"/><path d="M9 13h6M9 17h4"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    flag:'<path d="M6 21V4m0 1h10l-2 4 2 4H6"/>',
    empty:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'
  };
  const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||""}</svg>`;
  const esc=value=>escapeHtml(String(value??""));
  const pct=(part,total)=>total?Math.round(part/total*100):0;

  /* ---------------- Tổng hợp số liệu (một vòng duy nhất) ---------------- */
  function isDeleted(task){
    const value=taskValue(task,"is_deleted",false);
    return value===true||String(value).toLowerCase()==="true";
  }
  function isFlagged(task){
    const value=taskValue(task,"redFlag",false);
    return value===true||String(value).toLowerCase()==="true";
  }
  function conclusionOf(task){
    return String(taskValue(task,"conclusion","")||taskValue(task,"task","")||"").trim();
  }

  function summarizeDashboard(source){
    const s={total:0,done:0,processing:0,processingOnly:0,unappraised:0,late:0,paused:0,noDeadline:0,flagged:0,units:new Map(),upcoming:[],backlog:[],signature:""};
    const sig=[];
    for(const task of source){
      if(isDeleted(task))continue;
      s.total++;
      const final=taskFinalAssessment(task);
      const group=taskStatusGroup(task);
      const segment=final==="Chưa thẩm định"?"unappraised":group==="processing"?"processing":group;
      if(group==="done")s.done++;
      else if(group==="late")s.late++;
      else if(group==="paused")s.paused++;
      else{s.processing++;if(segment==="unappraised")s.unappraised++;else s.processingOnly++;}
      const flagged=isFlagged(task);
      if(flagged)s.flagged++;
      const deadline=taskDeadline(task);
      const days=diffDays(deadline);
      if(days===null)s.noDeadline++;

      const unitName=taskUnit(task)||"Chưa phân công";
      let unit=s.units.get(unitName);
      if(!unit){unit={name:unitName,total:0,done:0,processing:0,unappraised:0,late:0,paused:0};s.units.set(unitName,unit);}
      unit.total++;unit[segment]++;

      const open=group!=="done";
      // Lịch sắp đến hạn: chưa hoàn thành, không tạm dừng, có thời hạn ≤ 30 ngày tới (kể cả đã quá hạn)
      if(open&&group!=="paused"&&days!==null&&days<=UPCOMING_WINDOW_DAYS)s.upcoming.push({task,days,deadline,final});
      // Tồn đọng: chưa hoàn thành hoặc có Note đỏ
      if(open||flagged)s.backlog.push({task,days,deadline,final,group,flagged});
      sig.push(`${task.id}:${final}:${deadline}:${flagged?1:0}:${unitName}`);
    }
    s.upcoming.sort((a,b)=>a.deadline.localeCompare(b.deadline)||String(taskDoc(a.task)).localeCompare(String(taskDoc(b.task)),"vi"));
    s.backlog.sort((a,b)=>(b.flagged-a.flagged)||((b.group==="late")-(a.group==="late"))||((a.days??1e9)-(b.days??1e9))||String(taskDoc(a.task)).localeCompare(String(taskDoc(b.task)),"vi"));
    s.signature=sig.join("|");
    return s;
  }
  window.summarizeDashboard=summarizeDashboard;

  /* ---------------- Vẽ có kiểm tra thay đổi ---------------- */
  function paint(id,markup){
    const el=document.getElementById(id);
    if(!el||el.__dovHtml===markup)return false;
    el.innerHTML=markup;el.__dovHtml=markup;
    return true;
  }

  /* ---------------- A. Thời điểm cập nhật ---------------- */
  let lastSignature=null;let lastTasksRef=null;let updatedAt=null;
  function trackUpdated(summary){
    if(summary.signature!==lastSignature||tasks!==lastTasksRef){lastSignature=summary.signature;lastTasksRef=tasks;updatedAt=new Date();}
    const label=updatedAt?`Cập nhật lúc ${new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit"}).format(updatedAt)}, ${new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}).format(updatedAt)}`:"Đang tổng hợp dữ liệu…";
    const el=document.getElementById("dovUpdated");if(el&&el.textContent!==label)el.textContent=label;
  }

  /* ---------------- B. KPI ---------------- */
  function kpiCard({key,label,value,foot,filter,tone}){
    const action=filter===null?"openTaskGridView({})":`openTaskGridView({assessment:${JSON.stringify(filter).replace(/"/g,"&quot;")}})`;
    return `<button type="button" class="dov-kpi is-${tone}" onclick="${action}" aria-label="${esc(label)}: ${value}. Mở Tab Nhiệm vụ với bộ lọc này">
      <span class="dov-kpi-top"><span class="dov-kpi-label">${esc(label)}</span><span class="dov-kpi-icon">${icon(key)}</span></span>
      <span class="dov-kpi-value">${value}</span>
      <span class="dov-kpi-foot">${foot}</span>
    </button>`;
  }
  function renderKpis(s){
    return [
      kpiCard({key:"total",tone:"total",label:"Tổng nhiệm vụ",value:s.total,foot:s.noDeadline?`${s.noDeadline} nhiệm vụ chưa có thời hạn`:"Tất cả đều có thời hạn",filter:null}),
      kpiCard({key:"done",tone:"done",label:"Đã hoàn thành",value:s.done,foot:`${pct(s.done,s.total)}% tổng số nhiệm vụ`,filter:"Hoàn thành"}),
      kpiCard({key:"processing",tone:"processing",label:"Đang xử lý",value:s.processing,foot:`Gồm ${s.unappraised} chưa thẩm định`,filter:"group:processing"}),
      kpiCard({key:"late",tone:"late",label:"Trễ hạn, cần chú ý",value:s.late,foot:s.late?`${pct(s.late,s.total)}% tổng số, gồm cả không hoàn thành`:"Không có nhiệm vụ trễ hạn",filter:"group:late"}),
      kpiCard({key:"unappraised",tone:"unappraised",label:"Chưa thẩm định",value:s.unappraised,foot:s.unappraised?"VPĐU cần chốt đánh giá":"Đã thẩm định đầy đủ",filter:"Chưa thẩm định"})
    ].join("");
  }

  /* ---------------- C1. Tiến độ tổng thể (vòng tròn + chú giải) ---------------- */
  function renderOverall(s){
    if(!s.total)return emptyState("Chưa có nhiệm vụ nào","Khi có nhiệm vụ được giao, tỷ lệ hoàn thành sẽ hiển thị tại đây.");
    const radius=52,circumference=2*Math.PI*radius;
    let offset=0;
    const arcs=SEGMENTS.map(seg=>{
      const value=seg.key==="processing"?s.processingOnly:s[seg.key];
      if(!value)return "";
      const length=value/s.total*circumference;
      const arc=`<circle class="dov-arc is-${seg.key}" cx="64" cy="64" r="${radius}" stroke-dasharray="${length.toFixed(2)} ${(circumference-length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"><title>${esc(seg.label)}: ${value}</title></circle>`;
      offset+=length;return arc;
    }).join("");
    const legend=SEGMENTS.map(seg=>{
      const value=seg.key==="processing"?s.processingOnly:s[seg.key];
      return `<button type="button" class="dov-legend-row" onclick="openTaskGridView({assessment:${JSON.stringify(seg.filter).replace(/"/g,"&quot;")}})"><i class="dov-dot is-${seg.key}" aria-hidden="true"></i><span>${esc(seg.label)}</span><b>${value}</b><small>${pct(value,s.total)}%</small></button>`;
    }).join("");
    return `<div class="dov-overall">
      <div class="dov-donut" role="img" aria-label="Hoàn thành ${pct(s.done,s.total)}% trên ${s.total} nhiệm vụ">
        <svg viewBox="0 0 128 128"><circle class="dov-arc-track" cx="64" cy="64" r="${radius}"/>${arcs}</svg>
        <div class="dov-donut-center"><b>${pct(s.done,s.total)}%</b><span>hoàn thành</span></div>
      </div>
      <div class="dov-legend">${legend}<p class="dov-legend-total">Tổng cộng <b>${s.total}</b> nhiệm vụ</p></div>
    </div>`;
  }

  /* ---------------- C2. Tiến độ theo đơn vị ---------------- */
  function renderUnits(s){
    const units=[...s.units.values()].sort((a,b)=>b.late-a.late||b.total-a.total||a.name.localeCompare(b.name,"vi"));
    if(!units.length)return emptyState("Chưa có đơn vị nào được giao việc","Số liệu từng đơn vị sẽ hiển thị khi có nhiệm vụ.");
    const num=(value,tone,label,title)=>`<span class="dov-unit-num ${tone}${value?"":" is-zero"}" title="${esc(title||label)}"><small>${label}</small><b>${value}</b></span>`;
    const rows=units.map(u=>{
      const bar=SEGMENTS.map(seg=>u[seg.key]?`<i class="is-${seg.key}" style="width:${(u[seg.key]/u.total*100).toFixed(2)}%" title="${esc(seg.label)}: ${u[seg.key]}"></i>`:"").join("");
      const processing=u.processing+u.unappraised;
      const processingTitle=u.unappraised?`Đang xử lý ${processing}, gồm ${u.unappraised} chưa thẩm định`:"Đang xử lý";
      const paused=u.paused?` · ${u.paused} tạm dừng`:"";
      return `<button type="button" class="dov-unit-row" data-unit="${esc(u.name)}" onclick="openTaskGridView({sheet:this.dataset.unit})" aria-label="${esc(u.name)}: ${u.done} hoàn thành, ${processing} đang xử lý, ${u.late} trễ hạn trên ${u.total} nhiệm vụ. Mở sheet đơn vị">
        <span class="dov-unit-name"><b>${esc(u.name)}</b><small>${u.total} nhiệm vụ${paused}</small></span>
        <span class="dov-unit-bar" aria-hidden="true">${bar}</span>
        ${num(u.done,"is-done","Hoàn thành")}${num(processing,"is-processing","Đang xử lý",processingTitle)}${num(u.late,"is-late","Trễ hạn","Trễ hạn / Không hoàn thành")}
        <span class="dov-unit-pct"><b>${pct(u.done,u.total)}%</b></span>
      </button>`;
    }).join("");
    const head=`<div class="dov-unit-head" aria-hidden="true"><span>Đơn vị</span><span>Tiến độ</span><span class="is-done">Hoàn thành</span><span class="is-processing">Đang xử lý</span><span class="is-late">Trễ hạn</span><span>Tỷ lệ</span></div>`;
    const legend=SEGMENTS.map(seg=>`<span><i class="dov-dot is-${seg.key}" aria-hidden="true"></i>${esc(seg.label)}</span>`).join("");
    return `<div class="dov-unit-legend">${legend}</div><div class="dov-unit-list">${head}${rows}</div>`;
  }

  /* ---------------- 3. Lịch xử lý sắp đến hạn ---------------- */
  function dueInfo(days){
    if(days<0)return {text:`Quá hạn ${-days} ngày`,tone:"is-danger"};
    if(days===0)return {text:"Đến hạn hôm nay",tone:"is-danger"};
    if(days<=7)return {text:`Còn ${days} ngày`,tone:"is-warning"};
    return {text:`Còn ${days} ngày`,tone:"is-neutral"};
  }
  function dateHeading(iso){
    const date=parseDate(iso);
    if(!date)return fmt(iso);
    const weekday=new Intl.DateTimeFormat("vi-VN",{weekday:"long"}).format(date);
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${fmt(iso)}`;
  }
  function deadlineItem(entry){
    const task=entry.task;
    const conclusion=conclusionOf(task)||"Chưa có nội dung kết luận";
    return `<li class="dov-due-item">
      <div class="dov-due-main">
        <b class="dov-due-doc">${esc(taskDoc(task)||"Chưa có số văn bản")}</b>
        <p class="dov-due-text" title="${esc(conclusion)}">${esc(conclusion)}</p>
        <span class="dov-due-unit">${esc(taskUnit(task)||"Chưa phân công")} · ${esc(entry.final)}</span>
      </div>
      <button type="button" class="dov-view-btn" onclick="openTaskLogModal(${esc(JSON.stringify(String(task.id)))})">${icon("eye")}<span>Xem nhiệm vụ</span></button>
    </li>`;
  }
  function deadlineGroups(entries){
    const groups=[];
    for(const entry of entries){
      const last=groups[groups.length-1];
      if(last&&last.deadline===entry.deadline)last.items.push(entry);else groups.push({deadline:entry.deadline,days:entry.days,items:[entry]});
    }
    return groups.map(group=>{
      const due=dueInfo(group.days);
      return `<section class="dov-due-group">
        <header><span>${esc(dateHeading(group.deadline))}</span><em class="dov-due-badge ${due.tone}">${esc(due.text)}</em>${group.items.length>1?`<small>${group.items.length} nhiệm vụ</small>`:""}</header>
        <ul>${group.items.map(deadlineItem).join("")}</ul>
      </section>`;
    }).join("");
  }
  function renderDeadlineList(s){
    if(!s.upcoming.length)return emptyState("Không có nhiệm vụ đến hạn trong 30 ngày tới","Nhiệm vụ chưa có thời hạn không được đưa vào lịch này.","compact");
    return deadlineGroups(s.upcoming.slice(0,UPCOMING_PREVIEW));
  }

  /* ---------------- D. Nhiệm vụ tồn đọng (ẩn mặc định) ---------------- */
  let backlogQuery="";let backlogTimer=null;let backlogLimit=BACKLOG_PAGE;
  function renderBacklog(s){
    const query=norm(backlogQuery);
    const rows=query?s.backlog.filter(entry=>norm(`${taskDoc(entry.task)} ${conclusionOf(entry.task)} ${taskUnit(entry.task)}`).includes(query)):s.backlog;
    if(!rows.length)return emptyState(query?"Không tìm thấy nhiệm vụ phù hợp":"Không có nhiệm vụ tồn đọng",query?"Thử từ khóa khác.":"Tất cả nhiệm vụ đã hoàn thành.","compact");
    const shown=rows.slice(0,backlogLimit);
    const body=shown.map(entry=>{
      const task=entry.task;
      const due=entry.days===null?{text:"Chưa có thời hạn",tone:"is-neutral"}:dueInfo(entry.days);
      const note=entry.flagged?String(taskValue(task,"redFlagNote","")||"").trim():"";
      return `<li class="dov-backlog-row${entry.flagged?" is-flagged":""}">
        <div class="dov-backlog-main">
          <b class="dov-due-doc">${entry.flagged?`<span class="dov-flag" title="Có Note đỏ">${icon("flag")}</span>`:""}${esc(taskDoc(task)||"Chưa có số văn bản")}</b>
          <p class="dov-due-text" title="${esc(conclusionOf(task))}">${esc(conclusionOf(task)||"Chưa có nội dung kết luận")}</p>
          ${note?`<p class="dov-red-note">Note đỏ: ${esc(note)}</p>`:""}
        </div>
        <span class="dov-backlog-unit">${esc(taskUnit(task)||"Chưa phân công")}</span>
        <span class="dov-backlog-due"><span>${entry.deadline?esc(fmt(entry.deadline)):"—"}</span><em class="dov-due-badge ${due.tone}">${esc(due.text)}</em></span>
        <span class="dov-status is-${entry.final==="Chưa thẩm định"?"unappraised":entry.group}">${esc(entry.final)}</span>
        <button type="button" class="dov-view-btn" onclick="openTaskLogModal(${esc(JSON.stringify(String(task.id)))})">${icon("eye")}<span>Xem</span></button>
      </li>`;
    }).join("");
    const more=rows.length>shown.length?`<div class="dov-backlog-more"><span>Đang hiển thị ${shown.length}/${rows.length} nhiệm vụ.</span><button type="button" class="dov-btn" onclick="showMoreDashboardBacklog()">Hiển thị thêm ${Math.min(BACKLOG_PAGE,rows.length-shown.length)}</button></div>`:"";
    return `<ul class="dov-backlog-list">${body}</ul>${more}`;
  }

  function emptyState(title,text,size=""){
    return `<div class="dov-empty ${size?`is-${size}`:""}"><span>${icon("empty")}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div></div>`;
  }

  /* ---------------- Vẽ toàn trang (gọi 1 lần mỗi lượt render) ---------------- */
  let lastSummary=null;
  function renderDashboardOverview(){
    const page=document.getElementById("page-dashboard");
    if(!page||page.classList.contains("hidden"))return;
    // Tài khoản đơn vị không được xem số liệu tổng hợp
    if(typeof isUnitUser==="function"&&isUnitUser()){["dovKpis","dovOverall","dovUnits","dovDeadlines","dovBacklogList"].forEach(id=>paint(id,""));return;}
    const headerButton=document.getElementById("headerTaskBtn");if(headerButton)headerButton.style.display="none";
    const s=summarizeDashboard(Array.isArray(tasks)?tasks:[]);
    lastSummary=s;
    trackUpdated(s);
    paint("dovKpis",renderKpis(s));
    paint("dovOverall",renderOverall(s));
    paint("dovUnits",renderUnits(s));
    paint("dovDeadlines",renderDeadlineList(s));
    const all=document.getElementById("dovDeadlineAll");
    if(all){all.hidden=s.upcoming.length<=UPCOMING_PREVIEW;all.textContent=`Xem tất cả (${s.upcoming.length})`;}
    const count=document.getElementById("dovBacklogCount");
    if(count)count.textContent=s.backlog.length?String(s.backlog.length):"";
    if(!document.getElementById("dovBacklogBody")?.hidden)paint("dovBacklogList",renderBacklog(s));
    if(document.getElementById("dovDeadlinePanel")?.classList.contains("open"))paintDeadlinePanel(s);
  }
  window.renderDashboardOverview=renderDashboardOverview;

  /* ---------------- Tương tác ---------------- */
  window.toggleDashboardBacklog=function(force){
    const card=document.getElementById("dovBacklog");const body=document.getElementById("dovBacklogBody");const button=document.getElementById("dovBacklogToggle");
    if(!card||!body||!button)return;
    const open=typeof force==="boolean"?force:body.hidden;
    body.hidden=!open;card.classList.toggle("is-collapsed",!open);
    button.setAttribute("aria-expanded",String(open));button.textContent=open?"Thu gọn":"Mở rộng";
    if(open&&lastSummary)paint("dovBacklogList",renderBacklog(lastSummary));
  };
  window.queueDashboardBacklogSearch=function(value){
    window.clearTimeout(backlogTimer);
    backlogTimer=window.setTimeout(()=>{backlogQuery=String(value||"");backlogLimit=BACKLOG_PAGE;if(lastSummary)paint("dovBacklogList",renderBacklog(lastSummary));},300);
  };
  window.showMoreDashboardBacklog=function(){backlogLimit+=BACKLOG_PAGE;if(lastSummary)paint("dovBacklogList",renderBacklog(lastSummary));};

  function paintDeadlinePanel(s){
    const sub=document.getElementById("dovPanelSub");
    if(sub)sub.textContent=`${s.upcoming.length} nhiệm vụ chưa hoàn thành, sắp xếp theo thời hạn gần nhất.`;
    paint("dovPanelList",s.upcoming.length?deadlineGroups(s.upcoming):emptyState("Không có nhiệm vụ đến hạn","Danh sách trống.","compact"));
  }
  window.openDashboardDeadlinePanel=function(){
    const panel=document.getElementById("dovDeadlinePanel");if(!panel||!lastSummary)return;
    paintDeadlinePanel(lastSummary);
    panel.classList.add("open");if(typeof lockScroll==="function")lockScroll();
    window.setTimeout(()=>panel.querySelector(".dov-icon-btn")?.focus(),50);
  };
  window.closeDashboardDeadlinePanel=function(){
    const panel=document.getElementById("dovDeadlinePanel");if(!panel||!panel.classList.contains("open"))return;
    panel.classList.remove("open");if(typeof unlockScroll==="function")unlockScroll();
    document.getElementById("dovDeadlineAll")?.focus();
  };
  document.addEventListener("keydown",event=>{if(event.key==="Escape")window.closeDashboardDeadlinePanel();});
  // Mở chi tiết nhiệm vụ từ khung "Xem tất cả": đóng khung trước để popup chi tiết không bị đè
  const legacyOpenTaskLogModal=window.openTaskLogModal;
  if(typeof legacyOpenTaskLogModal==="function"){
    window.openTaskLogModal=function(){window.closeDashboardDeadlinePanel();return legacyOpenTaskLogModal.apply(this,arguments);};
  }

  /* ---------------- Nối vào vòng render hiện có ----------------
     render() gọi renderMetrics() ở mọi trang, rồi (khi ở Dashboard) gọi các hàm vẽ cũ.
     Các khối cũ đã được thay bằng bố cục mới nên các hàm vẽ cũ không còn việc gì để làm;
     renderMetrics vẽ Dashboard đúng 1 lần khi trang đang mở. */
  window.renderMetrics=function(){if(activePageName()==="dashboard")renderDashboardOverview();};
  window.renderAntCommandCenter=function(){};
  window.renderStatusCommand=function(){};
  window.renderCharts=function(){};
  window.renderDeadlines=function(){};
})();

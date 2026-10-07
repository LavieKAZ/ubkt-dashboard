(function(){
  "use strict";
  document.documentElement.dataset.taskGridFinal="ready";

  const FINAL_OPTIONS=["Chưa thẩm định","Đang xử lý","Hoàn thành","Trễ hạn","Tạm dừng","Không hoàn thành"];
  const SELF_OPTIONS=["Chưa tự đánh giá","Đang thực hiện","Hoàn thành","Chậm tiến độ","Cần hỗ trợ"];
  const GRID_FIELDS=["stt","doc","conclusion","unit","deadline","result","self","final"];
  const GRID_LETTERS=["A","B","C","D","E","F","G","H"];
  const GRID_COLUMN_CLASSES=["col-stt","col-doc","col-content","col-unit","col-date","col-result","col-self","col-final"];
  // [Univer] Độ rộng cột mặc định (px). Người dùng kéo mép chữ cột để đổi; lưu riêng trên trình duyệt.
  const GRID_DEFAULT_WIDTHS=[82,170,370,215,145,340,235,205];
  const GRID_MIN_WIDTH=64;
  const GRID_MAX_WIDTH=820;
  const GRID_WIDTH_STORE_KEY="ubkt.taskGrid.columnWidths.v1";
  function clampColumnWidth(value,index){
    const number=Math.round(Number(value));
    if(!Number.isFinite(number))return GRID_DEFAULT_WIDTHS[index];
    return Math.min(GRID_MAX_WIDTH,Math.max(GRID_MIN_WIDTH,number));
  }
  function loadColumnWidths(){
    try{
      const saved=JSON.parse(window.localStorage.getItem(GRID_WIDTH_STORE_KEY)||"null");
      if(Array.isArray(saved)&&saved.length===GRID_DEFAULT_WIDTHS.length)return saved.map(clampColumnWidth);
    }catch(error){/* Trình duyệt chặn bộ nhớ cục bộ: dùng độ rộng mặc định */}
    return GRID_DEFAULT_WIDTHS.slice();
  }
  function saveColumnWidths(widths){
    try{window.localStorage.setItem(GRID_WIDTH_STORE_KEY,JSON.stringify(widths));}catch(error){/* bỏ qua */}
  }
  /** Số cột cố định theo bề ngang màn hình: điện thoại 1 cột, máy tính bảng 2 cột, máy tính 3 cột. */
  function frozenColumnCount(){
    const width=window.innerWidth||1440;
    if(width<=640)return 1;
    if(width<=1100)return 2;
    return 3;
  }
  const gridState={search:"",month:"",assessment:"",sheet:"all",page:1,pageSize:30,density:"comfortable",selection:null,widths:loadColumnWidths(),frozen:frozenColumnCount(),columns:{flag:"",doc:"",content:"",unit:"",deadline:"",result:"",self:"",final:""}};
  let progressLogs=[];
  let systemNotifications=[];
  let activeLogTaskId="";
  let activeRedFlagTaskId="";
  let taskGridRealtimeChannel=null;
  let taskGridSearchTimer=null;
  let taskLogsLoading=false;

  /* ---------- Vai trò (tách rõ, không dùng chung một hàm "admin") ----------
     System Admin  : admin                 → quản trị tài khoản, đổi quyền
     Full Oversight: admin, ubkt           → toàn quyền hệ thống (isAdminUser của mã cũ)
     VPĐU          : vpdu                  → Dashboard + Nhiệm vụ + Duyệt cập nhật
     Task oversight: admin, ubkt, vpdu     → xem nhiệm vụ mọi đơn vị trong Tab Nhiệm vụ
     Unit          : unit                  → chỉ nhiệm vụ của đơn vị mình */
  function activeRole(){
    const profile=currentProfile;
    if(!profile||profile.approval_status!=="approved"||profile.is_active!==true)return "";
    return String(profile.role||"");
  }
  window.isSystemAdminUser=function(){return activeRole()==="admin";};
  window.isFullOversightUser=function(){return ["admin","ubkt"].includes(activeRole());};
  window.isVpduUser=function(){return activeRole()==="vpdu";};
  window.isOversightUser=function(){return ["admin","vpdu","ubkt"].includes(activeRole());};
  /* ---------- Bảng phân quyền giao diện (một nguồn duy nhất) ----------
     Máy chủ (RLS Supabase) vẫn là lớp chặn cuối; bảng này quyết định trang/cột nào hiện và sửa được.
     - Admin, UBKT: toàn quyền.
     - VPĐU: Dashboard + Tab Nhiệm vụ (mọi đơn vị) + Duyệt cập nhật; chấm Đánh giá của VPĐU, cập nhật kết quả, thêm nhiệm vụ mới.
     - Đơn vị: chỉ Tab Nhiệm vụ của đơn vị mình; sửa Thời gian, cập nhật kết quả, tự đánh giá. */
  const FULL_ACCESS=Object.freeze({pages:null,edit:["doc","conclusion","unit","deadline","vpduAssessment"],addTask:true,flag:true,selfAssess:true,tools:true,review:true});
  const ROLE_ACCESS=Object.freeze({
    admin:FULL_ACCESS,
    ubkt:FULL_ACCESS,
    vpdu:Object.freeze({pages:["dashboard","tasks","approvals"],edit:["vpduAssessment"],addTask:true,flag:false,selfAssess:false,tools:false,review:true}),
    unit:Object.freeze({pages:["tasks"],edit:["deadline"],addTask:false,flag:false,selfAssess:true,tools:false,review:false})
  });
  const NO_ACCESS=Object.freeze({pages:[],edit:[],addTask:false,flag:false,selfAssess:false,tools:false,review:false});
  window.taskRoleAccess=function(){
    const profile=currentProfile;
    if(!profile||profile.approval_status!=="approved"||profile.is_active!==true)return NO_ACCESS;
    return ROLE_ACCESS[profile.role]||NO_ACCESS;
  };
  window.canEditTaskField=function(field){return window.taskRoleAccess().edit.includes(field);};
  window.canAccessPage=function(page){const pages=window.taskRoleAccess().pages;return pages===null||pages.includes(page);};
  window.canFlagTask=function(){return window.taskRoleAccess().flag;};
  window.canAddTasks=function(){return window.taskRoleAccess().addTask;};
  window.canReviewTaskUpdates=function(){return window.taskRoleAccess().review;};
  /** Quyền theo từng ô: đơn vị chỉ sửa Thời gian của nhiệm vụ mình chủ trì (không sửa nhiệm vụ chỉ phối hợp). */
  function canEditTaskCell(task,field){
    if(!canEditTaskField(field))return false;
    if(isUnitUser())return canonicalUnitValue(taskUnit(task))===canonicalUnitValue(currentProfile?.unit_name);
    return true;
  }
  // Mã cũ dùng isAdminUser() cho mọi chức năng quản trị: chỉ Admin/UBKT. VPĐU được mở đúng phần của mình qua canAddTasks/canReviewTaskUpdates.
  isAdminUser=window.isFullOversightUser;
  syncCurrentUserWithProfile=function(profile){
    if(!currentUser||!profile)return;
    const roleLabel=profile.role==="admin"?"Quản trị hệ thống":profile.role==="vpdu"?"Văn phòng Đảng ủy":profile.role==="ubkt"?"Ủy ban Kiểm tra":`Đơn vị · ${canonicalUnitValue(profile.unit_name)}`;
    currentUser={...currentUser,id:profile.id,email:profile.email||currentUser.email,name:profile.full_name||profile.unit_name||currentUser.name,role:roleLabel,unit:canonicalUnitValue(profile.unit_name),permissions:isFullOversightUser()?["all"]:isVpduUser()?["dashboard","tasks","approvals"]:["tasks"]};
  };

  function finalAssessment(task){
    const value=String(taskValue(task,"vpduAssessment","")||"").trim();
    return FINAL_OPTIONS.includes(value)?value:"Chưa thẩm định";
  }
  function taskConclusion(task){
    return String(taskValue(task,"conclusion","")||"").trim()||String(taskValue(task,"task","")||"").trim();
  }
  function taskFlagged(task){
    const value=taskValue(task,"redFlag",false);
    return value===true||String(value).toLowerCase()==="true";
  }
  function taskSelfAssessment(task){
    const value=String(taskValue(task,"selfAssessment","")||"").trim();
    return SELF_OPTIONS.includes(value)?value:"Chưa tự đánh giá";
  }
  function taskProgressSummary(task){
    return String(taskValue(task,"latestProgressSummary",taskValue(task,"result",""))||"").trim();
  }
  function gridCellValue(task,field,rowNumber){
    const values={
      stt:String(Math.max(1,(Number(rowNumber)||2)-1)),
      doc:taskDoc(task),
      conclusion:taskConclusion(task),
      unit:taskUnit(task),
      deadline:formatDateInputValue(taskDeadline(task)),
      result:taskProgressSummary(task),
      self:taskSelfAssessment(task),
      final:finalAssessment(task)
    };
    return String(values[field]??"");
  }
  window.taskFinalAssessment=finalAssessment;
  /* Nhóm trạng thái theo Đánh giá của VPĐU — dùng chung cho Tab Nhiệm vụ và Dashboard Tổng quan */
  const STATUS_GROUPS={
    done:{label:"Hoàn thành",values:["Hoàn thành"]},
    processing:{label:"Đang xử lý (gồm Chưa thẩm định)",values:["Đang xử lý","Chưa thẩm định"]},
    late:{label:"Trễ hạn / Không hoàn thành",values:["Trễ hạn","Không hoàn thành"]},
    paused:{label:"Tạm dừng",values:["Tạm dừng"]}
  };
  function statusGroupOf(task){
    const value=finalAssessment(task);
    return Object.keys(STATUS_GROUPS).find(key=>STATUS_GROUPS[key].values.includes(value))||"processing";
  }
  function assessmentMatches(task,filter){
    if(!filter)return true;
    if(filter.startsWith("group:")){const group=STATUS_GROUPS[filter.slice(6)];return !!group&&group.values.includes(finalAssessment(task));}
    return finalAssessment(task)===filter;
  }
  window.taskStatusGroup=statusGroupOf;
  window.TASK_STATUS_GROUPS=STATUS_GROUPS;
  taskStatus=function(task){return norm(finalAssessment(task));};
  taskIsDone=function(task){return finalAssessment(task)==="Hoàn thành";};
  taskIsLateUnified=function(task){return ["Trễ hạn","Không hoàn thành"].includes(finalAssessment(task));};
  taskIsProcessing=function(task){return !taskIsDone(task)&&!taskIsLateUnified(task);};
  taskIsDoingUnified=taskIsProcessing;

  function activeTasks(){
    return tasks.filter(task=>{
      const deleted=taskValue(task,"is_deleted",false);
      return !(deleted===true||String(deleted).toLowerCase()==="true");
    });
  }
  function logsFor(taskId){
    return progressLogs.filter(log=>String(log.task_id)===String(taskId));
  }
  function filteredGridRows(){
    return activeTasks().filter(task=>{
      const unit=taskUnit(task);
      const assessment=finalAssessment(task);
      const deadline=taskDeadline(task);
      const days=diffDays(deadline);
      if(gridState.sheet!=="all"&&unit!==gridState.sheet)return false;
      if(gridState.assessment&&!assessmentMatches(task,gridState.assessment))return false;
      if(gridState.month==="none"&&deadline)return false;
      if(gridState.month&&gridState.month!=="none"&&!deadline.startsWith(gridState.month))return false;
      const column=gridState.columns;
      if(column.flag==="flagged"&&!taskFlagged(task))return false;
      if(column.flag==="normal"&&taskFlagged(task))return false;
      if(column.doc&&!norm(taskDoc(task)).includes(norm(column.doc)))return false;
      if(column.content&&!norm(taskConclusion(task)).includes(norm(column.content)))return false;
      if(column.deadline==="none"&&deadline)return false;
      if(column.deadline==="overdue"&&!(days!==null&&days<0))return false;
      if(column.deadline==="week"&&!(days!==null&&days>=0&&days<=7))return false;
      if(column.deadline==="month"&&!(days!==null&&days>=0&&days<=30))return false;
      const progress=taskProgressSummary(task);
      if(column.result==="yes"&&!progress)return false;
      if(column.result==="no"&&progress)return false;
      const self=taskSelfAssessment(task);
      if(column.self&&self!==column.self)return false;
      if(column.final&&assessment!==column.final)return false;
      if(gridState.search){
        if(!norm(`${taskDoc(task)} ${taskConclusion(task)}`).includes(norm(gridState.search)))return false;
      }
      return true;
    }).sort((a,b)=>{
      const da=parseDate(taskDeadline(a))?.getTime()||Number.MAX_SAFE_INTEGER;
      const db=parseDate(taskDeadline(b))?.getTime()||Number.MAX_SAFE_INTEGER;
      return da-db||String(taskDoc(a)).localeCompare(String(taskDoc(b)),"vi");
    });
  }
  function uniqueUnits(){return [...new Set(activeTasks().map(taskUnit).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi"));}
  function uniqueMonths(){return [...new Set(activeTasks().map(task=>taskDeadline(task).slice(0,7)).filter(value=>/^\d{4}-\d{2}$/.test(value)))].sort().reverse();}
  function monthLabel(value){
    const [year,month]=String(value).split("-");
    return month&&year?`Tháng ${Number(month)}/${year}`:value;
  }
  function html(value){return escapeHtml(String(value??""));}
  function statusTone(value){
    if(value==="Hoàn thành")return "is-done";
    if(["Trễ hạn","Không hoàn thành","Chậm tiến độ"].includes(value))return "is-late";
    if(["Đang xử lý","Đang thực hiện"].includes(value))return "is-doing";
    if(["Tạm dừng","Cần hỗ trợ"].includes(value))return "is-paused";
    return "is-none";
  }
  function options(values,current){return values.map(value=>`<option ${value===current?"selected":""}>${html(value)}</option>`).join("");}
  function filterIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 7v5l-4 2v-7z"/></svg>';}
  function attachmentIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 12-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>';}
  function columnFilterControl(key){
    const value=gridState.columns[key]||"";
    if(key==="doc"||key==="content")return `<input type="search" value="${html(value)}" placeholder="Nhập từ khóa..." onclick="event.stopPropagation()" onchange="setTaskGridColumnFilter('${key}',this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}">`;
    const sets={
      flag:[["","Tất cả"],["flagged","Đã gắn cờ"],["normal","Chưa gắn cờ"]],
      deadline:[["","Tất cả thời hạn"],["none","Chưa có thời hạn"],["overdue","Đã quá hạn"],["week","Trong 7 ngày"],["month","Trong 30 ngày"]],
      result:[["","Tất cả"],["yes","Đã có cập nhật"],["no","Chưa có cập nhật"]],
      self:[["","Tất cả tự đánh giá"],...SELF_OPTIONS.map(item=>[item,item])],
      final:[["","Tất cả thẩm định"],...FINAL_OPTIONS.map(item=>[item,item])]
    };
    return `<select onclick="event.stopPropagation()" onchange="setTaskGridColumnFilter('${key}',this.value)">${(sets[key]||[]).map(([optionValue,label])=>`<option value="${html(optionValue)}" ${optionValue===value?"selected":""}>${html(label)}</option>`).join("")}</select>`;
  }
  function headerCell(label,key,className){
    if(!key)return `<th class="${className||""}"><div class="task-grid-th"><span>${html(label)}</span></div></th>`;
    const active=!!gridState.columns[key];
    return `<th class="${className||""}"><div class="task-grid-th"><span>${html(label)}</span><details class="task-grid-filter ${active?"is-active":""}"><summary title="Lọc cột ${html(label)}" aria-label="Lọc cột ${html(label)}">${filterIcon()}</summary><div class="task-grid-filter-popover" onclick="event.stopPropagation()"><b>Lọc ${html(label)}</b>${columnFilterControl(key)}${active?`<button type="button" onclick="setTaskGridColumnFilter('${key}','')">Xóa bộ lọc cột</button>`:""}</div></details></div></th>`;
  }
  function gridCellAttributes(task,field,row,col){
    const selected=gridState.selection&&String(gridState.selection.taskId)===String(task.id)&&gridState.selection.field===field;
    return `data-task-id="${html(task.id)}" data-grid-field="${field}" data-grid-row="${row}" data-grid-col="${col}" tabindex="-1"${selected?' class="is-selected-cell"':''}`;
  }
  function flagCell(task,index){
    const flagged=taskFlagged(task);
    return `<div class="task-grid-row-index"><button type="button" class="task-row-open" onclick="openTaskRowViewer('${html(task.id)}')" title="Xem nhanh cả dòng" aria-label="Xem nhanh nhiệm vụ dòng ${index}"><span>${index}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg></button>${canFlagTask()?`<button type="button" class="task-flag-button ${flagged?"is-active":""}" onclick="openTaskRedFlagModal('${html(task.id)}')" aria-pressed="${flagged}" title="${flagged?"Sửa Note đỏ":"Thêm Note đỏ"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4m0 1h10l-2 4 2 4H6"/></svg></button>`:""}</div>`;
  }
  const WRAP_FIELD_LABELS={doc:"Số văn bản",conclusion:"Nội dung kết luận"};
  /** Ô chữ tự xuống dòng (Wrap Text). Nội dung dài được giới hạn số dòng; nút "Xem toàn bộ" chỉ hiện khi bị rút gọn. */
  function wrapTextCell(task,field,value){
    const fieldClass=field==="doc"?"task-grid-doc":"task-grid-conclusion";
    const body=canEditTaskField(field)
      ?`<textarea class="task-grid-cell-textarea task-grid-wrap ${field==="doc"?"task-grid-doc-editor":"task-grid-conclusion-editor"}" rows="1" aria-label="${WRAP_FIELD_LABELS[field]}" oninput="autoResizeTaskGridTextarea(this)" onblur="updateTaskGridField('${html(task.id)}','${field}',this.value,this)">${html(value)}</textarea>`
      :`<div class="task-grid-readonly task-grid-wrap ${fieldClass}">${html(value||"—")}</div>`;
    return `<div class="task-grid-text-cell" data-wrap-field="${field}">${body}<button type="button" class="task-grid-expand" onclick="openTaskTextViewer('${html(task.id)}','${field}')" aria-label="Xem toàn bộ ${WRAP_FIELD_LABELS[field].toLowerCase()}">Xem toàn bộ</button></div>`;
  }
  function conclusionCell(task){
    const note=String(taskValue(task,"redFlagNote","")||"").trim();
    return `<div class="task-grid-conclusion-cell">${wrapTextCell(task,"conclusion",taskConclusion(task))}${taskFlagged(task)&&note?`<aside class="task-red-note"><b>NOTE ĐỎ</b><p>${html(note)}</p></aside>`:""}</div>`;
  }
  function resultCell(task){
    const summary=taskProgressSummary(task);
    const author=String(taskValue(task,"latestProgressAuthor","")||"").split("|||")[0];
    const updatedAt=taskValue(task,"latestProgressAt","");
    return `<div class="task-grid-result-log">
      ${summary?`<p>${html(summary)}</p><small>${html(author||"Đã có báo cáo")}${updatedAt?` · ${html(relativeLogTime(updatedAt))}`:""}</small>`:`<p class="text-slate-400">Chưa có cập nhật</p>`}
      <button type="button" onclick="openTaskLogModal('${html(task.id)}')">${summary?"Xem / cập nhật":"＋ Thêm kết quả"}</button>
    </div>`;
  }
  function selfCell(task){
    const value=taskSelfAssessment(task);
    return `<span class="task-final-chip ${statusTone(value)}">${html(value)}</span>`;
  }
  function unitCell(task){
    const unit=taskUnit(task);
    if(!canEditTaskField("unit"))return `<div class="task-grid-readonly task-grid-unit">${html(unit)}</div>`;
    return `<select class="task-grid-cell-select" onchange="updateTaskGridField('${html(task.id)}','unit',this.value,this)">${uniqueUnits().map(value=>`<option ${value===unit?"selected":""}>${html(value)}</option>`).join("")}</select>`;
  }
  function dateCell(task){
    const value=taskDeadline(task);
    if(!canEditTaskCell(task,"deadline"))return `<div class="task-grid-readonly task-grid-date">${html(fmt(value))}</div>`;
    return `<input class="task-grid-cell-input date-input-vi" inputmode="numeric" maxlength="10" placeholder="Không bắt buộc" value="${html(formatDateInputValue(value))}" onblur="commitTaskGridDeadline('${html(task.id)}',this)">`;
  }
  function finalCell(task){
    const value=finalAssessment(task);
    if(!canEditTaskField("vpduAssessment"))return `<span class="task-final-chip ${statusTone(value)}">${html(value)}</span>`;
    return `<select class="task-grid-cell-select" onchange="updateTaskGridField('${html(task.id)}','vpduAssessment',this.value,this)">${options(FINAL_OPTIONS,value)}</select><div class="task-grid-save-state">Dùng cho Dashboard</div>`;
  }

  /** Biến CSS cho độ rộng cột và vị trí các cột cố định (thay cho số px viết cứng trước đây). */
  function tableGeometryStyle(){
    const widths=gridState.widths;
    const hidden=hiddenGridColumns();
    const total=widths.reduce((sum,value,index)=>sum+(hidden.includes(index)?0:value),0);
    return `--tg-left-1:${widths[0]}px;--tg-left-2:${widths[0]+widths[1]}px;width:${total}px;min-width:${total}px`;
  }
  function letterRowHtml(){
    return `<tr class="task-grid-letter-row">${GRID_LETTERS.map((letter,index)=>`<th class="${GRID_COLUMN_CLASSES[index]}" style="width:${gridState.widths[index]}px" data-letter-col="${index}"><span aria-hidden="true">${letter}</span><span class="task-grid-col-resizer" data-resize-col="${index}" title="Kéo để đổi độ rộng cột ${letter}. Nhấn đúp để trả về mặc định." role="separator" aria-orientation="vertical" aria-label="Đổi độ rộng cột ${letter}"></span></th>`).join("")}</tr>`;
  }
  function applyColumnWidths(){
    const table=document.querySelector("#taskExcelGrid .task-excel-table");
    if(!table)return;
    table.setAttribute("style",tableGeometryStyle());
    table.querySelectorAll(".task-grid-letter-row th").forEach((th,index)=>{th.style.width=`${gridState.widths[index]}px`;});
  }
  function updateFreezeStatus(){
    const status=document.getElementById("taskGridFreezeStatus");
    if(status)status.textContent=`Cố định ${gridState.frozen} cột đầu`;
  }

  window.renderTaskListFull=function(){
    const wrap=document.getElementById("taskExcelGrid");
    if(!wrap)return;
    const filtered=filteredGridRows();
    const all=activeTasks();
    const pageCount=Math.max(1,Math.ceil(filtered.length/gridState.pageSize));
    gridState.page=Math.min(Math.max(1,gridState.page),pageCount);
    const offset=(gridState.page-1)*gridState.pageSize;
    const rows=filtered.slice(offset,offset+gridState.pageSize);
    const hint=document.getElementById("taskCenterHint");
    if(hint)hint.textContent=`Trang ${gridState.page}/${pageCount} · ${filtered.length} nhiệm vụ phù hợp · Dashboard dùng Đánh giá của VPĐU.`;
    applyTaskGridViewClasses();
    renderTaskSheetTabs();
    renderTaskGridFilterOptions();
    if(!rows.length){
      const initialLoading=document.body.classList.contains("ubkt-initial-loading")&&!all.length;
      wrap.innerHTML=initialLoading
        ?`<div class="task-grid-skeleton" role="status" aria-live="polite"><span class="sr-only">Đang tải danh sách nhiệm vụ…</span>${'<i></i>'.repeat(6)}</div>`
        :`<div class="task-grid-empty"><div><b>Không có nhiệm vụ phù hợp</b><span>Thử thay đổi từ khóa hoặc bộ lọc đang chọn.</span></div></div>`;
      updateTaskGridSearchUi(0,all.length);
      renderTaskGridPagination(0,1);
      clearTaskGridSelectionUi();
      window.requestAnimationFrame(window.syncTaskGridScrollbars);
      return;
    }
    gridState.frozen=frozenColumnCount();
    updateFreezeStatus();
    wrap.innerHTML=`<table class="task-excel-table freeze-${gridState.frozen}${hiddenGridColumns().map(index=>` hide-col-${index}`).join("")}" style="${tableGeometryStyle()}"><thead>${letterRowHtml()}<tr class="task-grid-column-row">
      ${headerCell("STT","flag","col-stt")}${headerCell("Số văn bản","doc","col-doc")}${headerCell("Nội dung kết luận","content","col-content")}${headerCell("Đơn vị thực hiện",null,"col-unit")}${headerCell("Thời gian","deadline","col-date")}${headerCell("Kết quả thực hiện","result","col-result")}${headerCell("Tự đánh giá của đơn vị","self","col-self")}${headerCell("Đánh giá của VPĐU","final","col-final")}
    </tr></thead><tbody>${rows.map((task,index)=>{const sheetRow=offset+index+2;return `<tr class="${taskFlagged(task)?"is-flagged":""}" data-task-row="${sheetRow}">
      <td ${gridCellAttributes(task,"stt",sheetRow,0)}>${flagCell(task,offset+index+1)}</td>
      <td ${gridCellAttributes(task,"doc",sheetRow,1)}>${wrapTextCell(task,"doc",taskDoc(task))}</td>
      <td ${gridCellAttributes(task,"conclusion",sheetRow,2)}>${conclusionCell(task)}</td>
      <td ${gridCellAttributes(task,"unit",sheetRow,3)}>${unitCell(task)}</td><td ${gridCellAttributes(task,"deadline",sheetRow,4)}>${dateCell(task)}</td><td ${gridCellAttributes(task,"result",sheetRow,5)}>${resultCell(task)}</td><td ${gridCellAttributes(task,"self",sheetRow,6)}>${selfCell(task)}</td><td ${gridCellAttributes(task,"final",sheetRow,7)}>${finalCell(task)}</td>
    </tr>`;}).join("")}</tbody></table>`;
    updateTaskGridSearchUi(filtered.length,all.length);
    renderTaskGridPagination(filtered.length,pageCount);
    restoreTaskGridSelection(rows[0],offset+2);
    window.requestAnimationFrame(()=>refreshTaskGridWrap(wrap));
    window.requestAnimationFrame(window.syncTaskGridScrollbars);
  };

  window.setTaskGridFilter=function(key,value){gridState[key]=String(value||"");gridState.page=1;renderTaskListFull();};
  window.queueTaskGridSearch=function(value){
    window.clearTimeout(taskGridSearchTimer);
    taskGridSearchTimer=window.setTimeout(()=>setTaskGridFilter("search",value),300);
  };
  window.setTaskGridColumnFilter=function(key,value){
    if(!(key in gridState.columns))return;
    gridState.columns[key]=String(value||"");gridState.page=1;renderTaskListFull();
  };
  /* ---------- Wrap Text: tự bọc chữ theo độ rộng cột, giới hạn số dòng, hiện "Xem toàn bộ" khi bị rút gọn ---------- */
  /** Số đo của ô sửa: số dòng tối đa (biến CSS --tg-wrap-lines), chiều cao dòng, phần đệm và viền. */
  function wrapMetrics(element){
    const style=getComputedStyle(element);
    const px=key=>parseFloat(style[key])||0;
    return {
      lines:parseFloat(style.getPropertyValue("--tg-wrap-lines"))||4,
      lineHeight:parseFloat(style.lineHeight)||px("fontSize")*1.6,
      padTop:px("paddingTop"),padBottom:px("paddingBottom"),
      border:px("borderTopWidth")+px("borderBottomWidth")
    };
  }
  /** Ô sửa cao vừa nội dung; dài hơn N dòng thì dừng đúng N dòng và bỏ đệm dưới (lớp is-clipped) để dòng kế tiếp không lộ nửa chừng. */
  function fitWrapEditor(element,scrollHeight,m){
    const content=scrollHeight-m.padTop-m.padBottom;
    const limit=m.lineHeight*m.lines;
    const truncated=content>limit+1;
    element.classList.toggle("is-clipped",truncated);
    element.style.height=`${Math.ceil(truncated?limit+m.padTop+m.border:scrollHeight+m.border)}px`;
    element.closest(".task-grid-text-cell")?.classList.toggle("is-truncated",truncated);
  }
  function markTruncated(container){
    const text=container.querySelector("div.task-grid-wrap");if(!text)return;
    container.classList.toggle("is-truncated",text.scrollHeight>text.clientHeight+1);
  }
  /** Đo lại toàn bộ ô chữ trong bảng: ghi trước, đọc sau, rồi ghi một lượt để trình duyệt chỉ tính bố cục ít lần. */
  window.refreshTaskGridWrap=function(scope){
    const root=scope||document.getElementById("taskExcelGrid");if(!root)return;
    const editors=[...root.querySelectorAll("textarea.task-grid-wrap")];
    editors.forEach(element=>{element.classList.remove("is-clipped");element.style.height="auto";});
    const measured=editors.map(element=>({element,scrollHeight:element.scrollHeight,metrics:wrapMetrics(element)}));
    measured.forEach(item=>fitWrapEditor(item.element,item.scrollHeight,item.metrics));
    root.querySelectorAll(".task-grid-text-cell").forEach(markTruncated);
  };
  window.autoResizeTaskGridTextarea=function(element){
    if(!element)return;
    element.classList.remove("is-clipped");element.style.height="auto";
    fitWrapEditor(element,element.scrollHeight,wrapMetrics(element));
  };
  let wrapFrame=0;
  function scheduleTaskGridWrap(){
    if(wrapFrame)return;
    wrapFrame=window.requestAnimationFrame(()=>{wrapFrame=0;window.refreshTaskGridWrap();});
  }

  /* ---------- Cửa sổ "Xem toàn bộ": chỉ để đọc, không chuyển sang chế độ sửa ---------- */
  let textViewerReturnFocus=null;
  function ensureTaskTextViewer(){
    let viewer=document.getElementById("taskTextViewer");if(viewer)return viewer;
    document.body.insertAdjacentHTML("beforeend",`<div id="taskTextViewer" class="modal task-text-viewer" role="dialog" aria-modal="true" aria-labelledby="taskTextViewerTitle" aria-describedby="taskTextViewerMeta" onclick="if(event.target===this)closeTaskTextViewer()">
      <section class="task-text-viewer-card">
        <header class="task-text-viewer-head">
          <div><h3 id="taskTextViewerTitle">Nội dung kết luận</h3><span id="taskTextViewerMeta"></span></div>
          <button type="button" class="task-text-viewer-close" onclick="closeTaskTextViewer()" aria-label="Đóng"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </header>
        <div id="taskTextViewerBody" class="task-text-viewer-body" tabindex="0"></div>
        <footer class="task-text-viewer-foot">
          <span id="taskTextViewerHint"></span>
          <div><button type="button" class="task-text-viewer-btn" onclick="copyTaskTextViewer(this)">Sao chép</button><button id="taskTextViewerAction" type="button" class="task-text-viewer-btn" hidden>Cập nhật kết quả</button><button type="button" class="task-text-viewer-btn is-primary" onclick="closeTaskTextViewer()">Đóng</button></div>
        </footer>
      </section>
    </div>`);
    viewer=document.getElementById("taskTextViewer");
    viewer.addEventListener("keydown",event=>{
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();window.closeTaskTextViewer();return;}
      if(event.key!=="Tab")return;
      const focusable=[...viewer.querySelectorAll("button,[tabindex='0']")].filter(item=>item.offsetParent!==null);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    return viewer;
  }
  window.openTaskTextViewer=function(taskId,field){
    const task=tasks.find(item=>String(item.id)===String(taskId));if(!task)return;
    const viewer=ensureTaskTextViewer();
    const value=field==="doc"?taskDoc(task):taskConclusion(task);
    const note=String(taskValue(task,"redFlagNote","")||"").trim();
    const meta=[field==="doc"?"":taskDoc(task),taskUnit(task),taskDeadline(task)?`Thời hạn ${fmt(taskDeadline(task))}`:""].filter(Boolean).join(" · ");
    document.getElementById("taskTextViewerTitle").textContent=WRAP_FIELD_LABELS[field]||"Nội dung";
    document.getElementById("taskTextViewerMeta").textContent=meta;
    document.getElementById("taskTextViewerBody").innerHTML=`<div class="task-text-viewer-text">${html(value||"—")}</div>${field==="conclusion"&&taskFlagged(task)&&note?`<aside class="task-red-note"><b>NOTE ĐỎ</b><p>${html(note)}</p></aside>`:""}`;
    document.getElementById("taskTextViewerHint").textContent=canEditTaskCell(task,field)?"Chỉ để đọc. Nhấp đúp vào ô trong bảng để sửa.":"Chỉ để đọc.";
    document.getElementById("taskTextViewerAction").hidden=true;
    viewer.classList.remove("is-row-view");
    viewer.dataset.copyText=value||"";
    textViewerReturnFocus=document.querySelector(`#taskExcelGrid td[data-task-id="${CSS.escape(String(task.id))}"][data-grid-field="${field}"]`)||document.activeElement;
    if(!viewer.classList.contains("open")){viewer.classList.add("open");lockScroll();}
    document.getElementById("taskTextViewerBody").scrollTop=0;
    viewer.querySelector(".task-text-viewer-close").focus({preventScroll:true});
  };
  /** Xem nhanh cả dòng: mọi cột của một nhiệm vụ trong một khung đọc, không cần kéo ngang (rất hữu ích trên điện thoại). */
  window.openTaskRowViewer=function(taskId){
    const task=tasks.find(item=>String(item.id)===String(taskId));if(!task)return;
    const viewer=ensureTaskTextViewer();
    const doc=taskDoc(task)||"Chưa có số văn bản";const conclusion=taskConclusion(task)||"Chưa có nội dung kết luận";
    const coUnit=String(taskValue(task,"coUnit","")||"").trim();
    const summary=taskProgressSummary(task);const author=String(taskValue(task,"latestProgressAuthor","")||"").split("|||")[0];const at=taskValue(task,"latestProgressAt","");
    const note=String(taskValue(task,"redFlagNote","")||"").trim();
    const row=(label,value,extra="")=>`<div class="task-row-field${extra}"><dt>${label}</dt><dd>${value}</dd></div>`;
    document.getElementById("taskTextViewerTitle").textContent=doc;
    document.getElementById("taskTextViewerMeta").textContent=[taskUnit(task),taskDeadline(task)?`Thời hạn ${fmt(taskDeadline(task))}`:"Chưa có thời hạn"].filter(Boolean).join(" · ");
    document.getElementById("taskTextViewerBody").innerHTML=`${taskFlagged(task)&&note?`<aside class="task-red-note"><b>NOTE ĐỎ</b><p>${html(note)}</p></aside>`:""}<dl class="task-row-fields">
      ${row("Đơn vị thực hiện",html(taskUnit(task)||"—")+(coUnit?`<small>Phối hợp: ${html(coUnit)}</small>`:""))}
      ${row("Thời gian",html(taskDeadline(task)?fmt(taskDeadline(task)):"Chưa có thời hạn"))}
      ${row("Tự đánh giá của đơn vị",`<span class="task-final-chip ${statusTone(taskSelfAssessment(task))}">${html(taskSelfAssessment(task))}</span>`)}
      ${row("Đánh giá của VPĐU",`<span class="task-final-chip ${statusTone(finalAssessment(task))}">${html(finalAssessment(task))}</span>`)}
      ${row("Kết quả thực hiện",summary?`<div class="task-text-viewer-text">${html(summary)}</div><small>${html(author||"Đã có báo cáo")}${at?` · ${html(relativeLogTime(at))}`:""}</small>`:`<span class="is-muted">Chưa có cập nhật</span>`," is-wide")}
      ${row("Nội dung kết luận",`<div class="task-text-viewer-text">${html(conclusion)}</div>`," is-wide")}
    </dl>`;
    document.getElementById("taskTextViewerHint").textContent="Xem nhanh, không chỉnh sửa.";
    const action=document.getElementById("taskTextViewerAction");action.hidden=false;
    action.onclick=()=>{window.closeTaskTextViewer();window.openTaskLogModal(task.id);};
    viewer.classList.add("is-row-view");
    viewer.dataset.copyText=[doc,conclusion,`Đơn vị: ${taskUnit(task)}`,`Thời gian: ${taskDeadline(task)?fmt(taskDeadline(task)):"—"}`,`Kết quả: ${summary||"—"}`,`Tự đánh giá: ${taskSelfAssessment(task)}`,`Đánh giá VPĐU: ${finalAssessment(task)}`].join("\n");
    textViewerReturnFocus=document.querySelector(`#taskExcelGrid td[data-task-id="${CSS.escape(String(task.id))}"][data-grid-field="stt"]`)||document.activeElement;
    if(!viewer.classList.contains("open")){viewer.classList.add("open");lockScroll();}
    document.getElementById("taskTextViewerBody").scrollTop=0;
    viewer.querySelector(".task-text-viewer-close").focus({preventScroll:true});
  };
  window.closeTaskTextViewer=function(){
    const viewer=document.getElementById("taskTextViewer");
    if(!viewer||!viewer.classList.contains("open"))return;
    viewer.classList.remove("open");unlockScroll();
    const target=textViewerReturnFocus;textViewerReturnFocus=null;
    if(target&&document.contains(target)){
      if(target.matches?.("td[data-grid-field]"))selectTaskGridCell(target,false);
      target.focus({preventScroll:true});
    }
  };
  window.copyTaskTextViewer=async function(button){
    const text=document.getElementById("taskTextViewer")?.dataset.copyText||"";
    try{await navigator.clipboard.writeText(text);button.textContent="Đã sao chép";setTimeout(()=>{button.textContent="Sao chép";},1600);}
    catch(error){showModuleToast("Chưa sao chép được","Hãy bôi đen nội dung trong cửa sổ rồi nhấn Ctrl + C.");}
  };
  window.updateTaskGridSearchUi=function(visible,total){
    const count=document.getElementById("taskGridSearchCount");
    const clear=document.getElementById("taskGridSearchClear");
    if(count)count.textContent=gridState.search?`${visible} kết quả phù hợp`:`${total} nhiệm vụ`;
    if(clear)clear.hidden=!gridState.search;
  };
  window.clearTaskGridSearch=function(){
    window.clearTimeout(taskGridSearchTimer);
    gridState.search="";
    gridState.page=1;
    const input=document.getElementById("taskCenterSearch");
    if(input){input.value="";input.focus();}
    renderTaskListFull();
  };
  window.setTaskGridPage=function(page){
    gridState.page=Math.max(1,Number(page)||1);
    renderTaskListFull();
    document.getElementById("taskExcelGrid")?.scrollTo?.({top:0,behavior:"smooth"});
  };
  window.setTaskGridPageSize=function(value){
    const size=Number(value);
    gridState.pageSize=[20,30,50].includes(size)?size:30;
    gridState.page=1;
    renderTaskListFull();
  };
  /* ---------- Tùy chọn hiển thị: chiều cao dòng, cỡ chữ, chế độ tập trung (lưu riêng trên trình duyệt) ---------- */
  const VIEW_STORE_KEY="ubkt.taskGrid.view.v1";
  const DENSITIES=["compact","comfortable","spacious"];
  function loadViewPrefs(){
    try{const saved=JSON.parse(window.localStorage.getItem(VIEW_STORE_KEY)||"null")||{};return {density:DENSITIES.includes(saved.density)?saved.density:"comfortable",largeText:saved.largeText===true,focus:saved.focus===true};}
    catch(error){return {density:"comfortable",largeText:false,focus:false};}
  }
  function saveViewPrefs(){
    try{window.localStorage.setItem(VIEW_STORE_KEY,JSON.stringify({density:gridState.density,largeText:gridState.largeText,focus:gridState.focus}));}catch(error){/* trình duyệt chặn bộ nhớ: chỉ áp dụng trong phiên */}
  }
  Object.assign(gridState,loadViewPrefs());
  /** Cột ẩn ở chế độ tập trung: đơn vị bỏ cột Đơn vị (luôn là đơn vị mình); các vai trò khác giữ Số VB, Nội dung, Kết quả, Đánh giá VPĐU. */
  function hiddenGridColumns(){
    if(!gridState.focus)return [];
    return isUnitUser()?[3]:[3,4,6];
  }
  function visibleGridColumns(){const hidden=hiddenGridColumns();return GRID_FIELDS.map((field,index)=>index).filter(index=>!hidden.includes(index));}
  function applyTaskGridViewClasses(){
    const workspace=document.querySelector(".task-grid-workspace");if(!workspace)return;
    workspace.classList.toggle("is-compact",gridState.density==="compact");
    workspace.classList.toggle("is-spacious",gridState.density==="spacious");
    workspace.classList.toggle("is-large-text",gridState.largeText);
    workspace.classList.toggle("is-focus",gridState.focus);
    const panel=document.getElementById("taskGridViewPanel");if(!panel)return;
    panel.querySelectorAll('input[name="taskGridDensity"]').forEach(input=>{input.checked=input.value===gridState.density;});
    panel.querySelectorAll('input[name="taskGridTextSize"]').forEach(input=>{input.checked=(input.value==="large")===gridState.largeText;});
    const focus=document.getElementById("taskGridFocusToggle");if(focus)focus.checked=gridState.focus;
    const hint=document.getElementById("taskGridFocusHint");if(hint)hint.textContent=isUnitUser()?"Ẩn cột Đơn vị thực hiện":"Ẩn cột Đơn vị, Thời gian, Tự đánh giá";
    const label=document.getElementById("taskGridViewSummary");
    if(label){const changed=gridState.density!=="comfortable"||gridState.largeText||gridState.focus;label.hidden=!changed;}
  }
  window.setTaskGridView=function(key,value){
    if(key==="density"&&DENSITIES.includes(value))gridState.density=value;
    if(key==="largeText")gridState.largeText=!!value;
    if(key==="focus"){
      gridState.focus=!!value;
      // bộ lọc của cột vừa bị ẩn không còn nhìn thấy được, nên bỏ để tránh lọc "ngầm"
      if(gridState.focus){const keys=["flag","doc","content","unit","deadline","result","self","final"];hiddenGridColumns().forEach(index=>{gridState.columns[keys[index]]="";});}
    }
    saveViewPrefs();renderTaskListFull();
  };
  /** Giữ tương thích với lời gọi cũ: chuyển qua lại Gọn ↔ Tiêu chuẩn. */
  window.toggleTaskGridDensity=function(){window.setTaskGridView("density",gridState.density==="compact"?"comfortable":"compact");};
  window.toggleTaskGridViewPanel=function(force){
    const panel=document.getElementById("taskGridViewPanel");const button=document.getElementById("taskGridViewButton");if(!panel||!button)return;
    const open=typeof force==="boolean"?force:panel.hidden;
    panel.hidden=!open;button.setAttribute("aria-expanded",String(open));
    if(open){
      // Điện thoại: thả bảng tùy chọn ngay dưới nút, rộng gần hết màn hình (không đè thanh tab đơn vị và thông báo ở đáy)
      panel.style.top=window.innerWidth<=640?`${Math.round(button.getBoundingClientRect().bottom+6)}px`:"";
      applyTaskGridViewClasses();panel.querySelector("input:checked,input")?.focus({preventScroll:true});
    }
  };
  document.addEventListener("click",event=>{
    const panel=document.getElementById("taskGridViewPanel");
    if(panel&&!panel.hidden&&!event.target.closest?.(".task-view-menu"))window.toggleTaskGridViewPanel(false);
  });
  window.addEventListener("scroll",()=>{const panel=document.getElementById("taskGridViewPanel");if(panel&&!panel.hidden&&window.innerWidth<=640)window.toggleTaskGridViewPanel(false);},{passive:true});
  document.addEventListener("keydown",event=>{
    const panel=document.getElementById("taskGridViewPanel");
    if(event.key==="Escape"&&panel&&!panel.hidden){event.preventDefault();window.toggleTaskGridViewPanel(false);document.getElementById("taskGridViewButton")?.focus();}
  });
  function setTaskGridSyncState(state,label){
    const element=document.getElementById("taskGridSyncState");if(!element)return;
    element.dataset.state=state;element.textContent=label;
  }
  window.refreshTaskGridData=async function(button){
    if(button?.disabled)return;
    const original=button?.innerHTML;if(button){button.disabled=true;button.classList.add("is-loading");}
    setTaskGridSyncState("syncing","Đang đồng bộ dữ liệu...");
    try{
      const loaded=await loadFromDatabase();
      if(!loaded)throw new Error("Chưa kết nối được cơ sở dữ liệu");
      setTaskGridSyncState("ready",`Đã đồng bộ lúc ${new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit"}).format(new Date())}`);
      showModuleToast("Đã làm mới bảng nhiệm vụ","Dữ liệu mới nhất từ hệ thống đã được tải và Dashboard vẫn liên kết theo thẩm định VPĐU.");
    }catch(error){setTaskGridSyncState("error","Đồng bộ chưa thành công");showModuleToast("Chưa làm mới được dữ liệu",error.message||"Vui lòng thử lại.");}
    finally{if(button){button.disabled=false;button.classList.remove("is-loading");button.innerHTML=original;}}
  };
  function highlightSelectionHeaders(cell){
    const grid=document.getElementById("taskExcelGrid");if(!grid)return;
    grid.querySelectorAll(".task-grid-letter-row th.is-active-col").forEach(item=>item.classList.remove("is-active-col"));
    grid.querySelectorAll("tbody tr.is-active-row").forEach(item=>item.classList.remove("is-active-row"));
    if(!cell)return;
    const col=Number(cell.dataset.gridCol)||0;
    grid.querySelector(`.task-grid-letter-row th[data-letter-col="${col}"]`)?.classList.add("is-active-col");
    cell.parentElement?.classList.add("is-active-row");
  }
  function clearTaskGridSelectionUi(){
    highlightSelectionHeaders(null);
  }
  function restoreTaskGridSelection(fallbackTask,fallbackRow){
    let selection=gridState.selection;
    let cell=selection&&visibleGridColumns().includes(GRID_FIELDS.indexOf(selection.field))?document.querySelector(`#taskExcelGrid td[data-task-id="${CSS.escape(String(selection.taskId))}"][data-grid-field="${selection.field}"]`):null;
    if(!cell&&fallbackTask){selection={taskId:String(fallbackTask.id),field:"doc",row:fallbackRow,col:1};gridState.selection=selection;cell=document.querySelector(`#taskExcelGrid td[data-task-id="${CSS.escape(String(fallbackTask.id))}"][data-grid-field="doc"]`);}
    if(cell)selectTaskGridCell(cell,false);else clearTaskGridSelectionUi();
  }
  function selectTaskGridCell(cell,scroll=true){
    if(!cell)return;
    document.querySelectorAll("#taskExcelGrid td.is-selected-cell").forEach(item=>item.classList.remove("is-selected-cell"));cell.classList.add("is-selected-cell");
    highlightSelectionHeaders(cell);
    const task=tasks.find(item=>String(item.id)===String(cell.dataset.taskId));if(!task)return;
    const field=cell.dataset.gridField;const row=Number(cell.dataset.gridRow)||2;const col=Number(cell.dataset.gridCol)||0;
    gridState.selection={taskId:String(task.id),field,row,col};
    if(scroll)ensureCellVisible(cell);
  }
  /** Cuộn để ô đang chọn không bị che bởi các cột cố định hoặc hàng tiêu đề dính trên. */
  function ensureCellVisible(cell){
    const grid=document.getElementById("taskExcelGrid");const table=cell.closest("table");
    if(!grid||!table){cell.scrollIntoView({block:"nearest",inline:"nearest"});return;}
    const col=Number(cell.dataset.gridCol)||0;
    if(col>=gridState.frozen){
      const frozenWidth=gridState.widths.slice(0,gridState.frozen).reduce((sum,value)=>sum+value,0);
      const left=cell.offsetLeft;const right=left+cell.offsetWidth;
      if(left<grid.scrollLeft+frozenWidth)grid.scrollLeft=Math.max(0,left-frozenWidth);
      else if(right>grid.scrollLeft+grid.clientWidth)grid.scrollLeft=right-grid.clientWidth;
    }
    const headerHeight=table.tHead?.offsetHeight||0;
    const top=table.offsetTop+cell.offsetTop;const bottom=top+cell.offsetHeight;
    if(top<grid.scrollTop+headerHeight)grid.scrollTop=Math.max(0,top-headerHeight);
    else if(bottom>grid.scrollTop+grid.clientHeight)grid.scrollTop=Math.min(top-headerHeight,bottom-grid.clientHeight);
    cell.scrollIntoView({block:"nearest",inline:"nearest"});
  }
  /* ---------- [Univer] Thao tác bảng tính bằng bàn phím và chuột ---------- */
  function gridCellAt(row,col){
    return document.querySelector(`#taskExcelGrid td[data-grid-row="${row}"][data-grid-col="${col}"]`);
  }
  function pageRowBounds(){
    const rows=[...document.querySelectorAll("#taskExcelGrid tbody tr[data-task-row]")].map(item=>Number(item.dataset.taskRow));
    return rows.length?{first:Math.min(...rows),last:Math.max(...rows)}:null;
  }
  function focusGridCell(cell){
    if(!cell)return false;
    selectTaskGridCell(cell,true);
    cell.focus({preventScroll:true});
    return true;
  }
  /** Chuyển trang rồi chọn ô ở dòng đầu (hoặc cuối) trang mới, giữ nguyên cột. */
  function moveToPage(page,col,atEnd){
    const pageCount=Math.max(1,Math.ceil(filteredGridRows().length/gridState.pageSize));
    if(page<1||page>pageCount)return false;
    gridState.page=page;
    renderTaskListFull();
    const bounds=pageRowBounds();if(!bounds)return false;
    const grid=document.getElementById("taskExcelGrid");if(grid&&!atEnd)grid.scrollTop=0;
    return focusGridCell(gridCellAt(atEnd?bounds.last:bounds.first,col));
  }
  /** Mở ô để sửa (Enter / F2 / nhấn đúp). Ô chỉ đọc thì không làm gì. */
  function enterTaskGridCell(cell){
    if(!cell)return;
    const field=cell.dataset.gridField;
    if(field==="result"){openTaskLogModal(cell.dataset.taskId);return;}
    if(field==="stt"){if(canFlagTask())openTaskRedFlagModal(cell.dataset.taskId);return;}
    const control=cell.querySelector("input.task-grid-cell-input,textarea.task-grid-cell-textarea,select.task-grid-cell-select");
    // Ô chữ chỉ đọc (tài khoản đơn vị): Enter / nhấp đúp mở cửa sổ đọc toàn văn
    if(!control){if(["doc","conclusion"].includes(field))window.openTaskTextViewer(cell.dataset.taskId,field);return;}
    control.focus({preventScroll:true});
    if(control.tagName==="SELECT"){try{control.showPicker?.();}catch(error){/* trình duyệt không hỗ trợ mở sẵn danh sách */}return;}
    const end=control.value.length;
    try{control.setSelectionRange(end,end);}catch(error){/* ô ngày không hỗ trợ đặt con trỏ */}
  }
  /** Esc khi đang sửa: trả lại giá trị cũ rồi quay về chế độ chọn ô (không lưu gì). */
  function cancelCellEdit(control){
    if(control.tagName==="SELECT"){
      const index=[...control.options].findIndex(option=>option.defaultSelected);
      if(index>=0)control.selectedIndex=index;
    }else{
      control.value=control.defaultValue;
    }
    const cell=control.closest("td[data-grid-field]");
    control.blur();
    if(cell){selectTaskGridCell(cell,false);cell.focus({preventScroll:true});}
  }
  async function copySelectedCell(){
    const selection=gridState.selection;if(!selection)return;
    const task=tasks.find(item=>String(item.id)===String(selection.taskId));if(!task)return;
    const value=gridCellValue(task,selection.field,selection.row);
    try{
      await navigator.clipboard.writeText(value);
      showModuleToast("Đã sao chép ô",`${GRID_LETTERS[selection.col]||""}${selection.row}: ${value.length>80?`${value.slice(0,80)}…`:value||"(trống)"}`);
    }catch(error){
      showModuleToast("Chưa sao chép được","Trình duyệt chưa cho phép truy cập bộ nhớ tạm. Hãy bôi đen nội dung trong ô rồi nhấn Ctrl + C.");
    }
  }
  function handleGridKey(event){
    const page=document.getElementById("page-tasks");
    if(!page||page.classList.contains("hidden"))return;
    if(document.querySelector(".modal.open"))return;
    const target=event.target;
    // Đang sửa trong ô: Esc hủy, Enter (ô một dòng) lưu và xuống dòng dưới
    const control=target.closest?.("#taskExcelGrid td[data-grid-field] input,#taskExcelGrid td[data-grid-field] textarea,#taskExcelGrid td[data-grid-field] select");
    if(control){
      if(event.key==="Escape"){event.preventDefault();cancelCellEdit(control);return;}
      // Số văn bản là ô một dòng về ý nghĩa (chỉ bọc chữ khi hiển thị) nên Enter lưu như ô nhập thường
      if(event.key==="Enter"&&(control.tagName==="INPUT"||control.classList.contains("task-grid-doc-editor"))&&!event.isComposing){
        event.preventDefault();
        const cell=control.closest("td[data-grid-field]");
        const below=cell?gridCellAt(Number(cell.dataset.gridRow)+1,Number(cell.dataset.gridCol)):null;
        control.blur();
        if(below)focusGridCell(below);else if(cell){selectTaskGridCell(cell,false);cell.focus({preventScroll:true});}
      }
      return;
    }
    if(target.closest?.("input,textarea,select,button,[contenteditable='true'],summary,a"))return;
    if(!gridState.selection)return;
    // Chỉ nhận phím khi tiêu điểm đang ở trong bảng (hoặc chưa ở đâu cả), tránh chiếm phím của phần khác trên trang
    const inGrid=!!target.closest?.("#taskExcelGrid");
    if(!inGrid&&target!==document.body&&target!==document.documentElement)return;
    const cols=visibleGridColumns();const firstCol=cols[0],lastCol=cols[cols.length-1];
    const stepCol=(from,dir)=>{const index=cols.indexOf(from);return cols[Math.min(cols.length-1,Math.max(0,(index<0?0:index)+dir))];};
    let {row,col}=gridState.selection;
    const bounds=pageRowBounds();if(!bounds)return;
    const key=event.key;
    const ctrl=event.ctrlKey||event.metaKey;
    if(ctrl&&String(key).toLowerCase()==="c"){
      if(String(window.getSelection?.()||"").trim())return; // đang bôi đen chữ: để trình duyệt sao chép như thường
      event.preventDefault();copySelectedCell();return;
    }
    if(["Tab","Home","End","PageUp","PageDown"].includes(key)&&!inGrid)return;
    if(key==="Enter"||key==="F2"){event.preventDefault();enterTaskGridCell(gridCellAt(row,col));return;}
    if(key==="PageDown"){event.preventDefault();moveToPage(gridState.page+1,col,false);return;}
    if(key==="PageUp"){event.preventDefault();moveToPage(gridState.page-1,col,false);return;}
    if(key==="Home"){event.preventDefault();focusGridCell(gridCellAt(ctrl?bounds.first:row,firstCol));return;}
    if(key==="End"){event.preventDefault();focusGridCell(gridCellAt(ctrl?bounds.last:row,lastCol));return;}
    if(key==="Tab"){
      if(event.shiftKey){if(col>firstCol)col=stepCol(col,-1);else if(row>bounds.first){row-=1;col=lastCol;}else return;}
      else{if(col<lastCol)col=stepCol(col,1);else if(row<bounds.last){row+=1;col=firstCol;}else return;}
      event.preventDefault();focusGridCell(gridCellAt(row,col));return;
    }
    if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(key))return;
    event.preventDefault();
    if(key==="ArrowLeft")col=ctrl?firstCol:stepCol(col,-1);
    if(key==="ArrowRight")col=ctrl?lastCol:stepCol(col,1);
    if(key==="ArrowUp"){
      if(ctrl)row=bounds.first;
      else if(row<=bounds.first){moveToPage(gridState.page-1,col,true);return;}
      else row-=1;
    }
    if(key==="ArrowDown"){
      if(ctrl)row=bounds.last;
      else if(row>=bounds.last){moveToPage(gridState.page+1,col,false);return;}
      else row+=1;
    }
    focusGridCell(gridCellAt(row,col));
  }
  /** Kéo mép chữ cột (A, B, C...) để đổi độ rộng; nhấn đúp để trả về mặc định. */
  function installColumnResize(wrap){
    let drag=null;
    wrap.addEventListener("pointerdown",event=>{
      const handle=event.target.closest(".task-grid-col-resizer");if(!handle)return;
      event.preventDefault();
      const index=Number(handle.dataset.resizeCol);
      drag={index,startX:event.clientX,startWidth:gridState.widths[index],handle};
      handle.setPointerCapture?.(event.pointerId);
      handle.classList.add("is-dragging");document.body.classList.add("task-grid-resizing");
    });
    wrap.addEventListener("pointermove",event=>{
      if(!drag)return;
      gridState.widths[drag.index]=clampColumnWidth(drag.startWidth+(event.clientX-drag.startX),drag.index);
      applyColumnWidths();scheduleTaskGridWrap();
    });
    const finish=()=>{
      if(!drag)return;
      drag.handle.classList.remove("is-dragging");document.body.classList.remove("task-grid-resizing");
      drag=null;saveColumnWidths(gridState.widths);window.refreshTaskGridWrap();window.syncTaskGridScrollbars();
    };
    wrap.addEventListener("pointerup",finish);
    wrap.addEventListener("pointercancel",finish);
    wrap.addEventListener("dblclick",event=>{
      const handle=event.target.closest(".task-grid-col-resizer");
      if(handle){
        const index=Number(handle.dataset.resizeCol);
        gridState.widths[index]=GRID_DEFAULT_WIDTHS[index];
        applyColumnWidths();saveColumnWidths(gridState.widths);window.refreshTaskGridWrap();window.syncTaskGridScrollbars();
        return;
      }
      const cell=event.target.closest("td[data-grid-field]");
      if(cell&&!event.target.closest("input,textarea,select,button,a")){selectTaskGridCell(cell,false);enterTaskGridCell(cell);}
    });
  }
  function installTaskSheetInteractions(){
    const wrap=document.getElementById("taskExcelGrid");
    if(!wrap||wrap.dataset.sheetInteractionsReady)return;
    wrap.dataset.sheetInteractionsReady="1";
    wrap.addEventListener("click",event=>{
      const cell=event.target.closest("td[data-grid-field]");
      if(!cell)return;
      selectTaskGridCell(cell,false);
      // Bấm vào vùng trống của ô: đặt tiêu điểm vào ô để dùng ngay phím mũi tên
      if(!event.target.closest("input,textarea,select,button,a,summary"))cell.focus({preventScroll:true});
    });
    installColumnResize(wrap);
    document.addEventListener("keydown",handleGridKey);
    window.addEventListener("resize",scheduleTaskGridWrap,{passive:true});
    installTaskGridDock();
  }

  /* ---------- [Univer] Thanh cuộn ngang + tab đơn vị luôn dính đáy màn hình ---------- */
  let dockFrame=0;
  function scheduleTaskGridDock(){
    if(dockFrame)return;
    dockFrame=window.requestAnimationFrame(()=>{dockFrame=0;updateTaskGridDock();paintHorizontalScrollbar();});
  }
  function updateTaskGridDock(){
    const grid=document.getElementById("taskExcelGrid");
    const dock=document.getElementById("taskGridDock");
    const spacer=document.getElementById("taskGridDockSpacer");
    const page=document.getElementById("page-tasks");
    if(!grid||!dock||!spacer)return;
    const floating=dock.classList.contains("is-floating");
    const release=()=>{
      if(!floating)return;
      dock.classList.remove("is-floating");dock.style.left="";dock.style.width="";spacer.style.height="0px";
    };
    if(!page||page.classList.contains("hidden")||!grid.offsetParent){release();return;}
    const viewport=window.innerHeight||document.documentElement.clientHeight;
    const dockHeight=dock.offsetHeight;
    const gridRect=grid.getBoundingClientRect();
    // Vị trí "tự nhiên" của khối đáy: khi đang ghim thì đo theo khoảng giữ chỗ
    const naturalTop=(floating?spacer:dock).getBoundingClientRect().top;
    // Chỉ ghim khi bảng đã lộ đủ vài dòng (≥160px), tránh rối mắt lúc bảng mới ló lên ở mép dưới
    const gridVisible=gridRect.top<viewport-dockHeight-160&&gridRect.bottom>dockHeight+48;
    const shouldFloat=gridVisible&&naturalTop+dockHeight>viewport+1;
    if(!shouldFloat){release();return;}
    spacer.style.height=`${dockHeight}px`;
    dock.classList.add("is-floating");
    dock.style.left=`${Math.round(gridRect.left)}px`;
    dock.style.width=`${Math.round(gridRect.width)}px`;
  }
  function installTaskGridDock(){
    const grid=document.getElementById("taskExcelGrid");if(!grid||grid.dataset.dockReady)return;
    grid.dataset.dockReady="1";
    // Trang cuộn bằng thân trang (body) nên lắng nghe ở pha "capture" để bắt mọi vùng cuộn
    document.addEventListener("scroll",scheduleTaskGridDock,{capture:true,passive:true});
    window.addEventListener("resize",scheduleTaskGridDock,{passive:true});
    if("ResizeObserver" in window)new ResizeObserver(scheduleTaskGridDock).observe(grid);
  }
  window.updateTaskGridDock=scheduleTaskGridDock;

  /* ---------- [Univer] Tab đơn vị: tự cuộn tới tab đang chọn ---------- */
  /** Nút ‹ › trước dãy tab đơn vị (thay thanh cuộn có sẵn của trình duyệt dưới các tab). */
  function paintSheetTabNav(){
    const tabs=document.getElementById("taskSheetTabs");const nav=document.getElementById("taskSheetNav");
    if(!tabs||!nav)return;
    const overflow=!tabs.hidden&&tabs.scrollWidth>tabs.clientWidth+2;
    nav.hidden=!overflow;
    if(!overflow)return;
    nav.querySelector('[data-tabs-step="-1"]').disabled=tabs.scrollLeft<=0;
    nav.querySelector('[data-tabs-step="1"]').disabled=tabs.scrollLeft>=tabs.scrollWidth-tabs.clientWidth-1;
  }
  function installSheetTabNav(){
    const tabs=document.getElementById("taskSheetTabs");const nav=document.getElementById("taskSheetNav");
    if(!tabs||!nav||nav.dataset.ready)return;
    nav.dataset.ready="1";
    tabs.addEventListener("scroll",paintSheetTabNav,{passive:true});
    nav.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
      tabs.scrollBy({left:Number(button.dataset.tabsStep)*Math.max(160,tabs.clientWidth*.7),behavior:"smooth"});
    }));
    window.addEventListener("resize",paintSheetTabNav,{passive:true});
  }
  function revealActiveSheetTab(){
    installSheetTabNav();
    const tabs=document.getElementById("taskSheetTabs");const active=tabs?.querySelector(".task-sheet-tab.is-active");
    if(tabs&&active){
      const left=active.offsetLeft;const right=left+active.offsetWidth;
      if(left<tabs.scrollLeft)tabs.scrollLeft=Math.max(0,left-8);
      else if(right>tabs.scrollLeft+tabs.clientWidth)tabs.scrollLeft=right-tabs.clientWidth+8;
    }
    paintSheetTabNav();
  }
  window.renderTaskGridPagination=function(total,pageCount){
    const host=document.getElementById("taskGridPagination");if(!host)return;
    if(!total){host.innerHTML="";return;}
    const start=(gridState.page-1)*gridState.pageSize+1;
    const end=Math.min(total,gridState.page*gridState.pageSize);
    host.innerHTML=`<div><b>${start}–${end}</b><span>trong ${total} nhiệm vụ</span></div><div class="task-grid-page-actions"><label>Hiển thị <select onchange="setTaskGridPageSize(this.value)">${[20,30,50].map(size=>`<option value="${size}" ${size===gridState.pageSize?"selected":""}>${size} dòng</option>`).join("")}</select></label><button type="button" onclick="setTaskGridPage(${gridState.page-1})" ${gridState.page<=1?"disabled":""}>‹ Trước</button><span>Trang ${gridState.page}/${pageCount}</span><button type="button" onclick="setTaskGridPage(${gridState.page+1})" ${gridState.page>=pageCount?"disabled":""}>Sau ›</button></div>`;
  };
  /* ---------- Thanh cuộn ngang tự vẽ: luôn hiện, kéo chuột được ----------
     Trước đây dùng thanh cuộn có sẵn của trình duyệt: trên máy Mac nó tự ẩn (chỉ còn dải xám),
     và khi lướt trackpad thì hiện 2 lằn (thanh của bảng + thanh ở đáy). Nay bảng ẩn thanh ngang
     của trình duyệt, chỉ còn 1 thanh tự vẽ này. */
  const HSCROLL_MIN_THUMB=48;
  function hscrollParts(){
    const grid=document.getElementById("taskExcelGrid");
    const bar=document.getElementById("taskGridBottomScrollbar");
    return {grid,bar,track:bar?.querySelector(".task-hscroll-track"),thumb:bar?.querySelector(".task-hscroll-thumb")};
  }
  function hscrollMetrics(grid,track){
    const maxScroll=Math.max(0,grid.scrollWidth-grid.clientWidth);
    const trackWidth=track.clientWidth;
    const thumbWidth=maxScroll?Math.max(HSCROLL_MIN_THUMB,Math.round(trackWidth*grid.clientWidth/grid.scrollWidth)):trackWidth;
    return {maxScroll,trackWidth,thumbWidth,room:Math.max(0,trackWidth-thumbWidth)};
  }
  function paintHorizontalScrollbar(){
    const {grid,bar,track,thumb}=hscrollParts();
    if(!grid||!bar||!track||!thumb)return;
    const overflow=grid.scrollWidth>grid.clientWidth+2;
    bar.hidden=!overflow;
    if(!overflow)return;
    const m=hscrollMetrics(grid,track);
    const ratio=m.maxScroll?grid.scrollLeft/m.maxScroll:0;
    thumb.style.width=`${m.thumbWidth}px`;
    thumb.style.transform=`translateX(${Math.round(ratio*m.room)}px)`;
    bar.setAttribute("aria-valuenow",String(Math.round(ratio*100)));
    bar.querySelector('[data-step="-1"]').disabled=grid.scrollLeft<=0;
    bar.querySelector('[data-step="1"]').disabled=grid.scrollLeft>=m.maxScroll-1;
  }
  function installHorizontalScrollbar(){
    const {grid,bar,track,thumb}=hscrollParts();
    if(!grid||!bar||!track||!thumb||bar.dataset.ready)return;
    bar.dataset.ready="1";
    grid.addEventListener("scroll",paintHorizontalScrollbar,{passive:true});
    // Kéo tay kéo
    let drag=null;
    thumb.addEventListener("pointerdown",event=>{
      event.preventDefault();event.stopPropagation();
      drag={startX:event.clientX,startLeft:grid.scrollLeft,m:hscrollMetrics(grid,track)};
      thumb.setPointerCapture?.(event.pointerId);bar.classList.add("is-dragging");
    });
    thumb.addEventListener("pointermove",event=>{
      if(!drag||!drag.m.room)return;
      grid.scrollLeft=drag.startLeft+(event.clientX-drag.startX)*drag.m.maxScroll/drag.m.room;
    });
    const stop=()=>{drag=null;bar.classList.remove("is-dragging");};
    thumb.addEventListener("pointerup",stop);thumb.addEventListener("pointercancel",stop);
    // Bấm vào rãnh: nhảy tới vị trí bấm (tâm tay kéo đặt tại chỗ bấm)
    track.addEventListener("pointerdown",event=>{
      if(event.target===thumb)return;
      const m=hscrollMetrics(grid,track);if(!m.room)return;
      const x=event.clientX-track.getBoundingClientRect().left-m.thumbWidth/2;
      grid.scrollTo({left:Math.max(0,Math.min(m.room,x))/m.room*m.maxScroll,behavior:"smooth"});
    });
    // Nút ‹ ›: cuộn một khoảng bằng 60% bề ngang đang nhìn thấy
    bar.querySelectorAll(".task-hscroll-step").forEach(button=>button.addEventListener("click",()=>{
      grid.scrollBy({left:Number(button.dataset.step)*Math.max(160,grid.clientWidth*.6),behavior:"smooth"});
    }));
    // Lăn chuột khi trỏ đang ở trên thanh: cuộn ngang
    bar.addEventListener("wheel",event=>{
      const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
      if(!delta)return;
      event.preventDefault();grid.scrollLeft+=delta;
    },{passive:false});
    // Bàn phím khi thanh đang được chọn
    bar.addEventListener("keydown",event=>{
      const page=grid.clientWidth*.9;
      const moves={ArrowLeft:-80,ArrowRight:80,PageUp:-page,PageDown:page};
      if(event.key==="Home"){event.preventDefault();grid.scrollLeft=0;return;}
      if(event.key==="End"){event.preventDefault();grid.scrollLeft=grid.scrollWidth;return;}
      if(moves[event.key]===undefined)return;
      event.preventDefault();grid.scrollLeft+=moves[event.key];
    });
  }
  window.syncTaskGridScrollbars=function(){
    installHorizontalScrollbar();
    paintHorizontalScrollbar();
    scheduleTaskGridDock();
  };
  window.resetTaskGridFilters=function(){
    Object.assign(gridState,{search:"",month:"",assessment:"",sheet:"all",page:1});
    Object.keys(gridState.columns).forEach(key=>gridState.columns[key]="");
    ["taskCenterSearch","taskGridMonthFilter","taskGridAssessmentFilter"].forEach(id=>{const element=document.getElementById(id);if(element)element.value="";});
    renderTaskListFull();
  };
  /** Mở Tab Nhiệm vụ với bộ lọc có sẵn. options: {assessment, sheet}. Các bộ lọc khác được xóa để kết quả khớp số liệu trên Dashboard. */
  window.openTaskGridView=function(options={}){
    Object.assign(gridState,{search:"",month:"",assessment:String(options.assessment||""),sheet:String(options.sheet||"all"),page:1,selection:null});
    Object.keys(gridState.columns).forEach(key=>gridState.columns[key]="");
    const search=document.getElementById("taskCenterSearch");if(search)search.value="";
    switchPage("tasks");
    window.scrollTo?.({top:0,behavior:"auto"});
  };
  window.setTaskGridSheet=function(unit){gridState.sheet=unit||"all";gridState.page=1;renderTaskListFull();};
  window.renderTaskSheetTabs=function(){
    const tabs=document.getElementById("taskSheetTabs");
    if(!tabs||!isOversightUser())return;
    const all=activeTasks();
    const items=[{key:"all",label:"Tất cả nhiệm vụ",count:all.length},...uniqueUnits().map(unit=>({key:unit,label:unit,count:all.filter(task=>taskUnit(task)===unit).length}))];
    tabs.innerHTML=items.map(item=>`<button type="button" class="task-sheet-tab ${gridState.sheet===item.key?"is-active":""}" aria-pressed="${gridState.sheet===item.key}" onclick="setTaskGridSheet('${html(item.key).replace(/'/g,"&#39;")}')">${html(item.label)} <small>${item.count}</small></button>`).join("");
    window.requestAnimationFrame(revealActiveSheetTab);
  };
  window.renderTaskGridFilterOptions=function(){
    const month=document.getElementById("taskGridMonthFilter");
    const assessment=document.getElementById("taskGridAssessmentFilter");
    if(month)month.innerHTML=`<option value="">Tất cả tháng</option><option value="none" ${gridState.month==="none"?"selected":""}>Chưa có thời hạn</option>${uniqueMonths().map(value=>`<option value="${value}" ${value===gridState.month?"selected":""}>${monthLabel(value)}</option>`).join("")}`;
    if(assessment)assessment.innerHTML=`<option value="">Tất cả tiến độ</option><optgroup label="Theo nhóm">${["processing","late"].map(key=>`<option value="group:${key}" ${gridState.assessment===`group:${key}`?"selected":""}>${html(STATUS_GROUPS[key].label)}</option>`).join("")}</optgroup><optgroup label="Theo Đánh giá của VPĐU">${FINAL_OPTIONS.map(value=>`<option value="${html(value)}" ${value===gridState.assessment?"selected":""}>${html(value)}</option>`).join("")}</optgroup>`;
  };

  document.addEventListener("keydown",event=>{
    if(!(event.ctrlKey||event.metaKey)||String(event.key).toLowerCase()!=="f")return;
    const page=document.getElementById("page-tasks");
    const input=document.getElementById("taskCenterSearch");
    if(!page||page.classList.contains("hidden")||!input)return;
    event.preventDefault();input.focus();input.select();
  });
  window.addEventListener("resize",()=>window.requestAnimationFrame(()=>{
    // Đổi giữa điện thoại / máy tính bảng / máy tính thì số cột cố định thay đổi → vẽ lại bảng
    const page=document.getElementById("page-tasks");
    if(frozenColumnCount()!==gridState.frozen&&page&&!page.classList.contains("hidden"))renderTaskListFull();
    else window.syncTaskGridScrollbars();
  }));

  /** Đơn vị không có quyền ghi thẳng bảng nhiệm vụ (RLS), nên đổi thời hạn qua hàm máy chủ chỉ cho phép đúng ô Thời gian của đơn vị mình. */
  async function saveUnitDeadline(task,value,element){
    if(String(taskDeadline(task))===value)return;
    setTaskGridSyncState("syncing","Đang lưu thời hạn...");
    element?.classList.add("is-saving");
    const {error}=await getSupabaseClient().rpc("unit_set_task_deadline",{p_task_id:String(task.id),p_deadline:value||null});
    element?.classList.remove("is-saving");
    if(error){
      const missing=error.code==="PGRST202"||/could not find the function/i.test(error.message||"");
      setTaskGridSyncState("error","Thời hạn chưa được lưu");
      showModuleToast("Chưa lưu được thời hạn",missing?"Chức năng đơn vị tự sửa thời hạn đang chờ quản trị kích hoạt trên máy chủ.":(error.message||"Vui lòng thử lại."));
      renderTaskListFull();return;
    }
    Object.assign(task,{deadline:value,updatedAt:localTodayISO()});persistLocal(false);render();
    setTaskGridSyncState("ready","Đã lưu và đồng bộ Dashboard");
    showModuleToast("Đã lưu thời hạn","Thời hạn mới đã được cập nhật cho nhiệm vụ.");
  }

  /** VPĐU chốt đúng một trường thẩm định qua RPC; không có quyền UPDATE trực tiếp cả bản ghi nhiệm vụ. */
  async function saveVpduAssessment(task,value,element){
    if(finalAssessment(task)===value)return;
    setTaskGridSyncState("syncing","Đang lưu đánh giá VPĐU...");
    element?.classList.add("is-saving");
    const {data,error}=await getSupabaseClient().rpc("vpdu_set_task_assessment",{p_task_id:String(task.id),p_assessment:value});
    element?.classList.remove("is-saving");
    if(error){
      setTaskGridSyncState("error","Đánh giá chưa được lưu");
      showModuleToast("Chưa lưu được thẩm định",error.message||"Vui lòng thử lại.");
      renderTaskListFull();return;
    }
    Object.assign(task,{vpduAssessment:data?.vpduAssessment||value,updatedAt:data?.updatedAt||localTodayISO()});
    persistLocal(false);render();
    setTaskGridSyncState("ready","Đã lưu và đồng bộ Dashboard");
    showModuleToast("Đã cập nhật thẩm định","Các số liệu Dashboard đã được tính lại ngay.");
  }
  window.commitTaskGridDeadline=function(taskId,element){
    const raw=String(element?.value||"").trim();
    const value=raw?dateInputToISO(raw):"";
    if(raw&&!value){showModuleToast("Ngày chưa đúng định dạng","Vui lòng nhập ngày/tháng/năm, ví dụ 31/12/2026.");renderTaskListFull();return;}
    updateTaskGridField(taskId,"deadline",value,element);
  };

  function createRedFlagModal(){
    if(document.getElementById("taskRedFlagModal"))return;
    document.body.insertAdjacentHTML("beforeend",`<div id="taskRedFlagModal" class="modal task-red-flag-modal" role="dialog" aria-modal="true" aria-labelledby="taskRedFlagTitle"><form class="modal-card card" onsubmit="saveTaskRedFlag(event,this)"><div class="pm-modal-heading task-red-flag-heading"><div class="task-red-flag-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 21V4m0 1h10l-2 4 2 4H6"/></svg></div><div><div class="antd-modal-kicker">CẢNH BÁO QUẢN LÝ</div><h3 id="taskRedFlagTitle">Thêm Note đỏ</h3><p id="taskRedFlagDocument">—</p></div><button type="button" class="pm-modal-close" onclick="closeTaskRedFlagModal()" aria-label="Đóng">✕</button></div><div class="task-red-flag-body"><label>Nội dung cảnh báo <span>*</span><textarea id="taskRedFlagNote" rows="5" maxlength="2000" required placeholder="Nêu rõ nội dung cần ưu tiên, lý do trễ hạn hoặc yêu cầu đơn vị xử lý..."></textarea></label><p>Ghi chú này hiển thị trực tiếp dưới nội dung kết luận để đơn vị nhận việc nhìn thấy.</p></div><div class="task-red-flag-footer"><button id="taskRedFlagRemove" type="button" class="btn btn-ghost is-danger" onclick="removeTaskRedFlag()">Gỡ cảnh báo</button><div><button type="button" class="btn btn-ghost" onclick="closeTaskRedFlagModal()">Hủy</button><button type="submit" class="btn btn-primary">Lưu Note đỏ</button></div></div></form></div>`);
  }
  window.openTaskRedFlagModal=function(taskId){
    if(!canFlagTask())return;
    const task=tasks.find(item=>String(item.id)===String(taskId));if(!task)return;
    activeRedFlagTaskId=String(taskId);createRedFlagModal();
    document.getElementById("taskRedFlagTitle").textContent=taskFlagged(task)?"Chỉnh sửa Note đỏ":"Thêm Note đỏ";
    document.getElementById("taskRedFlagDocument").textContent=`${taskDoc(task)||"Chưa có số văn bản"} · ${taskUnit(task)}`;
    document.getElementById("taskRedFlagNote").value=String(taskValue(task,"redFlagNote","")||"");
    document.getElementById("taskRedFlagRemove").hidden=!taskFlagged(task);
    document.getElementById("taskRedFlagModal").classList.add("open");lockScroll();
    window.setTimeout(()=>document.getElementById("taskRedFlagNote")?.focus(),60);
  };
  window.closeTaskRedFlagModal=function(){document.getElementById("taskRedFlagModal")?.classList.remove("open");activeRedFlagTaskId="";unlockScroll();};
  async function persistTaskRedFlag(flagged,note,button){
    const task=tasks.find(item=>String(item.id)===activeRedFlagTaskId);if(!task)return false;
    const updated={...task,redFlag:flagged,redFlagNote:flagged?note:"",redFlagBy:flagged?(currentProfile?.full_name||currentProfile?.email||"Quản lý"):"",redFlagAt:flagged?new Date().toISOString():null,updatedAt:localTodayISO()};
    const auditItem=createAuditEntry(flagged?"Cập nhật Note đỏ":"Gỡ Note đỏ",updated,flagged?note:"Đã bỏ cảnh báo quản lý");
    setTaskGridSyncState("syncing",flagged?"Đang lưu Note đỏ...":"Đang gỡ cảnh báo...");
    const result=await saveRecordsImmediately([{table:DB_TABLES.tasks,items:[updated]},{table:DB_TABLES.audit,items:[auditItem]}],button,flagged?"Đang lưu Note đỏ...":"Đang gỡ cảnh báo...");
    if(!result.saved){setTaskGridSyncState("error","Note đỏ chưa được lưu");return false;}
    Object.assign(task,updated);appendAuditEntry(auditItem);persistLocal(false);closeTaskRedFlagModal();render();
    setTaskGridSyncState("ready","Đã lưu và đồng bộ Dashboard");
    showModuleToast(flagged?"Đã lưu Note đỏ":"Đã gỡ cảnh báo",flagged?"Dòng nhiệm vụ và nội dung cảnh báo đã được cập nhật cho đơn vị thực hiện.":"Nhiệm vụ đã trở về trạng thái bình thường.");
    return true;
  }
  window.saveTaskRedFlag=async function(event,form){event.preventDefault();const note=document.getElementById("taskRedFlagNote")?.value.trim()||"";if(!note)return;await persistTaskRedFlag(true,note,form.querySelector('button[type="submit"]'));};
  window.removeTaskRedFlag=async function(){await persistTaskRedFlag(false,"",document.getElementById("taskRedFlagRemove"));};

  window.updateTaskGridField=async function(taskId,field,value,element){
    const task=tasks.find(item=>String(item.id)===String(taskId));
    if(!task||!canEditTaskCell(task,field))return;
    if(field==="deadline"&&isUnitUser()){await saveUnitDeadline(task,String(value??"").trim(),element);return;}
    if(field==="vpduAssessment"&&currentProfile?.role==="vpdu"){await saveVpduAssessment(task,String(value??"").trim(),element);return;}
    const clean=String(value??"").trim();
    if(["doc","conclusion","unit"].includes(field)&&!clean){showModuleToast("Chưa đủ thông tin","Trường này không được để trống.");renderTaskListFull();return;}
    const previous=task[field];
    if(String(previous??"")===clean)return;
    setTaskGridSyncState("syncing","Đang lưu thay đổi...");
    element?.classList.add("is-saving");
    const updated={...task,[field]:clean,updatedAt:localTodayISO()};
    const auditItem=createAuditEntry(field==="vpduAssessment"?"Chốt đánh giá VPĐU":"Chỉnh sửa nhiệm vụ",updated,`${field}: ${clean}`);
    const result=await saveRecordsImmediately([{table:DB_TABLES.tasks,items:[updated]},{table:DB_TABLES.audit,items:[auditItem]}],null);
    element?.classList.remove("is-saving");
    if(!result.saved){setTaskGridSyncState("error","Thay đổi chưa được lưu");renderTaskListFull();return;}
    Object.assign(task,updated);appendAuditEntry(auditItem);persistLocal(false);render();
    setTaskGridSyncState("ready","Đã lưu và đồng bộ Dashboard");
    showModuleToast(field==="vpduAssessment"?"Đã cập nhật thẩm định":"Đã lưu thay đổi",field==="vpduAssessment"?"Các số liệu Dashboard đã được tính lại ngay.":"Dữ liệu nhiệm vụ đã được đồng bộ.");
  };

  /* Khung chờ nhẹ cho Tab Nhiệm vụ: chỉ thay nội dung bảng, không chạy toàn bộ render (để không làm chậm việc gửi truy vấn). */
  window.paintTaskGridSkeleton=function(){
    const wrap=document.getElementById("taskExcelGrid");
    if(!wrap||(Array.isArray(tasks)&&tasks.length))return;
    wrap.innerHTML=`<div class="task-grid-skeleton" role="status" aria-live="polite"><span class="sr-only">Đang tải danh sách nhiệm vụ…</span>${'<i></i>'.repeat(6)}</div>`;
  };
  async function loadTaskGridCollections(){
    if(!getSupabaseClient())return;
    const client=getSupabaseClient();
    const notificationsResult=await client.from("system_notifications").select("id,category,title,body,action_page,read_at,created_at").order("created_at",{ascending:false}).limit(100);
    if(!notificationsResult.error)systemNotifications=notificationsResult.data||[];
  }
  async function loadTaskLogs(taskId){
    if(!databaseReady||!getSupabaseClient()||!taskId)return;
    const result=await getSupabaseClient().from("task_progress_logs").select("id,task_id,author_id,author_name,content,self_assessment,assessment_note,reporting_period,evidence_url,evidence_path,evidence_name,created_at").eq("task_id",String(taskId)).order("created_at",{ascending:false});
    if(result.error)throw result.error;
    progressLogs=progressLogs.filter(log=>String(log.task_id)!==String(taskId));
    progressLogs.push(...(result.data||[]));
  }
  const legacyLoadFromDatabase=loadFromDatabase;
  loadFromDatabase=async function(){
    // Thông báo hệ thống tải song song với dữ liệu nhiệm vụ (trước đây chạy nối tiếp sau khi tải xong)
    const [loaded]=await Promise.all([legacyLoadFromDatabase(),loadTaskGridCollections().catch(error=>console.warn("Chưa tải được thông báo",error?.code||error?.name||""))]);
    // loadFromDatabase gốc đã vẽ lại toàn trang; ở đây chỉ cập nhật thanh điều hướng (tránh vẽ lại lần 2 ngay lập tức)
    if(loaded){installTaskGridRealtime();if(typeof renderProjectManagerChrome==="function")renderProjectManagerChrome();setTaskGridSyncState("ready","Dữ liệu Dashboard được liên kết trực tiếp");}
    else setTaskGridSyncState("error","Đang dùng dữ liệu cục bộ");
    return loaded;
  };
  function installTaskGridRealtime(){
    const client=getSupabaseClient();
    if(!client||taskGridRealtimeChannel)return;
    let refreshTimer=null;
    const refresh=()=>{
      window.clearTimeout(refreshTimer);
      refreshTimer=window.setTimeout(async()=>{
        try{
          setTaskGridSyncState("syncing","Đang nhận thay đổi mới...");
          const [loaded]=await Promise.all([legacyLoadFromDatabase(),loadTaskGridCollections().catch(()=>{})]);
          if(loaded){if(activeLogTaskId){await loadTaskLogs(activeLogTaskId);renderTaskLogHistory();}persistLocal(false);render();setTaskGridSyncState("ready","Vừa nhận dữ liệu mới");}
        }catch(error){setTaskGridSyncState("error","Mất kết nối cập nhật trực tiếp");console.warn("Task grid realtime refresh failed",error);}
      },220);
    };
    taskGridRealtimeChannel=client
      .channel(`task-grid-${currentProfile?.id||"viewer"}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"ubkt_tasks"},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"task_progress_logs"},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"system_notifications"},refresh)
      .subscribe();
  }

  function authorSnapshot(){
    const name=currentProfile?.full_name||currentProfile?.email||"Người dùng";
    const role=currentProfile?.role==="admin"?"Quản trị hệ thống":currentProfile?.role==="vpdu"?"Văn phòng Đảng ủy":currentProfile?.role==="ubkt"?"Ủy ban Kiểm tra":canonicalUnitValue(currentProfile?.unit_name)||"Đơn vị thực hiện";
    return {name,role,stored:`${name}|||${role}`};
  }
  function logAuthor(log){
    const parts=String(log?.author_name||"Người dùng").split("|||");
    return {name:parts[0]||"Người dùng",role:parts[1]||"Người cập nhật nhiệm vụ"};
  }
  function avatarText(value){
    const words=String(value||"ND").trim().split(/\s+/).filter(Boolean);
    return (words.length>1?`${words[0][0]}${words[words.length-1][0]}`:words[0]?.slice(0,2)||"ND").toLocaleUpperCase("vi");
  }
  function relativeLogTime(value){
    const time=Date.parse(value||"");if(!Number.isFinite(time))return "Vừa cập nhật";
    const seconds=Math.round((time-Date.now())/1000);const abs=Math.abs(seconds);
    const formatter=new Intl.RelativeTimeFormat("vi",{numeric:"auto"});
    if(abs<60)return formatter.format(seconds,"second");
    if(abs<3600)return formatter.format(Math.round(seconds/60),"minute");
    if(abs<86400)return formatter.format(Math.round(seconds/3600),"hour");
    if(abs<604800)return formatter.format(Math.round(seconds/86400),"day");
    return notificationTime(value);
  }

  function createLogModal(){
    if(document.getElementById("taskLogModal"))return;
    document.body.insertAdjacentHTML("beforeend",`<div id="taskLogModal" class="modal task-log-modal" role="dialog" aria-modal="true" aria-labelledby="taskLogTitle"><div class="modal-card card w-full">
      <div class="pm-modal-heading task-log-heading">
        <div class="pm-modal-heading-icon task-log-heading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 6h10M8 11h10M8 16h6"/><path d="M4 6h.01M4 11h.01M4 16h.01"/></svg></div>
        <div class="task-log-heading-copy"><div class="antd-modal-kicker">NHẬT KÝ TIẾN ĐỘ</div><h3 id="taskLogTitle">Cập nhật kết quả thực hiện</h3><p>Ghi thêm một lần báo cáo mới. Lịch sử đã lưu được giữ nguyên để bảo đảm dấu vết cập nhật.</p></div>
        <button type="button" class="pm-modal-close" onclick="closeTaskLogModal()" aria-label="Đóng cửa sổ">✕</button>
      </div>
      <div class="task-log-context" aria-label="Nhiệm vụ đang cập nhật"><div><span>Số văn bản</span><strong id="taskLogDocument">—</strong></div><p id="taskLogConclusion">—</p></div>
      <div class="task-log-body task-social-body"><form class="task-social-composer" onsubmit="submitTaskProgressLog(event,this)">
        <div class="task-social-identity"><span id="taskComposerAvatar" class="task-social-avatar">ND</span><div><b id="taskComposerName">Người cập nhật</b><small id="taskComposerRole">Đơn vị thực hiện</small></div></div>
        <div class="task-social-input"><textarea id="taskLogContent" rows="5" maxlength="10000" required placeholder="Viết cập nhật tiến độ, kết quả thực hiện hoặc khó khăn cần báo cáo..."></textarea></div>
        <div class="task-social-assessment"><label>Tự đánh giá<select id="taskLogSelfAssessment">${options(SELF_OPTIONS,"Đang thực hiện")}</select></label><small>Mỗi lần gửi sẽ tạo một dấu vết mới và không ghi đè lịch sử.</small></div>
        <details class="task-social-more"><summary>Thêm ghi chú hoặc đường dẫn minh chứng</summary><div><label>Ghi chú đánh giá<textarea id="taskLogAssessmentNote" rows="2" placeholder="Giải trình ngắn (nếu có)"></textarea></label><label>Đường dẫn minh chứng<input id="taskLogEvidenceUrl" type="url" placeholder="https://..."></label></div></details>
        <div class="task-social-actions"><label class="task-social-attach" for="taskLogEvidenceFile"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 12-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg><span id="taskLogFileName">Đính kèm minh chứng</span><input id="taskLogEvidenceFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onchange="document.getElementById('taskLogFileName').textContent=this.files[0]?.name||'Đính kèm minh chứng'"></label><button class="btn btn-primary" type="submit">Cập nhật</button></div>
      </form><section class="task-log-history task-social-feed"><div class="task-log-history-heading"><div><span>HOẠT ĐỘNG</span><h4>Luồng cập nhật</h4></div><small>Mới nhất hiển thị trước</small></div><div id="taskLogHistory"></div></section></div>
    </div></div>`);
  }
  window.openTaskLogModal=async function(taskId){
    const task=tasks.find(item=>String(item.id)===String(taskId));if(!task)return;
    activeLogTaskId=String(taskId);createLogModal();
    document.getElementById("taskLogTitle").textContent="Cập nhật kết quả thực hiện";
    document.getElementById("taskLogDocument").textContent=taskDoc(task)||"Chưa có số văn bản";
    document.getElementById("taskLogConclusion").textContent=taskConclusion(task)||"Chưa có nội dung kết luận";
    document.getElementById("taskLogContent").value="";document.getElementById("taskLogAssessmentNote").value="";document.getElementById("taskLogEvidenceUrl").value="";document.getElementById("taskLogEvidenceFile").value="";document.getElementById("taskLogSelfAssessment").value=taskSelfAssessment(task)==="Chưa tự đánh giá"?"Đang thực hiện":taskSelfAssessment(task);
    // VPĐU cập nhật tiến độ nhưng không thay đơn vị tự đánh giá: ẩn ô chọn, giữ nguyên giá trị hiện có
    const selfAssessBox=document.querySelector("#taskLogModal .task-social-assessment");if(selfAssessBox)selfAssessBox.hidden=!taskRoleAccess().selfAssess;
    const author=authorSnapshot();document.getElementById("taskComposerAvatar").textContent=avatarText(author.name);document.getElementById("taskComposerName").textContent=author.name;document.getElementById("taskComposerRole").textContent=author.role;document.getElementById("taskLogFileName").textContent="Đính kèm minh chứng";
    taskLogsLoading=true;renderTaskLogHistory();document.getElementById("taskLogModal").classList.add("open");lockScroll();
    window.setTimeout(()=>document.getElementById("taskLogContent")?.focus(),80);
    try{await loadTaskLogs(activeLogTaskId);}catch(error){showModuleToast("Chưa tải được lịch sử",error.message||"Vui lòng thử lại.");}
    finally{taskLogsLoading=false;renderTaskLogHistory();}
  };
  window.closeTaskLogModal=function(){document.getElementById("taskLogModal")?.classList.remove("open");activeLogTaskId="";unlockScroll();};
  /* Kết quả nhập ngay khi giao nhiệm vụ (trường result) — hiển thị khi chưa có báo cáo tiến độ nào. */
  function initialResultCard(taskId){
    const task=tasks.find(item=>String(item.id)===String(taskId));
    const result=String(task?.result||"").trim();
    if(!result)return "";
    return `<article class="task-social-comment task-log-initial-result"><span class="task-social-avatar" aria-hidden="true">KQ</span><div class="task-social-bubble"><div class="task-social-comment-head"><div><b>Kết quả thực hiện</b><small>Ghi nhận khi giao nhiệm vụ</small></div></div><p>${html(result)}</p></div></article>`;
  }
  window.renderTaskLogHistory=function(){
    const host=document.getElementById("taskLogHistory");if(!host)return;
    if(taskLogsLoading){host.innerHTML=`<div class="task-log-loading"><span></span><b>Đang tải lịch sử cập nhật...</b></div>`;return;}
    const rows=logsFor(activeLogTaskId);
    host.innerHTML=rows.length?rows.map(log=>{const author=logAuthor(log);return `<article class="task-social-comment"><span class="task-social-avatar">${html(avatarText(author.name))}</span><div class="task-social-bubble"><div class="task-social-comment-head"><div><b>${html(author.name)}</b><small>${html(author.role)}</small></div><time title="${html(relativeLogTime(log.created_at))}">${html(notificationTime(log.created_at))}</time></div><p>${html(log.content)}</p><div class="task-social-comment-meta">${log.self_assessment?`<span>Tự đánh giá: <b>${html(log.self_assessment)}</b></span>`:""}<span>${html(log.reporting_period)}</span></div>${log.assessment_note?`<div class="task-social-note">${html(log.assessment_note)}</div>`:""}${log.evidence_url||log.evidence_path?`<a class="task-social-evidence" href="#" onclick="openTaskEvidence('${html(log.id)}');return false">${attachmentIcon()}<span>${html(log.evidence_name||"Mở minh chứng đính kèm")}</span></a>`:""}</div></article>`;}).join(""):initialResultCard(activeLogTaskId)||`<div class="task-log-empty-state"><span aria-hidden="true">◎</span><b>Chưa có cập nhật nào</b><p>Hãy gửi báo cáo đầu tiên để bắt đầu luồng trao đổi tiến độ.</p></div>`;
  };
  window.submitTaskProgressLog=async function(event,form){
    event.preventDefault();const task=tasks.find(item=>String(item.id)===activeLogTaskId);if(!task)return;
    const button=form.querySelector("button[type=submit]");setSaveButtonBusy(button,true,"Đang lưu...");setTaskGridSyncState("syncing","Đang lưu kết quả thực hiện...");
    try{
      const client=getSupabaseClient();const content=document.getElementById("taskLogContent").value.trim();const file=document.getElementById("taskLogEvidenceFile").files[0];
      let evidencePath=null,evidenceName=null;
      if(file){
        const safeName=file.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-");
        evidencePath=`${activeLogTaskId}/${currentProfile.id}/${Date.now()}-${safeName}`;evidenceName=file.name;
        const upload=await client.storage.from("task-evidence").upload(evidencePath,file,{upsert:false});if(upload.error)throw upload.error;
      }
      const now=new Date();const author=authorSnapshot();const payload={task_id:activeLogTaskId,author_id:currentProfile.id,author_name:author.stored,content,self_assessment:taskRoleAccess().selfAssess?document.getElementById("taskLogSelfAssessment").value:(taskSelfAssessment(task)==="Chưa tự đánh giá"?null:taskSelfAssessment(task)),assessment_note:document.getElementById("taskLogAssessmentNote").value.trim()||null,reporting_period:`Tuần ${new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}).format(now)}`,evidence_url:document.getElementById("taskLogEvidenceUrl").value.trim()||null,evidence_path:evidencePath,evidence_name:evidenceName};
      const {data,error}=await client.from("task_progress_logs").insert(payload).select().single();if(error)throw error;
      progressLogs.unshift(data);Object.assign(task,{latestProgressSummary:content,selfAssessment:payload.self_assessment||"Chưa tự đánh giá",latestProgressAt:data.created_at||now.toISOString(),latestProgressAuthor:author.stored});recordTaskNotification(task,"comment","Có cập nhật kết quả thực hiện",content.slice(0,140));renderTaskLogHistory();renderTaskListFull();form.reset();document.getElementById("taskLogSelfAssessment").value="Đang thực hiện";document.getElementById("taskLogFileName").textContent="Đính kèm minh chứng";
      setTaskGridSyncState("ready","Đã lưu và đồng bộ Dashboard");
      showModuleToast("Đã lưu kết quả thực hiện","Nhật ký mới đã được ghi kèm người cập nhật và thời gian chốt kỳ.");
    }catch(error){setTaskGridSyncState("error","Kết quả chưa được lưu");showModuleToast("Chưa lưu được cập nhật",error.message||"Vui lòng thử lại.");}
    finally{setSaveButtonBusy(button,false);}
  };
  window.openTaskEvidence=async function(logId){
    const log=progressLogs.find(item=>String(item.id)===String(logId));if(!log)return;
    if(log.evidence_url){window.open(log.evidence_url,"_blank","noopener");return;}
    if(log.evidence_path){const {data,error}=await getSupabaseClient().storage.from("task-evidence").createSignedUrl(log.evidence_path,300);if(error){showModuleToast("Không mở được minh chứng",error.message);return;}window.open(data.signedUrl,"_blank","noopener");}
  };

  const legacyApplyAccessControl=applyAccessControl;
  /** Ẩn mục menu ngoài phạm vi vai trò; nhãn nhóm chỉ hiện khi trong nhóm còn ít nhất một mục. */
  function applyNavigationScope(){
    const access=taskRoleAccess();
    const nav=document.querySelector("#sidebar .pm-sidebar-nav");if(!nav)return;
    let section=null,visibleInSection=0;
    const closeSection=()=>{if(section)section.hidden=section.hidden||visibleInSection===0;};
    [...nav.children].forEach(item=>{
      if(item.classList.contains("pm-nav-section")){closeSection();section=item;visibleInSection=0;if(access.pages!==null)item.hidden=false;return;}
      if(!item.classList.contains("nav-item"))return;
      const page=item.dataset.page;
      const allowed=page?canAccessPage(page):access.pages===null;
      if(!allowed)item.hidden=true;
      else if(access.pages!==null)item.hidden=false;
      if(!item.hidden)visibleInSection+=1;
    });
    closeSection();
    document.querySelectorAll("[data-full-access-only]").forEach(element=>{element.hidden=!access.tools;});
    document.querySelectorAll("[data-task-creator]").forEach(element=>{element.hidden=!access.addTask;});
    document.querySelectorAll("[data-task-oversight]").forEach(element=>{element.hidden=!isOversightUser();});
    document.querySelectorAll("[data-update-reviewer]").forEach(element=>{element.hidden=!access.review;});
  }
  applyAccessControl=function(){
    legacyApplyAccessControl();
    document.body.classList.toggle("task-grid-unit-mode",isUnitUser());
    applyNavigationScope();
    const current=document.querySelector("section.page:not(.hidden)")?.id?.replace("page-","");
    if(current&&!canAccessPage(current))switchPage(current);
    if(window.location.hash)routeFromHash();
  };
  const PAGE_IDS=["dashboard","projects","roadmap","tasks","resolutions","opinion","conclusions","baseorgs","dossiers","accounts","approvals"];
  function pageScopeMessage(){
    if(isUnitUser())return ["Chỉ truy cập Tab Nhiệm vụ","Tài khoản đơn vị chỉ được xem và cập nhật nhiệm vụ thuộc đơn vị mình."];
    if(isVpduUser())return ["Không thuộc phạm vi tài khoản","Tài khoản Văn phòng Đảng ủy dùng Dashboard tổng quan, Tab Nhiệm vụ và Duyệt cập nhật tiến độ."];
    return ["Không có quyền truy cập","Tài khoản chưa được cấp quyền cho khu vực này."];
  }
  const legacySwitchPage=switchPage;
  switchPage=function(page){
    const access=taskRoleAccess();
    if(!PAGE_IDS.includes(page))page=access.pages?.[0]||"dashboard";
    if(currentProfile&&!canAccessPage(page)){
      const [title,body]=pageScopeMessage();showModuleToast(title,body);
      page=access.pages?.[0]||"tasks";
    }
    legacySwitchPage(page);
  };
  /** Lớp chặn thứ hai: trang đang hiện phải thuộc phạm vi vai trò, kể cả khi bị bật bằng URL (#accounts), console hay mã khác. */
  function enforceVisiblePageScope(){
    if(!currentProfile)return;
    const visible=document.querySelector("#appScreen section.page:not(.hidden)");
    const page=visible?.id?.replace("page-","");
    if(page&&!canAccessPage(page))switchPage(page);
  }
  const legacyRenderForScope=render;
  render=function(...args){enforceVisiblePageScope();return legacyRenderForScope.apply(this,args);};
  function routeFromHash(){
    const page=String(window.location.hash||"").replace(/^#(page-)?/,"").trim();
    if(page&&PAGE_IDS.includes(page)&&currentProfile)switchPage(page);
  }
  window.addEventListener("hashchange",routeFromHash);

  const legacyBuildWorkflowNotifications=buildWorkflowNotifications;
  buildWorkflowNotifications=function(){
    const dbItems=systemNotifications.map(item=>({id:`system-${item.id}`,category:item.category||"system",icon:"task",title:item.title,body:item.body,detail:item.read_at?"Đã xem":"Chưa xem",status:item.read_at?"recorded":"pending",statusLabel:item.read_at?"Đã xem":"Mới",tone:item.read_at?"is-neutral":"is-pending",time:item.created_at,actionLabel:"Mở bảng nhiệm vụ",action:`closeAlertsModal();switchPage('${item.action_page||"tasks"}')`}));
    return [...dbItems,...legacyBuildWorkflowNotifications()].sort((a,b)=>(Date.parse(b.time||"")||0)-(Date.parse(a.time||"")||0));
  };
  const legacyOpenAlertsModal=openAlertsModal;
  openAlertsModal=function(){
    legacyOpenAlertsModal();
    const unread=systemNotifications.filter(item=>!item.read_at);
    if(unread.length&&databaseReady){
      const readAt=new Date().toISOString();
      getSupabaseClient().from("system_notifications").update({read_at:readAt}).in("id",unread.map(item=>item.id)).then(({error})=>{
        if(!error){unread.forEach(item=>item.read_at=readAt);}
      });
    }
  };

  function installRoleOptions(){
    const role=document.getElementById("userEditRole");if(!role||role.querySelector('option[value="vpdu"]'))return;
    role.insertAdjacentHTML("beforeend",'<option value="vpdu">Văn phòng Đảng ủy (VPĐU)</option><option value="ubkt">Ủy ban Kiểm tra (UBKT)</option>');
  }
  const legacyOpenUserEditModal=openUserEditModal;
  openUserEditModal=function(userId,statusOverride=""){
    if(!isSystemAdminUser()){
      showModuleToast("Chỉ Admin được cấp quyền","VPĐU và UBKT được xem danh sách nhưng không thay đổi quyền tài khoản.");
      return;
    }
    legacyOpenUserEditModal(userId,statusOverride);installRoleOptions();const profile=adminAccounts.find(item=>item.id===userId);if(profile&&["vpdu","ubkt"].includes(profile.role)){userEditRole.value=profile.role;syncUserEditRoleFields(false);}
  };
  syncUserEditRoleFields=function(restoreUnit=true){
    const role=document.getElementById("userEditRole")?.value||"unit";const select=document.getElementById("userEditUnit");if(!select)return;const oversight=role!=="unit";
    if(oversight){const value=canonicalUnitValue(select.value);if(value)select.dataset.lastUnit=value;select.value="";select.disabled=true;}else{select.disabled=false;if(restoreUnit&&!canonicalUnitValue(select.value))select.value=canonicalUnitValue(select.dataset.lastUnit||document.getElementById("userEditRequestedUnit")?.value||"");}
    document.getElementById("userEditUnitField")?.classList.toggle("is-disabled",oversight);if(document.getElementById("userEditUnitRequired"))document.getElementById("userEditUnitRequired").hidden=oversight;
    const help=document.getElementById("userEditUnitHelp");if(help)help.textContent=oversight?"Vai trò này được xem và thao tác dữ liệu quản lý trên toàn hệ thống.":"Tài khoản đơn vị chỉ xem nhiệm vụ được giao cho đơn vị này.";
  };
  saveUserProfileEdit=async function(){
    if(!isSystemAdminUser())return;const role=userEditRole.value;const decision=userEditStatus.value;const unit=role==="unit"?canonicalUnitValue(userEditUnit.value):"";
    if(decision==="approved"&&role==="unit"&&!unit){showModuleToast("Thiếu đơn vị được cấp quyền","Vui lòng chọn đơn vị trước khi kích hoạt tài khoản.");return;}
    const {error}=await getSupabaseClient().rpc("set_user_account_access",{p_user_id:userEditId.value,p_role:role,p_decision:decision,p_unit_name:unit||null,p_note:userEditNote.value.trim()||null});
    if(error){showModuleToast("Chưa lưu được người dùng",error.message);return;}closeUserEditModal();await loadAdminQueues(false);showModuleToast("Đã cập nhật quyền tài khoản","Vai trò và phạm vi truy cập mới đã có hiệu lực.");
  };

  document.addEventListener("DOMContentLoaded",()=>{createLogModal();installRoleOptions();installTaskSheetInteractions();});
})();

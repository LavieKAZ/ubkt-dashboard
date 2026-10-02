(function(){
  "use strict";
  document.documentElement.dataset.taskGridFinal="ready";

  const FINAL_OPTIONS=["Chưa thẩm định","Đang xử lý","Hoàn thành","Trễ hạn","Tạm dừng","Không hoàn thành"];
  const SELF_OPTIONS=["Chưa tự đánh giá","Đang thực hiện","Hoàn thành","Chậm tiến độ","Cần hỗ trợ"];
  const gridState={search:"",unit:"",time:"",assessment:"",sheet:"all"};
  let progressLogs=[];
  let systemNotifications=[];
  let activeLogTaskId="";

  window.isSystemAdminUser=function(){
    return currentProfile?.role==="admin"&&currentProfile?.approval_status==="approved"&&currentProfile?.is_active===true;
  };
  window.isOversightUser=function(){
    return ["admin","vpdu","ubkt"].includes(currentProfile?.role)&&currentProfile?.approval_status==="approved"&&currentProfile?.is_active===true;
  };
  isAdminUser=window.isOversightUser;
  syncCurrentUserWithProfile=function(profile){
    if(!currentUser||!profile)return;
    const roleLabel=profile.role==="admin"?"Quản trị hệ thống":profile.role==="vpdu"?"Văn phòng Đảng ủy":profile.role==="ubkt"?"Ủy ban Kiểm tra":`Đơn vị · ${canonicalUnitValue(profile.unit_name)}`;
    currentUser={...currentUser,id:profile.id,email:profile.email||currentUser.email,name:profile.full_name||profile.unit_name||currentUser.name,role:roleLabel,unit:canonicalUnitValue(profile.unit_name),permissions:isOversightUser()?["all"]:["tasks"]};
  };

  function finalAssessment(task){
    const value=String(taskValue(task,"vpduAssessment","")||"").trim();
    return FINAL_OPTIONS.includes(value)?value:"Chưa thẩm định";
  }
  function taskConclusion(task){
    return String(taskValue(task,"conclusion","")||"").trim()||String(taskValue(task,"task","")||"").trim();
  }
  window.taskFinalAssessment=finalAssessment;
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
  function latestLog(taskId){return logsFor(taskId)[0]||null;}
  function gridRows(){
    return activeTasks().filter(task=>{
      const unit=taskUnit(task);
      const assessment=finalAssessment(task);
      const deadline=taskDeadline(task);
      const days=diffDays(deadline);
      if(gridState.sheet!=="all"&&unit!==gridState.sheet)return false;
      if(gridState.unit&&unit!==gridState.unit)return false;
      if(gridState.assessment&&assessment!==gridState.assessment)return false;
      if(gridState.time==="none"&&deadline)return false;
      if(gridState.time==="overdue"&&!(days!==null&&days<0))return false;
      if(gridState.time==="week"&&!(days!==null&&days>=0&&days<=7))return false;
      if(gridState.time==="month"&&!(days!==null&&days>=0&&days<=30))return false;
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
  function html(value){return escapeHtml(String(value??""));}
  function statusTone(value){
    if(value==="Hoàn thành")return "is-done";
    if(["Trễ hạn","Không hoàn thành"].includes(value))return "is-late";
    if(value==="Đang xử lý")return "is-doing";
    if(value==="Tạm dừng")return "is-paused";
    return "is-none";
  }
  function options(values,current){return values.map(value=>`<option ${value===current?"selected":""}>${html(value)}</option>`).join("");}
  function editableText(task,field,value,kind="input"){
    if(!isOversightUser())return `<div class="task-grid-readonly ${field==="doc"?"task-grid-doc":field==="conclusion"?"task-grid-conclusion":""}">${html(value||"—")}</div>`;
    if(kind==="textarea")return `<textarea class="task-grid-cell-textarea task-grid-conclusion-editor" rows="5" oninput="autoResizeTaskGridTextarea(this)" onblur="updateTaskGridField('${html(task.id)}','${field}',this.value,this)">${html(value)}</textarea>`;
    return `<input class="task-grid-cell-input" value="${html(value)}" onblur="updateTaskGridField('${html(task.id)}','${field}',this.value,this)">`;
  }
  function resultCell(task){
    const latest=latestLog(task.id);
    return `<div class="task-grid-result-log">
      ${latest?`<p>${html(latest.content)}</p><small>${html(latest.author_name)} · ${html(notificationTime(latest.created_at))}</small>`:`<p class="text-slate-400">Chưa có cập nhật</p>`}
      <button type="button" onclick="openTaskLogModal('${html(task.id)}')">${latest?"Xem / thêm cập nhật":"＋ Thêm kết quả"}</button>
    </div>`;
  }
  function selfCell(task){
    const latest=logsFor(task.id).find(log=>log.self_assessment)||null;
    if(!latest)return `<span class="task-final-chip is-none">Chưa tự đánh giá</span>`;
    return `<span class="task-final-chip ${statusTone(latest.self_assessment)}">${html(latest.self_assessment)}</span>${latest.assessment_note?`<p class="mt-2 text-sm text-slate-500">${html(latest.assessment_note)}</p>`:""}`;
  }
  function unitCell(task){
    const unit=taskUnit(task);
    if(!isOversightUser())return `<div class="task-grid-readonly task-grid-unit">${html(unit)}</div>`;
    return `<select class="task-grid-cell-select" onchange="updateTaskGridField('${html(task.id)}','unit',this.value,this)">${uniqueUnits().map(value=>`<option ${value===unit?"selected":""}>${html(value)}</option>`).join("")}</select>`;
  }
  function dateCell(task){
    const value=taskDeadline(task);
    if(!isOversightUser())return `<div class="task-grid-readonly task-grid-date">${html(fmt(value))}</div>`;
    return `<input class="task-grid-cell-input date-input-vi" inputmode="numeric" maxlength="10" placeholder="dd/mm/yyyy" value="${html(formatDateInputValue(value))}" onblur="updateTaskGridField('${html(task.id)}','deadline',dateInputToISO(this.value),this)">`;
  }
  function finalCell(task){
    const value=finalAssessment(task);
    if(!isOversightUser())return `<span class="task-final-chip ${statusTone(value)}">${html(value)}</span>`;
    return `<select class="task-grid-cell-select" onchange="updateTaskGridField('${html(task.id)}','vpduAssessment',this.value,this)">${options(FINAL_OPTIONS,value)}</select><div class="task-grid-save-state">Dùng cho Dashboard</div>`;
  }

  window.renderTaskListFull=function(){
    const wrap=document.getElementById("taskExcelGrid");
    if(!wrap)return;
    const rows=gridRows();
    const all=activeTasks();
    const hint=document.getElementById("taskCenterHint");
    if(hint)hint.textContent=`Đang hiển thị ${rows.length}/${all.length} nhiệm vụ · Dashboard sử dụng Đánh giá của VPĐU (Thẩm định).`;
    renderTaskSheetTabs();
    renderTaskGridFilterOptions();
    if(!rows.length){
      wrap.innerHTML=`<div class="task-grid-empty"><div><b>Không có nhiệm vụ phù hợp</b><span>Thử thay đổi từ khóa hoặc bộ lọc đang chọn.</span></div></div>`;
      updateTaskGridSearchUi(0,all.length);
      return;
    }
    wrap.innerHTML=`<table class="task-excel-table"><thead><tr>
      <th class="col-stt">STT</th><th class="col-doc">Số văn bản</th><th class="col-content">Nội dung kết luận</th><th class="col-unit">Đơn vị thực hiện</th><th class="col-date">Thời gian</th><th class="col-result">Kết quả thực hiện</th><th class="col-self">Tự đánh giá của đơn vị tham mưu</th><th class="col-final">Đánh giá của VPĐU (Thẩm định)</th>
    </tr></thead><tbody>${rows.map((task,index)=>`<tr>
      <td>${index+1}</td>
      <td>${editableText(task,"doc",taskDoc(task))}</td>
      <td>${editableText(task,"conclusion",taskConclusion(task),"textarea")}</td>
      <td>${unitCell(task)}</td><td>${dateCell(task)}</td><td>${resultCell(task)}</td><td>${selfCell(task)}</td><td>${finalCell(task)}</td>
    </tr>`).join("")}</tbody></table>`;
    updateTaskGridSearchUi(rows.length,all.length);
    window.requestAnimationFrame(()=>wrap.querySelectorAll(".task-grid-conclusion-editor").forEach(window.autoResizeTaskGridTextarea));
  };

  window.setTaskGridFilter=function(key,value){gridState[key]=String(value||"");renderTaskListFull();};
  window.autoResizeTaskGridTextarea=function(element){
    if(!element)return;
    element.style.height="auto";
    element.style.height=`${Math.min(Math.max(element.scrollHeight,112),240)}px`;
    element.classList.toggle("is-scrollable",element.scrollHeight>240);
  };
  window.updateTaskGridSearchUi=function(visible,total){
    const count=document.getElementById("taskGridSearchCount");
    const clear=document.getElementById("taskGridSearchClear");
    if(count)count.textContent=gridState.search?`${visible} kết quả phù hợp`:`${total} nhiệm vụ`;
    if(clear)clear.hidden=!gridState.search;
  };
  window.clearTaskGridSearch=function(){
    gridState.search="";
    const input=document.getElementById("taskCenterSearch");
    if(input){input.value="";input.focus();}
    renderTaskListFull();
  };
  window.resetTaskGridFilters=function(){
    Object.assign(gridState,{search:"",unit:"",time:"",assessment:"",sheet:"all"});
    ["taskCenterSearch","taskGridUnitFilter","taskGridTimeFilter","taskGridAssessmentFilter"].forEach(id=>{const element=document.getElementById(id);if(element)element.value="";});
    renderTaskListFull();
  };
  window.setTaskGridSheet=function(unit){gridState.sheet=unit||"all";renderTaskListFull();};
  window.renderTaskSheetTabs=function(){
    const tabs=document.getElementById("taskSheetTabs");
    if(!tabs||!isOversightUser())return;
    const all=activeTasks();
    const items=[{key:"all",label:"Tất cả nhiệm vụ",count:all.length},...uniqueUnits().map(unit=>({key:unit,label:unit,count:all.filter(task=>taskUnit(task)===unit).length}))];
    tabs.innerHTML=items.map(item=>`<button type="button" class="task-sheet-tab ${gridState.sheet===item.key?"is-active":""}" onclick="setTaskGridSheet('${html(item.key).replace(/'/g,"&#39;")}')">${html(item.label)} <small>${item.count}</small></button>`).join("");
  };
  window.renderTaskGridFilterOptions=function(){
    const select=document.getElementById("taskGridUnitFilter");
    if(!select)return;
    const value=gridState.unit;
    select.innerHTML=`<option value="">Tất cả đơn vị</option>${uniqueUnits().map(unit=>`<option ${unit===value?"selected":""}>${html(unit)}</option>`).join("")}`;
  };

  document.addEventListener("keydown",event=>{
    if(!(event.ctrlKey||event.metaKey)||String(event.key).toLowerCase()!=="f")return;
    const page=document.getElementById("page-tasks");
    const input=document.getElementById("taskCenterSearch");
    if(!page||page.classList.contains("hidden")||!input)return;
    event.preventDefault();input.focus();input.select();
  });

  window.updateTaskGridField=async function(taskId,field,value,element){
    if(!isOversightUser())return;
    const task=tasks.find(item=>String(item.id)===String(taskId));
    if(!task)return;
    const clean=String(value??"").trim();
    if(field==="deadline"&&!clean){showModuleToast("Thiếu thời hạn","Vui lòng nhập thời hạn theo định dạng ngày/tháng/năm.");renderTaskListFull();return;}
    if(["doc","conclusion","unit"].includes(field)&&!clean){showModuleToast("Chưa đủ thông tin","Trường này không được để trống.");renderTaskListFull();return;}
    const previous=task[field];
    if(String(previous??"")===clean)return;
    element?.classList.add("is-saving");
    const updated={...task,[field]:clean,updatedAt:localTodayISO()};
    const auditItem=createAuditEntry(field==="vpduAssessment"?"Chốt đánh giá VPĐU":"Chỉnh sửa nhiệm vụ",updated,`${field}: ${clean}`);
    const result=await saveRecordsImmediately([{table:DB_TABLES.tasks,items:[updated]},{table:DB_TABLES.audit,items:[auditItem]}],null);
    element?.classList.remove("is-saving");
    if(!result.saved){renderTaskListFull();return;}
    Object.assign(task,updated);appendAuditEntry(auditItem);persistLocal(false);render();
    showModuleToast(field==="vpduAssessment"?"Đã cập nhật thẩm định":"Đã lưu thay đổi",field==="vpduAssessment"?"Các số liệu Dashboard đã được tính lại ngay.":"Dữ liệu nhiệm vụ đã được đồng bộ.");
  };

  async function loadTaskGridCollections(){
    if(!databaseReady||!getSupabaseClient())return;
    const client=getSupabaseClient();
    const [logsResult,notificationsResult]=await Promise.all([
      client.from("task_progress_logs").select("id,task_id,author_id,author_name,content,self_assessment,assessment_note,reporting_period,evidence_url,evidence_path,evidence_name,created_at").order("created_at",{ascending:false}),
      client.from("system_notifications").select("id,category,title,body,action_page,read_at,created_at").order("created_at",{ascending:false}).limit(100)
    ]);
    if(!logsResult.error)progressLogs=logsResult.data||[];
    if(!notificationsResult.error)systemNotifications=notificationsResult.data||[];
  }
  const legacyLoadFromDatabase=loadFromDatabase;
  loadFromDatabase=async function(){
    const loaded=await legacyLoadFromDatabase();
    if(loaded){await loadTaskGridCollections();render();}
    return loaded;
  };

  function createLogModal(){
    if(document.getElementById("taskLogModal"))return;
    document.body.insertAdjacentHTML("beforeend",`<div id="taskLogModal" class="modal task-log-modal" role="dialog" aria-modal="true" aria-labelledby="taskLogTitle"><div class="modal-card card w-full">
      <div class="pm-modal-heading task-log-heading">
        <div class="pm-modal-heading-icon task-log-heading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 6h10M8 11h10M8 16h6"/><path d="M4 6h.01M4 11h.01M4 16h.01"/></svg></div>
        <div class="task-log-heading-copy"><div class="antd-modal-kicker">NHẬT KÝ TIẾN ĐỘ</div><h3 id="taskLogTitle">Cập nhật kết quả thực hiện</h3><p>Ghi thêm một lần báo cáo mới. Lịch sử đã lưu được giữ nguyên để bảo đảm dấu vết cập nhật.</p></div>
        <button type="button" class="pm-modal-close" onclick="closeTaskLogModal()" aria-label="Đóng cửa sổ">✕</button>
      </div>
      <div class="task-log-context" aria-label="Nhiệm vụ đang cập nhật"><div><span>Số văn bản</span><strong id="taskLogDocument">—</strong></div><p id="taskLogConclusion">—</p></div>
      <div class="task-log-body"><form class="task-log-form" onsubmit="submitTaskProgressLog(event,this)">
        <div class="task-log-section-heading"><span>01</span><div><b>Nội dung báo cáo</b><small>Mô tả việc đã làm, sản phẩm hoàn thành hoặc khó khăn cần xử lý.</small></div></div>
        <label class="task-log-field">Kết quả thực hiện <em>*</em><textarea id="taskLogContent" class="field" rows="6" maxlength="10000" required placeholder="Nhập kết quả thực hiện của nhiệm vụ..."></textarea></label>
        <div class="task-log-two-columns">
          <label class="task-log-field">Tự đánh giá của đơn vị<select id="taskLogSelfAssessment" class="field">${options(SELF_OPTIONS,"Đang thực hiện")}</select></label>
          <label class="task-log-field">Ghi chú đánh giá<textarea id="taskLogAssessmentNote" class="field" rows="3" placeholder="Giải trình ngắn (nếu có)"></textarea></label>
        </div>
        <div class="task-log-section-heading is-evidence"><span>02</span><div><b>Minh chứng</b><small>Có thể thêm đường dẫn hoặc tải tệp; không bắt buộc.</small></div></div>
        <div class="task-log-two-columns task-log-evidence-grid">
          <label class="task-log-field">Đường dẫn minh chứng<input id="taskLogEvidenceUrl" class="field" type="url" placeholder="https://..."></label>
          <label class="task-log-field">Tệp minh chứng<input id="taskLogEvidenceFile" class="field" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"><small class="task-log-file-note">PDF, Word, Excel hoặc hình ảnh</small></label>
        </div>
        <div class="pm-modal-footer task-log-footer"><button type="button" class="btn btn-ghost" onclick="closeTaskLogModal()">Đóng</button><button class="btn btn-primary" type="submit">Lưu kết quả thực hiện</button></div>
      </form><section class="task-log-history"><div class="task-log-history-heading"><div><span>NHẬT KÝ</span><h4>Lịch sử cập nhật</h4></div><small>Thông tin mới nhất hiển thị trước</small></div><div id="taskLogHistory"></div></section></div>
    </div></div>`);
  }
  window.openTaskLogModal=function(taskId){
    const task=tasks.find(item=>String(item.id)===String(taskId));if(!task)return;
    activeLogTaskId=String(taskId);createLogModal();
    document.getElementById("taskLogTitle").textContent="Cập nhật kết quả thực hiện";
    document.getElementById("taskLogDocument").textContent=taskDoc(task)||"Chưa có số văn bản";
    document.getElementById("taskLogConclusion").textContent=taskConclusion(task)||"Chưa có nội dung kết luận";
    document.getElementById("taskLogContent").value="";document.getElementById("taskLogAssessmentNote").value="";document.getElementById("taskLogEvidenceUrl").value="";document.getElementById("taskLogEvidenceFile").value="";
    renderTaskLogHistory();document.getElementById("taskLogModal").classList.add("open");lockScroll();
    window.setTimeout(()=>document.getElementById("taskLogContent")?.focus(),80);
  };
  window.closeTaskLogModal=function(){document.getElementById("taskLogModal")?.classList.remove("open");activeLogTaskId="";unlockScroll();};
  window.renderTaskLogHistory=function(){
    const host=document.getElementById("taskLogHistory");if(!host)return;
    const rows=logsFor(activeLogTaskId);
    host.innerHTML=rows.length?rows.map(log=>`<article class="task-log-entry"><div class="task-log-entry-head"><b>${html(log.author_name)}</b><time>${html(notificationTime(log.created_at))}</time></div><span class="task-log-period">${html(log.reporting_period)}</span><p>${html(log.content)}</p>${log.self_assessment?`<div class="task-log-assessment"><small>Tự đánh giá</small><strong>${html(log.self_assessment)}</strong>${log.assessment_note?`<p>${html(log.assessment_note)}</p>`:""}</div>`:""}${log.evidence_url||log.evidence_path?`<a href="#" onclick="openTaskEvidence('${html(log.id)}');return false">↗ Mở minh chứng ${html(log.evidence_name||"")}</a>`:""}</article>`).join(""):`<div class="task-log-empty-state"><span aria-hidden="true">◎</span><b>Chưa có kết quả thực hiện</b><p>Lần cập nhật đầu tiên sẽ được lưu cùng người nhập và thời gian.</p></div>`;
  };
  window.submitTaskProgressLog=async function(event,form){
    event.preventDefault();const task=tasks.find(item=>String(item.id)===activeLogTaskId);if(!task)return;
    const button=form.querySelector("button[type=submit]");setSaveButtonBusy(button,true,"Đang lưu...");
    try{
      const client=getSupabaseClient();const content=document.getElementById("taskLogContent").value.trim();const file=document.getElementById("taskLogEvidenceFile").files[0];
      let evidencePath=null,evidenceName=null;
      if(file){
        const safeName=file.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-");
        evidencePath=`${activeLogTaskId}/${currentProfile.id}/${Date.now()}-${safeName}`;evidenceName=file.name;
        const upload=await client.storage.from("task-evidence").upload(evidencePath,file,{upsert:false});if(upload.error)throw upload.error;
      }
      const now=new Date();const payload={task_id:activeLogTaskId,author_id:currentProfile.id,author_name:currentProfile.full_name||currentProfile.unit_name||currentProfile.email||"Người dùng",content,self_assessment:document.getElementById("taskLogSelfAssessment").value,assessment_note:document.getElementById("taskLogAssessmentNote").value.trim()||null,reporting_period:`Tuần ${new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}).format(now)}`,evidence_url:document.getElementById("taskLogEvidenceUrl").value.trim()||null,evidence_path:evidencePath,evidence_name:evidenceName};
      const {data,error}=await client.from("task_progress_logs").insert(payload).select().single();if(error)throw error;
      progressLogs.unshift(data);recordTaskNotification(task,"comment","Có cập nhật kết quả thực hiện",content.slice(0,140));renderTaskLogHistory();renderTaskListFull();form.reset();
      showModuleToast("Đã lưu kết quả thực hiện","Nhật ký mới đã được ghi kèm người cập nhật và thời gian chốt kỳ.");
    }catch(error){showModuleToast("Chưa lưu được cập nhật",error.message||"Vui lòng thử lại.");}
    finally{setSaveButtonBusy(button,false);}
  };
  window.openTaskEvidence=async function(logId){
    const log=progressLogs.find(item=>String(item.id)===String(logId));if(!log)return;
    if(log.evidence_url){window.open(log.evidence_url,"_blank","noopener");return;}
    if(log.evidence_path){const {data,error}=await getSupabaseClient().storage.from("task-evidence").createSignedUrl(log.evidence_path,300);if(error){showModuleToast("Không mở được minh chứng",error.message);return;}window.open(data.signedUrl,"_blank","noopener");}
  };

  const legacyApplyAccessControl=applyAccessControl;
  applyAccessControl=function(){
    legacyApplyAccessControl();
    document.body.classList.toggle("task-grid-unit-mode",isUnitUser());
    const resolutionNav=document.querySelector('.nav-item[data-page="resolutions"]');if(resolutionNav)resolutionNav.hidden=isUnitUser();
  };
  const legacySwitchPage=switchPage;
  switchPage=function(page){
    if(isUnitUser()&&page!=="tasks"){showModuleToast("Chỉ truy cập Tab Nhiệm vụ","Tài khoản đơn vị chỉ được xem và cập nhật nhiệm vụ thuộc đơn vị mình.");page="tasks";}
    legacySwitchPage(page);
  };

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

  document.addEventListener("DOMContentLoaded",()=>{createLogModal();installRoleOptions();});
})();

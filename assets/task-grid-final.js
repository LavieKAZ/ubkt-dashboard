(function(){
  "use strict";
  document.documentElement.dataset.taskGridFinal="ready";

  const FINAL_OPTIONS=["Chưa thẩm định","Đang xử lý","Hoàn thành","Trễ hạn","Tạm dừng","Không hoàn thành"];
  const SELF_OPTIONS=["Chưa tự đánh giá","Đang thực hiện","Hoàn thành","Chậm tiến độ","Cần hỗ trợ"];
  const GRID_FIELDS=["stt","doc","conclusion","unit","deadline","result","self","final"];
  const GRID_LETTERS=["A","B","C","D","E","F","G","H"];
  const GRID_COLUMN_CLASSES=["col-stt","col-doc","col-content","col-unit","col-date","col-result","col-self","col-final"];
  const gridState={search:"",month:"",assessment:"",sheet:"all",page:1,pageSize:30,density:"comfortable",selection:null,columns:{flag:"",doc:"",content:"",unit:"",deadline:"",result:"",self:"",final:""}};
  let progressLogs=[];
  let systemNotifications=[];
  let activeLogTaskId="";
  let activeRedFlagTaskId="";
  let taskGridRealtimeChannel=null;
  let taskGridSearchTimer=null;
  let taskLogsLoading=false;

  window.isSystemAdminUser=function(){
    return currentProfile?.role==="admin"&&currentProfile?.approval_status==="approved"&&currentProfile?.is_active===true;
  };
  window.isOversightUser=function(){
    return ["admin","vpdu","ubkt"].includes(currentProfile?.role)&&currentProfile?.approval_status==="approved"&&currentProfile?.is_active===true;
  };
  window.canFlagTask=function(){
    return ["admin","vpdu"].includes(currentProfile?.role)&&currentProfile?.approval_status==="approved"&&currentProfile?.is_active===true;
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
      if(gridState.assessment&&assessment!==gridState.assessment)return false;
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
    return `<div class="task-grid-row-index"><span>${index}</span>${canFlagTask()?`<button type="button" class="task-flag-button ${flagged?"is-active":""}" onclick="openTaskRedFlagModal('${html(task.id)}')" aria-pressed="${flagged}" title="${flagged?"Sửa Note đỏ":"Thêm Note đỏ"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4m0 1h10l-2 4 2 4H6"/></svg></button>`:""}</div>`;
  }
  function editableText(task,field,value,kind="input"){
    if(!isOversightUser())return `<div class="task-grid-readonly ${field==="doc"?"task-grid-doc":field==="conclusion"?"task-grid-conclusion":""}">${html(value||"—")}</div>`;
    if(kind==="textarea")return `<textarea class="task-grid-cell-textarea task-grid-conclusion-editor" rows="5" oninput="autoResizeTaskGridTextarea(this)" onblur="updateTaskGridField('${html(task.id)}','${field}',this.value,this)">${html(value)}</textarea>`;
    return `<input class="task-grid-cell-input" value="${html(value)}" onblur="updateTaskGridField('${html(task.id)}','${field}',this.value,this)">`;
  }
  function conclusionCell(task){
    const note=String(taskValue(task,"redFlagNote","")||"").trim();
    return `<div class="task-grid-conclusion-cell">${editableText(task,"conclusion",taskConclusion(task),"textarea")}${taskFlagged(task)&&note?`<aside class="task-red-note"><b>NOTE ĐỎ</b><p>${html(note)}</p></aside>`:""}</div>`;
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
    if(!isOversightUser())return `<div class="task-grid-readonly task-grid-unit">${html(unit)}</div>`;
    return `<select class="task-grid-cell-select" onchange="updateTaskGridField('${html(task.id)}','unit',this.value,this)">${uniqueUnits().map(value=>`<option ${value===unit?"selected":""}>${html(value)}</option>`).join("")}</select>`;
  }
  function dateCell(task){
    const value=taskDeadline(task);
    if(!isOversightUser())return `<div class="task-grid-readonly task-grid-date">${html(fmt(value))}</div>`;
    return `<input class="task-grid-cell-input date-input-vi" inputmode="numeric" maxlength="10" placeholder="Không bắt buộc" value="${html(formatDateInputValue(value))}" onblur="commitTaskGridDeadline('${html(task.id)}',this)">`;
  }
  function finalCell(task){
    const value=finalAssessment(task);
    if(!isOversightUser())return `<span class="task-final-chip ${statusTone(value)}">${html(value)}</span>`;
    return `<select class="task-grid-cell-select" onchange="updateTaskGridField('${html(task.id)}','vpduAssessment',this.value,this)">${options(FINAL_OPTIONS,value)}</select><div class="task-grid-save-state">Dùng cho Dashboard</div>`;
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
    document.querySelector(".task-grid-workspace")?.classList.toggle("is-compact",gridState.density==="compact");
    renderTaskSheetTabs();
    renderTaskGridFilterOptions();
    if(!rows.length){
      wrap.innerHTML=`<div class="task-grid-empty"><div><b>Không có nhiệm vụ phù hợp</b><span>Thử thay đổi từ khóa hoặc bộ lọc đang chọn.</span></div></div>`;
      updateTaskGridSearchUi(0,all.length);
      renderTaskGridPagination(0,1);
      clearTaskGridSelectionUi();
      window.requestAnimationFrame(window.syncTaskGridScrollbars);
      return;
    }
    wrap.innerHTML=`<table class="task-excel-table"><thead><tr class="task-grid-letter-row">${GRID_LETTERS.map((letter,index)=>`<th class="${GRID_COLUMN_CLASSES[index]}" aria-hidden="true">${letter}</th>`).join("")}</tr><tr class="task-grid-column-row">
      ${headerCell("STT","flag","col-stt")}${headerCell("Số văn bản","doc","col-doc")}${headerCell("Nội dung kết luận","content","col-content")}${headerCell("Đơn vị thực hiện",null,"col-unit")}${headerCell("Thời gian","deadline","col-date")}${headerCell("Kết quả thực hiện","result","col-result")}${headerCell("Tự đánh giá của đơn vị","self","col-self")}${headerCell("Đánh giá của VPĐU","final","col-final")}
    </tr></thead><tbody>${rows.map((task,index)=>{const sheetRow=offset+index+2;return `<tr class="${taskFlagged(task)?"is-flagged":""}" data-task-row="${sheetRow}">
      <td ${gridCellAttributes(task,"stt",sheetRow,0)}>${flagCell(task,offset+index+1)}</td>
      <td ${gridCellAttributes(task,"doc",sheetRow,1)}>${editableText(task,"doc",taskDoc(task))}</td>
      <td ${gridCellAttributes(task,"conclusion",sheetRow,2)}>${conclusionCell(task)}</td>
      <td ${gridCellAttributes(task,"unit",sheetRow,3)}>${unitCell(task)}</td><td ${gridCellAttributes(task,"deadline",sheetRow,4)}>${dateCell(task)}</td><td ${gridCellAttributes(task,"result",sheetRow,5)}>${resultCell(task)}</td><td ${gridCellAttributes(task,"self",sheetRow,6)}>${selfCell(task)}</td><td ${gridCellAttributes(task,"final",sheetRow,7)}>${finalCell(task)}</td>
    </tr>`;}).join("")}</tbody></table>`;
    updateTaskGridSearchUi(filtered.length,all.length);
    renderTaskGridPagination(filtered.length,pageCount);
    restoreTaskGridSelection(rows[0],offset+2);
    window.requestAnimationFrame(()=>wrap.querySelectorAll(".task-grid-conclusion-editor").forEach(window.autoResizeTaskGridTextarea));
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
  window.toggleTaskGridDensity=function(){
    gridState.density=gridState.density==="compact"?"comfortable":"compact";
    const button=document.getElementById("taskGridDensityButton");
    if(button)button.lastChild.textContent=gridState.density==="compact"?"Thoáng":"Thu gọn";
    renderTaskListFull();
  };
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
  function clearTaskGridSelectionUi(){
    const name=document.getElementById("taskGridNameBox");const input=document.getElementById("taskGridFormulaInput");const save=document.getElementById("taskGridFormulaSave");
    if(name)name.textContent="—";if(input){input.value="";input.readOnly=true;input.placeholder="Không có ô dữ liệu phù hợp";input.classList.remove("is-dirty");}if(save){save.hidden=true;save.classList.remove("is-ready");}
  }
  function restoreTaskGridSelection(fallbackTask,fallbackRow){
    let selection=gridState.selection;
    let cell=selection?document.querySelector(`#taskExcelGrid td[data-task-id="${CSS.escape(String(selection.taskId))}"][data-grid-field="${selection.field}"]`):null;
    if(!cell&&fallbackTask){selection={taskId:String(fallbackTask.id),field:"doc",row:fallbackRow,col:1};gridState.selection=selection;cell=document.querySelector(`#taskExcelGrid td[data-task-id="${CSS.escape(String(fallbackTask.id))}"][data-grid-field="doc"]`);}
    if(cell)selectTaskGridCell(cell,false);else clearTaskGridSelectionUi();
  }
  function selectTaskGridCell(cell,scroll=true){
    if(!cell)return;
    document.querySelectorAll("#taskExcelGrid td.is-selected-cell").forEach(item=>item.classList.remove("is-selected-cell"));cell.classList.add("is-selected-cell");
    const task=tasks.find(item=>String(item.id)===String(cell.dataset.taskId));if(!task)return;
    const field=cell.dataset.gridField;const row=Number(cell.dataset.gridRow)||2;const col=Number(cell.dataset.gridCol)||0;
    gridState.selection={taskId:String(task.id),field,row,col};
    const name=document.getElementById("taskGridNameBox");const input=document.getElementById("taskGridFormulaInput");const save=document.getElementById("taskGridFormulaSave");
    if(name)name.textContent=`${GRID_LETTERS[col]||"A"}${row}`;
    if(input){input.value=gridCellValue(task,field,row);input.readOnly=!(isOversightUser()&&["doc","conclusion"].includes(field));input.placeholder=input.readOnly?"Ô này được thao tác bằng điều khiển trong bảng":"Sửa nội dung và nhấn Ctrl + Enter để lưu";input.classList.remove("is-dirty");input.dataset.original=input.value;}
    if(save){save.hidden=input?.readOnly!==false;save.classList.remove("is-ready");}
    if(scroll)cell.scrollIntoView({block:"nearest",inline:"nearest"});
  }
  window.taskGridFormulaChanged=function(){
    const input=document.getElementById("taskGridFormulaInput");if(!input||input.readOnly)return;
    input.classList.toggle("is-dirty",input.value!==input.dataset.original);const save=document.getElementById("taskGridFormulaSave");if(save)save.classList.toggle("is-ready",input.value!==input.dataset.original);
  };
  window.saveSelectedTaskGridCell=async function(){
    const selection=gridState.selection;const input=document.getElementById("taskGridFormulaInput");const button=document.getElementById("taskGridFormulaSave");
    if(!selection||!input||input.readOnly||input.value===input.dataset.original)return;
    setTaskGridSyncState("syncing","Đang lưu ô đã chỉnh sửa...");
    await updateTaskGridField(selection.taskId,selection.field,input.value,button);
  };
  function installTaskSheetInteractions(){
    const wrap=document.getElementById("taskExcelGrid");
    if(!wrap||wrap.dataset.sheetInteractionsReady)return;
    wrap.dataset.sheetInteractionsReady="1";
    wrap.addEventListener("click",event=>{
      const cell=event.target.closest("td[data-grid-field]");
      if(cell)selectTaskGridCell(cell,false);
    });
    document.addEventListener("keydown",event=>{
      const page=document.getElementById("page-tasks");
      if(!page||page.classList.contains("hidden")||!gridState.selection)return;
      if(event.target.closest("input,textarea,select,button,[contenteditable='true']"))return;
      if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"].includes(event.key))return;
      if(event.key==="Enter"){
        if(gridState.selection.field==="result"){
          event.preventDefault();
          openTaskLogModal(gridState.selection.taskId);
        }
        return;
      }
      let {row,col}=gridState.selection;
      if(event.key==="ArrowUp")row-=1;
      if(event.key==="ArrowDown")row+=1;
      if(event.key==="ArrowLeft")col-=1;
      if(event.key==="ArrowRight")col+=1;
      col=Math.max(0,Math.min(GRID_FIELDS.length-1,col));
      const next=wrap.querySelector(`td[data-grid-row="${row}"][data-grid-col="${col}"]`);
      if(!next)return;
      event.preventDefault();selectTaskGridCell(next,true);next.focus({preventScroll:true});
    });
  }
  window.renderTaskGridPagination=function(total,pageCount){
    const host=document.getElementById("taskGridPagination");if(!host)return;
    if(!total){host.innerHTML="";return;}
    const start=(gridState.page-1)*gridState.pageSize+1;
    const end=Math.min(total,gridState.page*gridState.pageSize);
    host.innerHTML=`<div><b>${start}–${end}</b><span>trong ${total} nhiệm vụ</span></div><div class="task-grid-page-actions"><label>Hiển thị <select onchange="setTaskGridPageSize(this.value)">${[20,30,50].map(size=>`<option value="${size}" ${size===gridState.pageSize?"selected":""}>${size} dòng</option>`).join("")}</select></label><button type="button" onclick="setTaskGridPage(${gridState.page-1})" ${gridState.page<=1?"disabled":""}>‹ Trước</button><span>Trang ${gridState.page}/${pageCount}</span><button type="button" onclick="setTaskGridPage(${gridState.page+1})" ${gridState.page>=pageCount?"disabled":""}>Sau ›</button></div>`;
  };
  window.syncTaskGridScrollbars=function(){
    const grid=document.getElementById("taskExcelGrid");
    const bar=document.getElementById("taskGridBottomScrollbar");
    const track=bar?.firstElementChild;
    if(!grid||!bar||!track)return;
    track.style.width=`${grid.scrollWidth}px`;
    bar.hidden=grid.scrollWidth<=grid.clientWidth+2;
    if(!grid.dataset.bottomScrollReady){
      let syncing=false;
      grid.addEventListener("scroll",()=>{if(syncing)return;syncing=true;bar.scrollLeft=grid.scrollLeft;syncing=false;},{passive:true});
      bar.addEventListener("scroll",()=>{if(syncing)return;syncing=true;grid.scrollLeft=bar.scrollLeft;syncing=false;},{passive:true});
      grid.dataset.bottomScrollReady="1";
    }
    bar.scrollLeft=grid.scrollLeft;
  };
  window.resetTaskGridFilters=function(){
    Object.assign(gridState,{search:"",month:"",assessment:"",sheet:"all",page:1});
    Object.keys(gridState.columns).forEach(key=>gridState.columns[key]="");
    ["taskCenterSearch","taskGridMonthFilter","taskGridAssessmentFilter"].forEach(id=>{const element=document.getElementById(id);if(element)element.value="";});
    renderTaskListFull();
  };
  window.setTaskGridSheet=function(unit){gridState.sheet=unit||"all";gridState.page=1;renderTaskListFull();};
  window.renderTaskSheetTabs=function(){
    const tabs=document.getElementById("taskSheetTabs");
    if(!tabs||!isOversightUser())return;
    const all=activeTasks();
    const items=[{key:"all",label:"Tất cả nhiệm vụ",count:all.length},...uniqueUnits().map(unit=>({key:unit,label:unit,count:all.filter(task=>taskUnit(task)===unit).length}))];
    tabs.innerHTML=items.map(item=>`<button type="button" class="task-sheet-tab ${gridState.sheet===item.key?"is-active":""}" onclick="setTaskGridSheet('${html(item.key).replace(/'/g,"&#39;")}')">${html(item.label)} <small>${item.count}</small></button>`).join("");
  };
  window.renderTaskGridFilterOptions=function(){
    const month=document.getElementById("taskGridMonthFilter");
    const assessment=document.getElementById("taskGridAssessmentFilter");
    if(month)month.innerHTML=`<option value="">Tất cả tháng</option><option value="none" ${gridState.month==="none"?"selected":""}>Chưa có thời hạn</option>${uniqueMonths().map(value=>`<option value="${value}" ${value===gridState.month?"selected":""}>${monthLabel(value)}</option>`).join("")}`;
    if(assessment)assessment.innerHTML=`<option value="">Tất cả tiến độ</option>${FINAL_OPTIONS.map(value=>`<option value="${html(value)}" ${value===gridState.assessment?"selected":""}>${html(value)}</option>`).join("")}`;
  };

  document.addEventListener("keydown",event=>{
    if(!(event.ctrlKey||event.metaKey)||String(event.key).toLowerCase()!=="f")return;
    const page=document.getElementById("page-tasks");
    const input=document.getElementById("taskCenterSearch");
    if(!page||page.classList.contains("hidden")||!input)return;
    event.preventDefault();input.focus();input.select();
  });
  window.addEventListener("resize",()=>window.requestAnimationFrame(window.syncTaskGridScrollbars));

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
    if(!isOversightUser())return;
    const task=tasks.find(item=>String(item.id)===String(taskId));
    if(!task)return;
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

  async function loadTaskGridCollections(){
    if(!databaseReady||!getSupabaseClient())return;
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
    const loaded=await legacyLoadFromDatabase();
    if(loaded){await loadTaskGridCollections();installTaskGridRealtime();render();setTaskGridSyncState("ready","Dữ liệu Dashboard được liên kết trực tiếp");}
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
          const loaded=await legacyLoadFromDatabase();
          if(loaded){await loadTaskGridCollections();if(activeLogTaskId){await loadTaskLogs(activeLogTaskId);renderTaskLogHistory();}persistLocal(false);render();setTaskGridSyncState("ready","Vừa nhận dữ liệu mới");}
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
    const author=authorSnapshot();document.getElementById("taskComposerAvatar").textContent=avatarText(author.name);document.getElementById("taskComposerName").textContent=author.name;document.getElementById("taskComposerRole").textContent=author.role;document.getElementById("taskLogFileName").textContent="Đính kèm minh chứng";
    taskLogsLoading=true;renderTaskLogHistory();document.getElementById("taskLogModal").classList.add("open");lockScroll();
    window.setTimeout(()=>document.getElementById("taskLogContent")?.focus(),80);
    try{await loadTaskLogs(activeLogTaskId);}catch(error){showModuleToast("Chưa tải được lịch sử",error.message||"Vui lòng thử lại.");}
    finally{taskLogsLoading=false;renderTaskLogHistory();}
  };
  window.closeTaskLogModal=function(){document.getElementById("taskLogModal")?.classList.remove("open");activeLogTaskId="";unlockScroll();};
  window.renderTaskLogHistory=function(){
    const host=document.getElementById("taskLogHistory");if(!host)return;
    if(taskLogsLoading){host.innerHTML=`<div class="task-log-loading"><span></span><b>Đang tải lịch sử cập nhật...</b></div>`;return;}
    const rows=logsFor(activeLogTaskId);
    host.innerHTML=rows.length?rows.map(log=>{const author=logAuthor(log);return `<article class="task-social-comment"><span class="task-social-avatar">${html(avatarText(author.name))}</span><div class="task-social-bubble"><div class="task-social-comment-head"><div><b>${html(author.name)}</b><small>${html(author.role)}</small></div><time title="${html(relativeLogTime(log.created_at))}">${html(notificationTime(log.created_at))}</time></div><p>${html(log.content)}</p><div class="task-social-comment-meta">${log.self_assessment?`<span>Tự đánh giá: <b>${html(log.self_assessment)}</b></span>`:""}<span>${html(log.reporting_period)}</span></div>${log.assessment_note?`<div class="task-social-note">${html(log.assessment_note)}</div>`:""}${log.evidence_url||log.evidence_path?`<a class="task-social-evidence" href="#" onclick="openTaskEvidence('${html(log.id)}');return false">${attachmentIcon()}<span>${html(log.evidence_name||"Mở minh chứng đính kèm")}</span></a>`:""}</div></article>`;}).join(""):`<div class="task-log-empty-state"><span aria-hidden="true">◎</span><b>Chưa có cập nhật nào</b><p>Hãy gửi báo cáo đầu tiên để bắt đầu luồng trao đổi tiến độ.</p></div>`;
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
      const now=new Date();const author=authorSnapshot();const payload={task_id:activeLogTaskId,author_id:currentProfile.id,author_name:author.stored,content,self_assessment:document.getElementById("taskLogSelfAssessment").value,assessment_note:document.getElementById("taskLogAssessmentNote").value.trim()||null,reporting_period:`Tuần ${new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}).format(now)}`,evidence_url:document.getElementById("taskLogEvidenceUrl").value.trim()||null,evidence_path:evidencePath,evidence_name:evidenceName};
      const {data,error}=await client.from("task_progress_logs").insert(payload).select().single();if(error)throw error;
      progressLogs.unshift(data);Object.assign(task,{latestProgressSummary:content,selfAssessment:payload.self_assessment,latestProgressAt:data.created_at||now.toISOString(),latestProgressAuthor:author.stored});recordTaskNotification(task,"comment","Có cập nhật kết quả thực hiện",content.slice(0,140));renderTaskLogHistory();renderTaskListFull();form.reset();document.getElementById("taskLogSelfAssessment").value="Đang thực hiện";document.getElementById("taskLogFileName").textContent="Đính kèm minh chứng";
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

  document.addEventListener("DOMContentLoaded",()=>{createLogModal();installRoleOptions();installTaskSheetInteractions();});
})();

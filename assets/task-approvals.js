/* =====================================================================
   Duyệt cập nhật tiến độ (05/10/2026)
   - Dùng nguyên bảng task_update_requests và RPC review_task_update hiện có.
   - Người duyệt: Admin, UBKT, VPĐU (canReviewTaskUpdates). Đơn vị không mở được trang này.
   - Họ tên người gửi/người xử lý lấy qua RPC list_task_update_requests (migration 20261005120000);
     nếu máy chủ chưa có RPC, tự đọc bảng như trước (Admin/UBKT vẫn có họ tên từ danh sách tài khoản).
   - Sau khi xử lý: cập nhật ngay danh sách, bộ đếm, nhiệm vụ liên quan; không tải lại trang.
   ===================================================================== */
(function(){
  "use strict";

  const FIELDS=[
    {key:"status",label:"Trạng thái",current:task=>task?.status,format:value=>value},
    {key:"progress",label:"Mức độ hoàn thành",current:task=>task?.progress,format:value=>value===undefined||value===null||value===""?"":`${clampProgress(value)}%`},
    {key:"result",label:"Kết quả thực hiện",current:task=>task?.result,format:value=>value},
    {key:"recommendation",alt:"kien_nghi_xu_ly",label:"Kiến nghị / vướng mắc",current:task=>task?.recommendation||task?.kien_nghi_xu_ly,format:value=>value},
    {key:"note",label:"Ghi chú",current:task=>task?.note,format:value=>value}
  ];
  const STATUS={pending:["Chờ duyệt","is-pending"],approved:["Đã duyệt","is-approved"],rejected:["Từ chối","is-rejected"]};
  const state={loading:false,error:"",submitting:false,expanded:new Set(),searchTimer:0,namesFromServer:false,returnFocus:null};

  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const fold=value=>String(value??"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/đ/gi,"d").toLowerCase().replace(/\s+/g," ").trim();
  function clampProgress(value){const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(100,Math.round(number))):0;}
  function isReviewer(){return typeof window.canReviewTaskUpdates==="function"?window.canReviewTaskUpdates():isAdminUser();}
  function formatTime(value){
    if(!value)return "";
    const date=new Date(value);if(Number.isNaN(date.getTime()))return "";
    return new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit",year:"numeric"}).format(date);
  }
  function findTask(request){return (Array.isArray(tasks)?tasks:[]).find(item=>String(item.id)===String(request.task_id));}
  function taskDocText(task,request){return String(task?.doc||task?.docFull||"").trim()||`Nhiệm vụ ${request.task_id}`;}
  function taskContentText(task){return String(task?.conclusion||task?.task||task?.summary||"").trim();}
  function profileName(id){
    const profile=(Array.isArray(adminAccounts)?adminAccounts:[]).find(item=>item.id===id);
    return profile?(profile.full_name||profile.email||""):"";
  }
  function requesterName(request){return request.requester_name||profileName(request.requested_by)||"Tài khoản đơn vị";}
  function reviewerName(request){
    if(!request.reviewed_by&&!request.reviewed_at)return "";
    return request.reviewer_name||profileName(request.reviewed_by)||(String(request.reviewed_by)===String(currentProfile?.id)?(currentUser?.name||"Bạn"):"Người duyệt");
  }
  function proposedValue(patch,field){
    if(Object.prototype.hasOwnProperty.call(patch,field.key))return patch[field.key];
    if(field.alt&&Object.prototype.hasOwnProperty.call(patch,field.alt))return patch[field.alt];
    return undefined;
  }
  /** Các trường đơn vị đề nghị, kèm giá trị hiện tại và cờ "có thay đổi". */
  function requestChanges(request){
    const task=findTask(request);const patch=request.proposed_data||{};
    return FIELDS.map(field=>{
      const proposed=proposedValue(patch,field);
      if(proposed===undefined)return null;
      const current=field.format(field.current(task));const next=field.format(proposed);
      return {field,current:String(current??"").trim(),next:String(next??"").trim(),changed:String(current??"").trim()!==String(next??"").trim()};
    }).filter(Boolean);
  }

  /* ---------- Tải dữ liệu ---------- */
  async function fetchUpdateRequests(client){
    const rpc=await client.rpc("list_task_update_requests");
    if(!rpc.error){state.namesFromServer=true;return rpc.data||[];}
    state.namesFromServer=false;
    const table=await client.from(DB_TABLES.updateRequests)
      .select("id,task_id,requested_by,unit_name,proposed_data,status,review_note,reviewed_by,reviewed_at,created_at")
      .order("created_at",{ascending:false});
    if(table.error)throw table.error;
    return table.data||[];
  }
  /** Thay hàm cũ: Admin/UBKT tải tài khoản + hàng đợi; VPĐU chỉ tải hàng đợi (không đụng dữ liệu tài khoản). */
  loadAdminQueues=async function(showFeedback=false){
    const fullAdmin=isAdminUser();
    if(!fullAdmin&&!isReviewer())return;
    const client=getSupabaseClient();if(!client)return;
    state.loading=true;state.error="";renderTaskApprovals();
    try{
      const [requests,accountsResult]=await Promise.all([
        fetchUpdateRequests(client),
        fullAdmin?loadAdminAccountRows(client):Promise.resolve(null)
      ]);
      taskUpdateRequests=requests;
      if(accountsResult){
        if(accountsResult.error)throw accountsResult.error;
        adminAccounts=accountsResult.data||[];
        const pendingAccounts=adminAccounts.filter(profile=>profile.approval_status==="pending");
        const hasNewAccount=adminQueueInitialized?pendingAccounts.some(profile=>!knownPendingAccountIds.has(profile.id)):pendingAccounts.length>0;
        knownPendingAccountIds=new Set(pendingAccounts.map(profile=>profile.id));
        adminQueueInitialized=true;
        renderAdminAccounts();
        if(hasNewAccount)showModuleToast("Có tài khoản chờ phê duyệt",`${pendingAccounts.length} tài khoản đơn vị đang chờ Admin kiểm tra và cấp quyền.`);
      }else{
        adminAccounts=[];
      }
      if(showFeedback)showModuleToast("Đã làm mới","Hàng đợi duyệt cập nhật đã được đồng bộ.");
    }catch(error){
      console.error("Không tải được hàng đợi duyệt",error);
      state.error=error?.message||"Không tải được hàng đợi.";
      if(showFeedback)showModuleToast("Chưa tải được hàng đợi",state.error);
    }finally{
      state.loading=false;
      renderTaskApprovals();
      if(typeof renderProjectManagerChrome==="function")renderProjectManagerChrome();
    }
  };
  window.refreshTaskApprovals=async function(button){
    if(button){button.disabled=true;button.classList.add("is-loading");}
    try{await loadAdminQueues(true);}finally{if(button){button.disabled=false;button.classList.remove("is-loading");}}
  };

  /* ---------- Danh sách ---------- */
  setApprovalFilter=function(filter){
    approvalFilter=["pending","approved","rejected","all"].includes(filter)?filter:"pending";
    document.querySelectorAll("[data-approval-filter]").forEach(button=>{
      const active=button.dataset.approvalFilter===approvalFilter;
      button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",String(active));
    });
    renderTaskApprovals();
  };
  window.queueApprovalSearch=function(){
    window.clearTimeout(state.searchTimer);
    state.searchTimer=window.setTimeout(renderTaskApprovals,250);
  };
  window.toggleApprovalContent=function(id){
    if(state.expanded.has(id))state.expanded.delete(id);else state.expanded.add(id);
    renderTaskApprovals();
  };
  function skeleton(){
    return Array.from({length:3},()=>`<div class="tap-item is-skeleton" aria-hidden="true"><div><i style="width:38%"></i><i style="width:92%"></i><i style="width:74%"></i></div><div><i style="width:70%"></i><i style="width:50%"></i></div></div>`).join("");
  }
  function emptyState(title,body){return `<div class="tap-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg><b>${esc(title)}</b><p>${esc(body)}</p></div>`;}
  function changeChips(changes){
    if(!changes.length)return `<span class="tap-chip">Cập nhật nhiệm vụ</span>`;
    return changes.map(change=>{
      const short=change.field.key==="progress"&&change.changed?`${change.field.label}: ${change.current||"chưa có"} → ${change.next}`
        :change.field.key==="status"&&change.changed?`${change.field.label}: ${change.next}`
        :change.field.label;
      return `<span class="tap-chip${change.changed?" is-changed":""}">${esc(short)}</span>`;
    }).join("");
  }
  function itemHtml(request){
    const task=findTask(request);const [label,tone]=STATUS[request.status]||["Không rõ","is-pending"];
    const content=taskContentText(task);const expanded=state.expanded.has(String(request.id));
    const long=content.length>260;
    const reviewer=reviewerName(request);
    return `<article class="tap-item ${tone}">
      <div class="tap-item-main">
        <div class="tap-item-title"><span class="tap-status ${tone}">${label}</span><h4>${esc(taskDocText(task,request))}</h4></div>
        ${content?`<p class="tap-item-content${long&&!expanded?" is-clamped":""}" id="tapContent-${esc(request.id)}">${esc(content)}</p>${long?`<button type="button" class="tap-link" aria-expanded="${expanded}" aria-controls="tapContent-${esc(request.id)}" onclick="toggleApprovalContent('${esc(request.id)}')">${expanded?"Thu gọn":"Xem đầy đủ nội dung"}</button>`:""}`:`<p class="tap-item-content is-muted">Không tìm thấy nội dung nhiệm vụ (mã ${esc(request.task_id)}).</p>`}
        <div class="tap-chips" aria-label="Các trường đề nghị thay đổi">${changeChips(requestChanges(request))}</div>
        ${request.status!=="pending"?`<p class="tap-item-review"><b>${request.status==="approved"?"Đã duyệt":"Đã từ chối"}</b>${reviewer?` bởi ${esc(reviewer)}`:""}${request.reviewed_at?` lúc ${esc(formatTime(request.reviewed_at))}`:""}${request.review_note?` — ${esc(request.review_note)}`:""}</p>`:""}
      </div>
      <dl class="tap-item-meta">
        <div><dt>Đơn vị gửi</dt><dd>${esc(request.unit_name||"Chưa xác định")}</dd></div>
        <div><dt>Người cập nhật</dt><dd>${esc(requesterName(request))}</dd></div>
        <div><dt>Gửi lúc</dt><dd>${esc(formatTime(request.created_at)||"—")}</dd></div>
      </dl>
      <div class="tap-item-action"><button type="button" class="tap-btn${request.status==="pending"?" is-primary":""}" onclick="openTaskApprovalModal('${esc(request.id)}')">${request.status==="pending"?"Xem và xử lý":"Xem chi tiết"}</button></div>
    </article>`;
  }
  renderTaskApprovals=function(){
    const list=document.getElementById("taskApprovalList");
    const rows=Array.isArray(taskUpdateRequests)?taskUpdateRequests:[];
    const counts={pending:0,approved:0,rejected:0};rows.forEach(row=>{if(counts[row.status]!==undefined)counts[row.status]+=1;});
    [["updatePending",counts.pending],["updateApproved",counts.approved],["updateRejected",counts.rejected],["updateAll",rows.length]].forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value;});
    if(!list)return;
    list.setAttribute("aria-busy",String(state.loading));
    const counter=document.getElementById("tapResultCount");
    if(state.loading&&!rows.length){list.innerHTML=skeleton();if(counter)counter.textContent="Đang tải…";return;}
    if(state.error&&!rows.length){list.innerHTML=emptyState("Chưa tải được hàng đợi",`${state.error} Kiểm tra kết nối rồi bấm Làm mới.`);if(counter)counter.textContent="";return;}
    const query=fold(document.getElementById("approvalSearch")?.value||"");
    const filtered=rows.filter(request=>{
      if(approvalFilter!=="all"&&request.status!==approvalFilter)return false;
      if(!query)return true;
      const task=findTask(request);
      return fold([taskDocText(task,request),taskContentText(task),request.unit_name,requesterName(request),task?.unit].join(" ")).includes(query);
    });
    if(counter)counter.textContent=query||approvalFilter!=="all"?`${filtered.length} đề nghị`:"";
    if(!filtered.length){
      list.innerHTML=query
        ?emptyState("Không tìm thấy đề nghị phù hợp","Thử từ khóa khác hoặc chọn trạng thái khác.")
        :approvalFilter==="pending"
          ?emptyState("Không có đề nghị chờ duyệt","Khi đơn vị gửi cập nhật cần phê duyệt, đề nghị sẽ hiện tại đây.")
          :emptyState("Chưa có đề nghị ở trạng thái này","Chọn trạng thái khác để xem các đề nghị đã có.");
      return;
    }
    list.innerHTML=filtered.map(itemHtml).join("");
  };

  /* ---------- Cửa sổ chi tiết ---------- */
  function comparisonHtml(request){
    const changes=requestChanges(request);
    if(!changes.length)return `<p class="tap-muted">Đề nghị không có trường dữ liệu nào để so sánh.</p>`;
    return `<div class="tap-compare" role="table" aria-label="So sánh dữ liệu hiện tại và nội dung đề nghị">
      <div class="tap-compare-row is-head" role="row"><span role="columnheader">Trường</span><span role="columnheader">Dữ liệu hiện tại</span><span role="columnheader">Đơn vị đề nghị</span></div>
      ${changes.map(change=>`<div class="tap-compare-row${change.changed?" is-changed":""}" role="row">
        <span class="tap-compare-label" role="rowheader">${esc(change.field.label)}${change.changed?`<em>Thay đổi</em>`:`<em class="is-same">Không đổi</em>`}</span>
        <span class="tap-compare-cell" role="cell" data-label="Hiện tại">${change.current?esc(change.current):`<i class="tap-muted">Chưa có</i>`}</span>
        <span class="tap-compare-cell is-next" role="cell" data-label="Đề nghị">${change.next?esc(change.next):`<i class="tap-muted">Để trống</i>`}</span>
      </div>`).join("")}
    </div>`;
  }
  function setModalBusy(busy,decision){
    state.submitting=busy;
    const approve=document.getElementById("taskApprovalApproveButton");const reject=document.getElementById("taskApprovalRejectButton");const close=document.getElementById("taskApprovalCloseButton");
    [approve,reject,close].forEach(button=>{if(button)button.disabled=busy;});
    const note=document.getElementById("taskApprovalReviewNote");if(note)note.readOnly=busy;
    if(approve)approve.textContent=busy&&decision==="approved"?"Đang phê duyệt…":"Phê duyệt";
    if(reject)reject.textContent=busy&&decision==="rejected"?"Đang từ chối…":"Từ chối";
    document.getElementById("taskApprovalModal")?.setAttribute("aria-busy",String(busy));
  }
  function showModalError(message){const box=document.getElementById("tapModalError");if(!box)return;box.textContent=message;box.hidden=!message;}
  window.clearApprovalError=function(){showModalError("");document.getElementById("taskApprovalReviewNote")?.classList.remove("is-invalid");};

  openTaskApprovalModal=function(requestId){
    if(!isReviewer())return;
    const request=(taskUpdateRequests||[]).find(item=>String(item.id)===String(requestId));
    if(!request){showModuleToast("Không tìm thấy đề nghị","Dữ liệu có thể vừa thay đổi. Bấm Làm mới để tải lại hàng đợi.");return;}
    const modal=document.getElementById("taskApprovalModal");if(!modal)return;
    const task=findTask(request);const [label,tone]=STATUS[request.status]||["Không rõ","is-pending"];
    const pending=request.status==="pending";const reviewer=reviewerName(request);
    document.getElementById("taskApprovalReviewId").value=request.id;
    const status=document.getElementById("tapModalStatus");status.textContent=label;status.className=`tap-status ${tone}`;
    document.getElementById("tapModalTitle").textContent=taskDocText(task,request);
    document.getElementById("tapModalSubtitle").textContent=`${request.unit_name||"Chưa xác định đơn vị"} · ${requesterName(request)} · gửi lúc ${formatTime(request.created_at)||"—"}`;
    document.getElementById("taskApprovalReviewBody").innerHTML=`
      <section class="tap-section">
        <h4>Nội dung nhiệm vụ</h4>
        <p class="tap-task-content">${esc(taskContentText(task)||"Không tìm thấy nội dung nhiệm vụ.")}</p>
        <dl class="tap-facts">
          <div><dt>Số văn bản</dt><dd>${esc(taskDocText(task,request))}</dd></div>
          <div><dt>Đơn vị gửi</dt><dd>${esc(request.unit_name||"Chưa xác định")}</dd></div>
          <div><dt>Người cập nhật</dt><dd>${esc(requesterName(request))}</dd></div>
          <div><dt>Thời điểm gửi</dt><dd>${esc(formatTime(request.created_at)||"—")}</dd></div>
          ${!pending?`<div><dt>Người xử lý</dt><dd>${esc(reviewer||"—")}</dd></div><div><dt>Thời điểm xử lý</dt><dd>${esc(formatTime(request.reviewed_at)||"—")}</dd></div>`:""}
        </dl>
      </section>
      <section class="tap-section">
        <h4>So sánh dữ liệu</h4>
        ${comparisonHtml(request)}
      </section>
      ${!pending&&request.review_note?`<section class="tap-section"><h4>Ý kiến xử lý</h4><p class="tap-review-note">${esc(request.review_note)}</p></section>`:""}`;
    const note=document.getElementById("taskApprovalReviewNote");note.value="";note.readOnly=false;note.classList.remove("is-invalid");
    document.getElementById("taskApprovalReviewNoteWrap").hidden=!pending;
    document.getElementById("taskApprovalRejectButton").hidden=!pending;
    document.getElementById("taskApprovalApproveButton").hidden=!pending;
    showModalError("");setModalBusy(false);
    state.returnFocus=document.activeElement;
    if(!modal.classList.contains("open")){modal.classList.add("open");lockScroll();}
    document.getElementById("taskApprovalReviewBody").scrollTop=0;
    (pending?note:modal.querySelector(".tap-icon-btn"))?.focus({preventScroll:true});
  };
  closeTaskApprovalModal=function(){
    if(state.submitting)return; // không đóng khi máy chủ chưa trả kết quả
    const modal=document.getElementById("taskApprovalModal");if(!modal||!modal.classList.contains("open"))return;
    modal.classList.remove("open");unlockScroll();
    const target=state.returnFocus;state.returnFocus=null;
    if(target&&document.contains(target))target.focus?.({preventScroll:true});
  };
  document.addEventListener("keydown",event=>{
    const modal=document.getElementById("taskApprovalModal");
    if(!modal||!modal.classList.contains("open"))return;
    if(event.key==="Escape"){event.preventDefault();closeTaskApprovalModal();return;}
    if(event.key!=="Tab")return;
    const focusable=[...modal.querySelectorAll("button:not([disabled]):not([hidden]),textarea:not([hidden]),[tabindex='0']")].filter(item=>item.offsetParent!==null);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });

  /** Lấy lại đúng một nhiệm vụ sau khi duyệt (không tải lại toàn bộ). */
  async function refreshOneTask(taskId,patch){
    const local=findTask({task_id:taskId});
    try{
      const {data,error}=await getSupabaseClient().from(DB_TABLES.tasks).select("id,data,updated_at").eq("id",String(taskId)).limit(1);
      if(error)throw error;
      const row=(Array.isArray(data)?data:[data]).find(item=>item&&String(item.id)===String(taskId));
      if(row?.data){if(local)Object.assign(local,row.data);else tasks.push(row.data);return findTask({task_id:taskId});}
    }catch(error){console.warn("Không tải lại được nhiệm vụ sau khi duyệt",error);}
    if(local&&patch)Object.assign(local,patch);
    return local;
  }

  submitTaskApprovalDecision=async function(decision){
    if(!isReviewer()||state.submitting)return;
    const requestId=document.getElementById("taskApprovalReviewId").value;
    const request=(taskUpdateRequests||[]).find(item=>String(item.id)===String(requestId));
    if(!request||request.status!=="pending"){showModalError("Đề nghị này đã được xử lý. Bấm Làm mới để xem trạng thái mới nhất.");return;}
    const noteInput=document.getElementById("taskApprovalReviewNote");const note=noteInput.value.trim();
    if(decision==="rejected"&&!note){
      showModalError("Cần nhập lý do từ chối để đơn vị biết nội dung cần điều chỉnh.");
      noteInput.classList.add("is-invalid");noteInput.focus();return;
    }
    showModalError("");setModalBusy(true,decision);
    try{
      const {data,error}=await getSupabaseClient().rpc("review_task_update",{p_request_id:requestId,p_decision:decision,p_review_note:note||null});
      if(error)throw error;
      const saved=Array.isArray(data)?data[0]:data;
      Object.assign(request,{
        status:saved?.status||decision,
        review_note:saved?.review_note??(note||null),
        reviewed_by:saved?.reviewed_by||currentProfile?.id||null,
        reviewed_at:saved?.reviewed_at||new Date().toISOString(),
        reviewer_name:currentUser?.name||currentProfile?.full_name||"Bạn"
      });
      if(request.status==="approved"){
        const patch={};FIELDS.forEach(field=>{const value=proposedValue(request.proposed_data||{},field);if(value!==undefined&&value!==null)patch[field.key]=value;});
        if(request.proposed_data?.kien_nghi_xu_ly!==undefined)patch.kien_nghi_xu_ly=request.proposed_data.kien_nghi_xu_ly;
        const task=await refreshOneTask(request.task_id,patch);
        if(task&&typeof recordTaskNotification==="function"){
          recordTaskNotification(task,"status","Đã phê duyệt cập nhật nhiệm vụ",`${request.unit_name||"Đơn vị"} · ${request.proposed_data?.status||"Cập nhật tiến độ"}`);
          if(typeof recordTaskActivity==="function")recordTaskActivity(task,"approval","Đề nghị cập nhật của đơn vị đã được phê duyệt.");
        }
      }
      if(typeof persistLocal==="function")persistLocal(false);
      setModalBusy(false);
      closeTaskApprovalModal();
      renderTaskApprovals();
      render();
      showModuleToast(decision==="approved"?"Đã phê duyệt cập nhật":"Đã từ chối đề nghị",decision==="approved"?"Dữ liệu nhiệm vụ đã được cập nhật theo nội dung đơn vị đề nghị.":"Lý do từ chối đã được lưu để đơn vị xem.");
    }catch(error){
      setModalBusy(false);
      const message=String(error?.message||"Vui lòng thử lại.");
      showModalError(`Chưa xử lý được: ${message} Nội dung đã nhập vẫn được giữ.`);
      if(/đã được xử lý/i.test(message)){await loadAdminQueues(false);}
    }
  };
  reviewTaskRequest=function(requestId){openTaskApprovalModal(requestId);};
})();

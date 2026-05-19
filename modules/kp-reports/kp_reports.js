(function(){
  const PERIODS='ubkt_kp_report_periods';
  const ENTRIES='ubkt_kp_report_entries';
  const BASE_ORGS='ubkt_base_orgs';
  const SUMMARY='ubkt_kp_report_summary';

  const state={periods:[],orgs:[],entries:[],summary:[],activePeriodId:'',tab:'dashboard'};

  function client(){
    if(typeof supabaseClient!=='undefined') return supabaseClient;
    if(typeof client!=='undefined' && client?.from) return client;
    if(window.supabaseClient) return window.supabaseClient;
    if(window.sb) return window.sb;
    if(typeof supabase!=='undefined' && window.UBKT_SUPABASE_URL && window.UBKT_SUPABASE_ANON_KEY){
      window.supabaseClient=supabase.createClient(window.UBKT_SUPABASE_URL, window.UBKT_SUPABASE_ANON_KEY);
      return window.supabaseClient;
    }
    if(typeof supabase!=='undefined' && window.UBKT_CONFIG?.supabaseUrl && window.UBKT_CONFIG?.supabaseAnonKey){
      window.supabaseClient=supabase.createClient(window.UBKT_CONFIG.supabaseUrl, window.UBKT_CONFIG.supabaseAnonKey);
      return window.supabaseClient;
    }
    throw new Error('Không tìm thấy Supabase client. Kiểm tra config.js và Supabase SDK.');
  }
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function id(prefix='id'){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
  function val(id){return document.getElementById(id)?.value ?? ''}
  function intVal(id){const n=parseInt(val(id),10);return Number.isFinite(n)?n:0}
  function dateVN(d){if(!d)return '—'; try{return new Date(d).toLocaleDateString('vi-VN')}catch{return d}}
  function normalizeOrgName(name){
    let s=String(name||'').trim();
    if(!s)return '';
    s=s.replace(/^chi bộ\s+/i,'Chi bộ ');
    s=s.replace(/khu phố\s*0?(\d+)/i,(m,n)=>`Khu phố ${String(Number(n)).padStart(2,'0')}`);
    return s;
  }
  function orgName(o){return normalizeOrgName(o.name||o.orgName||o.title||o.data?.name||'')}
  function sortOrgs(list){return [...list].sort((a,b)=>{
    const an=orgName(a), bn=orgName(b);
    const ai=Number(an.match(/Khu phố\s*(\d+)/i)?.[1]||9999);
    const bi=Number(bn.match(/Khu phố\s*(\d+)/i)?.[1]||9999);
    return ai!==bi?ai-bi:an.localeCompare(bn,'vi',{numeric:true,sensitivity:'base'});
  })}
  function entryId(periodId,orgId){return `kp-entry-${periodId}-${orgId}`.replace(/[^a-zA-Z0-9_-]/g,'-')}
  function badge(text,type='info'){return `<span class="kp-badge ${type}">${esc(text)}</span>`}

  async function loadBase(){
    const sb=client();
    const [{data:periods,error:pErr},{data:orgRows,error:oErr}]=await Promise.all([
      sb.from(PERIODS).select('*').order('created_at',{ascending:false}),
      sb.from(BASE_ORGS).select('id,data,created_at,updated_at')
    ]);
    if(pErr) throw pErr; if(oErr) throw oErr;
    state.periods=periods||[];
state.orgs=sortOrgs((orgRows||[]).map(r=>({id:r.id,...(r.data||{}),data:r.data||{}})).filter(o=>/khu phố/i.test(orgName(o))));
    if(!state.activePeriodId && state.periods[0]) state.activePeriodId=state.periods[0].id;
  }
  async function loadEntries(){
    const sb=client();
    if(!state.activePeriodId){state.entries=[];state.summary=[];return;}
    const [{data:entries,error:eErr},{data:sum,error:sErr}]=await Promise.all([
      sb.from(ENTRIES).select('*').eq('period_id',state.activePeriodId).order('org_name',{ascending:true}),
      sb.from(SUMMARY).select('*').eq('period_id',state.activePeriodId)
    ]);
    if(eErr) throw eErr; if(sErr) throw sErr;
    state.entries=entries||[]; state.summary=sum||[];
  }

  function totals(){
    const e=state.entries; const submitted=e.length; const total=state.orgs.length;
    const sum=k=>e.reduce((a,r)=>a+(Number(r[k])||0),0);
    return {total,submitted,missing:Math.max(total-submitted,0),paper:e.filter(r=>r.paper_status==='Đã nhận hồ sơ giấy').length,
      members:sum('party_members_total'),check:sum('check_violation_members')+sum('check_compliance_members')+sum('check_discipline_members'),
      supervision:sum('supervision_members'),discipline:sum('discipline_members')};
  }
  function renderKpis(){const t=totals();return `<section class="kp-grid">
    ${[['Chi bộ phải nhập',t.total],['Đã nhập số liệu',t.submitted],['Chưa nhập',t.missing],['Đã nhận hồ sơ giấy',t.paper],['Tổng đảng viên',t.members],['Lượt kiểm tra ĐV',t.check],['Lượt giám sát ĐV',t.supervision],['Đảng viên kỷ luật',t.discipline]].map(x=>`<div class="kp-card kp-kpi"><p>${x[0]}</p><b>${x[1]}</b></div>`).join('')}
  </section>`}
  function periodOptions(){return state.periods.map(p=>`<option value="${esc(p.id)}" ${p.id===state.activePeriodId?'selected':''}>${esc(p.name)} — ${esc(p.status)}</option>`).join('')}
  function entryByOrg(orgId){return state.entries.find(e=>e.org_id===orgId)}
  function renderOrgRows(){
    const rows=state.orgs.map(o=>{const e=entryByOrg(o.id); const submitted=!!e; const paper=e?.paper_status==='Đã nhận hồ sơ giấy'; return {o,e,submitted,paper};});
    const table=`<div class="kp-table-wrap"><table class="kp-table"><thead><tr><th>Chi bộ</th><th>Trạng thái</th><th>Đảng viên</th><th>KT ĐV</th><th>GS ĐV</th><th>Kỷ luật ĐV</th><th>Hồ sơ giấy</th><th>Thao tác</th></tr></thead><tbody>${rows.map(({o,e,submitted,paper})=>`<tr>
<td><b>${esc(orgName(o))}</b></td><td>${submitted?badge('Đã nhập','ok'):badge('Chưa nhập','bad')}</td><td>${e?.party_members_total??'—'}</td><td>${(e?.check_violation_members||0)+(e?.check_compliance_members||0)+(e?.check_discipline_members||0)}</td><td>${e?.supervision_members??0}</td><td>${e?.discipline_members??0}</td><td>${paper?badge('Đã nhận','ok'):badge('Chưa nhận','warn')}</td><td><button class="kp-btn soft" onclick="KPReports.openEntry('${esc(o.id)}')">Xem</button> <button class="kp-btn soft" onclick="KPReports.togglePaper('${esc(o.id)}')">${paper?'Bỏ nhận':'Đã nhận giấy'}</button></td>
    </tr>`).join('')}</tbody></table></div>`;
    const mobile=`<div class="kp-mobile-list">${rows.map(({o,e,submitted,paper})=>`<div class="kp-org-card"><div><b>${esc(orgName(o))}</b><div class="kp-mini">${submitted?'Đã nhập số liệu':'Chưa nhập'} • Hồ sơ giấy: ${paper?'Đã nhận':'Chưa nhận'}</div><div class="kp-mini">Đảng viên: ${e?.party_members_total??'—'} • KT ĐV: ${(e?.check_violation_members||0)+(e?.check_compliance_members||0)+(e?.check_discipline_members||0)} • GS ĐV: ${e?.supervision_members??0}</div></div><div><button class="kp-btn soft" onclick="KPReports.openEntry('${esc(o.id)}')">Xem</button><button class="kp-btn soft" onclick="KPReports.togglePaper('${esc(o.id)}')">${paper?'Bỏ nhận':'Đã nhận giấy'}</button></div></div>`).join('')}</div>`;
    return table+mobile;
  }
  function renderDashboard(root){
    root.innerHTML=`<div class="kp-wrap"><section class="kp-hero"><div><h1>Báo cáo KTGS khu phố</h1><p>Nhập nhanh số liệu để UBKT phường tổng hợp. Hồ sơ giấy vẫn gửi, tiếp nhận và lưu theo quy định.</p></div><div class="kp-actions"><button class="kp-btn primary" onclick="KPReports.openPeriodModal()">+ Mở kỳ báo cáo</button><a class="kp-btn soft" href="./bao-cao-ktgs-khu-pho.html" target="_blank">Mở form công khai</a></div></section><div class="kp-tabs"><button class="kp-tab ${state.tab==='dashboard'?'active':''}" onclick="KPReports.setTab('dashboard')">Tổng hợp</button><button class="kp-tab ${state.tab==='periods'?'active':''}" onclick="KPReports.setTab('periods')">Kỳ báo cáo</button></div>${state.tab==='periods'?renderPeriods():renderMain()}</div>${modalHtml()}`;
  }
  function renderMain(){return `<div class="kp-panel"><div class="kp-panel-head"><div><h2>Tổng hợp theo kỳ</h2><div class="kp-mini">Chọn kỳ để xem 43 chi bộ đã nhập/chưa nhập và tình trạng hồ sơ giấy.</div></div><label class="kp-field" style="min-width:min(360px,100%)">Kỳ báo cáo<select class="kp-select" onchange="KPReports.changePeriod(this.value)">${periodOptions()}</select></label></div><div class="kp-panel-body">${state.periods.length?renderKpis()+renderOrgRows():`<div class="kp-empty">Chưa có kỳ báo cáo. Bấm “+ Mở kỳ báo cáo” để tạo kỳ đầu tiên.</div>`}</div></div>`}
function renderPeriods(){return `<div class="kp-panel"><div class="kp-panel-head"><h2>Danh sách kỳ báo cáo</h2><button class="kp-btn primary" onclick="KPReports.openPeriodModal()">+ Mở kỳ báo cáo</button></div><div class="kp-panel-body"><div class="kp-table-wrap"><table class="kp-table"><thead><tr><th>Tên kỳ</th><th>Loại</th><th>Từ ngày</th><th>Đến ngày</th><th>Hạn nhập</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${state.periods.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.report_type)}</td><td>${dateVN(p.period_from)}</td><td>${dateVN(p.period_to)}</td><td>${dateVN(p.due_date)}</td><td>${badge(p.status,p.status==='Đang mở'?'ok':'warn')}</td><td><button class="kp-btn soft" onclick="KPReports.changePeriod('${esc(p.id)}');KPReports.setTab('dashboard')">Xem</button></td></tr>`).join('')}</tbody></table></div><div class="kp-mobile-list">${state.periods.map(p=>`<div class="kp-org-card"><div><b>${esc(p.name)}</b><div class="kp-mini">${esc(p.report_type)} • ${dateVN(p.period_from)} - ${dateVN(p.period_to)} • Hạn ${dateVN(p.due_date)}</div></div><button class="kp-btn soft" onclick="KPReports.changePeriod('${esc(p.id)}');KPReports.setTab('dashboard')">Xem</button></div>`).join('')}</div></div></div>`}
  function modalHtml(){return `<div id="kpModal" class="kp-modal" onclick="if(event.target.id==='kpModal')KPReports.closeModal()"><div class="kp-modal-card"><div class="kp-modal-head"><h2 id="kpModalTitle">Mở kỳ báo cáo</h2><button class="kp-btn soft" onclick="KPReports.closeModal()">Đóng</button></div><div id="kpModalBody" class="kp-modal-body"></div></div></div>`}

  async function mount(){const root=document.getElementById('kpReportsRoot'); if(!root)return; root.innerHTML='<div class="kp-wrap"><div class="kp-panel"><div class="kp-empty">Đang tải dữ liệu...</div></div></div>'; try{await loadBase(); await loadEntries(); renderDashboard(root)}catch(e){root.innerHTML=`<div class="kp-wrap"><div class="kp-error">${esc(e.message)}</div></div>`}}
  async function refresh(){await loadBase(); await loadEntries(); const root=document.getElementById('kpReportsRoot'); if(root)renderDashboard(root)}
function openPeriodModal(){document.getElementById('kpModalTitle').textContent='Mở kỳ báo cáo'; document.getElementById('kpModalBody').innerHTML=`<div class="kp-form-grid"><label class="kp-field">Tên kỳ báo cáo<input id="kpPeriodName" class="kp-input" placeholder="VD: Báo cáo KTGS tháng 5/2026"></label><label class="kp-field">Loại báo cáo<select id="kpPeriodType" class="kp-select"><option>Tháng</option><option>6 tháng</option><option>Năm</option></select></label><label class="kp-field">Từ ngày<input id="kpPeriodFrom" class="kp-input" type="date"></label><label class="kp-field">Đến ngày<input id="kpPeriodTo" class="kp-input" type="date"></label><label class="kp-field">Hạn nhập số liệu<input id="kpPeriodDue" class="kp-input" type="date"></label><label class="kp-field">Trạng thái<select id="kpPeriodStatus" class="kp-select"><option>Đang mở</option><option>Đã khóa</option></select></label></div><label class="kp-field" style="margin-top:12px">Ghi chú<textarea id="kpPeriodNote" class="kp-textarea" rows="3"></textarea></label><div class="kp-sticky-submit"><button class="kp-btn soft" onclick="KPReports.closeModal()">Hủy</button><button class="kp-btn primary" onclick="KPReports.savePeriod()">Tạo kỳ báo cáo</button></div>`; document.getElementById('kpModal').classList.add('open')}
  async function savePeriod(){const name=val('kpPeriodName').trim(); if(!name){alert('Nhập tên kỳ báo cáo');return;} const sb=client(); const row={id:id('kp-period'),name,report_type:val('kpPeriodType'),period_from:val('kpPeriodFrom')||null,period_to:val('kpPeriodTo')||null,due_date:val('kpPeriodDue')||null,status:val('kpPeriodStatus'),note:val('kpPeriodNote')}; const {error}=await sb.from(PERIODS).insert(row); if(error){alert(error.message);return;} closeModal(); state.activePeriodId=row.id; await refresh();}
  function closeModal(){document.getElementById('kpModal')?.classList.remove('open')}
  async function changePeriod(pid){state.activePeriodId=pid; await loadEntries(); const root=document.getElementById('kpReportsRoot'); if(root)renderDashboard(root)}
  function setTab(tab){state.tab=tab; const root=document.getElementById('kpReportsRoot'); if(root)renderDashboard(root)}
function openEntry(orgId){const org=state.orgs.find(o=>o.id===orgId); const e=entryByOrg(orgId); document.getElementById('kpModalTitle').textContent=orgName(org); document.getElementById('kpModalBody').innerHTML=e?`<div class="kp-form-grid three"><div class="kp-card kp-kpi"><p>Tổng ĐV</p><b>${e.party_members_total||0}</b></div><div class="kp-card kp-kpi"><p>Kiểm tra ĐV</p><b>${(e.check_violation_members||0)+(e.check_compliance_members||0)+(e.check_discipline_members||0)}</b></div><div class="kp-card kp-kpi"><p>Giám sát ĐV</p><b>${e.supervision_members||0}</b></div></div><div class="kp-card" style="margin-top:12px"><b>Người nhập:</b> ${esc(e.submitter_name||'—')}<br><b>Thời gian:</b> ${dateVN(e.submitted_at)}<br><b>Hồ sơ giấy:</b> ${esc(e.paper_status||'Chưa nhận')}</div><div class="kp-card" style="margin-top:12px"><b>Giải quyết tố cáo:</b><p>${esc(e.complaint_resolution||'Không có nội dung')}</p><b>Nhiệm vụ trọng tâm:</b><p>${esc(e.next_tasks||'Không có nội dung')}</p><b>Ghi chú/kiến nghị:</b><p>${esc(e.recommendations||'Không có')}</p></div>`:`<div class="kp-empty">Chi bộ này chưa nhập số liệu điện tử trong kỳ đã chọn.</div>`; document.getElementById('kpModal').classList.add('open')}
  async function togglePaper(orgId){if(!state.activePeriodId)return alert('Chưa chọn kỳ'); const org=state.orgs.find(o=>o.id===orgId); let e=entryByOrg(orgId); const next=e?.paper_status==='Đã nhận hồ sơ giấy'?'Chưa nhận hồ sơ giấy':'Đã nhận hồ sơ giấy'; const row={id:e?.id||entryId(state.activePeriodId,orgId),period_id:state.activePeriodId,org_id:orgId,org_name:orgName(org),paper_status:next,paper_received_at:next==='Đã nhận hồ sơ giấy'?new Date().toISOString():null,status:e?.status||'Chưa nhập số liệu'}; const {error}=await client().from(ENTRIES).upsert(row,{onConflict:'period_id,org_id'}); if(error)return alert(error.message); await loadEntries(); const root=document.getElementById('kpReportsRoot'); if(root)renderDashboard(root)}

  async function mountPublic(){const root=document.getElementById('kpPublicReportRoot'); if(!root)return; root.innerHTML='<div class="kp-public"><div class="kp-public-shell"><div class="kp-panel"><div class="kp-empty">Đang tải biểu mẫu...</div></div></div></div>'; try{await loadBase(); renderPublic(root)}catch(e){root.innerHTML=`<div class="kp-public"><div class="kp-error">${esc(e.message)}</div></div>`}}
function renderPublic(root){const openPeriods=state.periods.filter(p=>p.status==='Đang mở'); root.innerHTML=`<div class="kp-public kp-public-v3"><div class="kp-public-shell"><header class="kp-public-hero"><div><span class="kp-public-pill">Biểu mẫu nhập nhanh</span><h1>Nhập số liệu KTGS khu phố</h1><p>Chọn kỳ, chọn chi bộ, nhập số liệu chính. Số liệu này chỉ phục vụ UBKT phường tổng hợp nhanh; hồ sơ giấy vẫn gửi theo quy định.</p></div><div class="kp-public-logo-card">
  <img src="./assets/ubkt-logo.png" alt="Ủy ban Kiểm tra Đảng" class="kp-public-logo">
</div></header><form id="kpPublicForm" class="kp-public-form" onsubmit="event.preventDefault();KPReports.submitPublic()"><section class="kp-step-card kp-step-card-first"><div class="kp-step-head"><span>1</span><div><b>Thông tin đơn vị</b><p>Chọn đúng kỳ báo cáo và Chi bộ Khu phố trước khi nhập số liệu.</p></div></div><div class="kp-form-grid kp-form-grid-identity"><label class="kp-field">Kỳ báo cáo<select id="pubPeriod" class="kp-select" required>${openPeriods.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label class="kp-field">Chi bộ Khu phố<select id="pubOrg" class="kp-select" required>${state.orgs.map(o=>`<option value="${esc(o.id)}">${esc(orgName(o))}</option>`).join('')}</select></label><label class="kp-field">Người nhập<input id="pubSubmitter" class="kp-input" placeholder="Họ tên người nhập"></label><label class="kp-field">Số điện thoại liên hệ<input id="pubPhone" class="kp-input" inputmode="tel" placeholder="Không bắt buộc"></label></div></section>${publicFields()}<section class="kp-confirm-card"><b>Lưu ý trước khi gửi</b><p>Vui lòng kiểm tra lại tên chi bộ và kỳ báo cáo. Sau khi gửi, UBKT phường sẽ thấy trạng thái “đã nhập số liệu”; hồ sơ giấy vẫn nộp/lưu theo quy định.</p></section><div class="kp-sticky-submit"><button class="kp-btn soft" type="reset">Nhập lại</button><button class="kp-btn primary" type="submit">Gửi số liệu</button></div><div id="pubMsg" style="margin-top:12px"></div></form></div></div>`; if(!openPeriods.length)document.getElementById('pubMsg').innerHTML='<div class="kp-error">Hiện chưa có kỳ báo cáo đang mở. Vui lòng liên hệ UBKT Đảng ủy phường.</div>'}
  function numField(id,label){return `<label class="kp-field kp-number-field">${label}<input id="${id}" class="kp-input big" type="number" min="0" value="0" inputmode="numeric"><small>Không phát sinh thì để 0</small></label>`}
function publicFields(){return `<section class="kp-step-card"><div class="kp-step-head"><span>2</span><div><b>Tình hình tổ chức đảng</b><p>Nhập số lượng đảng viên theo từng nhóm.</p></div></div><div class="kp-form-grid three kp-number-grid">${numField('pmTotal','Tổng số đảng viên')}${numField('pmOfficial','Đảng viên chính thức')}${numField('pmProb','Đảng viên dự bị')}${numField('pmExempt','Miễn sinh hoạt Đảng')}${numField('pmTempIn','Sinh hoạt tạm thời')}${numField('pmTempOut','Chuyển sinh hoạt tạm thời đi')}</div></section><section class="kp-step-card"><div class="kp-step-head"><span>3</span><div><b>Kiểm tra, giám sát, kỷ luật</b><p>Chỉ nhập số lượng phát sinh trong kỳ báo cáo.</p></div></div><div class="kp-form-grid three kp-number-grid">${numField('cvMem','KT ĐV khi có DHVP')}${numField('cvOrg','KT tổ chức khi có DHVP')}${numField('ccMem','KT ĐV chấp hành')}${numField('ccOrg','KT tổ chức chấp hành')}${numField('cdMem','KT thi hành KL đối với ĐV')}${numField('cdOrg','KT thi hành KL đối với TCĐ')}${numField('supMem','Giám sát đảng viên')}${numField('supOrg','Giám sát tổ chức đảng')}${numField('disMem','Đảng viên bị kỷ luật')}${numField('disOrg','Tổ chức đảng bị kỷ luật')}</div></section><section class="kp-step-card"><div class="kp-step-head"><span>4</span><div><b>Nội dung ngắn</b><p>Chỉ ghi nội dung nổi bật; nếu không có thì để trống.</p></div></div><div class="kp-form-grid kp-text-grid"><label class="kp-field">Nội dung giám sát đảng viên<textarea id="supMemText" class="kp-textarea" rows="3" placeholder="Nếu có"></textarea></label><label class="kp-field">Nội dung giám sát tổ chức đảng<textarea id="supOrgText" class="kp-textarea" rows="3" placeholder="Nếu có"></textarea></label><label class="kp-field">Giải quyết tố cáo của đảng viên<textarea id="complaint" class="kp-textarea" rows="3" placeholder="Nếu không có thì để trống"></textarea></label><label class="kp-field">Nhiệm vụ trọng tâm tiếp theo<textarea id="nextTasks" class="kp-textarea" rows="3" placeholder="Nhập nhiệm vụ trọng tâm kỳ sau nếu có"></textarea></label><label class="kp-field kp-field-full">Ghi chú/kiến nghị<textarea id="recommendations" class="kp-textarea" rows="3" placeholder="Nếu có"></textarea></label></div></section>`}
async function submitPublic(){const periodId=val('pubPeriod'), orgId=val('pubOrg'); const org=state.orgs.find(o=>o.id===orgId); if(!periodId||!orgId)return; const row={id:entryId(periodId,orgId),period_id:periodId,org_id:orgId,org_name:orgName(org),party_members_total:intVal('pmTotal'),party_members_official:intVal('pmOfficial'),party_members_probationary:intVal('pmProb'),party_members_exempt:intVal('pmExempt'),party_members_temporary_in:intVal('pmTempIn'),party_members_temporary_out:intVal('pmTempOut'),check_violation_members:intVal('cvMem'),check_violation_orgs:intVal('cvOrg'),check_compliance_members:intVal('ccMem'),check_compliance_orgs:intVal('ccOrg'),check_discipline_members:intVal('cdMem'),check_discipline_orgs:intVal('cdOrg'),supervision_members:intVal('supMem'),supervision_members_content:val('supMemText'),supervision_orgs:intVal('supOrg'),supervision_orgs_content:val('supOrgText'),discipline_members:intVal('disMem'),discipline_orgs:intVal('disOrg'),complaint_resolution:val('complaint'),next_tasks:val('nextTasks'),recommendations:val('recommendations'),submitter_name:val('pubSubmitter'),submitter_phone:val('pubPhone'),status:'Đã nhập số liệu',submitted_at:new Date().toISOString()}; const msg=document.getElementById('pubMsg'); msg.innerHTML='<div class="kp-help">Đang gửi số liệu...</div>'; const {error}=await client().from(ENTRIES).upsert(row,{onConflict:'period_id,org_id'}); if(error){msg.innerHTML=`<div class="kp-error">${esc(error.message)}</div>`;return;} msg.innerHTML=`<div class="kp-success">Đã ghi nhận số liệu của ${esc(row.org_name)}. Hồ sơ giấy vẫn gửi theo quy định.</div>`; document.getElementById('kpPublicForm').scrollIntoView({behavior:'smooth',block:'start'});}

  window.KPReports={mount,mountPublic,refresh,openPeriodModal,savePeriod,closeModal,changePeriod,setTab,openEntry,togglePaper,submitPublic};
  document.addEventListener('DOMContentLoaded',()=>{if(document.getElementById('kpPublicReportRoot')) mountPublic();});
})();

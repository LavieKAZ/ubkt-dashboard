(function(){
  const TABLES={
    documents:'ubkt_documents',
    links:'ubkt_document_links',
    indicators:'ubkt_indicators',
    units:'ubkt_indicator_units',
    updates:'ubkt_indicator_updates',
    tasks:'ubkt_tasks'
  };

  const STATE={
    loaded:false,
    client:null,
    view:'tree',
    docs:[],
    links:[],
    indicators:[],
    assignments:[],
    unitOptions:[],
    filters:{doc:'',type:'',level:'',unit:'',role:'',status:'',keyword:''},
    saving:false,
    activeDetail:null
  };

  const DOC_TYPES=['Nghị quyết','Chương trình hành động','Kế hoạch','Chương trình KTGS','Văn bản khác'];
  const DOC_LEVELS=['Thành phố','Phường','Cấp trên','Nội bộ'];
  const LINK_TYPES=['cụ thể hóa','triển khai','căn cứ','liên quan','thay thế'];
  const MEASURE_TYPES=[['percentage','Tỷ lệ %'],['number','Số lượng'],['growth','Tăng/giảm'],['milestone','Mốc hoàn thành'],['mixed','Hỗn hợp']];
  const COMPARE_OPS=[['>=','≥ Đạt từ'],['>','> Lớn hơn'],['<=','≤ Không quá'],['<','< Nhỏ hơn'],['=','= Bằng'],['range','Trong khoảng'],['complete','Hoàn thành'],['note','Theo mô tả']];
  const ROLES=['Chủ trì','Phối hợp','Thực hiện','Tham mưu','Theo dõi','Tất cả đơn vị'];
  const STATUS=['Chưa có số liệu','Chưa đến kỳ','Đang thực hiện','Đạt','Chưa đạt','Hoàn thành','Quá hạn'];
  const PRIORITIES=['Bình thường','Cao','Rất cao'];
  const CYCLES=['Quý','6 tháng','Năm','Hằng năm','Theo kế hoạch','Giữa nhiệm kỳ','Cuối nhiệm kỳ'];
  const SCOPES=['Hằng năm','Theo quý','6 tháng','Đến 2030','Giai đoạn 2025-2030','Theo kế hoạch'];
  const PERIODS=['Quý I','6 tháng','Quý III','Năm','Giữa nhiệm kỳ','Tổng kết'];
  const FALLBACK_UNITS=['Đảng ủy phường','UBND Phường','UBKT','Ban Xây dựng Đảng','VPĐU','MTTQ','HĐND','Đảng ủy - BCH Công an phường','BCHQS','Tất cả đơn vị'];
  const UNIT_ALIASES=[
    ['UBND Phường',['UBND','UBND phường','UBND Phường','Ủy ban nhân dân','Ủy ban nhân dân phường','UBND P','uy ban nhan dan phuong']],
    ['Đảng ủy phường',['Đảng ủy','Đảng uỷ','Đảng ủy phường','Đảng uỷ phường','Dang uy phuong']],
    ['Đảng ủy - BCH Công an phường',['Công an','Công an phường','Đảng ủy Công an phường','Đảng ủy - BCH Công an phường','BCH Công an phường','CA phường']],
    ['Ban Xây dựng Đảng',['Ban Xây dựng Đảng','Ban XDD','Ban XDĐ','BXDĐ','Xây dựng Đảng']],
    ['VPĐU',['VPĐU','Văn phòng Đảng ủy','Văn phòng ĐU','VP Đảng ủy','Van phong Dang uy']],
    ['UBKT',['UBKT','UBKT Đảng ủy','Ủy ban Kiểm tra','Ủy ban Kiểm tra Đảng ủy']],
    ['MTTQ',['MTTQ','MTTQ phường','UBMTTQ','UB.MTTQ','Ủy ban MTTQ','Ủy ban MTTQ Việt Nam phường','Mặt trận Tổ quốc']],
    ['HĐND',['HĐND','HĐND phường','Hội đồng nhân dân','Thường trực HĐND']],
    ['BCHQS',['BCHQS','BCHQS phường','Ban Chỉ huy Quân sự','Ban CHQS','Quân sự phường']],
    ['Tất cả đơn vị',['Tất cả đơn vị','Tất cả','Toàn bộ đơn vị','Tất cả đơn vị thực hiện']],
    ['Chưa phân công',['','Chưa xác định','Chưa xác định đơn vị','Chưa phân công','Chưa giao']]
  ];

  function esc(s){return String(s??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
  function id(prefix){return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;}
  function nval(v){const s=String(v??'').trim().replace(',','.'); if(!s) return null; const n=Number(s); return Number.isFinite(n)?n:null;}
  function ival(v){const s=String(v??'').trim(); if(!s) return null; const n=parseInt(s,10); return Number.isFinite(n)?n:null;}
  function unique(arr){return [...new Set(arr.filter(Boolean).map(x=>String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true,sensitivity:'base'}));}
  function uniqueUnits(arr){return unique(arr.map(normalizeUnitName).filter(u=>u && u!=='Chưa phân công'));}
  function opt(values,current=''){return values.map(v=>`<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(v)}</option>`).join('');}
  function optPairs(values,current=''){return values.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(l)}</option>`).join('');}
  function selectedIn(list,value){return list.map(v=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(v)}</option>`).join('');}
  function selectedMany(list,selected=[]){const set=new Set(selected||[]);return list.map(v=>`<option value="${esc(v)}" ${set.has(v)?'selected':''}>${esc(v)}</option>`).join('');}

  function ensureCss(){
    if(document.getElementById('nq5bCss')) return;
    const link=document.createElement('link');
    link.id='nq5bCss'; link.rel='stylesheet'; link.href='./modules/indicators/indicators.css';
    document.head.appendChild(link);
  }
  function getClient(){
    if(STATE.client) return STATE.client;
    const url=(window.UBKT_SUPABASE_URL||'').trim();
    const key=(window.UBKT_SUPABASE_ANON_KEY||'').trim();
    if(!url || !key || !window.supabase) return null;
    STATE.client=window.supabase.createClient(url,key);
    return STATE.client;
  }
  function toast(msg){
    document.querySelectorAll('.nq-toast').forEach(x=>x.remove());
    const el=document.createElement('div'); el.className='nq-toast'; el.textContent=msg;
    document.body.appendChild(el); setTimeout(()=>el.remove(),2600);
  }
  function lockScroll(){document.body.classList.add('mobile-drawer-open');document.body.style.overflow='hidden';}
  function unlockScroll(){document.body.classList.remove('mobile-drawer-open');document.body.style.overflow='';}

  async function loadData(force=false){
    if(STATE.loaded && !force) return;
    const client=getClient();
    if(!client) throw new Error('Chưa cấu hình Supabase hoặc chưa tải supabase-js.');
    const [d,l,i,u]=await Promise.all([
      client.from(TABLES.documents).select('*').eq('is_active',true).order('sort_order',{ascending:true}).order('created_at',{ascending:true}),
      client.from(TABLES.links).select('*'),
      client.from(TABLES.indicators).select('*').eq('is_active',true).order('document_id',{ascending:true}).order('sort_order',{ascending:true}).order('ordinal',{ascending:true}),
      client.from(TABLES.units).select('*')
    ]);
    if(d.error) throw d.error; if(l.error) throw l.error; if(i.error) throw i.error; if(u.error) throw u.error;
    STATE.docs=d.data||[]; STATE.links=l.data||[]; STATE.indicators=i.data||[]; STATE.assignments=u.data||[];
    await loadUnitOptions();
    STATE.loaded=true;
  }

  async function loadUnitOptions(){
    const client=getClient();
    const set=new Set(FALLBACK_UNITS);
    STATE.assignments.forEach(a=>a.unit_name && set.add(a.unit_name));
    STATE.docs.forEach(d=>{ if(d.advisory_unit) set.add(d.advisory_unit); if(d.lead_unit) set.add(d.lead_unit); });
    try{
      const res=await client.from(TABLES.tasks).select('data').limit(1000);
      if(!res.error){
        (res.data||[]).forEach(r=>{
          const data=r.data||{};
          ['unit','lead_unit','leadUnit','assignedUnit','responsibleUnit','ownerUnit','coordinatingUnit'].forEach(k=>{ if(data[k]) set.add(String(data[k]).trim()); });
        });
      }
    }catch(e){}
    STATE.unitOptions=uniqueUnits([...set]);
  }

  function docById(id){return STATE.docs.find(d=>d.id===id)||null;}
  function indicatorById(id){return STATE.indicators.find(i=>i.id===id)||null;}
  function assignmentsOf(indicatorId){
    const merged=new Map();
    STATE.assignments.filter(a=>a.indicator_id===indicatorId).forEach(a=>{
      const unit=normalizeUnitName(a.unit_name);
      const key=`${unit}__${a.role||'Thực hiện'}__${!!a.is_primary}`;
      if(!merged.has(key)) merged.set(key,{...a,unit_name:unit});
    });
    return [...merged.values()].sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||String(a.role).localeCompare(String(b.role),'vi')||String(a.unit_name).localeCompare(String(b.unit_name),'vi'));
  }
  function childrenOf(id){return STATE.indicators.filter(i=>i.parent_indicator_id===id).sort(sortIndicators);}
  function parentOf(i){return i?.parent_indicator_id?indicatorById(i.parent_indicator_id):null;}
  function linksFrom(parentId){return STATE.links.filter(l=>l.parent_document_id===parentId);}
  function parentLinksOf(childId){return STATE.links.filter(l=>l.child_document_id===childId);}
  function sortDocs(a,b){return Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.code||'').localeCompare(String(b.code||''),'vi',{numeric:true,sensitivity:'base'})||String(a.title||'').localeCompare(String(b.title||''),'vi',{numeric:true,sensitivity:'base'});}
  function sortIndicators(a,b){
    const ap=parentOf(a)||a, bp=parentOf(b)||b;
    const ar=Number(ap.ordinal??ap.sort_order??999999), br=Number(bp.ordinal??bp.sort_order??999999);
    if(ar!==br) return ar-br;
    if(ap.id!==bp.id) return String(ap.code||'').localeCompare(String(bp.code||''),'vi',{numeric:true,sensitivity:'base'});
    if(!a.parent_indicator_id && b.parent_indicator_id) return -1;
    if(a.parent_indicator_id && !b.parent_indicator_id) return 1;
    return Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.code||'').localeCompare(String(b.code||''),'vi',{numeric:true,sensitivity:'base'});
  }
  function targetLabel(i){
    if(i.target_label) return i.target_label;
    if(i.compare_operator==='range' && i.target_min!=null && i.target_max!=null) return `Từ ${i.target_min} đến ${i.target_max}${i.target_unit?' '+i.target_unit:''}`;
    if(i.target_value!=null) return `${i.compare_operator||'>='} ${i.target_value}${i.target_unit?' '+i.target_unit:''}`;
    if(i.compare_operator==='complete') return 'Hoàn thành';
    return 'Theo mô tả';
  }
  function statusClass(s){
    if(['Đạt','Hoàn thành'].includes(s)) return 'nq-badge-ok';
    if(['Chưa đạt','Quá hạn'].includes(s)) return 'nq-badge-bad';
    if(['Đang thực hiện'].includes(s)) return 'nq-badge-doing';
    if(['Chưa đến kỳ'].includes(s)) return 'nq-badge-warn';
    return 'nq-badge-wait';
  }
  function badge(s,cls=''){return `<span class="nq-badge ${cls||statusClass(s)}">${esc(s||'Chưa có số liệu')}</span>`;}
  function measureText(v){const f=MEASURE_TYPES.find(x=>x[0]===v); return f?f[1]:(v||'—');}
  function roleBadge(a){return `<span class="nq-badge ${a.is_primary?'nq-badge-dark':'nq-badge-soft'}">${esc(a.unit_name)} • ${esc(a.role)}</span>`;}
  function calcProgress(){
    const total=STATE.indicators.length;
    const ok=STATE.indicators.filter(i=>['Đạt','Hoàn thành'].includes(i.status)).length;
    const bad=STATE.indicators.filter(i=>['Chưa đạt','Quá hạn'].includes(i.status)).length;
    const doing=STATE.indicators.filter(i=>i.status==='Đang thực hiện').length;
    const missing=STATE.indicators.filter(i=>!i.status||i.status==='Chưa có số liệu').length;
    return {total,ok,bad,doing,missing,rate:total?Math.round(ok/total*100):0};
  }

  function filteredIndicators(){
    const f=STATE.filters, kw=norm(f.keyword);
    return STATE.indicators.filter(i=>{
      const d=docById(i.document_id)||{};
      const au=assignmentsOf(i.id);
      if(f.doc && i.document_id!==f.doc) return false;
      if(f.type && d.document_type!==f.type) return false;
      if(f.level && d.document_level!==f.level) return false;
      if(f.status && i.status!==f.status) return false;
      if(f.unit && !au.some(a=>a.unit_name===f.unit)) return false;
      if(f.role && !au.some(a=>a.role===f.role)) return false;
      if(kw){
        const hay=norm(`${i.code} ${i.ordinal} ${i.title} ${i.source_excerpt} ${i.group_name} ${targetLabel(i)} ${d.code} ${d.title} ${au.map(a=>a.unit_name+' '+a.role).join(' ')}`);
        if(!hay.includes(kw)) return false;
      }
      return true;
    }).sort((a,b)=>{
      const d=String(a.document_id||'').localeCompare(String(b.document_id||''),'vi',{numeric:true,sensitivity:'base'});
      return d || sortIndicators(a,b);
    });
  }

  function renderHero(){
    const p=calcProgress();
    return `<section class="nq-hero nq-animate">
      <div>
        <h1>Chỉ tiêu NQ-CTHĐ</h1>
        <p>Theo dõi cây văn bản từ nghị quyết, chương trình hành động, kế hoạch đến chỉ tiêu cụ thể; phân công đơn vị thực hiện và cập nhật kết quả từng kỳ.</p>
        <div class="nq-hero-actions">
          <button class="nq-btn nq-btn-primary" onclick="NQIndicators.openDocumentForm()">+ Văn bản nguồn</button>
          <button class="nq-btn nq-btn-soft" onclick="NQIndicators.openIndicatorForm()">+ Chỉ tiêu</button>
          <button class="nq-btn nq-btn-soft" onclick="NQIndicators.openLinkForm()">Liên kết văn bản</button>
        </div>
      </div>
      <aside class="nq-hero-panel">
        <span>Tỷ lệ chỉ tiêu đạt/hoàn thành</span>
        <b>${p.rate}%</b>
        <span>${p.ok}/${p.total} chỉ tiêu đã đạt hoặc hoàn thành. Dữ liệu đang theo cấu trúc mới, anh có thể nhập tay từ đầu.</span>
      </aside>
    </section>`;
  }

  function renderTabs(){
    const tabs=[['tree','Cây văn bản'],['list','Danh sách chỉ tiêu'],['units','Theo đơn vị']];
    return `<div class="nq-tabs">${tabs.map(([v,l])=>`<button class="nq-tab ${STATE.view===v?'active':''}" onclick="NQIndicators.setView('${v}')">${l}</button>`).join('')}</div>`;
  }
  function renderKpis(){
    const p=calcProgress();
    const items=[
      ['Văn bản',STATE.docs.length,'Nguồn theo dõi'],
      ['Chỉ tiêu',p.total,'Tổng chỉ tiêu'],
      ['Đạt',p.ok,'Hoàn thành/đạt'],
      ['Đang làm',p.doing,'Đang thực hiện'],
      ['Chưa đạt',p.bad,'Cần đôn đốc'],
      ['Chưa số liệu',p.missing,'Cần cập nhật']
    ];
    return `<section class="nq-kpis">${items.map((it,idx)=>`<div class="nq-card nq-kpi" style="animation-delay:${idx*0.025}s"><p>${it[0]}</p><b>${it[1]}</b><small>${it[2]}</small></div>`).join('')}</section>`;
  }
  function renderFilters(){
    const docs=STATE.docs.map(d=>`<option value="${esc(d.id)}">${esc(d.code||'')} ${esc(d.title)}</option>`).join('');
    const units=STATE.unitOptions.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('');
    return `<section class="nq-card nq-filter">
      <div class="nq-filter-grid">
        <label class="nq-label">Văn bản<select id="nqFDoc" class="nq-field"><option value="">Tất cả</option>${docs}</select></label>
        <label class="nq-label">Loại văn bản<select id="nqFType" class="nq-field"><option value="">Tất cả</option>${opt(DOC_TYPES)}</select></label>
        <label class="nq-label">Cấp văn bản<select id="nqFLevel" class="nq-field"><option value="">Tất cả</option>${opt(DOC_LEVELS)}</select></label>
        <label class="nq-label">Đơn vị<select id="nqFUnit" class="nq-field"><option value="">Tất cả</option>${units}</select></label>
        <label class="nq-label">Trạng thái<select id="nqFStatus" class="nq-field"><option value="">Tất cả</option>${opt(STATUS)}</select></label>
        <label class="nq-label">Từ khóa<input id="nqFKeyword" class="nq-field" placeholder="Tìm văn bản, chỉ tiêu, đơn vị..." /></label>
      </div>
    </section>`;
  }

  function renderTreeView(){
    const roots=STATE.docs.filter(d=>!parentLinksOf(d.id).length).sort(sortDocs);
    const allRoots=roots.length?roots:STATE.docs.slice().sort(sortDocs);
    return `<section class="nq-board">
      <aside class="nq-side">
        <div class="nq-card p-4" style="padding:14px">
          <h2 class="nq-section-title">Cây văn bản</h2>
          <p class="nq-section-sub">Dùng để trả lời: nghị quyết có chương trình nào, chương trình có kế hoạch nào, mỗi văn bản có bao nhiêu chỉ tiêu.</p>
        </div>
        <div class="nq-card" style="padding:14px">
          <h2 class="nq-section-title">Thao tác nhanh</h2>
          <div class="nq-actions" style="justify-content:flex-start;margin-top:12px">
            <button class="nq-btn nq-btn-primary" onclick="NQIndicators.openDocumentForm()">+ Văn bản</button>
            <button class="nq-btn nq-btn-soft" onclick="NQIndicators.openLinkForm()">Liên kết</button>
          </div>
        </div>
      </aside>
      <main class="nq-main">
        <div class="nq-card nq-doc-tree">${STATE.docs.length?allRoots.map(d=>renderDocNode(d,0)).join(''):`<div class="nq-empty"><b>Chưa có văn bản nguồn</b> Bấm “+ Văn bản nguồn” để nhập nghị quyết, chương trình, kế hoạch.</div>`}</div>
      </main>
    </section>`;
  }
  function renderDocNode(d,level=0,seen=new Set()){
    if(seen.has(d.id)) return ''; seen.add(d.id);
    const count=STATE.indicators.filter(i=>i.document_id===d.id).length;
    const childLinks=linksFrom(d.id);
    const children=childLinks.map(l=>docById(l.child_document_id)).filter(Boolean).sort(sortDocs);
    const cls=level?' child':'';
    return `<div class="nq-doc-node${cls}" style="margin-left:${Math.min(level*10,30)}px">
      <div class="nq-doc-head">
        <div>
          <div class="nq-doc-code">${esc(d.code||'Chưa có số')}</div>
          <div class="nq-doc-title">${esc(d.title)}</div>
          <div class="nq-doc-meta">
            ${badge(d.document_type,'nq-badge-soft')} ${badge(d.document_level,'nq-badge-soft')} ${badge(`${count} chỉ tiêu`,'nq-badge-dark')}
          </div>
          <div class="nq-body-text" style="margin-top:8px">Tham mưu: <b>${esc(d.advisory_unit||'Chưa phân công')}</b> • Theo dõi: <b>${esc(d.lead_unit||'Chưa phân công')}</b></div>
        </div>
        <div class="nq-actions">
          <button class="nq-btn nq-btn-sm nq-btn-dark" onclick="NQIndicators.openDocumentIndicators('${d.id}')">Xem chỉ tiêu</button>
          <button class="nq-btn nq-btn-sm nq-btn-soft" onclick="NQIndicators.openDocumentForm('${d.id}')">Sửa</button>
          <button class="nq-btn nq-btn-sm nq-btn-primary" onclick="NQIndicators.openIndicatorForm(null,'${d.id}')">+ Chỉ tiêu</button>
        </div>
      </div>
      ${children.length?`<div style="margin-top:10px;display:grid;gap:8px">${children.map(c=>renderDocNode(c,level+1,new Set(seen))).join('')}</div>`:''}
    </div>`;
  }

  function renderListView(){
    const list=filteredIndicators();
    return `<section class="nq-card nq-table-card">
      <div class="nq-table-head">
        <div><h2 class="nq-section-title">Danh sách chỉ tiêu</h2><p class="nq-section-sub">Đang hiển thị ${list.length}/${STATE.indicators.length} chỉ tiêu.</p></div>
        <div class="nq-actions"><button class="nq-btn nq-btn-primary" onclick="NQIndicators.openIndicatorForm()">+ Chỉ tiêu</button></div>
      </div>
      <div class="nq-list">${list.length?list.map(renderIndicatorRow).join(''):`<div class="nq-empty"><b>Chưa có chỉ tiêu</b> Bấm “+ Chỉ tiêu” để nhập chỉ tiêu cụ thể theo văn bản.</div>`}</div>
    </section>`;
  }
  function renderIndicatorRow(i){
    const d=docById(i.document_id)||{};
    const units=assignmentsOf(i.id);
    const isChild=!!i.parent_indicator_id;
    return `<div class="nq-row ${isChild?'child':''}">
      <div><div class="nq-code">${esc(i.code||'CT')}</div><div class="nq-ordinal">STT ${esc(i.ordinal??'—')}</div></div>
      <div><div class="nq-ind-title">${esc(i.title)}</div><div class="nq-muted">${esc(d.code||'')} • ${esc(d.title||'Chưa có văn bản')}</div></div>
      <div><div class="nq-body-text"><b>${esc(i.group_name||'Chưa phân nhóm')}</b></div><div class="nq-muted">${esc(measureText(i.measure_type))}</div></div>
      <div><div class="nq-body-text">${units.length?units.slice(0,3).map(roleBadge).join(' '):'<span class="nq-muted">Chưa phân công đơn vị</span>'}</div></div>
      <div><div class="nq-body-text"><b>${esc(targetLabel(i))}</b></div>${badge(i.status)}</div>
      <div class="nq-actions">
        <button class="nq-btn nq-btn-sm nq-btn-soft" onclick="NQIndicators.openDetail('${i.id}')">Chi tiết</button>
        <button class="nq-btn nq-btn-sm nq-btn-soft" onclick="NQIndicators.openIndicatorForm('${i.id}')">Sửa</button>
        <button class="nq-btn nq-btn-sm nq-btn-primary" onclick="NQIndicators.openIndicatorForm(null,'${i.document_id}','${i.id}')">+ Con</button>
      </div>
    </div>`;
  }

  function renderUnitsView(){
    const unitMap=new Map();
    STATE.assignments.forEach(a=>{
      const key=normalizeUnitName(a.unit_name)||'Chưa phân công';
      if(!unitMap.has(key)) unitMap.set(key,[]);
      unitMap.get(key).push(a);
    });
    const cards=[...unitMap.entries()].sort((a,b)=>a[0].localeCompare(b[0],'vi',{numeric:true,sensitivity:'base'}));
    return `<section class="nq-main">
      <div class="nq-card" style="padding:16px"><h2 class="nq-section-title">Theo đơn vị</h2><p class="nq-section-sub">Trả lời câu hỏi: mỗi đơn vị đang chủ trì, phối hợp, thực hiện những chỉ tiêu nào.</p></div>
      <div class="nq-unit-grid">${cards.length?cards.map(([unit,items])=>renderUnitCard(unit,items)).join(''):`<div class="nq-card nq-empty"><b>Chưa phân công đơn vị</b> Khi nhập chỉ tiêu, chọn đơn vị thực hiện từ danh sách.</div>`}</div>
    </section>`;
  }
  function renderUnitCard(unit,items){
    const primary=items.filter(a=>a.is_primary||a.role==='Chủ trì').length;
    const coop=items.filter(a=>!a.is_primary&&a.role!=='Chủ trì').length;
    const bad=items.filter(a=>{const i=indicatorById(a.indicator_id); return i&&['Chưa đạt','Quá hạn'].includes(i.status);}).length;
    return `<div class="nq-card nq-unit-card">
      <h3>${esc(unit)}</h3>
      <div class="nq-unit-stats"><div><b>${items.length}</b><span>Tổng</span></div><div><b>${primary}</b><span>Chủ trì</span></div><div><b>${bad}</b><span>Cần xử lý</span></div></div>
      <div class="nq-body-text">Phối hợp/thực hiện: <b>${coop}</b></div>
      <button class="nq-btn nq-btn-sm nq-btn-soft" onclick="NQIndicators.filterByUnit('${esc(unit).replace(/'/g,"\\'")}')">Xem chỉ tiêu</button>
    </div>`;
  }

  function wireFilters(){
    const map=[['nqFDoc','doc'],['nqFType','type'],['nqFLevel','level'],['nqFUnit','unit'],['nqFStatus','status'],['nqFKeyword','keyword']];
    map.forEach(([idv,key])=>{
      const el=document.getElementById(idv); if(!el) return;
      el.value=STATE.filters[key]||'';
      const evt=key==='keyword'?'input':'change';
      el.addEventListener(evt, debounce(()=>{STATE.filters[key]=el.value; render();}, key==='keyword'?220:0));
    });
  }
  function debounce(fn,delay=200){let t;return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),delay);};}

  function render(){
    const root=document.getElementById('nqIndicatorsRoot'); if(!root) return;
    root.className='nq-root';
    root.innerHTML=`${renderHero()}${renderTabs()}${renderKpis()}${renderFilters()}${STATE.view==='tree'?renderTreeView():STATE.view==='units'?renderUnitsView():renderListView()}${drawerShell()}`;
    wireFilters();
  }

  function drawerShell(){
    return `<div id="nqDrawerBackdrop" class="nq-drawer-backdrop" onclick="NQIndicators.closeDrawer()"></div>
      <aside id="nqDrawer" class="nq-drawer" aria-hidden="true">
        <div class="nq-drawer-head"><div><h2 id="nqDrawerTitle" class="nq-section-title">Chi tiết</h2><p id="nqDrawerSub" class="nq-section-sub"></p></div><button class="nq-btn nq-btn-soft" onclick="NQIndicators.closeDrawer()">Đóng</button></div>
        <div id="nqDrawerBody" class="nq-drawer-body"></div>
      </aside>`;
  }
  function openDrawer(title,sub,body){
    document.getElementById('nqDrawerTitle').textContent=title;
    document.getElementById('nqDrawerSub').textContent=sub||'';
    document.getElementById('nqDrawerBody').innerHTML=body;
    document.getElementById('nqDrawerBackdrop').classList.add('open');
    document.getElementById('nqDrawer').classList.add('open');
    lockScroll();
  }
  function closeDrawer(){
    const b=document.getElementById('nqDrawerBackdrop'), d=document.getElementById('nqDrawer');
    if(b) b.classList.remove('open'); if(d) d.classList.remove('open'); unlockScroll();
  }

  function openDocumentForm(docId=''){
    const d=docById(docId)||{};
    const parent=parentLinksOf(docId)[0]||{};
    const docOptions=STATE.docs.filter(x=>x.id!==docId).map(x=>`<option value="${esc(x.id)}" ${parent.parent_document_id===x.id?'selected':''}>${esc(x.code||'')} - ${esc(x.title)}</option>`).join('');
    const body=`<form id="nqDocForm" class="nq-form-section" onsubmit="NQIndicators.saveDocument(event,'${esc(docId)}')">
      <h3>Thông tin văn bản nguồn</h3>
      <div class="nq-form-grid">
        <label class="nq-label">Số/ký hiệu<input name="code" class="nq-field" value="${esc(d.code||'')}" placeholder="VD: 01-NQ/ĐU" /></label>
        <label class="nq-label">Loại văn bản<select name="document_type" class="nq-field">${selectedIn(DOC_TYPES,d.document_type||'')}</select></label>
        <label class="nq-label span-2">Tên/trích yếu văn bản<input name="title" required class="nq-field" value="${esc(d.title||'')}" /></label>
        <label class="nq-label">Cấp văn bản<select name="document_level" class="nq-field">${selectedIn(DOC_LEVELS,d.document_level||'Phường')}</select></label>
        <label class="nq-label">Ngày ban hành<input name="issued_date" type="date" class="nq-field" value="${esc(d.issued_date||'')}" /></label>
        <label class="nq-label">Đơn vị tham mưu<select name="advisory_unit" class="nq-field"><option value="">Chọn đơn vị</option>${selectedIn(STATE.unitOptions,d.advisory_unit||'')}</select></label>
        <label class="nq-label">Đơn vị theo dõi<select name="lead_unit" class="nq-field"><option value="">Chọn đơn vị</option>${selectedIn(STATE.unitOptions,d.lead_unit||'')}</select></label>
        <label class="nq-label">Từ năm<input name="period_from" type="number" class="nq-field" value="${esc(d.period_from||2025)}" /></label>
        <label class="nq-label">Đến năm<input name="period_to" type="number" class="nq-field" value="${esc(d.period_to||2030)}" /></label>
        <label class="nq-label">Văn bản cha/liên kết<select name="parent_document_id" class="nq-field"><option value="">Không có</option>${docOptions}</select><span class="nq-help">Anh tự link: Nghị quyết → Chương trình → Kế hoạch.</span></label>
        <label class="nq-label">Kiểu liên kết<select name="link_type" class="nq-field">${selectedIn(LINK_TYPES,parent.link_type||'triển khai')}</select></label>
        <label class="nq-label">Thứ tự<input name="sort_order" type="number" class="nq-field" value="${esc(d.sort_order||0)}" /></label>
        <label class="nq-label">Tên file/link<input name="file_name" class="nq-field" value="${esc(d.file_name||'')}" /></label>
        <label class="nq-label span-2">Tóm tắt<textarea name="summary" class="nq-field">${esc(d.summary||'')}</textarea></label>
      </div>
      <div class="nq-actions"><button type="button" class="nq-btn nq-btn-soft" onclick="NQIndicators.closeDrawer()">Hủy</button><button class="nq-btn nq-btn-primary">Lưu văn bản</button></div>
    </form>`;
    openDrawer(docId?'Sửa văn bản nguồn':'+ Văn bản nguồn','Quản lý nghị quyết, chương trình, kế hoạch và đơn vị tham mưu.',body);
  }

  async function saveDocument(e,docId=''){
    e.preventDefault(); const client=getClient(); const fd=new FormData(e.target); const newId=docId||id('doc');
    const row={
      id:newId, code:fd.get('code')||null, title:String(fd.get('title')||'').trim(), document_type:fd.get('document_type')||'Văn bản', document_level:fd.get('document_level')||'Phường',
      advisory_unit:fd.get('advisory_unit')||null, lead_unit:fd.get('lead_unit')||null, issued_date:fd.get('issued_date')||null, period_from:ival(fd.get('period_from')), period_to:ival(fd.get('period_to')),
      summary:fd.get('summary')||null, file_name:fd.get('file_name')||null, sort_order:ival(fd.get('sort_order'))||0, is_active:true
    };
    if(!row.title){toast('Chưa nhập tên văn bản');return;}
    const res=await client.from(TABLES.documents).upsert(row,{onConflict:'id'}); if(res.error){toast('Lỗi lưu văn bản: '+res.error.message);return;}
    await client.from(TABLES.links).delete().eq('child_document_id',newId);
    const parent=fd.get('parent_document_id');
    if(parent){
      const link={id:id('link'),parent_document_id:parent,child_document_id:newId,link_type:fd.get('link_type')||'triển khai'};
      const lr=await client.from(TABLES.links).insert(link); if(lr.error){toast('Văn bản đã lưu, nhưng lỗi liên kết: '+lr.error.message);}
    }
    toast('Đã lưu văn bản nguồn'); closeDrawer(); await loadData(true); render();
  }

  function openLinkForm(){
    const docs=STATE.docs.map(d=>`<option value="${esc(d.id)}">${esc(d.code||'')} - ${esc(d.title)}</option>`).join('');
    const body=`<form class="nq-form-section" onsubmit="NQIndicators.saveLink(event)">
      <h3>Liên kết văn bản cha/con</h3>
      <label class="nq-label">Văn bản cha<select name="parent" required class="nq-field">${docs}</select></label>
      <label class="nq-label">Văn bản con<select name="child" required class="nq-field">${docs}</select></label>
      <label class="nq-label">Kiểu liên kết<select name="type" class="nq-field">${opt(LINK_TYPES,'triển khai')}</select></label>
      <label class="nq-label">Ghi chú<textarea name="note" class="nq-field"></textarea></label>
      <div class="nq-actions"><button class="nq-btn nq-btn-primary">Lưu liên kết</button></div>
    </form>`;
    openDrawer('Liên kết văn bản','Tự thiết lập cây Nghị quyết → Chương trình → Kế hoạch.',body);
  }
  async function saveLink(e){
    e.preventDefault(); const fd=new FormData(e.target); const parent=fd.get('parent'), child=fd.get('child');
    if(parent===child){toast('Văn bản cha và con không được trùng');return;}
    const row={id:id('link'),parent_document_id:parent,child_document_id:child,link_type:fd.get('type')||'triển khai',note:fd.get('note')||null};
    const res=await getClient().from(TABLES.links).upsert(row,{onConflict:'parent_document_id,child_document_id,link_type'});
    if(res.error){toast('Lỗi lưu liên kết: '+res.error.message);return;}
    toast('Đã lưu liên kết'); closeDrawer(); await loadData(true); render();
  }

  function openIndicatorForm(indId='',docId='',parentId=''){
    const i=indicatorById(indId)||{}; const currentDoc=docId||i.document_id||''; const currentParent=parentId||i.parent_indicator_id||'';
    const docOptions=STATE.docs.map(d=>`<option value="${esc(d.id)}" ${d.id===currentDoc?'selected':''}>${esc(d.code||'')} - ${esc(d.title)}</option>`).join('');
    const parentOptions=STATE.indicators.filter(x=>x.id!==indId).map(x=>`<option value="${esc(x.id)}" ${x.id===currentParent?'selected':''}>${esc(x.code||'')} - ${esc(x.title)}</option>`).join('');
    const units=assignmentsOf(indId); const primary=(units.find(x=>x.is_primary)||{}).unit_name||''; const co=units.filter(x=>!x.is_primary).map(x=>x.unit_name);
    const body=`<form class="nq-form-section" onsubmit="NQIndicators.saveIndicator(event,'${esc(indId)}')">
      <h3>1. Nguồn chỉ tiêu</h3>
      <div class="nq-form-grid">
        <label class="nq-label span-2">Văn bản chứa chỉ tiêu<select required name="document_id" class="nq-field"><option value="">Chọn văn bản</option>${docOptions}</select></label>
        <label class="nq-label span-2">Chỉ tiêu mẹ nếu là chỉ tiêu con<select name="parent_indicator_id" class="nq-field"><option value="">Không có</option>${parentOptions}</select></label>
        <label class="nq-label">STT<input name="ordinal" type="number" class="nq-field" value="${esc(i.ordinal||'')}" /></label>
        <label class="nq-label">Mã chỉ tiêu<input name="code" class="nq-field" value="${esc(i.code||'')}" placeholder="VD: CT.14" /></label>
        <label class="nq-label span-2">Nội dung rút gọn<input required name="title" class="nq-field" value="${esc(i.title||'')}" /></label>
        <label class="nq-label span-2">Trích nguyên văn<textarea name="source_excerpt" class="nq-field">${esc(i.source_excerpt||'')}</textarea></label>
        <label class="nq-label">Nhóm lĩnh vực<input name="group_name" class="nq-field" value="${esc(i.group_name||'')}" /></label>
        <label class="nq-label">Mức ưu tiên<select name="priority" class="nq-field">${selectedIn(PRIORITIES,i.priority||'Bình thường')}</select></label>
      </div>
      <h3>2. Đơn vị thực hiện</h3>
      <div class="nq-form-grid">
        <label class="nq-label">Đơn vị chủ trì<select name="primary_unit" class="nq-field"><option value="">Chọn đơn vị</option>${selectedIn(STATE.unitOptions,primary)}</select></label>
        <label class="nq-label">Vai trò chủ trì<select name="primary_role" class="nq-field">${selectedIn(ROLES,(units.find(x=>x.is_primary)||{}).role||'Chủ trì')}</select></label>
        <label class="nq-label span-2">Đơn vị phối hợp/thực hiện<select name="co_units" class="nq-field" multiple>${selectedMany(STATE.unitOptions,co)}</select><span class="nq-help">Giữ Ctrl để chọn nhiều đơn vị. Chọn “Tất cả đơn vị” nếu chỉ tiêu áp dụng toàn hệ thống.</span></label>
      </div>
      <h3>3. Cách đo và mốc theo dõi</h3>
      <div class="nq-form-grid">
        <label class="nq-label">Loại đo<select name="measure_type" class="nq-field">${optPairs(MEASURE_TYPES,i.measure_type||'mixed')}</select></label>
        <label class="nq-label">Kiểu so sánh<select name="compare_operator" class="nq-field">${optPairs(COMPARE_OPS,i.compare_operator||'note')}</select></label>
        <label class="nq-label">Giá trị mục tiêu<input name="target_value" class="nq-field" value="${esc(i.target_value??'')}" /></label>
        <label class="nq-label">Đơn vị tính<input name="target_unit" class="nq-field" value="${esc(i.target_unit||'')}" placeholder="%, tuyến, mô hình..." /></label>
        <label class="nq-label">Giá trị thấp<input name="target_min" class="nq-field" value="${esc(i.target_min??'')}" /></label>
        <label class="nq-label">Giá trị cao<input name="target_max" class="nq-field" value="${esc(i.target_max??'')}" /></label>
        <label class="nq-label span-2">Mục tiêu hiển thị<input name="target_label" class="nq-field" value="${esc(i.target_label||'')}" placeholder="VD: >97% hồ sơ đúng hạn hằng năm" /></label>
        <label class="nq-label">Chu kỳ<select name="cycle" class="nq-field">${selectedIn(CYCLES,i.cycle||'Năm')}</select></label>
        <label class="nq-label">Phạm vi theo dõi<select name="tracking_scope" class="nq-field">${selectedIn(SCOPES,i.tracking_scope||'Hằng năm')}</select></label>
        <label class="nq-label">Năm/mốc hoàn thành<input name="target_year" type="number" class="nq-field" value="${esc(i.target_year||2030)}" /></label>
        <label class="nq-label">Trạng thái<select name="status" class="nq-field">${selectedIn(STATUS,i.status||'Chưa có số liệu')}</select></label>
        <label class="nq-label">Thứ tự<input name="sort_order" type="number" class="nq-field" value="${esc(i.sort_order||i.ordinal||0)}" /></label>
        <label class="nq-label">Cần tách chỉ tiêu con?<select name="is_split_recommended" class="nq-field"><option value="false">Không</option><option value="true" ${i.is_split_recommended?'selected':''}>Có</option></select></label>
      </div>
      <div class="nq-actions"><button type="button" class="nq-btn nq-btn-soft" onclick="NQIndicators.closeDrawer()">Hủy</button><button class="nq-btn nq-btn-primary">Lưu chỉ tiêu</button></div>
    </form>`;
    openDrawer(indId?'Sửa chỉ tiêu':'+ Chỉ tiêu','Nhập chỉ tiêu cụ thể, chỉ tiêu con và phân công đơn vị thực hiện.',body);
  }

  async function saveIndicator(e,indId=''){
    e.preventDefault(); const client=getClient(); const fd=new FormData(e.target); const newId=indId||id('ind');
    const row={
      id:newId, document_id:fd.get('document_id'), parent_indicator_id:fd.get('parent_indicator_id')||null, ordinal:ival(fd.get('ordinal')), code:fd.get('code')||null,
      title:String(fd.get('title')||'').trim(), source_excerpt:fd.get('source_excerpt')||null, group_name:fd.get('group_name')||null,
      measure_type:fd.get('measure_type')||'mixed', compare_operator:fd.get('compare_operator')||'note', target_value:nval(fd.get('target_value')), target_min:nval(fd.get('target_min')), target_max:nval(fd.get('target_max')),
      target_unit:fd.get('target_unit')||null, target_label:fd.get('target_label')||null, cycle:fd.get('cycle')||'Năm', tracking_scope:fd.get('tracking_scope')||null, target_year:ival(fd.get('target_year')),
      status:fd.get('status')||'Chưa có số liệu', priority:fd.get('priority')||'Bình thường', sort_order:ival(fd.get('sort_order'))||0, is_split_recommended:fd.get('is_split_recommended')==='true', is_active:true
    };
    if(!row.document_id || !row.title){toast('Chưa chọn văn bản hoặc chưa nhập nội dung chỉ tiêu');return;}
    const res=await client.from(TABLES.indicators).upsert(row,{onConflict:'id'}); if(res.error){toast('Lỗi lưu chỉ tiêu: '+res.error.message);return;}
    await client.from(TABLES.units).delete().eq('indicator_id',newId);
    const unitRows=[];
    const primary=normalizeUnitName(fd.get('primary_unit'));
    if(primary && primary!=='Chưa phân công') unitRows.push({id:id('iu'),indicator_id:newId,unit_name:primary,role:fd.get('primary_role')||'Chủ trì',is_primary:true});
    const co=uniqueUnits(fd.getAll('co_units').filter(Boolean));
    co.forEach(u=>{ if(u!==primary) unitRows.push({id:id('iu'),indicator_id:newId,unit_name:u,role:u==='Tất cả đơn vị'?'Tất cả đơn vị':'Phối hợp',is_primary:false}); });
    if(unitRows.length){ const ur=await client.from(TABLES.units).insert(unitRows); if(ur.error){toast('Chỉ tiêu đã lưu, nhưng lỗi phân công đơn vị: '+ur.error.message);} }
    await refreshChildCount(row.parent_indicator_id);
    toast('Đã lưu chỉ tiêu'); closeDrawer(); await loadData(true); render();
  }
  async function refreshChildCount(parentId){
    if(!parentId) return;
    const client=getClient();
    const cnt=STATE.indicators.filter(i=>i.parent_indicator_id===parentId).length+1;
    await client.from(TABLES.indicators).update({child_count:cnt}).eq('id',parentId);
  }


  function indicatorsOfDocument(docId){
    return STATE.indicators.filter(i=>i.document_id===docId && !i.parent_indicator_id).sort(sortIndicators);
  }
  function renderDocIndicatorCard(i){
    const units=assignmentsOf(i.id);
    const children=childrenOf(i.id);
    return `<div class="nq-doc-ind-card">
      <button class="nq-doc-ind-main" onclick="NQIndicators.openDetail('${i.id}')">
        <span class="nq-code">${esc(i.code||'CT')}</span>
        <span class="nq-doc-ind-title">${esc(i.title)}</span>
        <span class="nq-doc-ind-meta">STT ${esc(i.ordinal??'—')} • ${esc(i.group_name||'Chưa phân nhóm')} • ${esc(targetLabel(i))}</span>
        <span class="nq-doc-ind-units">${units.length?units.slice(0,4).map(roleBadge).join(' '):'<span class="nq-muted">Chưa phân công đơn vị</span>'}</span>
      </button>
      <div class="nq-doc-ind-side">${badge(i.status)}${children.length?`<span class="nq-badge nq-badge-soft">${children.length} chỉ tiêu con</span>`:''}</div>
      ${children.length?`<div class="nq-doc-child-list">${children.map(c=>`<button onclick="NQIndicators.openDetail('${c.id}')"><b>${esc(c.code||'CT con')}</b><span>${esc(c.title)}</span>${badge(c.status)}</button>`).join('')}</div>`:''}
    </div>`;
  }
  async function openDocumentIndicators(docId){
    const d=docById(docId); if(!d) return;
    const list=indicatorsOfDocument(docId);
    const childDocs=linksFrom(docId).map(l=>docById(l.child_document_id)).filter(Boolean).sort(sortDocs);
    const body=`<div class="nq-detail-grid">
      <div class="nq-detail-box"><strong>Văn bản</strong><p>${esc(d.code||'Chưa có số')} - ${esc(d.title)}</p></div>
      <div class="nq-detail-box"><strong>Phân công theo dõi</strong><p>Tham mưu: <b>${esc(normalizeUnitName(d.advisory_unit||'Chưa phân công'))}</b><br>Theo dõi: <b>${esc(normalizeUnitName(d.lead_unit||'Chưa phân công'))}</b></p></div>
    </div>
    ${childDocs.length?`<div class="nq-detail-box"><strong>Văn bản con</strong><div class="nq-doc-child-docs">${childDocs.map(c=>`<button onclick="NQIndicators.openDocumentIndicators('${c.id}')"><b>${esc(c.code||'VB')}</b><span>${esc(c.title)}</span></button>`).join('')}</div></div>`:''}
    <div class="nq-detail-box"><strong>Danh sách chỉ tiêu của văn bản</strong><div class="nq-doc-ind-list">${list.length?list.map(renderDocIndicatorCard).join(''):'<div class="nq-empty"><b>Văn bản này chưa có chỉ tiêu</b> Bấm “+ Chỉ tiêu” để nhập chỉ tiêu cho văn bản này.</div>'}</div></div>
    <div class="nq-actions"><button class="nq-btn nq-btn-primary" onclick="NQIndicators.openIndicatorForm(null,'${d.id}')">+ Chỉ tiêu cho văn bản này</button><button class="nq-btn nq-btn-soft" onclick="NQIndicators.openDocumentForm('${d.id}')">Sửa văn bản</button></div>`;
    openDrawer('Chỉ tiêu trong văn bản',`${d.code||''} ${d.title||''}`,body);
  }

  async function openDetail(indId){
    const i=indicatorById(indId); if(!i) return;
    const d=docById(i.document_id)||{}; const units=assignmentsOf(indId); const children=childrenOf(indId);
    const res=await getClient().from(TABLES.updates).select('*').eq('indicator_id',indId).order('report_year',{ascending:false}).order('created_at',{ascending:false});
    const updates=res.error?[]:(res.data||[]);
    const body=`<div class="nq-detail-grid">
      <div class="nq-detail-box"><strong>Văn bản nguồn</strong><p>${esc(d.code||'')} - ${esc(d.title||'')}</p></div>
      <div class="nq-detail-box"><strong>Mục tiêu</strong><p>${esc(targetLabel(i))}</p>${badge(i.status)}</div>
      <div class="nq-detail-box"><strong>Đơn vị thực hiện</strong><p>${units.length?units.map(roleBadge).join(' '):'Chưa phân công'}</p></div>
      <div class="nq-detail-box"><strong>Chu kỳ/mốc</strong><p>${esc(i.cycle||'')} • ${esc(i.tracking_scope||'')} • ${esc(i.target_year||'')}</p></div>
    </div>
    <div class="nq-detail-box"><strong>Trích nguyên văn</strong><p>${esc(i.source_excerpt||i.title)}</p></div>
    ${children.length?`<div class="nq-detail-box"><strong>Chỉ tiêu con</strong><div class="nq-list">${children.map(renderIndicatorRow).join('')}</div></div>`:''}
    <div class="nq-detail-box"><strong>Cập nhật kỳ báo cáo</strong><div class="nq-actions" style="justify-content:flex-start;margin-bottom:10px"><button class="nq-btn nq-btn-primary" onclick="NQIndicators.openUpdateForm('${i.id}')">+ Cập nhật kỳ</button></div><div class="nq-timeline">${updates.length?updates.map(u=>`<div class="nq-timeline-item"><b>${esc(u.report_period)} ${esc(u.report_year)} • ${esc(u.assessment)}</b><p>${esc(u.actual_text||'')}</p><p class="nq-muted">${esc(u.reason||'')}</p></div>`).join(''):'<div class="nq-muted">Chưa có cập nhật kỳ.</div>'}</div></div>
    <div class="nq-actions"><button class="nq-btn nq-btn-soft" onclick="NQIndicators.openIndicatorForm('${i.id}')">Sửa chỉ tiêu</button><button class="nq-btn nq-btn-primary" onclick="NQIndicators.openIndicatorForm(null,'${i.document_id}','${i.id}')">+ Chỉ tiêu con</button></div>`;
    openDrawer(i.code||'Chi tiết chỉ tiêu',i.title,body);
  }

  function openUpdateForm(indId){
    const i=indicatorById(indId); if(!i) return;
    const units=assignmentsOf(indId).map(a=>a.unit_name);
    const body=`<form class="nq-form-section" onsubmit="NQIndicators.saveUpdate(event,'${indId}')">
      <h3>Cập nhật kết quả kỳ báo cáo</h3>
      <div class="nq-form-grid">
        <label class="nq-label">Kỳ báo cáo<select name="report_period" class="nq-field">${opt(PERIODS,'Năm')}</select></label>
        <label class="nq-label">Năm<input name="report_year" type="number" class="nq-field" value="${new Date().getFullYear()}" /></label>
        <label class="nq-label">Đơn vị cập nhật<select name="unit_name" class="nq-field"><option value="">Toàn phường</option>${selectedIn(unique(units), '')}</select></label>
        <label class="nq-label">Đánh giá<select name="assessment" class="nq-field">${selectedIn(STATUS,'Đang thực hiện')}</select></label>
        <label class="nq-label">Số liệu thực tế<input name="actual_value" class="nq-field" /></label>
        <label class="nq-label">Tiến độ %<input name="progress_percent" class="nq-field" /></label>
        <label class="nq-label span-2">Kết quả bằng chữ<textarea name="actual_text" class="nq-field"></textarea></label>
        <label class="nq-label span-2">Khó khăn/nguyên nhân<textarea name="reason" class="nq-field"></textarea></label>
        <label class="nq-label span-2">Giải pháp<textarea name="solution" class="nq-field"></textarea></label>
        <label class="nq-label span-2">Minh chứng/link<input name="evidence" class="nq-field" /></label>
      </div>
      <div class="nq-actions"><button class="nq-btn nq-btn-primary">Lưu cập nhật</button></div>
    </form>`;
    openDrawer('Cập nhật kỳ',i.title,body);
  }
  async function saveUpdate(e,indId){
    e.preventDefault(); const fd=new FormData(e.target); const row={id:id('upd'),indicator_id:indId,report_period:fd.get('report_period'),report_year:ival(fd.get('report_year'))||new Date().getFullYear(),unit_name:fd.get('unit_name')||null,actual_value:nval(fd.get('actual_value')),actual_text:fd.get('actual_text')||null,assessment:fd.get('assessment')||'Đang thực hiện',progress_percent:nval(fd.get('progress_percent')),reason:fd.get('reason')||null,solution:fd.get('solution')||null,evidence:fd.get('evidence')||null};
    const client=getClient(); const res=await client.from(TABLES.updates).insert(row); if(res.error){toast('Lỗi lưu cập nhật: '+res.error.message);return;}
    await client.from(TABLES.indicators).update({status:row.assessment}).eq('id',indId);
    toast('Đã lưu cập nhật kỳ'); closeDrawer(); await loadData(true); render();
  }

  async function mount(){
    ensureCss();
    const root=document.getElementById('nqIndicatorsRoot'); if(!root) return;
    root.className='nq-root'; root.innerHTML='<div class="nq-card nq-empty"><b>Đang tải module chỉ tiêu...</b> Vui lòng chờ trong giây lát.</div>';
    try{ await loadData(); render(); }catch(err){ root.innerHTML=`<div class="nq-card nq-empty"><b>Lỗi tải module</b><p>${esc(err.message||err)}</p></div>`; }
  }
  function setView(v){STATE.view=v; render();}
  function filterByUnit(unit){STATE.filters.unit=unit; STATE.view='list'; render();}

  window.NQIndicators={mount,setView,openDocumentForm,saveDocument,openLinkForm,saveLink,openIndicatorForm,saveIndicator,openDocumentIndicators,openDetail,openUpdateForm,saveUpdate,closeDrawer,filterByUnit};
})();

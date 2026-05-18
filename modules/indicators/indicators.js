(function(){
  const STATE = {
    loaded:false,
    programs:[],
    indicators:[],
    filters:{program:'',group:'',unit:'',year:'',status:'',keyword:''},
    client:null,
    saving:false
  };

  const TABLES = {
    programs:'ubkt_programs',
    indicators:'ubkt_indicators',
    updates:'ubkt_indicator_updates'
  };

  const STATUS_OPTIONS=['Chưa có số liệu','Chưa đến kỳ','Đang thực hiện','Đạt','Chưa đạt','Hoàn thành','Quá hạn'];
  const PRIORITY_OPTIONS=['Bình thường','Cao','Rất cao'];
  const CYCLE_OPTIONS=['Quý','6 tháng','Năm','Hằng năm','Theo kế hoạch','Quý/Năm'];
  const MEASURE_TYPE_OPTIONS=[['percentage','Tỷ lệ %'],['number','Số lượng'],['growth','Tăng/giảm theo năm'],['milestone','Định tính/mốc hoàn thành'],['mixed','Chỉ tiêu hỗn hợp']];
  const COMPARE_OPTIONS=[['>=','Đạt từ / lớn hơn hoặc bằng'],['>','Lớn hơn'],['<=','Nhỏ hơn hoặc bằng'],['=','Bằng'],['range','Trong khoảng'],['complete','Hoàn thành/chưa hoàn thành'],['note','Theo mô tả']];
  const TRACKING_SCOPE_OPTIONS=['Hằng năm','Theo quý','6 tháng','Đến 2030','Giai đoạn 2025-2030','Theo kế hoạch'];
  const PERIOD_OPTIONS=['Quý I','6 tháng','Quý III','Năm','Sơ kết','Tổng kết'];

  function esc(s){return String(s ?? '').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
  function debounce(fn,delay=220){let t;return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),delay);};}
  function id(prefix){return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;}
  function numOrNull(v){const s=String(v??'').trim(); if(!s) return null; const n=Number(s.replace(',','.')); return Number.isFinite(n)?n:null;}
  function intOrNull(v){const n=parseInt(String(v??'').trim(),10); return Number.isFinite(n)?n:null;}
  function arrFromComma(v){return String(v||'').split(',').map(x=>x.trim()).filter(Boolean);}
  function todayYear(){return new Date().getFullYear();}

  function ensureCss(){
    if(document.getElementById('nqIndicatorsCss')) return;
    const link=document.createElement('link');
    link.id='nqIndicatorsCss';
    link.rel='stylesheet';
    link.href='./modules/indicators/indicators.css';
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

  async function loadData(force=false){
    if(STATE.loaded && !force) return;
    const client=getClient();
    if(!client) throw new Error('Chưa cấu hình Supabase URL/anon key hoặc chưa tải supabase-js.');

    const [pRes,iRes]=await Promise.all([
      client.from(TABLES.programs).select('*').eq('is_active',true).order('sort_order',{ascending:true}),
      client.from(TABLES.indicators).select('*').eq('is_active',true).order('program_id',{ascending:true}).order('sort_order',{ascending:true})
    ]);
    if(pRes.error) throw pRes.error;
    if(iRes.error) throw iRes.error;
    STATE.programs=pRes.data||[];
    STATE.indicators=iRes.data||[];
    STATE.loaded=true;
  }

  function programOf(id){return STATE.programs.find(p=>p.id===id)||{};}
  function childrenOf(parentId){
    return STATE.indicators.filter(i=>i.parent_indicator_id===parentId).sort((a,b)=>{
      const ao=indicatorSortValue(a), bo=indicatorSortValue(b);
      if(ao!==bo) return ao-bo;
      return String(a.code||'').localeCompare(String(b.code||''),'vi',{numeric:true,sensitivity:'base'});
    });
  }
  function parentOf(child){return child?.parent_indicator_id ? (STATE.indicators.find(i=>i.id===child.parent_indicator_id)||null) : null;}
  function nextChildCode(parent){
    const kids=childrenOf(parent.id);
    const base=String(parent.code||'CT').trim();
    return `${base}.${kids.length+1}`;
  }
  function nextChildSort(parent){
    const base=Number(parent.sort_order ?? parent.ordinal ?? 0);
    const kids=childrenOf(parent.id);
    return base*100 + kids.length + 1;
  }
  function needsSplit(i){
    return !i.parent_indicator_id && ((i.data && i.data.should_split===true) || i.measure_type==='mixed');
  }
  function statusSummary(list){
    const total=list.length;
    const ok=list.filter(i=>i.status==='Đạt'||i.status==='Hoàn thành').length;
    const bad=list.filter(i=>i.status==='Chưa đạt'||i.status==='Quá hạn').length;
    const doing=list.filter(i=>i.status==='Đang thực hiện'||i.status==='Chưa đến kỳ').length;
    const missing=list.filter(i=>!i.status||i.status==='Chưa có số liệu').length;
    return {total,ok,bad,doing,missing};
  }
  function statusClass(s){
    if(s==='Đạt' || s==='Hoàn thành') return 'nq-badge-ok';
    if(s==='Chưa đạt' || s==='Quá hạn') return 'nq-badge-bad';
    if(s==='Đang thực hiện') return 'nq-badge-doing';
    if(s==='Chưa đến kỳ') return 'nq-badge-soon';
    return 'nq-badge-wait';
  }
  function badge(s){return `<span class="nq-badge ${statusClass(s)}">${esc(s||'Chưa có số liệu')}</span>`;}
  function optionList(values,current=''){
    return values.map(v=>`<option value="${esc(v)}" ${String(current)===String(v)?'selected':''}>${esc(v)}</option>`).join('');
  }
  function pairOptionList(pairs,current=''){
    return pairs.map(([value,label])=>`<option value="${esc(value)}" ${String(current)===String(value)?'selected':''}>${esc(label)}</option>`).join('');
  }
  function indicatorSortValue(i){
    const n=Number(i.ordinal ?? i.sort_order ?? 999999);
    return Number.isFinite(n)?n:999999;
  }
  function indicatorTargetLabel(i){
    if(i.target_label) return i.target_label;
    if(i.compare_operator==='range' && i.target_min!=null && i.target_max!=null) return `Từ ${i.target_min} đến ${i.target_max}${i.target_unit?' '+i.target_unit:''}`;
    if(i.target_value!=null) return `${i.compare_operator||'>='} ${i.target_value}${i.target_unit?' '+i.target_unit:''}`;
    return i.target_text || '—';
  }
  function measureLabel(v){
    const f=MEASURE_TYPE_OPTIONS.find(x=>x[0]===v);
    return f?f[1]:(v||'—');
  }

  function filteredIndicators(){
    const f=STATE.filters;
    const kw=norm(f.keyword);
    return STATE.indicators.filter(i=>{
      if(f.program && i.program_id!==f.program) return false;
      if(f.group && i.group_name!==f.group) return false;
      if(f.unit && i.lead_unit!==f.unit) return false;
      if(f.year && String(i.target_year||'')!==String(f.year)) return false;
      if(f.status && (i.status||'')!==f.status) return false;
      if(kw){
        const p=programOf(i.program_id);
        const hay=norm(`${i.code} ${i.ordinal} ${i.title} ${i.source_excerpt} ${i.group_name} ${i.lead_unit} ${p.code} ${p.title} ${i.target_text} ${i.target_label} ${i.tracking_scope} ${i.latest_result}`);
        if(!hay.includes(kw)) return false;
      }
      return true;
    }).sort((a,b)=>{
      const po=String(a.program_id||'').localeCompare(String(b.program_id||''),'vi',{numeric:true,sensitivity:'base'});
      if(po) return po;
      const ap=parentOf(a), bp=parentOf(b);
      const aRoot=ap || a, bRoot=bp || b;
      const ao=indicatorSortValue(aRoot), bo=indicatorSortValue(bRoot);
      if(ao!==bo) return ao-bo;
      if(aRoot.id!==bRoot.id) return String(aRoot.code||'').localeCompare(String(bRoot.code||''),'vi',{numeric:true,sensitivity:'base'});
      if(!a.parent_indicator_id && b.parent_indicator_id) return -1;
      if(a.parent_indicator_id && !b.parent_indicator_id) return 1;
      return String(a.code||'').localeCompare(String(b.code||''),'vi',{numeric:true,sensitivity:'base'});
    });
  }

  function calcStats(list=STATE.indicators){
    return {
      programs:STATE.programs.length,
      total:list.length,
      ok:list.filter(i=>i.status==='Đạt'||i.status==='Hoàn thành').length,
      bad:list.filter(i=>i.status==='Chưa đạt'||i.status==='Quá hạn').length,
      missing:list.filter(i=>!i.status||i.status==='Chưa có số liệu').length,
      doing:list.filter(i=>i.status==='Đang thực hiện').length
    };
  }

  function unique(arr){return [...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'vi',{numeric:true,sensitivity:'base'}));}

  function renderFilters(){
    const programs=STATE.programs.map(p=>`<option value="${esc(p.id)}">${esc(p.code)} - ${esc(p.title)}</option>`).join('');
    const groups=unique(STATE.indicators.map(i=>i.group_name)).map(x=>`<option>${esc(x)}</option>`).join('');
    const units=unique(STATE.indicators.map(i=>i.lead_unit)).map(x=>`<option>${esc(x)}</option>`).join('');
    const years=unique(STATE.indicators.map(i=>String(i.target_year||''))).map(x=>`<option>${esc(x)}</option>`).join('');
    const statuses=unique(STATE.indicators.map(i=>i.status||'Chưa có số liệu')).map(x=>`<option>${esc(x)}</option>`).join('');

    return `
      <div class="nq-card p-4">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <label class="text-xs font-extrabold text-slate-500 uppercase">Văn bản nguồn
            <select id="nqFilterProgram" class="nq-field mt-1"><option value="">Tất cả</option>${programs}</select>
          </label>
          <label class="text-xs font-extrabold text-slate-500 uppercase">Lĩnh vực
            <select id="nqFilterGroup" class="nq-field mt-1"><option value="">Tất cả</option>${groups}</select>
          </label>
          <label class="text-xs font-extrabold text-slate-500 uppercase">Đơn vị chủ trì
            <select id="nqFilterUnit" class="nq-field mt-1"><option value="">Tất cả</option>${units}</select>
          </label>
          <label class="text-xs font-extrabold text-slate-500 uppercase">Năm/mốc
            <select id="nqFilterYear" class="nq-field mt-1"><option value="">Tất cả</option>${years}</select>
          </label>
          <label class="text-xs font-extrabold text-slate-500 uppercase">Trạng thái
            <select id="nqFilterStatus" class="nq-field mt-1"><option value="">Tất cả</option>${statuses}</select>
          </label>
          <label class="text-xs font-extrabold text-slate-500 uppercase">Từ khóa
            <input id="nqFilterKeyword" class="nq-field mt-1" placeholder="Tìm chỉ tiêu, đơn vị..." />
          </label>
        </div>
      </div>`;
  }

  function renderKpis(list){
    const s=calcStats(list);
    const items=[
      ['Văn bản nguồn',s.programs,'text-[#1f2a44]'],
      ['Tổng chỉ tiêu',s.total,'text-[#1f2a44]'],
      ['Đạt',s.ok,'text-[#6BCB77]'],
      ['Chưa đạt',s.bad,'text-[#FF6B6B]'],
      ['Đang thực hiện',s.doing,'text-[#4D96FF]'],
      ['Chưa số liệu',s.missing,'text-slate-500']
    ];
    return `<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">${items.map(([label,value,cls])=>`
      <div class="nq-card nq-kpi p-4">
        <p class="text-xs font-extrabold text-slate-500 uppercase">${label}</p>
        <p class="text-3xl font-extrabold mt-2 ${cls}">${value}</p>
      </div>`).join('')}</div>`;
  }

  function renderMatrix(){
    const years=[2025,2026,2027,2028,2029,2030];
    const rows=STATE.programs.map(p=>{
      const inds=STATE.indicators.filter(i=>i.program_id===p.id);
      const cells=years.map(y=>{
        const ys=inds.filter(i=>Number(i.target_year)===y || (Number(i.target_year)===2030 && y===2030));
        const hasBad=ys.some(i=>i.status==='Chưa đạt'||i.status==='Quá hạn');
        const hasDoing=ys.some(i=>i.status==='Đang thực hiện'||i.status==='Chưa đến kỳ');
        const hasOk=ys.some(i=>i.status==='Đạt'||i.status==='Hoàn thành');
        const cls=hasBad?'warn':hasOk?'done':hasDoing?'active':'';
        const txt=ys.length? (hasBad?'!':hasOk?'✓':'•') : '—';
        return `<div class="nq-matrix-cell ${cls}" title="${esc(p.code)} - ${y}">${txt}</div>`;
      }).join('');
      return `<div class="font-extrabold text-sm text-slate-700 truncate" title="${esc(p.title)}">${esc(p.code)}</div>${cells}`;
    }).join('');
    return `<div class="nq-card p-4 overflow-x-auto">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div><h3 class="text-lg font-extrabold">Ma trận theo dõi 2025-2030</h3><p class="text-sm text-slate-500">Xem nhanh văn bản nào đang có chỉ tiêu cần theo dõi theo từng năm.</p></div>
        <div class="hidden md:flex gap-2 text-xs text-slate-500"><span>• đang theo dõi</span><span>! cần chú ý</span><span>✓ đạt</span></div>
      </div>
      <div class="nq-matrix">
        <div class="nq-matrix-head">Văn bản</div>${years.map(y=>`<div class="nq-matrix-head text-center">${y}</div>`).join('')}
        ${rows}
      </div>
    </div>`;
  }

  function renderProgressByProgram(){
    const lines=STATE.programs.map(p=>{
      const inds=STATE.indicators.filter(i=>i.program_id===p.id);
      const total=inds.length||1;
      const ok=inds.filter(i=>i.status==='Đạt'||i.status==='Hoàn thành').length;
      const bad=inds.filter(i=>i.status==='Chưa đạt'||i.status==='Quá hạn').length;
      const pct=Math.round(ok/total*100);
      return `<div class="grid grid-cols-[110px_1fr_64px_52px] gap-3 items-center text-sm">
        <b class="truncate" title="${esc(p.title)}">${esc(p.code)}</b>
        <div class="h-3 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${bad?'bg-[#FF6B6B]':'bg-[#6BCB77]'}" style="width:${pct}%"></div></div>
        <span class="text-right font-extrabold">${ok}/${total}</span>
        <button class="nq-mini-link" data-nq-program-edit="${esc(p.id)}">Sửa</button>
      </div>`;
    }).join('');
    return `<div class="nq-card p-4"><h3 class="text-lg font-extrabold mb-3">Tiến độ theo văn bản</h3><div class="grid gap-3">${lines}</div></div>`;
  }

  function renderUnitMissing(){
    const missing=STATE.indicators.filter(i=>!i.status||i.status==='Chưa có số liệu');
    const by={}; missing.forEach(i=>{by[i.lead_unit||'Chưa xác định']=(by[i.lead_unit||'Chưa xác định']||0)+1;});
    const rows=Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([u,c])=>`
      <div class="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0"><span class="font-bold text-sm">${esc(u)}</span><span class="nq-badge nq-badge-wait">${c} thiếu</span></div>`).join('');
    return `<div class="nq-card p-4"><h3 class="text-lg font-extrabold mb-3">Đơn vị còn thiếu số liệu</h3>${rows||'<div class="nq-empty">Không có đơn vị thiếu số liệu.</div>'}</div>`;
  }

  function renderTable(list){
    const rows=list.map(i=>{
      const p=programOf(i.program_id);
      const shouldSplit=i?.data?.should_split===true || String(i?.data?.should_split).toLowerCase()==='true' || i.measure_type==='mixed';
      return `<tr>
        <td><b>${esc(i.ordinal ?? i.sort_order ?? '')}</b><div class="text-xs nq-muted mt-1">${esc(i.code||'')}</div></td>
        <td><div class="nq-title-clamp" title="${esc(i.source_excerpt||i.title)}">${esc(i.source_excerpt||i.title)}</div>${shouldSplit?'<div class="nq-split-hint mt-2">Nên tách chỉ tiêu con khi cập nhật số liệu</div>':''}</td>
        <td><b>${esc(i.group_name||'')}</b><div class="text-xs nq-muted mt-1">${esc(measureLabel(i.measure_type))}</div></td>
        <td><b>${esc(i.lead_unit||'')}</b><div class="text-xs nq-muted mt-1">${esc((i.co_units||[]).slice(0,2).join(', '))}</div></td>
        <td><b>${esc(indicatorTargetLabel(i))}</b><div class="text-xs nq-muted mt-1">${esc(i.tracking_scope||i.cycle||'—')} • ${esc(i.target_year||'—')}</div></td>
        <td>${esc(i.latest_result||'Chưa cập nhật')}<div class="text-xs nq-muted mt-1">${esc(i.latest_period||'')} ${esc(i.latest_year||'')}</div></td>
        <td>${badge(i.status)}</td>
        <td><div class="flex gap-2"><button class="nq-btn nq-btn-ghost px-3 py-2" data-nq-detail="${esc(i.id)}">Chi tiết</button><button class="nq-btn nq-btn-ghost px-3 py-2" data-nq-edit="${esc(i.id)}">Sửa</button></div></td>
      </tr>`;
    }).join('');
    return `<div class="nq-card overflow-hidden">
      <div class="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
        <div><h3 class="text-lg font-extrabold">Bảng chỉ tiêu cụ thể</h3><p id="nqShowingText" class="text-sm text-slate-500">Đang hiển thị ${list.length}/${STATE.indicators.length} chỉ tiêu.</p></div>
        <div class="flex gap-2"><button class="nq-btn nq-btn-ghost" onclick="window.NQIndicators.reload()">Tải lại</button><button class="nq-btn nq-btn-primary" onclick="window.NQIndicators.openIndicatorForm()">+ Nhập chỉ tiêu</button></div>
      </div>
      <div class="nq-table-wrap"><table class="nq-table"><thead><tr>
        <th>STT</th><th>Chỉ tiêu cụ thể</th><th>Nhóm / loại</th><th>Đơn vị</th><th>Mục tiêu</th><th>Kết quả gần nhất</th><th>Trạng thái</th><th></th>
      </tr></thead><tbody>${rows||`<tr><td colspan="8"><div class="nq-empty">Không có chỉ tiêu phù hợp bộ lọc.</div></td></tr>`}</tbody></table></div>
    </div>`;
  }

  function ensureOverlay(){
    let overlay=document.getElementById('nqFormOverlay');
    if(!overlay){
      overlay=document.createElement('div');
      overlay.id='nqFormOverlay';
      overlay.className='nq-form-overlay';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function closeForm(){
    const overlay=document.getElementById('nqFormOverlay');
    if(overlay) overlay.classList.remove('open');
  }


  function renderProgramForm(item){
    const isEdit=!!item;
    return `<div class="nq-form-panel nq-form-panel-sm">
      <div class="nq-form-head">
        <div><p class="text-sm font-extrabold text-[#4D96FF]">${isEdit?'Điều chỉnh văn bản nguồn':'Bổ sung văn bản nguồn'}</p><h2 class="text-xl font-extrabold mt-1">${isEdit?esc(item.code):'Thêm nghị quyết/chương trình/kế hoạch'}</h2><p class="text-sm text-slate-500 mt-1">Văn bản nguồn là hồ sơ gốc để gắn các chỉ tiêu bên dưới.</p></div>
        <button class="nq-btn nq-btn-ghost" type="button" onclick="window.NQIndicators.closeForm()">Đóng</button>
      </div>
      <form id="nqProgramForm" class="nq-form-body">
        <input type="hidden" id="nqProgramId" value="${esc(item?.id||'')}">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="nq-label">Số/ký hiệu văn bản
            <input id="nqProgramCode" class="nq-field" required placeholder="VD: 09-CTrHĐ/ĐU" value="${esc(item?.code||'')}">
          </label>
          <label class="nq-label">Loại văn bản
            <select id="nqProgramType" class="nq-field">
              ${optionList(['Nghị quyết','Chương trình hành động','Chương trình kiểm tra, giám sát','Kế hoạch','Văn bản chỉ đạo'], item?.type||'Chương trình hành động')}
            </select>
          </label>
          <label class="nq-label md:col-span-2">Tên văn bản
            <textarea id="nqProgramTitle" class="nq-field" rows="3" required placeholder="Nhập đầy đủ trích yếu/tên văn bản">${esc(item?.title||'')}</textarea>
          </label>
          <label class="nq-label">Ngày ban hành
            <input id="nqProgramIssuedDate" class="nq-field" type="date" value="${esc(item?.issued_date||'')}">
          </label>
          <label class="nq-label">Đơn vị chủ trì theo dõi
            <input id="nqProgramLeadUnit" class="nq-field" placeholder="VD: UBND phường" value="${esc(item?.lead_unit||'')}">
          </label>
          <label class="nq-label">Giai đoạn từ năm
            <input id="nqProgramFrom" class="nq-field" type="number" value="${esc(item?.period_from||2025)}">
          </label>
          <label class="nq-label">Giai đoạn đến năm
            <input id="nqProgramTo" class="nq-field" type="number" value="${esc(item?.period_to||2030)}">
          </label>
          <label class="nq-label">Tên file/link tài liệu
            <input id="nqProgramFileName" class="nq-field" placeholder="VD: 09-CTrHĐ.pdf hoặc link" value="${esc(item?.file_name||item?.file_url||'')}">
          </label>
          <label class="nq-label">Thứ tự hiển thị
            <input id="nqProgramSortOrder" class="nq-field" type="number" value="${esc(item?.sort_order??0)}">
          </label>
          <label class="nq-label md:col-span-2">Tóm tắt nội dung/theo dõi
            <textarea id="nqProgramSummary" class="nq-field" rows="3" placeholder="Tóm tắt nhóm chỉ tiêu, nội dung theo dõi chính">${esc(item?.summary||'')}</textarea>
          </label>
        </div>
        <div class="nq-form-actions">
          <button class="nq-btn nq-btn-ghost" type="button" onclick="window.NQIndicators.closeForm()">Hủy</button>
          <button class="nq-btn nq-btn-primary" type="submit">${isEdit?'Lưu điều chỉnh văn bản':'Lưu văn bản nguồn'}</button>
        </div>
      </form>
    </div>`;
  }

  function openProgramForm(programId){
    const item=programId?STATE.programs.find(x=>x.id===programId):null;
    const overlay=ensureOverlay();
    overlay.innerHTML=renderProgramForm(item);
    overlay.classList.add('open');
    overlay.onclick=e=>{if(e.target.id==='nqFormOverlay') closeForm();};
    const form=document.getElementById('nqProgramForm');
    if(form) form.onsubmit=saveProgramFromForm;
  }

  function collectProgramPayload(){
    const existingId=document.getElementById('nqProgramId').value.trim();
    const code=document.getElementById('nqProgramCode').value.trim();
    const title=document.getElementById('nqProgramTitle').value.trim();
    if(!code) throw new Error('Chưa nhập số/ký hiệu văn bản.');
    if(!title) throw new Error('Chưa nhập tên/trích yếu văn bản.');
    const safeCode=norm(code).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'program';
    const payload={
      id: existingId || `prog-${safeCode}-${Date.now()}`,
      code,
      title,
      type: document.getElementById('nqProgramType').value,
      issued_date: document.getElementById('nqProgramIssuedDate').value || null,
      period_from: intOrNull(document.getElementById('nqProgramFrom').value) || 2025,
      period_to: intOrNull(document.getElementById('nqProgramTo').value) || 2030,
      lead_unit: document.getElementById('nqProgramLeadUnit').value.trim(),
      summary: document.getElementById('nqProgramSummary').value.trim(),
      file_name: document.getElementById('nqProgramFileName').value.trim(),
      sort_order: intOrNull(document.getElementById('nqProgramSortOrder').value) || 0,
      is_active:true,
      data:{source:'manual', updatedFrom:'program_form'}
    };
    return {payload,isEdit:!!existingId};
  }

  async function saveProgramFromForm(e){
    e.preventDefault();
    if(STATE.saving) return;
    const client=getClient();
    if(!client){alert('Chưa kết nối Supabase.');return;}
    let payload,isEdit;
    try{({payload,isEdit}=collectProgramPayload());}
    catch(err){alert(err.message||err);return;}
    STATE.saving=true;
    try{
      const res=isEdit
        ? await client.from(TABLES.programs).update(payload).eq('id',payload.id)
        : await client.from(TABLES.programs).insert(payload);
      if(res.error) throw res.error;
      closeForm();
      STATE.loaded=false;
      await loadData(true);
      STATE.filters.program=payload.id;
      render();
      alert(isEdit?'Đã lưu điều chỉnh văn bản nguồn.':'Đã bổ sung văn bản nguồn. Anh có thể nhập chỉ tiêu và gắn vào văn bản này.');
    }catch(err){
      console.error(err);
      alert('Không lưu được văn bản nguồn: '+(err.message||err));
    }finally{STATE.saving=false;}
  }

  function renderIndicatorForm(item){
    const isEdit=!!item;
    const programs=STATE.programs.map(p=>`<option value="${esc(p.id)}" ${item?.program_id===p.id?'selected':''}>${esc(p.code)} - ${esc(p.title)}</option>`).join('');
    const statusOptions=optionList(STATUS_OPTIONS,item?.status||'Chưa có số liệu');
    const priorityOptions=optionList(PRIORITY_OPTIONS,item?.priority||'Bình thường');
    const cycleOptions=optionList(CYCLE_OPTIONS,item?.cycle||'Hằng năm');
    const trackingOptions=optionList(TRACKING_SCOPE_OPTIONS,item?.tracking_scope||item?.cycle||'Hằng năm');
    const measureOptions=pairOptionList(MEASURE_TYPE_OPTIONS,item?.measure_type||'mixed');
    const compareOptions=pairOptionList(COMPARE_OPTIONS,item?.compare_operator||'note');
    const coUnits=Array.isArray(item?.co_units)?item.co_units.join(', '):'';
    return `<div class="nq-form-panel">
      <div class="nq-form-head">
        <div><p class="text-sm font-extrabold text-[#4D96FF]">${isEdit?'Điều chỉnh chỉ tiêu cụ thể':'Nhập chỉ tiêu cụ thể'}</p><h2 class="text-xl font-extrabold mt-1">${isEdit?esc(item.code):'Thêm chỉ tiêu NQ-CTHĐ'}</h2><p class="text-sm text-slate-500 mt-1">Chỉ nhập phần chỉ tiêu cụ thể trong nghị quyết/chương trình, không nhập thành nhiệm vụ ngắn hạn.</p></div>
        <button class="nq-btn nq-btn-ghost" type="button" onclick="window.NQIndicators.closeForm()">Đóng</button>
      </div>
      <form id="nqIndicatorForm" class="nq-form-body">
        <input type="hidden" id="nqFormId" value="${esc(item?.id||'')}">
        <div class="nq-form-section-title">1. Thông tin gốc của chỉ tiêu</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="nq-label">Văn bản nguồn
            <select id="nqFormProgram" class="nq-field" required>${programs}</select>
          </label>
          <label class="nq-label">Số thứ tự trong văn bản
            <input id="nqFormOrdinal" class="nq-field" type="number" placeholder="VD: 14" value="${esc(item?.ordinal??item?.sort_order??'')}">
          </label>
          <label class="nq-label">Mã chỉ tiêu
            <input id="nqFormCode" class="nq-field" required placeholder="VD: CT.14 hoặc 09.02" value="${esc(item?.code||'')}">
          </label>
          <label class="nq-label">Nhóm lĩnh vực
            <input id="nqFormGroup" class="nq-field" placeholder="VD: Cải cách hành chính" value="${esc(item?.group_name||'')}">
          </label>
          <label class="nq-label md:col-span-2">Nội dung chỉ tiêu cụ thể / trích nguyên văn
            <textarea id="nqFormSourceExcerpt" class="nq-field" rows="4" required placeholder="Dán nguyên văn chỉ tiêu trong văn bản, ví dụ: Hằng năm, tỷ lệ giải quyết hồ sơ hành chính đúng hạn...">${esc(item?.source_excerpt||item?.title||'')}</textarea>
          </label>
          <label class="nq-label">Đơn vị chủ trì
            <input id="nqFormLeadUnit" class="nq-field" placeholder="VD: UBND phường" value="${esc(item?.lead_unit||'')}">
          </label>
          <label class="nq-label">Đơn vị phối hợp, cách nhau bằng dấu phẩy
            <input id="nqFormCoUnits" class="nq-field" placeholder="VD: MTTQ phường, Công an phường" value="${esc(coUnits)}">
          </label>
        </div>

        <div class="nq-form-section-title">2. Cách đo và mục tiêu cần đạt</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="nq-label">Loại chỉ tiêu
            <select id="nqFormMeasureType" class="nq-field">${measureOptions}</select>
          </label>
          <label class="nq-label">Kiểu so sánh
            <select id="nqFormCompare" class="nq-field">${compareOptions}</select>
          </label>
          <label class="nq-label">Giá trị mục tiêu
            <input id="nqFormTargetValue" class="nq-field" type="number" step="any" placeholder="VD: 97" value="${esc(item?.target_value??'')}">
          </label>
          <label class="nq-label">Đơn vị tính
            <input id="nqFormTargetUnit" class="nq-field" placeholder="%, tuyến, mô hình, cuộc..." value="${esc(item?.target_unit||'')}">
          </label>
          <label class="nq-label">Giá trị thấp nhất nếu là khoảng
            <input id="nqFormTargetMin" class="nq-field" type="number" step="any" placeholder="VD: 3" value="${esc(item?.target_min??'')}">
          </label>
          <label class="nq-label">Giá trị cao nhất nếu là khoảng
            <input id="nqFormTargetMax" class="nq-field" type="number" step="any" placeholder="VD: 5" value="${esc(item?.target_max??'')}">
          </label>
          <label class="nq-label md:col-span-2">Mục tiêu hiển thị trên bảng
            <input id="nqFormTargetLabel" class="nq-field" placeholder="VD: ≥97%; từ 3%-5%/năm; hoàn thành đến năm 2030" value="${esc(item?.target_label||indicatorTargetLabel(item||{}).replace('—',''))}">
          </label>
          <label class="nq-label md:col-span-2">Mô tả mục tiêu/mốc cần đạt
            <textarea id="nqFormTargetText" class="nq-field" rows="2" placeholder="Diễn giải mục tiêu theo văn bản nếu cần">${esc(item?.target_text||'')}</textarea>
          </label>
        </div>

        <div class="nq-form-section-title">3. Theo dõi thực hiện</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="nq-label">Chu kỳ báo cáo
            <select id="nqFormCycle" class="nq-field">${cycleOptions}</select>
          </label>
          <label class="nq-label">Phạm vi theo dõi
            <select id="nqFormTrackingScope" class="nq-field">${trackingOptions}</select>
          </label>
          <label class="nq-label">Năm/mốc hoàn thành
            <input id="nqFormTargetYear" class="nq-field" type="number" min="2025" max="2035" value="${esc(item?.target_year||2030)}">
          </label>
          <label class="nq-label">Trạng thái
            <select id="nqFormStatus" class="nq-field">${statusOptions}</select>
          </label>
          <label class="nq-label">Mức ưu tiên
            <select id="nqFormPriority" class="nq-field">${priorityOptions}</select>
          </label>
          <label class="nq-label">Thứ tự hiển thị
            <input id="nqFormSortOrder" class="nq-field" type="number" value="${esc(item?.sort_order??item?.ordinal??0)}">
          </label>
        </div>
        <div class="nq-form-actions">
          <button class="nq-btn nq-btn-ghost" type="button" onclick="window.NQIndicators.closeForm()">Hủy</button>
          <button class="nq-btn nq-btn-primary" type="submit">${isEdit?'Lưu điều chỉnh':'Lưu chỉ tiêu'}</button>
        </div>
      </form>
    </div>`;
  }

  function openIndicatorForm(indicatorId){
    const item=indicatorId?STATE.indicators.find(x=>x.id===indicatorId):null;
    const overlay=ensureOverlay();
    overlay.innerHTML=renderIndicatorForm(item);
    overlay.classList.add('open');
    overlay.onclick=e=>{if(e.target.id==='nqFormOverlay') closeForm();};
    const form=document.getElementById('nqIndicatorForm');
    if(form) form.onsubmit=saveIndicatorFromForm;
  }

  function collectIndicatorPayload(){
    const existingId=document.getElementById('nqFormId').value.trim();
    const isEdit=!!existingId;
    const ordinal=intOrNull(document.getElementById('nqFormOrdinal').value);
    const sourceExcerpt=document.getElementById('nqFormSourceExcerpt').value.trim();
    const targetValue=numOrNull(document.getElementById('nqFormTargetValue').value);
    const targetMin=numOrNull(document.getElementById('nqFormTargetMin').value);
    const targetMax=numOrNull(document.getElementById('nqFormTargetMax').value);
    const targetUnit=document.getElementById('nqFormTargetUnit').value.trim();
    let targetLabel=document.getElementById('nqFormTargetLabel').value.trim();
    const compare=document.getElementById('nqFormCompare').value;
    if(!targetLabel){
      if(compare==='range' && targetMin!=null && targetMax!=null) targetLabel=`Từ ${targetMin} đến ${targetMax}${targetUnit?' '+targetUnit:''}`;
      else if(targetValue!=null) targetLabel=`${compare||'>='} ${targetValue}${targetUnit?' '+targetUnit:''}`;
    }
    const payload={
      id: isEdit ? existingId : id('ind'),
      program_id: document.getElementById('nqFormProgram').value,
      code: document.getElementById('nqFormCode').value.trim(),
      ordinal,
      title: sourceExcerpt,
      source_excerpt: sourceExcerpt,
      group_name: document.getElementById('nqFormGroup').value.trim(),
      measure_type: document.getElementById('nqFormMeasureType').value,
      compare_operator: compare,
      target_value: targetValue,
      target_min: targetMin,
      target_max: targetMax,
      target_unit: targetUnit,
      target_label: targetLabel,
      target_text: document.getElementById('nqFormTargetText').value.trim(),
      target_year: intOrNull(document.getElementById('nqFormTargetYear').value) || 2030,
      cycle: document.getElementById('nqFormCycle').value,
      tracking_scope: document.getElementById('nqFormTrackingScope').value,
      lead_unit: document.getElementById('nqFormLeadUnit').value.trim(),
      co_units: arrFromComma(document.getElementById('nqFormCoUnits').value),
      status: document.getElementById('nqFormStatus').value,
      priority: document.getElementById('nqFormPriority').value,
      sort_order: intOrNull(document.getElementById('nqFormSortOrder').value) || ordinal || 0,
      is_active:true,
      input_mode:'specific_target',
      data:{source:'manual', updatedFrom:'specific_indicator_form'}
    };
    if(!payload.code) throw new Error('Chưa nhập mã chỉ tiêu.');
    if(!payload.source_excerpt) throw new Error('Chưa nhập nội dung chỉ tiêu cụ thể.');
    if(!payload.program_id) throw new Error('Chưa chọn văn bản nguồn.');
    return {payload,isEdit};
  }

  async function saveIndicatorFromForm(e){
    e.preventDefault();
    if(STATE.saving) return;
    const client=getClient();
    if(!client){alert('Chưa kết nối Supabase.');return;}
    let payload,isEdit;
    try{({payload,isEdit}=collectIndicatorPayload());}
    catch(err){alert(err.message||err);return;}
    STATE.saving=true;
    try{
      const res=isEdit
        ? await client.from(TABLES.indicators).update(payload).eq('id',payload.id)
        : await client.from(TABLES.indicators).insert(payload);
      if(res.error) throw res.error;
      closeForm();
      STATE.loaded=false;
      await loadData(true);
      render();
      alert(isEdit?'Đã lưu điều chỉnh chỉ tiêu.':'Đã thêm chỉ tiêu mới.');
    }catch(err){
      console.error(err);
      alert('Không lưu được chỉ tiêu: '+(err.message||err));
    }finally{STATE.saving=false;}
  }


  function renderSplitForm(parentId){
    const parent=STATE.indicators.find(x=>x.id===parentId)||{};
    const p=programOf(parent.program_id);
    const childCode=nextChildCode(parent);
    const childSort=nextChildSort(parent);
    return `<div class="nq-form-panel">
      <div class="nq-form-head">
        <div><p class="text-sm font-extrabold text-[#4D96FF]">Tách chỉ tiêu con</p><h2 class="text-xl font-extrabold mt-1">${esc(parent.code||'Chỉ tiêu mẹ')}</h2><p class="text-sm text-slate-500 mt-1">Dùng khi một chỉ tiêu lớn có nhiều số đo. Chỉ tiêu con sẽ gắn với chỉ tiêu mẹ và cập nhật số liệu riêng.</p></div>
        <button class="nq-btn nq-btn-ghost" type="button" onclick="window.NQIndicators.closeForm()">Đóng</button>
      </div>
      <form id="nqSplitForm" class="nq-form-body">
        <input type="hidden" id="nqSplitParentId" value="${esc(parentId)}">
        <div class="nq-parent-preview">
          <b>Chỉ tiêu mẹ:</b>
          <p>${esc(parent.source_excerpt||parent.title||'')}</p>
          <span>${esc(p.code||'')} • ${esc(parent.group_name||'')} • ${esc(parent.lead_unit||'')}</span>
        </div>
        <div class="nq-form-section-title">1. Nội dung chỉ tiêu con</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="nq-label">Mã chỉ tiêu con
            <input id="nqChildCode" class="nq-field" required value="${esc(childCode)}">
          </label>
          <label class="nq-label">Số thứ tự hiển thị
            <input id="nqChildSortOrder" class="nq-field" type="number" value="${esc(childSort)}">
          </label>
          <label class="nq-label md:col-span-2">Nội dung chỉ tiêu con
            <textarea id="nqChildSourceExcerpt" class="nq-field" rows="3" required placeholder="VD: Tỷ lệ giải quyết hồ sơ hành chính đúng hạn đạt trên 97%"></textarea>
          </label>
          <label class="nq-label">Nhóm lĩnh vực
            <input id="nqChildGroup" class="nq-field" value="${esc(parent.group_name||'')}">
          </label>
          <label class="nq-label">Đơn vị chủ trì
            <input id="nqChildLeadUnit" class="nq-field" value="${esc(parent.lead_unit||'')}">
          </label>
        </div>
        <div class="nq-form-section-title">2. Cách đo chỉ tiêu con</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="nq-label">Loại chỉ tiêu
            <select id="nqChildMeasureType" class="nq-field">${pairOptionList(MEASURE_TYPE_OPTIONS,'percentage')}</select>
          </label>
          <label class="nq-label">Kiểu so sánh
            <select id="nqChildCompare" class="nq-field">${pairOptionList(COMPARE_OPTIONS,'>=')}</select>
          </label>
          <label class="nq-label">Giá trị mục tiêu
            <input id="nqChildTargetValue" class="nq-field" type="number" step="any" placeholder="VD: 97">
          </label>
          <label class="nq-label">Đơn vị tính
            <input id="nqChildTargetUnit" class="nq-field" placeholder="%, tuyến, mô hình, hộ...">
          </label>
          <label class="nq-label">Giá trị thấp nhất nếu là khoảng
            <input id="nqChildTargetMin" class="nq-field" type="number" step="any" placeholder="VD: 3">
          </label>
          <label class="nq-label">Giá trị cao nhất nếu là khoảng
            <input id="nqChildTargetMax" class="nq-field" type="number" step="any" placeholder="VD: 5">
          </label>
          <label class="nq-label md:col-span-2">Mục tiêu hiển thị
            <input id="nqChildTargetLabel" class="nq-field" placeholder="VD: ≥97%; từ 3%-5%/năm; hoàn thành đến năm 2030">
          </label>
        </div>
        <div class="nq-form-section-title">3. Theo dõi</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="nq-label">Chu kỳ báo cáo
            <select id="nqChildCycle" class="nq-field">${optionList(CYCLE_OPTIONS,parent.cycle||'Hằng năm')}</select>
          </label>
          <label class="nq-label">Phạm vi theo dõi
            <select id="nqChildTrackingScope" class="nq-field">${optionList(TRACKING_SCOPE_OPTIONS,parent.tracking_scope||parent.cycle||'Hằng năm')}</select>
          </label>
          <label class="nq-label">Năm/mốc hoàn thành
            <input id="nqChildTargetYear" class="nq-field" type="number" value="${esc(parent.target_year||2030)}">
          </label>
          <label class="nq-label">Mức ưu tiên
            <select id="nqChildPriority" class="nq-field">${optionList(PRIORITY_OPTIONS,parent.priority||'Bình thường')}</select>
          </label>
        </div>
        <div class="nq-form-actions">
          <button class="nq-btn nq-btn-ghost" type="button" onclick="window.NQIndicators.closeForm()">Hủy</button>
          <button class="nq-btn nq-btn-primary" type="submit">Lưu chỉ tiêu con</button>
        </div>
      </form>
    </div>`;
  }

  function openSplitForm(parentId){
    const parent=STATE.indicators.find(x=>x.id===parentId);
    if(!parent){alert('Không tìm thấy chỉ tiêu mẹ.');return;}
    const overlay=ensureOverlay();
    overlay.innerHTML=renderSplitForm(parentId);
    overlay.classList.add('open');
    overlay.onclick=e=>{if(e.target.id==='nqFormOverlay') closeForm();};
    const form=document.getElementById('nqSplitForm');
    if(form) form.onsubmit=saveChildIndicatorFromForm;
  }

  function collectChildPayload(){
    const parentId=document.getElementById('nqSplitParentId').value;
    const parent=STATE.indicators.find(x=>x.id===parentId);
    if(!parent) throw new Error('Không tìm thấy chỉ tiêu mẹ.');
    const sourceExcerpt=document.getElementById('nqChildSourceExcerpt').value.trim();
    const compare=document.getElementById('nqChildCompare').value;
    const targetValue=numOrNull(document.getElementById('nqChildTargetValue').value);
    const targetMin=numOrNull(document.getElementById('nqChildTargetMin').value);
    const targetMax=numOrNull(document.getElementById('nqChildTargetMax').value);
    const targetUnit=document.getElementById('nqChildTargetUnit').value.trim();
    let targetLabel=document.getElementById('nqChildTargetLabel').value.trim();
    if(!targetLabel){
      if(compare==='range' && targetMin!=null && targetMax!=null) targetLabel=`Từ ${targetMin} đến ${targetMax}${targetUnit?' '+targetUnit:''}`;
      else if(targetValue!=null) targetLabel=`${compare||'>='} ${targetValue}${targetUnit?' '+targetUnit:''}`;
    }
    const payload={
      id:id('ind-child'),
      program_id:parent.program_id,
      parent_indicator_id:parent.id,
      code:document.getElementById('nqChildCode').value.trim(),
      ordinal:parent.ordinal,
      title:sourceExcerpt,
      source_excerpt:sourceExcerpt,
      group_name:document.getElementById('nqChildGroup').value.trim() || parent.group_name,
      measure_type:document.getElementById('nqChildMeasureType').value,
      compare_operator:compare,
      target_value:targetValue,
      target_min:targetMin,
      target_max:targetMax,
      target_unit:targetUnit,
      target_label:targetLabel,
      target_text:targetLabel,
      target_year:intOrNull(document.getElementById('nqChildTargetYear').value) || parent.target_year || 2030,
      cycle:document.getElementById('nqChildCycle').value,
      tracking_scope:document.getElementById('nqChildTrackingScope').value,
      lead_unit:document.getElementById('nqChildLeadUnit').value.trim() || parent.lead_unit,
      co_units:Array.isArray(parent.co_units)?parent.co_units:[],
      status:'Chưa có số liệu',
      priority:document.getElementById('nqChildPriority').value,
      sort_order:intOrNull(document.getElementById('nqChildSortOrder').value) || nextChildSort(parent),
      is_active:true,
      input_mode:'child_target',
      data:{source:'manual', updatedFrom:'split_indicator_form', parentCode:parent.code}
    };
    if(!payload.code) throw new Error('Chưa nhập mã chỉ tiêu con.');
    if(!payload.source_excerpt) throw new Error('Chưa nhập nội dung chỉ tiêu con.');
    return {payload,parent};
  }

  async function saveChildIndicatorFromForm(e){
    e.preventDefault();
    if(STATE.saving) return;
    const client=getClient();
    if(!client){alert('Chưa kết nối Supabase.');return;}
    let payload,parent;
    try{({payload,parent}=collectChildPayload());}
    catch(err){alert(err.message||err);return;}
    STATE.saving=true;
    try{
      const res=await client.from(TABLES.indicators).insert(payload);
      if(res.error) throw res.error;
      await client.from(TABLES.indicators).update({
        measure_type:'mixed',
        input_mode:'parent_with_children',
        data:{...(parent.data||{}), should_split:false, has_children:true}
      }).eq('id',parent.id);
      closeForm();
      STATE.loaded=false;
      await loadData(true);
      STATE.filters.program=parent.program_id;
      render();
      alert('Đã tách và lưu chỉ tiêu con. Từ nay có thể cập nhật kỳ riêng cho chỉ tiêu con này.');
    }catch(err){console.error(err);alert('Không lưu được chỉ tiêu con: '+(err.message||err));}
    finally{STATE.saving=false;}
  }

  function renderUpdateForm(indicatorId){
    const i=STATE.indicators.find(x=>x.id===indicatorId)||{};
    return `<div class="nq-form-panel nq-form-panel-sm">
      <div class="nq-form-head">
        <div><p class="text-sm font-extrabold text-[#4D96FF]">Cập nhật kỳ báo cáo</p><h2 class="text-xl font-extrabold mt-1">${esc(i.code||'')}</h2><p class="text-sm text-slate-500 mt-1">${esc(i.title||'')}</p></div>
        <button class="nq-btn nq-btn-ghost" type="button" onclick="window.NQIndicators.closeForm()">Đóng</button>
      </div>
      <form id="nqUpdateForm" class="nq-form-body">
        <input type="hidden" id="nqUpdateIndicatorId" value="${esc(indicatorId)}">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="nq-label">Kỳ báo cáo<select id="nqUpdatePeriod" class="nq-field">${optionList(PERIOD_OPTIONS,'Năm')}</select></label>
          <label class="nq-label">Năm<input id="nqUpdateYear" class="nq-field" type="number" value="${todayYear()}"></label>
          <label class="nq-label">Kết quả số<input id="nqUpdateValue" class="nq-field" type="number" step="any" placeholder="VD: 96.5"></label>
          <label class="nq-label">Đánh giá<select id="nqUpdateAssessment" class="nq-field">${optionList(['Đạt','Chưa đạt','Đang thực hiện','Chưa đánh giá'],'Chưa đánh giá')}</select></label>
          <label class="nq-label md:col-span-2">Kết quả đạt được<textarea id="nqUpdateText" class="nq-field" rows="3" placeholder="Nhập kết quả kỳ báo cáo"></textarea></label>
          <label class="nq-label md:col-span-2">Nguyên nhân/khó khăn<textarea id="nqUpdateReason" class="nq-field" rows="2"></textarea></label>
          <label class="nq-label md:col-span-2">Giải pháp/kiến nghị<textarea id="nqUpdateSolution" class="nq-field" rows="2"></textarea></label>
          <label class="nq-label md:col-span-2">Minh chứng<input id="nqUpdateEvidence" class="nq-field" placeholder="Tên báo cáo, đường link, phụ lục..."></label>
        </div>
        <div class="nq-form-actions"><button class="nq-btn nq-btn-ghost" type="button" onclick="window.NQIndicators.closeForm()">Hủy</button><button class="nq-btn nq-btn-primary" type="submit">Lưu cập nhật kỳ</button></div>
      </form>
    </div>`;
  }

  function openUpdateForm(indicatorId){
    const overlay=ensureOverlay();
    overlay.innerHTML=renderUpdateForm(indicatorId);
    overlay.classList.add('open');
    overlay.onclick=e=>{if(e.target.id==='nqFormOverlay') closeForm();};
    const form=document.getElementById('nqUpdateForm');
    if(form) form.onsubmit=saveUpdateFromForm;
  }

  async function saveUpdateFromForm(e){
    e.preventDefault();
    const client=getClient();
    if(!client){alert('Chưa kết nối Supabase.');return;}
    const indicatorId=document.getElementById('nqUpdateIndicatorId').value;
    const assessment=document.getElementById('nqUpdateAssessment').value;
    const reportPeriod=document.getElementById('nqUpdatePeriod').value;
    const reportYear=intOrNull(document.getElementById('nqUpdateYear').value)||todayYear();
    const actualText=document.getElementById('nqUpdateText').value.trim();
    const payload={
      id:id('upd'),
      indicator_id:indicatorId,
      report_period:reportPeriod,
      report_year:reportYear,
      actual_value:numOrNull(document.getElementById('nqUpdateValue').value),
      actual_text:actualText,
      assessment,
      reason:document.getElementById('nqUpdateReason').value.trim(),
      solution:document.getElementById('nqUpdateSolution').value.trim(),
      evidence:document.getElementById('nqUpdateEvidence').value.trim(),
      updated_by:'web',
      data:{source:'manual', updatedFrom:'indicator_update_form'}
    };
    try{
      const res=await client.from(TABLES.updates).insert(payload);
      if(res.error) throw res.error;
      const status=assessment==='Đạt'?'Đạt':assessment==='Chưa đạt'?'Chưa đạt':assessment==='Đang thực hiện'?'Đang thực hiện':'Chưa có số liệu';
      const ures=await client.from(TABLES.indicators).update({
        latest_period:reportPeriod,
        latest_year:reportYear,
        latest_result:actualText,
        latest_assessment:assessment,
        status
      }).eq('id',indicatorId);
      if(ures.error) throw ures.error;
      closeForm();
      const drawer=document.getElementById('nqIndicatorDrawer');
      if(drawer) drawer.classList.remove('open');
      STATE.loaded=false;
      await loadData(true);
      render();
      alert('Đã lưu cập nhật kỳ báo cáo.');
    }catch(err){console.error(err);alert('Không lưu được cập nhật kỳ: '+(err.message||err));}
  }

  async function openDetail(id){
    const i=STATE.indicators.find(x=>x.id===id); if(!i) return;
    const p=programOf(i.program_id);
    const client=getClient();
    let updates=[];
    if(client){
      const res=await client.from(TABLES.updates).select('*').eq('indicator_id',id).order('report_year',{ascending:false}).order('updated_at',{ascending:false});
      if(!res.error) updates=res.data||[];
    }
    const children=childrenOf(id);
    const childStats=statusSummary(children);
    let drawer=document.getElementById('nqIndicatorDrawer');
    if(!drawer){drawer=document.createElement('div');drawer.id='nqIndicatorDrawer';drawer.className='nq-drawer';document.body.appendChild(drawer);}
    drawer.innerHTML=`<div class="nq-drawer-panel">
      <div class="sticky top-0 bg-white border-b border-slate-200 p-5 z-10 flex items-start justify-between gap-3">
        <div><p class="text-sm font-extrabold text-[#4D96FF]">${esc(i.code)} • ${esc(p.code||'')}</p><h2 class="text-xl font-extrabold mt-1">${esc(i.title)}</h2><p class="text-sm text-slate-500 mt-1">${esc(p.title||'')}</p></div>
        <button class="nq-btn nq-btn-ghost" onclick="document.getElementById('nqIndicatorDrawer').classList.remove('open')">Đóng</button>
      </div>
      <div class="p-5 grid gap-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="nq-card p-4"><b>Đơn vị chủ trì</b><p class="mt-1 text-slate-600">${esc(i.lead_unit||'—')}</p></div>
          <div class="nq-card p-4"><b>Trạng thái</b><p class="mt-2">${badge(i.status)}</p></div>
          <div class="nq-card p-4"><b>Mục tiêu</b><p class="mt-1 text-slate-600">${esc(indicatorTargetLabel(i))}</p><p class="text-xs nq-muted mt-2">${esc(measureLabel(i.measure_type))} • ${esc(i.compare_operator||'note')}</p></div>
          <div class="nq-card p-4"><b>Chu kỳ / mốc</b><p class="mt-1 text-slate-600">${esc(i.tracking_scope||i.cycle||'—')} • ${esc(i.target_year||'—')}</p></div>
        </div>
        ${children.length?`<div class="nq-card p-4"><div class="flex items-start justify-between gap-3 mb-3"><div><b>Chỉ tiêu con đã tách</b><p class="text-sm text-slate-500 mt-1">${childStats.total} chỉ tiêu con • đạt ${childStats.ok} • chưa đạt ${childStats.bad} • chưa số liệu ${childStats.missing}</p></div><button class="nq-btn nq-btn-ghost" onclick="window.NQIndicators.openSplitForm('${esc(i.id)}')">+ Tách thêm</button></div><div class="nq-child-list">${children.map(c=>`<div class="nq-child-card"><div><b>${esc(c.code)}</b><p>${esc(c.source_excerpt||c.title)}</p><span>${esc(indicatorTargetLabel(c))} • ${esc(c.lead_unit||'')}</span></div><div class="flex gap-2 flex-wrap justify-end">${badge(c.status)}<button class="nq-btn nq-btn-ghost px-3 py-2" onclick="window.NQIndicators.openUpdateForm('${esc(c.id)}')">Cập nhật kỳ</button><button class="nq-btn nq-btn-ghost px-3 py-2" onclick="window.NQIndicators.openIndicatorForm('${esc(c.id)}')">Sửa</button></div></div>`).join('')}</div></div>`:''}
        <div class="nq-card p-4"><b>Lịch sử cập nhật kỳ báo cáo</b><div class="nq-timeline mt-3">${updates.length?updates.map(u=>`
          <div class="nq-timeline-item"><b>${esc(u.report_period)} ${esc(u.report_year)} • ${esc(u.assessment)}</b><p class="text-sm text-slate-600 mt-1">${esc(u.actual_text||'')}</p>${u.reason?`<p class="text-sm mt-2"><b>Nguyên nhân:</b> ${esc(u.reason)}</p>`:''}${u.solution?`<p class="text-sm mt-1"><b>Giải pháp:</b> ${esc(u.solution)}</p>`:''}</div>`).join(''):'<div class="nq-empty">Chưa có bản cập nhật kỳ.</div>'}</div></div>
        <div class="flex justify-end gap-2 flex-wrap"><button class="nq-btn nq-btn-ghost" onclick="window.NQIndicators.openSplitForm('${esc(i.id)}')">Tách chỉ tiêu con</button><button class="nq-btn nq-btn-ghost" onclick="window.NQIndicators.openIndicatorForm('${esc(i.id)}')">Sửa chỉ tiêu</button><button class="nq-btn nq-btn-ghost" onclick="window.NQIndicators.openUpdateForm('${esc(i.id)}')">Cập nhật kỳ</button><button class="nq-btn nq-btn-primary" onclick="alert('Gói NQ-5 sẽ kết nối tạo nhiệm vụ đôn đốc sang Trung tâm nhiệm vụ.')">Tạo nhiệm vụ đôn đốc</button></div>
      </div>
    </div>`;
    drawer.classList.add('open');
    drawer.onclick=e=>{if(e.target.id==='nqIndicatorDrawer') drawer.classList.remove('open');};
  }

  function bindFilters(){
    const map={nqFilterProgram:'program',nqFilterGroup:'group',nqFilterUnit:'unit',nqFilterYear:'year',nqFilterStatus:'status'};
    Object.entries(map).forEach(([id,key])=>{const el=document.getElementById(id); if(el){el.value=STATE.filters[key]||''; el.onchange=()=>{STATE.filters[key]=el.value; render();};}});
    const kw=document.getElementById('nqFilterKeyword');
    if(kw){kw.value=STATE.filters.keyword||''; kw.oninput=debounce(()=>{STATE.filters.keyword=kw.value; render();},220);}
    document.querySelectorAll('[data-nq-detail]').forEach(btn=>btn.onclick=()=>openDetail(btn.dataset.nqDetail));
    document.querySelectorAll('[data-nq-edit]').forEach(btn=>btn.onclick=()=>openIndicatorForm(btn.dataset.nqEdit));
    document.querySelectorAll('[data-nq-split]').forEach(btn=>btn.onclick=()=>openSplitForm(btn.dataset.nqSplit));
    document.querySelectorAll('[data-nq-program-edit]').forEach(btn=>btn.onclick=()=>openProgramForm(btn.dataset.nqProgramEdit));
  }

  function render(){
    const root=document.getElementById('nqIndicatorsRoot');
    if(!root) return;
    const list=filteredIndicators();
    root.innerHTML=`<div class="nq-shell space-y-5">
      <div class="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3">
        <div><h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight">Chỉ tiêu NQ-CTHĐ</h1><p class="text-sm text-slate-500 mt-1">Theo dõi chỉ tiêu nghị quyết, chương trình hành động, kế hoạch giai đoạn 2025-2030.</p></div>
        <div class="flex gap-2 flex-wrap"><button class="nq-btn nq-btn-ghost" onclick="window.NQIndicators.resetFilters()">Xóa lọc</button><button class="nq-btn nq-btn-ghost" onclick="window.NQIndicators.openProgramForm()">+ Văn bản nguồn</button><button class="nq-btn nq-btn-primary" onclick="window.NQIndicators.openIndicatorForm()">+ Nhập chỉ tiêu</button></div>
      </div>
      ${renderKpis(list)}
      ${renderMatrix()}
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4"><div class="xl:col-span-2">${renderProgressByProgram()}</div>${renderUnitMissing()}</div>
      ${renderFilters()}
      ${renderTable(list)}
    </div>`;
    bindFilters();
  }

  async function mount(){
    ensureCss();
    const root=document.getElementById('nqIndicatorsRoot');
    if(!root) return;
    root.innerHTML='<div class="nq-card p-6 text-slate-500">Đang tải dữ liệu chỉ tiêu NQ-CTHĐ...</div>';
    try{await loadData();render();}
    catch(err){console.error(err);root.innerHTML=`<div class="nq-card p-6"><h3 class="font-extrabold text-[#FF6B6B]">Không tải được module Chỉ tiêu NQ-CTHĐ</h3><p class="text-sm text-slate-600 mt-2">${esc(err.message||err)}</p></div>`;}
  }

  window.NQIndicators={
    mount,
    reload:async()=>{STATE.loaded=false;await mount();},
    resetFilters:()=>{STATE.filters={program:'',group:'',unit:'',year:'',status:'',keyword:''};render();},
    openIndicatorForm,
    openProgramForm,
    openSplitForm,
    openUpdateForm,
    closeForm
  };
})();

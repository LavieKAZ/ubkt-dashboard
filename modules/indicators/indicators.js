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

  const DOC_TYPES=['Nghá»‹ quyáº¿t','ChÆ°Æ¡ng trÃ¬nh hÃ nh Ä‘á»™ng','Káº¿ hoáº¡ch','ChÆ°Æ¡ng trÃ¬nh KTGS','VÄƒn báº£n khÃ¡c'];
  const DOC_LEVELS=['ThÃ nh phá»‘','PhÆ°á»ng','Cáº¥p trÃªn','Ná»™i bá»™'];
  const LINK_TYPES=['cá»¥ thá»ƒ hÃ³a','triá»ƒn khai','cÄƒn cá»©','liÃªn quan','thay tháº¿'];
  const MEASURE_TYPES=[['percentage','Tá»· lá»‡ %'],['number','Sá»‘ lÆ°á»£ng'],['growth','TÄƒng/giáº£m'],['milestone','Má»‘c hoÃ n thÃ nh'],['mixed','Há»—n há»£p']];
  const COMPARE_OPS=[['>=','â‰¥ Äáº¡t tá»«'],['>','> Lá»›n hÆ¡n'],['<=','â‰¤ KhÃ´ng quÃ¡'],['<','< Nhá» hÆ¡n'],['=','= Báº±ng'],['range','Trong khoáº£ng'],['complete','HoÃ n thÃ nh'],['note','Theo mÃ´ táº£']];
  const ROLES=['Chá»§ trÃ¬','Phá»‘i há»£p','Thá»±c hiá»‡n','Tham mÆ°u','Theo dÃµi','Táº¥t cáº£ Ä‘Æ¡n vá»‹'];
  const STATUS=['ChÆ°a cÃ³ sá»‘ liá»‡u','ChÆ°a Ä‘áº¿n ká»³','Äang thá»±c hiá»‡n','Äáº¡t','ChÆ°a Ä‘áº¡t','HoÃ n thÃ nh','QuÃ¡ háº¡n'];
  const PRIORITIES=['BÃ¬nh thÆ°á»ng','Cao','Ráº¥t cao'];
  const CYCLES=['QuÃ½','6 thÃ¡ng','NÄƒm','Háº±ng nÄƒm','Theo káº¿ hoáº¡ch','Giá»¯a nhiá»‡m ká»³','Cuá»‘i nhiá»‡m ká»³'];
  const SCOPES=['Háº±ng nÄƒm','Theo quÃ½','6 thÃ¡ng','Äáº¿n 2030','Giai Ä‘oáº¡n 2025-2030','Theo káº¿ hoáº¡ch'];
  const PERIODS=['QuÃ½ I','6 thÃ¡ng','QuÃ½ III','NÄƒm','Giá»¯a nhiá»‡m ká»³','Tá»•ng káº¿t'];
  const FALLBACK_UNITS=['Äáº£ng á»§y phÆ°á»ng','UBND phÆ°á»ng','UBKT Äáº£ng á»§y','Ban XÃ¢y dá»±ng Äáº£ng','VÄƒn phÃ²ng Äáº£ng á»§y','MTTQ phÆ°á»ng','HÄND phÆ°á»ng','CÃ´ng an phÆ°á»ng','BCHQS phÆ°á»ng','Táº¥t cáº£ Ä‘Æ¡n vá»‹'];

  function esc(s){return String(s??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
  function id(prefix){return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;}
  function nval(v){const s=String(v??'').trim().replace(',','.'); if(!s) return null; const n=Number(s); return Number.isFinite(n)?n:null;}
  function ival(v){const s=String(v??'').trim(); if(!s) return null; const n=parseInt(s,10); return Number.isFinite(n)?n:null;}
  function unique(arr){return [...new Set(arr.filter(Boolean).map(x=>String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true,sensitivity:'base'}));}
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
    if(!client) throw new Error('ChÆ°a cáº¥u hÃ¬nh Supabase hoáº·c chÆ°a táº£i supabase-js.');
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
    STATE.unitOptions=unique([...set]);
  }

  function docById(id){return STATE.docs.find(d=>d.id===id)||null;}
  function indicatorById(id){return STATE.indicators.find(i=>i.id===id)||null;}
  function assignmentsOf(indicatorId){return STATE.assignments.filter(a=>a.indicator_id===indicatorId).sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||String(a.role).localeCompare(String(b.role),'vi')||String(a.unit_name).localeCompare(String(b.unit_name),'vi'));}
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
    if(i.compare_operator==='range' && i.target_min!=null && i.target_max!=null) return `Tá»« ${i.target_min} Ä‘áº¿n ${i.target_max}${i.target_unit?' '+i.target_unit:''}`;
    if(i.target_value!=null) return `${i.compare_operator||'>='} ${i.target_value}${i.target_unit?' '+i.target_unit:''}`;
    if(i.compare_operator==='complete') return 'HoÃ n thÃ nh';
    return 'Theo mÃ´ táº£';
  }
  function statusClass(s){
    if(['Äáº¡t','HoÃ n thÃ nh'].includes(s)) return 'nq-badge-ok';
    if(['ChÆ°a Ä‘áº¡t','QuÃ¡ háº¡n'].includes(s)) return 'nq-badge-bad';
    if(['Äang thá»±c hiá»‡n'].includes(s)) return 'nq-badge-doing';
    if(['ChÆ°a Ä‘áº¿n ká»³'].includes(s)) return 'nq-badge-warn';
    return 'nq-badge-wait';
  }
  function badge(s,cls=''){return `<span class="nq-badge ${cls||statusClass(s)}">${esc(s||'ChÆ°a cÃ³ sá»‘ liá»‡u')}</span>`;}
  function measureText(v){const f=MEASURE_TYPES.find(x=>x[0]===v); return f?f[1]:(v||'â€”');}
  function roleBadge(a){return `<span class="nq-badge ${a.is_primary?'nq-badge-dark':'nq-badge-soft'}">${esc(a.unit_name)} â€¢ ${esc(a.role)}</span>`;}
  function calcProgress(){
    const total=STATE.indicators.length;
    const ok=STATE.indicators.filter(i=>['Äáº¡t','HoÃ n thÃ nh'].includes(i.status)).length;
    const bad=STATE.indicators.filter(i=>['ChÆ°a Ä‘áº¡t','QuÃ¡ háº¡n'].includes(i.status)).length;
    const doing=STATE.indicators.filter(i=>i.status==='Äang thá»±c hiá»‡n').length;
    const missing=STATE.indicators.filter(i=>!i.status||i.status==='ChÆ°a cÃ³ sá»‘ liá»‡u').length;
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
        <h1>Chá»‰ tiÃªu NQ-CTHÄ</h1>
        <p>Theo dÃµi cÃ¢y vÄƒn báº£n tá»« nghá»‹ quyáº¿t, chÆ°Æ¡ng trÃ¬nh hÃ nh Ä‘á»™ng, káº¿ hoáº¡ch Ä‘áº¿n chá»‰ tiÃªu cá»¥ thá»ƒ; phÃ¢n cÃ´ng Ä‘Æ¡n vá»‹ thá»±c hiá»‡n vÃ  cáº­p nháº­t káº¿t quáº£ tá»«ng ká»³.</p>
        <div class="nq-hero-actions">
          <button class="nq-btn nq-btn-primary" onclick="NQIndicators.openDocumentForm()">+ VÄƒn báº£n nguá»“n</button>
          <button class="nq-btn nq-btn-soft" onclick="NQIndicators.openIndicatorForm()">+ Chá»‰ tiÃªu</button>
          <button class="nq-btn nq-btn-soft" onclick="NQIndicators.openLinkForm()">LiÃªn káº¿t vÄƒn báº£n</button>
        </div>
      </div>
      <aside class="nq-hero-panel">
        <span>Tá»· lá»‡ chá»‰ tiÃªu Ä‘áº¡t/hoÃ n thÃ nh</span>
        <b>${p.rate}%</b>
        <span>${p.ok}/${p.total} chá»‰ tiÃªu Ä‘Ã£ Ä‘áº¡t hoáº·c hoÃ n thÃ nh. Dá»¯ liá»‡u Ä‘ang theo cáº¥u trÃºc má»›i, anh cÃ³ thá»ƒ nháº­p tay tá»« Ä‘áº§u.</span>
      </aside>
    </section>`;
  }

  function renderTabs(){
    const tabs=[['tree','CÃ¢y vÄƒn báº£n'],['list','Danh sÃ¡ch chá»‰ tiÃªu'],['units','Theo Ä‘Æ¡n vá»‹']];
    return `<div class="nq-tabs">${tabs.map(([v,l])=>`<button class="nq-tab ${STATE.view===v?'active':''}" onclick="NQIndicators.setView('${v}')">${l}</button>`).join('')}</div>`;
  }
  function renderKpis(){
    const p=calcProgress();
    const items=[
      ['VÄƒn báº£n',STATE.docs.length,'Nguá»“n theo dÃµi'],
      ['Chá»‰ tiÃªu',p.total,'Tá»•ng chá»‰ tiÃªu'],
      ['Äáº¡t',p.ok,'HoÃ n thÃ nh/Ä‘áº¡t'],
      ['Äang lÃ m',p.doing,'Äang thá»±c hiá»‡n'],
      ['ChÆ°a Ä‘áº¡t',p.bad,'Cáº§n Ä‘Ã´n Ä‘á»‘c'],
      ['ChÆ°a sá»‘ liá»‡u',p.missing,'Cáº§n cáº­p nháº­t']
    ];
    return `<section class="nq-kpis">${items.map((it,idx)=>`<div class="nq-card nq-kpi" style="animation-delay:${idx*0.025}s"><p>${it[0]}</p><b>${it[1]}</b><small>${it[2]}</small></div>`).join('')}</section>`;
  }
  function renderFilters(){
    const docs=STATE.docs.map(d=>`<option value="${esc(d.id)}">${esc(d.code||'')} ${esc(d.title)}</option>`).join('');
    const units=STATE.unitOptions.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('');
    return `<section class="nq-card nq-filter">
      <div class="nq-filter-grid">
        <label class="nq-label">VÄƒn báº£n<select id="nqFDoc" class="nq-field"><option value="">Táº¥t cáº£</option>${docs}</select></label>
        <label class="nq-label">Loáº¡i vÄƒn báº£n<select id="nqFType" class="nq-field"><option value="">Táº¥t cáº£</option>${opt(DOC_TYPES)}</select></label>
        <label class="nq-label">Cáº¥p vÄƒn báº£n<select id="nqFLevel" class="nq-field"><option value="">Táº¥t cáº£</option>${opt(DOC_LEVELS)}</select></label>
        <label class="nq-label">ÄÆ¡n vá»‹<select id="nqFUnit" class="nq-field"><option value="">Táº¥t cáº£</option>${units}</select></label>
        <label class="nq-label">Tráº¡ng thÃ¡i<select id="nqFStatus" class="nq-field"><option value="">Táº¥t cáº£</option>${opt(STATUS)}</select></label>
        <label class="nq-label">Tá»« khÃ³a<input id="nqFKeyword" class="nq-field" placeholder="TÃ¬m vÄƒn báº£n, chá»‰ tiÃªu, Ä‘Æ¡n vá»‹..." /></label>
      </div>
    </section>`;
  }

  function renderTreeView(){
    const roots=STATE.docs.filter(d=>!parentLinksOf(d.id).length).sort(sortDocs);
    const allRoots=roots.length?roots:STATE.docs.slice().sort(sortDocs);
    return `<section class="nq-board">
      <aside class="nq-side">
        <div class="nq-card p-4" style="padding:14px">
          <h2 class="nq-section-title">CÃ¢y vÄƒn báº£n</h2>
          <p class="nq-section-sub">DÃ¹ng Ä‘á»ƒ tráº£ lá»i: nghá»‹ quyáº¿t cÃ³ chÆ°Æ¡ng trÃ¬nh nÃ o, chÆ°Æ¡ng trÃ¬nh cÃ³ káº¿ hoáº¡ch nÃ o, má»—i vÄƒn báº£n cÃ³ bao nhiÃªu chá»‰ tiÃªu.</p>
        </div>
        <div class="nq-card" style="padding:14px">
          <h2 class="nq-section-title">Thao tÃ¡c nhanh</h2>
          <div class="nq-actions" style="justify-content:flex-start;margin-top:12px">
            <button class="nq-btn nq-btn-primary" onclick="NQIndicators.openDocumentForm()">+ VÄƒn báº£n</button>
            <button class="nq-btn nq-btn-soft" onclick="NQIndicators.openLinkForm()">LiÃªn káº¿t</button>
          </div>
        </div>
      </aside>
      <main class="nq-main">
        <div class="nq-card nq-doc-tree">${STATE.docs.length?allRoots.map(d=>renderDocNode(d,0)).join(''):`<div class="nq-empty"><b>ChÆ°a cÃ³ vÄƒn báº£n nguá»“n</b> Báº¥m â€œ+ VÄƒn báº£n nguá»“nâ€ Ä‘á»ƒ nháº­p nghá»‹ quyáº¿t, chÆ°Æ¡ng trÃ¬nh, káº¿ hoáº¡ch.</div>`}</div>
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
          <div class="nq-doc-code">${esc(d.code||'ChÆ°a cÃ³ sá»‘')}</div>
          <div class="nq-doc-title">${esc(d.title)}</div>
          <div class="nq-doc-meta">
            ${badge(d.document_type,'nq-badge-soft')} ${badge(d.document_level,'nq-badge-soft')} ${badge(`${count} chá»‰ tiÃªu`,'nq-badge-dark')}
          </div>
          <div class="nq-body-text" style="margin-top:8px">Tham mÆ°u: <b>${esc(d.advisory_unit||'ChÆ°a phÃ¢n cÃ´ng')}</b> â€¢ Theo dÃµi: <b>${esc(d.lead_unit||'ChÆ°a phÃ¢n cÃ´ng')}</b></div>
        </div>
        <div class="nq-actions">
          <button class="nq-btn nq-btn-sm nq-btn-soft" onclick="NQIndicators.openDocumentForm('${d.id}')">Sá»­a</button>
          <button class="nq-btn nq-btn-sm nq-btn-primary" onclick="NQIndicators.openIndicatorForm(null,'${d.id}')">+ Chá»‰ tiÃªu</button>
        </div>
      </div>
      ${children.length?`<div style="margin-top:10px;display:grid;gap:8px">${children.map(c=>renderDocNode(c,level+1,new Set(seen))).join('')}</div>`:''}
    </div>`;
  }

  function renderListView(){
    const list=filteredIndicators();
    return `<section class="nq-card nq-table-card">
      <div class="nq-table-head">
        <div><h2 class="nq-section-title">Danh sÃ¡ch chá»‰ tiÃªu</h2><p class="nq-section-sub">Äang hiá»ƒn thá»‹ ${list.length}/${STATE.indicators.length} chá»‰ tiÃªu.</p></div>
        <div class="nq-actions"><button class="nq-btn nq-btn-primary" onclick="NQIndicators.openIndicatorForm()">+ Chá»‰ tiÃªu</button></div>
      </div>
      <div class="nq-list">${list.length?list.map(renderIndicatorRow).join(''):`<div class="nq-empty"><b>ChÆ°a cÃ³ chá»‰ tiÃªu</b> Báº¥m â€œ+ Chá»‰ tiÃªuâ€ Ä‘á»ƒ nháº­p chá»‰ tiÃªu cá»¥ thá»ƒ theo vÄƒn báº£n.</div>`}</div>
    </section>`;
  }
  function renderIndicatorRow(i){
    const d=docById(i.document_id)||{};
    const units=assignmentsOf(i.id);
    const isChild=!!i.parent_indicator_id;
    return `<div class="nq-row ${isChild?'child':''}">
      <div><div class="nq-code">${esc(i.code||'CT')}</div><div class="nq-ordinal">STT ${esc(i.ordinal??'â€”')}</div></div>
      <div><div class="nq-ind-title">${esc(i.title)}</div><div class="nq-muted">${esc(d.code||'')} â€¢ ${esc(d.title||'ChÆ°a cÃ³ vÄƒn báº£n')}</div></div>
      <div><div class="nq-body-text"><b>${esc(i.group_name||'ChÆ°a phÃ¢n nhÃ³m')}</b></div><div class="nq-muted">${esc(measureText(i.measure_type))}</div></div>
      <div><div class="nq-body-text">${units.length?units.slice(0,3).map(roleBadge).join(' '):'<span class="nq-muted">ChÆ°a phÃ¢n cÃ´ng</span>'}</div></div>
      <div><div class="nq-body-text"><b>${esc(targetLabel(i))}</b></div>${badge(i.status)}</div>
      <div class="nq-actions">
        <button class="nq-btn nq-btn-sm nq-btn-soft" onclick="NQIndicators.openDetail('${i.id}')">Chi tiáº¿t</button>
        <button class="nq-btn nq-btn-sm nq-btn-soft" onclick="NQIndicators.openIndicatorForm('${i.id}')">Sá»­a</button>
        <button class="nq-btn nq-btn-sm nq-btn-primary" onclick="NQIndicators.openIndicatorForm(null,'${i.document_id}','${i.id}')">+ Con</button>
      </div>
    </div>`;
  }

  function renderUnitsView(){
    const unitMap=new Map();
    STATE.assignments.forEach(a=>{
      const key=a.unit_name||'ChÆ°a phÃ¢n cÃ´ng';
      if(!unitMap.has(key)) unitMap.set(key,[]);
      unitMap.get(key).push(a);
    });
    const cards=[...unitMap.entries()].sort((a,b)=>a[0].localeCompare(b[0],'vi',{numeric:true,sensitivity:'base'}));
    return `<section class="nq-main">
      <div class="nq-card" style="padding:16px"><h2 class="nq-section-title">Theo Ä‘Æ¡n vá»‹</h2><p class="nq-section-sub">Tráº£ lá»i cÃ¢u há»i: má»—i Ä‘Æ¡n vá»‹ Ä‘ang chá»§ trÃ¬, phá»‘i há»£p, thá»±c hiá»‡n nhá»¯ng chá»‰ tiÃªu nÃ o.</p></div>
      <div class="nq-unit-grid">${cards.length?cards.map(([unit,items])=>renderUnitCard(unit,items)).join(''):`<div class="nq-card nq-empty"><b>ChÆ°a phÃ¢n cÃ´ng Ä‘Æ¡n vá»‹</b> Khi nháº­p chá»‰ tiÃªu, chá»n Ä‘Æ¡n vá»‹ thá»±c hiá»‡n tá»« danh sÃ¡ch.</div>`}</div>
    </section>`;
  }
  function renderUnitCard(unit,items){
    const primary=items.filter(a=>a.is_primary||a.role==='Chá»§ trÃ¬').length;
    const coop=items.filter(a=>!a.is_primary&&a.role!=='Chá»§ trÃ¬').length;
    const bad=items.filter(a=>{const i=indicatorById(a.indicator_id); return i&&['ChÆ°a Ä‘áº¡t','QuÃ¡ háº¡n'].includes(i.status);}).length;
    return `<div class="nq-card nq-unit-card">
      <h3>${esc(unit)}</h3>
      <div class="nq-unit-stats"><div><b>${items.length}</b><span>Tá»•ng</span></div><div><b>${primary}</b><span>Chá»§ trÃ¬</span></div><div><b>${bad}</b><span>Cáº§n xá»­ lÃ½</span></div></div>
      <div class="nq-body-text">Phá»‘i há»£p/thá»±c hiá»‡n: <b>${coop}</b></div>
      <button class="nq-btn nq-btn-sm nq-btn-soft" onclick="NQIndicators.filterByUnit('${esc(unit).replace(/'/g,"\\'")}')">Xem chá»‰ tiÃªu</button>
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
        <div class="nq-drawer-head"><div><h2 id="nqDrawerTitle" class="nq-section-title">Chi tiáº¿t</h2><p id="nqDrawerSub" class="nq-section-sub"></p></div><button class="nq-btn nq-btn-soft" onclick="NQIndicators.closeDrawer()">ÄÃ³ng</button></div>
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
      <h3>ThÃ´ng tin vÄƒn báº£n nguá»“n</h3>
      <div class="nq-form-grid">
        <label class="nq-label">Sá»‘/kÃ½ hiá»‡u<input name="code" class="nq-field" value="${esc(d.code||'')}" placeholder="VD: 01-NQ/ÄU" /></label>
        <label class="nq-label">Loáº¡i vÄƒn báº£n<select name="document_type" class="nq-field">${selectedIn(DOC_TYPES,d.document_type||'')}</select></label>
        <label class="nq-label span-2">TÃªn/trÃ­ch yáº¿u vÄƒn báº£n<input name="title" required class="nq-field" value="${esc(d.title||'')}" /></label>
        <label class="nq-label">Cáº¥p vÄƒn báº£n<select name="document_level" class="nq-field">${selectedIn(DOC_LEVELS,d.document_level||'PhÆ°á»ng')}</select></label>
        <label class="nq-label">NgÃ y ban hÃ nh<input name="issued_date" type="date" class="nq-field" value="${esc(d.issued_date||'')}" /></label>
        <label class="nq-label">ÄÆ¡n vá»‹ tham mÆ°u<select name="advisory_unit" class="nq-field"><option value="">Chá»n Ä‘Æ¡n vá»‹</option>${selectedIn(STATE.unitOptions,d.advisory_unit||'')}</select></label>
        <label class="nq-label">ÄÆ¡n vá»‹ theo dÃµi<select name="lead_unit" class="nq-field"><option value="">Chá»n Ä‘Æ¡n vá»‹</option>${selectedIn(STATE.unitOptions,d.lead_unit||'')}</select></label>
        <label class="nq-label">Tá»« nÄƒm<input name="period_from" type="number" class="nq-field" value="${esc(d.period_from||2025)}" /></label>
        <label class="nq-label">Äáº¿n nÄƒm<input name="period_to" type="number" class="nq-field" value="${esc(d.period_to||2030)}" /></label>
        <label class="nq-label">VÄƒn báº£n cha/liÃªn káº¿t<select name="parent_document_id" class="nq-field"><option value="">KhÃ´ng cÃ³</option>${docOptions}</select><span class="nq-help">Anh tá»± link: Nghá»‹ quyáº¿t â†’ ChÆ°Æ¡ng trÃ¬nh â†’ Káº¿ hoáº¡ch.</span></label>
        <label class="nq-label">Kiá»ƒu liÃªn káº¿t<select name="link_type" class="nq-field">${selectedIn(LINK_TYPES,parent.link_type||'triá»ƒn khai')}</select></label>
        <label class="nq-label">Thá»© tá»±<input name="sort_order" type="number" class="nq-field" value="${esc(d.sort_order||0)}" /></label>
        <label class="nq-label">TÃªn file/link<input name="file_name" class="nq-field" value="${esc(d.file_name||'')}" /></label>
        <label class="nq-label span-2">TÃ³m táº¯t<textarea name="summary" class="nq-field">${esc(d.summary||'')}</textarea></label>
      </div>
      <div class="nq-actions"><button type="button" class="nq-btn nq-btn-soft" onclick="NQIndicators.closeDrawer()">Há»§y</button><button class="nq-btn nq-btn-primary">LÆ°u vÄƒn báº£n</button></div>
    </form>`;
    openDrawer(docId?'Sá»­a vÄƒn báº£n nguá»“n':'+ VÄƒn báº£n nguá»“n','Quáº£n lÃ½ nghá»‹ quyáº¿t, chÆ°Æ¡ng trÃ¬nh, káº¿ hoáº¡ch vÃ  Ä‘Æ¡n vá»‹ tham mÆ°u.',body);
  }

  async function saveDocument(e,docId=''){
    e.preventDefault(); const client=getClient(); const fd=new FormData(e.target); const newId=docId||id('doc');
    const row={
      id:newId, code:fd.get('code')||null, title:String(fd.get('title')||'').trim(), document_type:fd.get('document_type')||'VÄƒn báº£n', document_level:fd.get('document_level')||'PhÆ°á»ng',
      advisory_unit:fd.get('advisory_unit')||null, lead_unit:fd.get('lead_unit')||null, issued_date:fd.get('issued_date')||null, period_from:ival(fd.get('period_from')), period_to:ival(fd.get('period_to')),
      summary:fd.get('summary')||null, file_name:fd.get('file_name')||null, sort_order:ival(fd.get('sort_order'))||0, is_active:true
    };
    if(!row.title){toast('ChÆ°a nháº­p tÃªn vÄƒn báº£n');return;}
    const res=await client.from(TABLES.documents).upsert(row,{onConflict:'id'}); if(res.error){toast('Lá»—i lÆ°u vÄƒn báº£n: '+res.error.message);return;}
    await client.from(TABLES.links).delete().eq('child_document_id',newId);
    const parent=fd.get('parent_document_id');
    if(parent){
      const link={id:id('link'),parent_document_id:parent,child_document_id:newId,link_type:fd.get('link_type')||'triá»ƒn khai'};
      const lr=await client.from(TABLES.links).insert(link); if(lr.error){toast('VÄƒn báº£n Ä‘Ã£ lÆ°u, nhÆ°ng lá»—i liÃªn káº¿t: '+lr.error.message);}
    }
    toast('ÄÃ£ lÆ°u vÄƒn báº£n nguá»“n'); closeDrawer(); await loadData(true); render();
  }

  function openLinkForm(){
    const docs=STATE.docs.map(d=>`<option value="${esc(d.id)}">${esc(d.code||'')} - ${esc(d.title)}</option>`).join('');
    const body=`<form class="nq-form-section" onsubmit="NQIndicators.saveLink(event)">
      <h3>LiÃªn káº¿t vÄƒn báº£n cha/con</h3>
      <label class="nq-label">VÄƒn báº£n cha<select name="parent" required class="nq-field">${docs}</select></label>
      <label class="nq-label">VÄƒn báº£n con<select name="child" required class="nq-field">${docs}</select></label>
      <label class="nq-label">Kiá»ƒu liÃªn káº¿t<select name="type" class="nq-field">${opt(LINK_TYPES,'triá»ƒn khai')}</select></label>
      <label class="nq-label">Ghi chÃº<textarea name="note" class="nq-field"></textarea></label>
      <div class="nq-actions"><button class="nq-btn nq-btn-primary">LÆ°u liÃªn káº¿t</button></div>
    </form>`;
    openDrawer('LiÃªn káº¿t vÄƒn báº£n','Tá»± thiáº¿t láº­p cÃ¢y Nghá»‹ quyáº¿t â†’ ChÆ°Æ¡ng trÃ¬nh â†’ Káº¿ hoáº¡ch.',body);
  }
  async function saveLink(e){
    e.preventDefault(); const fd=new FormData(e.target); const parent=fd.get('parent'), child=fd.get('child');
    if(parent===child){toast('VÄƒn báº£n cha vÃ  con khÃ´ng Ä‘Æ°á»£c trÃ¹ng');return;}
    const row={id:id('link'),parent_document_id:parent,child_document_id:child,link_type:fd.get('type')||'triá»ƒn khai',note:fd.get('note')||null};
    const res=await getClient().from(TABLES.links).upsert(row,{onConflict:'parent_document_id,child_document_id,link_type'});
    if(res.error){toast('Lá»—i lÆ°u liÃªn káº¿t: '+res.error.message);return;}
    toast('ÄÃ£ lÆ°u liÃªn káº¿t'); closeDrawer(); await loadData(true); render();
  }

  function openIndicatorForm(indId='',docId='',parentId=''){
    const i=indicatorById(indId)||{}; const currentDoc=docId||i.document_id||''; const currentParent=parentId||i.parent_indicator_id||'';
    const docOptions=STATE.docs.map(d=>`<option value="${esc(d.id)}" ${d.id===currentDoc?'selected':''}>${esc(d.code||'')} - ${esc(d.title)}</option>`).join('');
    const parentOptions=STATE.indicators.filter(x=>x.id!==indId).map(x=>`<option value="${esc(x.id)}" ${x.id===currentParent?'selected':''}>${esc(x.code||'')} - ${esc(x.title)}</option>`).join('');
    const units=assignmentsOf(indId); const primary=(units.find(x=>x.is_primary)||{}).unit_name||''; const co=units.filter(x=>!x.is_primary).map(x=>x.unit_name);
    const body=`<form class="nq-form-section" onsubmit="NQIndicators.saveIndicator(event,'${esc(indId)}')">
      <h3>1. Nguá»“n chá»‰ tiÃªu</h3>
      <div class="nq-form-grid">
        <label class="nq-label span-2">VÄƒn báº£n chá»©a chá»‰ tiÃªu<select required name="document_id" class="nq-field"><option value="">Chá»n vÄƒn báº£n</option>${docOptions}</select></label>
        <label class="nq-label span-2">Chá»‰ tiÃªu máº¹ náº¿u lÃ  chá»‰ tiÃªu con<select name="parent_indicator_id" class="nq-field"><option value="">KhÃ´ng cÃ³</option>${parentOptions}</select></label>
        <label class="nq-label">STT<input name="ordinal" type="number" class="nq-field" value="${esc(i.ordinal||'')}" /></label>
        <label class="nq-label">MÃ£ chá»‰ tiÃªu<input name="code" class="nq-field" value="${esc(i.code||'')}" placeholder="VD: CT.14" /></label>
        <label class="nq-label span-2">Ná»™i dung rÃºt gá»n<input required name="title" class="nq-field" value="${esc(i.title||'')}" /></label>
        <label class="nq-label span-2">TrÃ­ch nguyÃªn vÄƒn<textarea name="source_excerpt" class="nq-field">${esc(i.source_excerpt||'')}</textarea></label>
        <label class="nq-label">NhÃ³m lÄ©nh vá»±c<input name="group_name" class="nq-field" value="${esc(i.group_name||'')}" /></label>
        <label class="nq-label">Má»©c Æ°u tiÃªn<select name="priority" class="nq-field">${selectedIn(PRIORITIES,i.priority||'BÃ¬nh thÆ°á»ng')}</select></label>
      </div>
      <h3>2. ÄÆ¡n vá»‹ thá»±c hiá»‡n</h3>
      <div class="nq-form-grid">
        <label class="nq-label">ÄÆ¡n vá»‹ chá»§ trÃ¬<select name="primary_unit" class="nq-field"><option value="">Chá»n Ä‘Æ¡n vá»‹</option>${selectedIn(STATE.unitOptions,primary)}</select></label>
        <label class="nq-label">Vai trÃ² chá»§ trÃ¬<select name="primary_role" class="nq-field">${selectedIn(ROLES,(units.find(x=>x.is_primary)||{}).role||'Chá»§ trÃ¬')}</select></label>
        <label class="nq-label span-2">ÄÆ¡n vá»‹ phá»‘i há»£p/thá»±c hiá»‡n<select name="co_units" class="nq-field" multiple>${selectedMany(STATE.unitOptions,co)}</select><span class="nq-help">Giá»¯ Ctrl Ä‘á»ƒ chá»n nhiá»u Ä‘Æ¡n vá»‹. Chá»n â€œTáº¥t cáº£ Ä‘Æ¡n vá»‹â€ náº¿u chá»‰ tiÃªu Ã¡p dá»¥ng toÃ n há»‡ thá»‘ng.</span></label>
      </div>
      <h3>3. CÃ¡ch Ä‘o vÃ  má»‘c theo dÃµi</h3>
      <div class="nq-form-grid">
        <label class="nq-label">Loáº¡i Ä‘o<select name="measure_type" class="nq-field">${optPairs(MEASURE_TYPES,i.measure_type||'mixed')}</select></label>
        <label class="nq-label">Kiá»ƒu so sÃ¡nh<select name="compare_operator" class="nq-field">${optPairs(COMPARE_OPS,i.compare_operator||'note')}</select></label>
        <label class="nq-label">GiÃ¡ trá»‹ má»¥c tiÃªu<input name="target_value" class="nq-field" value="${esc(i.target_value??'')}" /></label>
        <label class="nq-label">ÄÆ¡n vá»‹ tÃ­nh<input name="target_unit" class="nq-field" value="${esc(i.target_unit||'')}" placeholder="%, tuyáº¿n, mÃ´ hÃ¬nh..." /></label>
        <label class="nq-label">GiÃ¡ trá»‹ tháº¥p<input name="target_min" class="nq-field" value="${esc(i.target_min??'')}" /></label>
        <label class="nq-label">GiÃ¡ trá»‹ cao<input name="target_max" class="nq-field" value="${esc(i.target_max??'')}" /></label>
        <label class="nq-label span-2">Má»¥c tiÃªu hiá»ƒn thá»‹<input name="target_label" class="nq-field" value="${esc(i.target_label||'')}" placeholder="VD: >97% há»“ sÆ¡ Ä‘Ãºng háº¡n háº±ng nÄƒm" /></label>
        <label class="nq-label">Chu ká»³<select name="cycle" class="nq-field">${selectedIn(CYCLES,i.cycle||'NÄƒm')}</select></label>
        <label class="nq-label">Pháº¡m vi theo dÃµi<select name="tracking_scope" class="nq-field">${selectedIn(SCOPES,i.tracking_scope||'Háº±ng nÄƒm')}</select></label>
        <label class="nq-label">NÄƒm/má»‘c hoÃ n thÃ nh<input name="target_year" type="number" class="nq-field" value="${esc(i.target_year||2030)}" /></label>
        <label class="nq-label">Tráº¡ng thÃ¡i<select name="status" class="nq-field">${selectedIn(STATUS,i.status||'ChÆ°a cÃ³ sá»‘ liá»‡u')}</select></label>
        <label class="nq-label">Thá»© tá»±<input name="sort_order" type="number" class="nq-field" value="${esc(i.sort_order||i.ordinal||0)}" /></label>
        <label class="nq-label">Cáº§n tÃ¡ch chá»‰ tiÃªu con?<select name="is_split_recommended" class="nq-field"><option value="false">KhÃ´ng</option><option value="true" ${i.is_split_recommended?'selected':''}>CÃ³</option></select></label>
      </div>
      <div class="nq-actions"><button type="button" class="nq-btn nq-btn-soft" onclick="NQIndicators.closeDrawer()">Há»§y</button><button class="nq-btn nq-btn-primary">LÆ°u chá»‰ tiÃªu</button></div>
    </form>`;
    openDrawer(indId?'Sá»­a chá»‰ tiÃªu':'+ Chá»‰ tiÃªu','Nháº­p chá»‰ tiÃªu cá»¥ thá»ƒ, chá»‰ tiÃªu con vÃ  phÃ¢n cÃ´ng Ä‘Æ¡n vá»‹ thá»±c hiá»‡n.',body);
  }

  async function saveIndicator(e,indId=''){
    e.preventDefault(); const client=getClient(); const fd=new FormData(e.target); const newId=indId||id('ind');
    const row={
      id:newId, document_id:fd.get('document_id'), parent_indicator_id:fd.get('parent_indicator_id')||null, ordinal:ival(fd.get('ordinal')), code:fd.get('code')||null,
      title:String(fd.get('title')||'').trim(), source_excerpt:fd.get('source_excerpt')||null, group_name:fd.get('group_name')||null,
      measure_type:fd.get('measure_type')||'mixed', compare_operator:fd.get('compare_operator')||'note', target_value:nval(fd.get('target_value')), target_min:nval(fd.get('target_min')), target_max:nval(fd.get('target_max')),
      target_unit:fd.get('target_unit')||null, target_label:fd.get('target_label')||null, cycle:fd.get('cycle')||'NÄƒm', tracking_scope:fd.get('tracking_scope')||null, target_year:ival(fd.get('target_year')),
      status:fd.get('status')||'ChÆ°a cÃ³ sá»‘ liá»‡u', priority:fd.get('priority')||'BÃ¬nh thÆ°á»ng', sort_order:ival(fd.get('sort_order'))||0, is_split_recommended:fd.get('is_split_recommended')==='true', is_active:true
    };
    if(!row.document_id || !row.title){toast('ChÆ°a chá»n vÄƒn báº£n hoáº·c chÆ°a nháº­p ná»™i dung chá»‰ tiÃªu');return;}
    const res=await client.from(TABLES.indicators).upsert(row,{onConflict:'id'}); if(res.error){toast('Lá»—i lÆ°u chá»‰ tiÃªu: '+res.error.message);return;}
    await client.from(TABLES.units).delete().eq('indicator_id',newId);
    const unitRows=[];
    const primary=fd.get('primary_unit');
    if(primary) unitRows.push({id:id('iu'),indicator_id:newId,unit_name:primary,role:fd.get('primary_role')||'Chá»§ trÃ¬',is_primary:true});
    const co=fd.getAll('co_units').filter(Boolean);
    co.forEach(u=>{ if(u!==primary) unitRows.push({id:id('iu'),indicator_id:newId,unit_name:u,role:u==='Táº¥t cáº£ Ä‘Æ¡n vá»‹'?'Táº¥t cáº£ Ä‘Æ¡n vá»‹':'Phá»‘i há»£p',is_primary:false}); });
    if(unitRows.length){ const ur=await client.from(TABLES.units).insert(unitRows); if(ur.error){toast('Chá»‰ tiÃªu Ä‘Ã£ lÆ°u, nhÆ°ng lá»—i phÃ¢n cÃ´ng Ä‘Æ¡n vá»‹: '+ur.error.message);} }
    await refreshChildCount(row.parent_indicator_id);
    toast('ÄÃ£ lÆ°u chá»‰ tiÃªu'); closeDrawer(); await loadData(true); render();
  }
  async function refreshChildCount(parentId){
    if(!parentId) return;
    const client=getClient();
    const cnt=STATE.indicators.filter(i=>i.parent_indicator_id===parentId).length+1;
    await client.from(TABLES.indicators).update({child_count:cnt}).eq('id',parentId);
  }

  async function openDetail(indId){
    const i=indicatorById(indId); if(!i) return;
    const d=docById(i.document_id)||{}; const units=assignmentsOf(indId); const children=childrenOf(indId);
    const res=await getClient().from(TABLES.updates).select('*').eq('indicator_id',indId).order('report_year',{ascending:false}).order('created_at',{ascending:false});
    const updates=res.error?[]:(res.data||[]);
    const body=`<div class="nq-detail-grid">
      <div class="nq-detail-box"><strong>VÄƒn báº£n nguá»“n</strong><p>${esc(d.code||'')} - ${esc(d.title||'')}</p></div>
      <div class="nq-detail-box"><strong>Má»¥c tiÃªu</strong><p>${esc(targetLabel(i))}</p>${badge(i.status)}</div>
      <div class="nq-detail-box"><strong>ÄÆ¡n vá»‹ thá»±c hiá»‡n</strong><p>${units.length?units.map(roleBadge).join(' '):'ChÆ°a phÃ¢n cÃ´ng'}</p></div>
      <div class="nq-detail-box"><strong>Chu ká»³/má»‘c</strong><p>${esc(i.cycle||'')} â€¢ ${esc(i.tracking_scope||'')} â€¢ ${esc(i.target_year||'')}</p></div>
    </div>
    <div class="nq-detail-box"><strong>TrÃ­ch nguyÃªn vÄƒn</strong><p>${esc(i.source_excerpt||i.title)}</p></div>
    ${children.length?`<div class="nq-detail-box"><strong>Chá»‰ tiÃªu con</strong><div class="nq-list">${children.map(renderIndicatorRow).join('')}</div></div>`:''}
    <div class="nq-detail-box"><strong>Cáº­p nháº­t ká»³ bÃ¡o cÃ¡o</strong><div class="nq-actions" style="justify-content:flex-start;margin-bottom:10px"><button class="nq-btn nq-btn-primary" onclick="NQIndicators.openUpdateForm('${i.id}')">+ Cáº­p nháº­t ká»³</button></div><div class="nq-timeline">${updates.length?updates.map(u=>`<div class="nq-timeline-item"><b>${esc(u.report_period)} ${esc(u.report_year)} â€¢ ${esc(u.assessment)}</b><p>${esc(u.actual_text||'')}</p><p class="nq-muted">${esc(u.reason||'')}</p></div>`).join(''):'<div class="nq-muted">ChÆ°a cÃ³ cáº­p nháº­t ká»³.</div>'}</div></div>
    <div class="nq-actions"><button class="nq-btn nq-btn-soft" onclick="NQIndicators.openIndicatorForm('${i.id}')">Sá»­a chá»‰ tiÃªu</button><button class="nq-btn nq-btn-primary" onclick="NQIndicators.openIndicatorForm(null,'${i.document_id}','${i.id}')">+ Chá»‰ tiÃªu con</button></div>`;
    openDrawer(i.code||'Chi tiáº¿t chá»‰ tiÃªu',i.title,body);
  }

  function openUpdateForm(indId){
    const i=indicatorById(indId); if(!i) return;
    const units=assignmentsOf(indId).map(a=>a.unit_name);
    const body=`<form class="nq-form-section" onsubmit="NQIndicators.saveUpdate(event,'${indId}')">
      <h3>Cáº­p nháº­t káº¿t quáº£ ká»³ bÃ¡o cÃ¡o</h3>
      <div class="nq-form-grid">
        <label class="nq-label">Ká»³ bÃ¡o cÃ¡o<select name="report_period" class="nq-field">${opt(PERIODS,'NÄƒm')}</select></label>
        <label class="nq-label">NÄƒm<input name="report_year" type="number" class="nq-field" value="${new Date().getFullYear()}" /></label>
        <label class="nq-label">ÄÆ¡n vá»‹ cáº­p nháº­t<select name="unit_name" class="nq-field"><option value="">ToÃ n phÆ°á»ng</option>${selectedIn(unique(units), '')}</select></label>
        <label class="nq-label">ÄÃ¡nh giÃ¡<select name="assessment" class="nq-field">${selectedIn(STATUS,'Äang thá»±c hiá»‡n')}</select></label>
        <label class="nq-label">Sá»‘ liá»‡u thá»±c táº¿<input name="actual_value" class="nq-field" /></label>
        <label class="nq-label">Tiáº¿n Ä‘á»™ %<input name="progress_percent" class="nq-field" /></label>
        <label class="nq-label span-2">Káº¿t quáº£ báº±ng chá»¯<textarea name="actual_text" class="nq-field"></textarea></label>
        <label class="nq-label span-2">KhÃ³ khÄƒn/nguyÃªn nhÃ¢n<textarea name="reason" class="nq-field"></textarea></label>
        <label class="nq-label span-2">Giáº£i phÃ¡p<textarea name="solution" class="nq-field"></textarea></label>
        <label class="nq-label span-2">Minh chá»©ng/link<input name="evidence" class="nq-field" /></label>
      </div>
      <div class="nq-actions"><button class="nq-btn nq-btn-primary">LÆ°u cáº­p nháº­t</button></div>
    </form>`;
    openDrawer('Cáº­p nháº­t ká»³',i.title,body);
  }
  async function saveUpdate(e,indId){
    e.preventDefault(); const fd=new FormData(e.target); const row={id:id('upd'),indicator_id:indId,report_period:fd.get('report_period'),report_year:ival(fd.get('report_year'))||new Date().getFullYear(),unit_name:fd.get('unit_name')||null,actual_value:nval(fd.get('actual_value')),actual_text:fd.get('actual_text')||null,assessment:fd.get('assessment')||'Äang thá»±c hiá»‡n',progress_percent:nval(fd.get('progress_percent')),reason:fd.get('reason')||null,solution:fd.get('solution')||null,evidence:fd.get('evidence')||null};
    const client=getClient(); const res=await client.from(TABLES.updates).insert(row); if(res.error){toast('Lá»—i lÆ°u cáº­p nháº­t: '+res.error.message);return;}
    await client.from(TABLES.indicators).update({status:row.assessment}).eq('id',indId);
    toast('ÄÃ£ lÆ°u cáº­p nháº­t ká»³'); closeDrawer(); await loadData(true); render();
  }

  async function mount(){
    ensureCss();
    const root=document.getElementById('nqIndicatorsRoot'); if(!root) return;
    root.className='nq-root'; root.innerHTML='<div class="nq-card nq-empty"><b>Äang táº£i module chá»‰ tiÃªu...</b> Vui lÃ²ng chá» trong giÃ¢y lÃ¡t.</div>';
    try{ await loadData(); render(); }catch(err){ root.innerHTML=`<div class="nq-card nq-empty"><b>Lá»—i táº£i module</b><p>${esc(err.message||err)}</p></div>`; }
  }
  function setView(v){STATE.view=v; render();}
  function filterByUnit(unit){STATE.filters.unit=unit; STATE.view='list'; render();}

  window.NQIndicators={mount,setView,openDocumentForm,saveDocument,openLinkForm,saveLink,openIndicatorForm,saveIndicator,openDetail,openUpdateForm,saveUpdate,closeDrawer,filterByUnit};
})();

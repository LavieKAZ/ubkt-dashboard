// UI/client module for AI-assisted one-page report analysis.
// No API keys are stored or sent from the browser except the user's Supabase session token.
(function initAiOnePageReport(){
  var state = { running: false, lastText: '' };

  function byId(id){ return document.getElementById(id); }

  function text(value){
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value){
    return text(value).replace(/[&<>"]/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]);
    });
  }

  function taskGet(task, key, fallback){
    try{
      if(typeof window.taskValue === 'function') return window.taskValue(task, key, fallback || '');
    }catch(_err){}
    return task && task[key] != null ? task[key] : (fallback || '');
  }

  function taskDone(task){
    try{ if(typeof window.taskIsDone === 'function') return window.taskIsDone(task); }catch(_err){}
    return text(taskGet(task, 'status')).toLowerCase().indexOf('hoan thanh') >= 0 || text(taskGet(task, 'status')).toLowerCase().indexOf('hoàn thành') >= 0;
  }

  function taskLate(task){
    try{ if(typeof window.taskIsLateUnified === 'function') return window.taskIsLateUnified(task); }catch(_err){}
    return text(taskGet(task, 'status')).toLowerCase().indexOf('qua han') >= 0 || text(taskGet(task, 'status')).toLowerCase().indexOf('quá hạn') >= 0;
  }

  function taskUnitName(task){
    try{ if(typeof window.taskUnit === 'function') return window.taskUnit(task); }catch(_err){}
    return text(taskGet(task, 'unit') || taskGet(task, 'leadUnit') || 'Chưa rõ');
  }

  function activeTasks(){
    var source = Array.isArray(window.localState && window.localState.tasks)
      ? window.localState.tasks
      : (Array.isArray(window.tasks) ? window.tasks : []);
    return source.filter(function(task){
      var deleted = taskGet(task, 'is_deleted', false);
      return !(deleted === true || String(deleted).toLowerCase() === 'true');
    });
  }

  function buildPayload(){
    if(typeof window.generateReport === 'function') window.generateReport();

    var reportBox = byId('reportBox');
    var tasks = activeTasks();
    var completed = tasks.filter(taskDone);
    var late = tasks.filter(function(task){ return !taskDone(task) && taskLate(task); });
    var open = tasks.filter(function(task){ return !taskDone(task); });
    var units = {};

    tasks.forEach(function(task){
      var unit = taskUnitName(task) || 'Chưa rõ';
      if(!units[unit]) units[unit] = { unit: unit, total: 0, completed: 0, open: 0, late: 0 };
      units[unit].total += 1;
      if(taskDone(task)) units[unit].completed += 1;
      else units[unit].open += 1;
      if(!taskDone(task) && taskLate(task)) units[unit].late += 1;
    });

    var riskTasks = late.concat(open.filter(function(task){ return !taskLate(task); })).slice(0, 25).map(function(task){
      return {
        doc: text(taskGet(task, 'doc') || taskGet(task, 'docFull')),
        unit: taskUnitName(task),
        status: text(taskGet(task, 'status')),
        deadline: text(taskGet(task, 'deadline') || taskGet(task, 'deadlineText')),
        task: text(taskGet(task, 'task') || taskGet(task, 'contentToDo')).slice(0, 420),
        result: text(taskGet(task, 'result') || taskGet(task, 'currentProgress')).slice(0, 260)
      };
    });

    return {
      reportText: text(reportBox ? reportBox.innerText : ''),
      metrics: {
        total: tasks.length,
        completed: completed.length,
        open: open.length,
        late: late.length,
        completionRate: tasks.length ? Math.round(completed.length / tasks.length * 100) : 0
      },
      units: Object.keys(units).map(function(key){ return units[key]; }).sort(function(a,b){
        return b.late - a.late || b.open - a.open || b.total - a.total || a.unit.localeCompare(b.unit, 'vi');
      }).slice(0, 20),
      riskTasks: riskTasks
    };
  }

  function endpointUrl(){
    if(window.UBKT_AI_REPORT_ENDPOINT) return window.UBKT_AI_REPORT_ENDPOINT;
    var base = text(window.UBKT_SUPABASE_URL || '');
    if(base) return base.replace(/\/$/, '') + '/functions/v1/ai-one-page-report';
    return '';
  }

  async function authHeaders(){
    var headers = { 'Content-Type': 'application/json' };
    try{
      if(typeof window.getSupabaseClient === 'function'){
        var client = window.getSupabaseClient();
        var result = await client.auth.getSession();
        var token = result && result.data && result.data.session && result.data.session.access_token;
        if(token) headers.Authorization = 'Bearer ' + token;
      }
    }catch(_err){}
    return headers;
  }

  function setRunning(isRunning){
    state.running = isRunning;
    var btn = byId('aiOnePageRunBtn');
    var status = byId('aiOnePageStatus');
    if(btn){
      btn.disabled = isRunning;
      btn.innerHTML = isRunning ? '<span class="ai-report-spinner"></span> Đang phân tích...' : 'Phân tích bằng AI';
    }
    if(status) status.classList.toggle('open', isRunning);
  }

  function showError(message){
    var el = byId('aiOnePageError');
    if(!el) return;
    el.textContent = message;
    el.classList.add('open');
  }

  function clearError(){
    var el = byId('aiOnePageError');
    if(el) el.classList.remove('open');
  }

  function showOutput(content){
    var box = byId('aiOnePageOutput');
    if(!box) return;
    state.lastText = content;
    box.innerHTML = '<h5>Kết quả phân tích</h5><div>' + escapeHtml(content).replace(/\n/g, '<br>') + '</div>';
    box.classList.add('open');
  }

  async function run(){
    if(state.running) return;
    clearError();
    var url = endpointUrl();
    if(!url){
      showError('Chưa cấu hình endpoint AI. Hãy triển khai Edge Function ai-one-page-report hoặc đặt window.UBKT_AI_REPORT_ENDPOINT.');
      return;
    }

    setRunning(true);
    try{
      var resp = await fetch(url, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(buildPayload())
      });
      var data = await resp.json().catch(function(){ return {}; });
      if(!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
      showOutput(data.analysis || data.text || 'Chưa có nội dung phân tích.');
    }catch(err){
      showError('Không thể tạo phân tích AI: ' + (err && err.message ? err.message : String(err)));
    }finally{
      setRunning(false);
    }
  }

  function copy(){
    var textValue = state.lastText || text(byId('aiOnePageOutput') && byId('aiOnePageOutput').innerText);
    if(!textValue) return;
    navigator.clipboard.writeText(textValue).then(function(){
      var btn = byId('aiOnePageCopyBtn');
      if(!btn) return;
      var old = btn.textContent;
      btn.textContent = 'Đã sao chép';
      setTimeout(function(){ btn.textContent = old; }, 1600);
    });
  }

  function injectPanel(){
    if(byId('aiOnePageReportPanel')) return;
    var reportBox = byId('reportBox');
    if(!reportBox) return;
    var panel = document.createElement('div');
    panel.id = 'aiOnePageReportPanel';
    panel.className = 'ai-report-panel';
    panel.innerHTML = [
      '<div class="ai-report-head">',
        '<div class="ai-report-title">',
          '<div class="ai-report-icon" aria-hidden="true">✦</div>',
          '<div>',
            '<h4>Phân tích báo cáo một trang</h4>',
            '<p>Đọc nội dung báo cáo hiện tại, chỉ ra điểm nổi bật, rủi ro và kiến nghị xử lý.</p>',
          '</div>',
        '</div>',
        '<div class="ai-report-actions">',
          '<button id="aiOnePageRunBtn" class="ai-report-btn" type="button">Phân tích bằng AI</button>',
          '<button id="aiOnePageCopyBtn" class="ai-report-btn ai-report-ghost" type="button">Sao chép</button>',
        '</div>',
      '</div>',
      '<div id="aiOnePageStatus" class="ai-report-status"><span class="ai-report-spinner"></span><span>Đang đọc báo cáo và phân tích nhiệm vụ...</span></div>',
      '<div id="aiOnePageError" class="ai-report-error"></div>',
      '<div id="aiOnePageOutput" class="ai-report-output"></div>'
    ].join('');
    reportBox.insertAdjacentElement('afterend', panel);
    byId('aiOnePageRunBtn').addEventListener('click', run);
    byId('aiOnePageCopyBtn').addEventListener('click', copy);
  }

  document.addEventListener('DOMContentLoaded', injectPanel);
  window.addEventListener('load', injectPanel);
  window.runOnePageReportAi = run;
})();

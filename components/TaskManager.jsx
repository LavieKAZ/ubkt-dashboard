'use client'
import { useEffect, useState, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { PERMISSIONS, STATUS_OPTIONS, GROUP_OPTIONS, HORIZON_OPTIONS, diffDays, fmtDate, statusBadgeClass, groupBadgeClass, isLongTerm } from '@/lib/constants'

function DeadlineBadge({ deadline, status }) {
  if (!deadline) return <span className="badge b-gray">chưa có hạn</span>
  if (status === 'hoàn thành') return <span className="badge b-green">{fmtDate(deadline)}</span>
  const d = diffDays(deadline)
  if (d < 0)  return <span className="badge b-coral">quá hạn {Math.abs(d)} ngày</span>
  if (d === 0) return <span className="badge b-yellow">hôm nay</span>
  if (d <= 7)  return <span className="badge b-yellow">còn {d} ngày</span>
  return <span className="badge b-gray">{fmtDate(deadline)}</span>
}

const EMPTY = {
  source_table:'', doc_number:'', doc_full:'', task_group:'Thông báo kết luận',
  task_type:'', summary:'', order_num:1, task_content:'', conclusion:'',
  deadline:'', deadline_text:'', issue_date:'', meeting:'',
  status:'chưa thực hiện', result:'', recommendation:'', note:'',
  horizon:'short', source_resolution:''
}

export default function TaskManager({ profile, role }) {
  const [tasks, setTasks]       = useState([])
  const [depts, setDepts]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [filters, setFilters]   = useState({ group:'', unit:'', status:'', deadline:'', keyword:'' })
  const [editTask, setEditTask] = useState(null)   // null = closed, 'new' = new, object = editing
  const [detailTask, setDetailTask] = useState(null)
  const [dupWarning, setDupWarning] = useState(null)
  const [saving, setSaving]     = useState(false)

  const can = PERMISSIONS
  const myDeptId = profile?.department_id

  const load = useCallback(async () => {
    const sb = getSupabase()
    setLoading(true)
    let q = sb.from('tasks').select('*,departments(id,name,code)').order('created_at', { ascending: false })
    if (role === 'don_vi' && myDeptId) q = q.eq('assigned_to_dept_id', myDeptId)
    const [{ data: t }, { data: d }] = await Promise.all([q, sb.from('departments').select('*').order('name')])
    setTasks(t || []); setDepts(d || [])
    setLoading(false)
  }, [role, myDeptId])

  useEffect(() => { load() }, [load])

  function filtered() {
    return tasks.filter(t => {
      const { group, unit, status, deadline, keyword } = filters
      if (group   && t.task_group !== group)  return false
      if (unit    && t.departments?.name !== unit) return false
      if (status  && t.status !== status)     return false
      if (deadline === 'overdue' && !(diffDays(t.deadline) < 0 && t.status !== 'hoàn thành')) return false
      if (deadline === 'soon7'   && !(diffDays(t.deadline) >= 0 && diffDays(t.deadline) <= 7 && t.status !== 'hoàn thành')) return false
      if (deadline === 'noResult' && t.result?.trim()) return false
      if (keyword) {
        const kw = keyword.toLowerCase()
        const txt = [t.title, t.task_content, t.doc_number, t.doc_full, t.summary, t.departments?.name].join(' ').toLowerCase()
        if (!txt.includes(kw)) return false
      }
      return true
    })
  }

  async function saveTask(form, deptId, confirmed = false) {
    const sb = getSupabase()
    // duplicate check
    if (!form.id && !confirmed) {
      const dup = tasks.find(t => t.doc_number && t.doc_number.trim().toLowerCase() === form.doc_number?.trim().toLowerCase())
      if (dup) { setDupWarning({ dup, form, deptId }); return }
    }
    setSaving(true)
    const payload = {
      ...form,
      assigned_to_dept_id: deptId || null,
      updated_at: new Date().toISOString(),
      created_by: profile?.id,
      // map to DB columns
      title: form.task_content || form.title || '',
    }
    delete payload.departments
    if (form.id) {
      await sb.from('tasks').update(payload).eq('id', form.id)
      // audit
      await sb.from('audit_logs').insert({ user_id: profile.id, action: 'Cập nhật nhiệm vụ', resource_type: 'tasks', resource_id: form.id, new_values: { status: form.status } })
    } else {
      const { data } = await sb.from('tasks').insert({ ...payload, tab_type: 'ket_luan' }).select().single()
      await sb.from('audit_logs').insert({ user_id: profile.id, action: 'Thêm nhiệm vụ', resource_type: 'tasks', resource_id: data?.id, new_values: { doc: form.doc_number } })
    }
    setSaving(false); setEditTask(null); setDupWarning(null)
    load()
  }

  async function saveProgress(id, updates) {
    const sb = getSupabase()
    const old = tasks.find(t => t.id === id)
    await sb.from('tasks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    await sb.from('task_updates').insert({ task_id: id, updated_by: profile.id, old_status: old?.status, new_status: updates.status, content: updates.result || '' })
    await sb.from('audit_logs').insert({ user_id: profile.id, action: 'Cập nhật tiến độ', resource_type: 'tasks', resource_id: id, new_values: updates })
    setDetailTask(null); load()
  }

  async function deleteTask(id) {
    if (!confirm('Xác nhận xóa nhiệm vụ này?')) return
    await getSupabase().from('tasks').delete().eq('id', id)
    await getSupabase().from('audit_logs').insert({ user_id: profile.id, action: 'Xóa nhiệm vụ', resource_type: 'tasks', resource_id: id })
    load()
  }

  async function quickComplete(t) {
    await saveProgress(t.id, { status: 'hoàn thành', result: t.result || 'Đã cập nhật hoàn thành.' })
  }

  const rows = filtered()
  const groups = [...new Set(tasks.map(t => t.task_group).filter(Boolean))]
  const units  = [...new Set(tasks.map(t => t.departments?.name).filter(Boolean))]

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="card rounded-3xl p-4 flex flex-wrap gap-3 items-center">
        <input className="field flex-1 min-w-40" placeholder="🔍 Tìm kiếm…"
          value={filters.keyword} onChange={e => setFilters(f => ({ ...f, keyword: e.target.value }))} />
        <select className="field w-auto" value={filters.group} onChange={e => setFilters(f => ({ ...f, group: e.target.value }))}>
          <option value="">Tất cả nhóm</option>
          {groups.map(g => <option key={g}>{g}</option>)}
        </select>
        <select className="field w-auto" value={filters.unit} onChange={e => setFilters(f => ({ ...f, unit: e.target.value }))}>
          <option value="">Tất cả đơn vị</option>
          {units.map(u => <option key={u}>{u}</option>)}
        </select>
        <select className="field w-auto" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">Tất cả trạng thái</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="field w-auto" value={filters.deadline} onChange={e => setFilters(f => ({ ...f, deadline: e.target.value }))}>
          <option value="">Tất cả hạn</option>
          <option value="overdue">Quá hạn</option>
          <option value="soon7">Sắp hạn 7 ngày</option>
          <option value="noResult">Thiếu kết quả</option>
        </select>
        {can.canManageTasks(role) && (
          <button className="btn btn-primary ml-auto" onClick={() => setEditTask({ ...EMPTY })}>
            + Thêm mới
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="badge b-blue">Hiển thị {rows.length} / {tasks.length} nhiệm vụ</span>
        <span className="badge b-green">✅ {tasks.filter(t=>t.status==='hoàn thành').length} HT</span>
        <span className="badge b-coral">🔴 {tasks.filter(t=>diffDays(t.deadline)<0&&t.status!=='hoàn thành').length} quá hạn</span>
        <span className="badge b-yellow">⚠️ {tasks.filter(t=>{const d=diffDays(t.deadline);return d>=0&&d<=7&&t.status!=='hoàn thành'}).length} sắp hạn</span>
      </div>

      {/* Table */}
      <div className="card rounded-3xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#4D96FF] border-t-transparent rounded-full animate-spin"/></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-bold">Không có nhiệm vụ phù hợp</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-3 font-extrabold text-slate-600">Số VB</th>
                  <th className="text-left p-3 font-extrabold text-slate-600 min-w-[200px]">Nội dung nhiệm vụ</th>
                  <th className="text-left p-3 font-extrabold text-slate-600">Đơn vị</th>
                  <th className="text-left p-3 font-extrabold text-slate-600">Hạn</th>
                  <th className="text-left p-3 font-extrabold text-slate-600">Trạng thái</th>
                  <th className="text-left p-3 font-extrabold text-slate-600">Nhóm</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3">
                      <p className="font-bold text-xs text-slate-500">{t.doc_number || t.so_van_ban || '—'}</p>
                      {isLongTerm(t) && <span className="badge tenure-chip mt-1">nhiệm kỳ</span>}
                    </td>
                    <td className="p-3">
                      <button className="text-left hover:text-[#4D96FF] transition-colors font-medium line-clamp-2 max-w-xs"
                        onClick={() => setDetailTask(t)}>
                        {t.title || t.task_content || '—'}
                      </button>
                      {t.result && <p className="text-xs text-slate-400 mt-1 line-clamp-1">✔ {t.result}</p>}
                    </td>
                    <td className="p-3 whitespace-nowrap text-xs text-slate-600">{t.departments?.name || '—'}</td>
                    <td className="p-3 whitespace-nowrap"><DeadlineBadge deadline={t.deadline} status={t.status} /></td>
                    <td className="p-3 whitespace-nowrap"><span className={`badge ${statusBadgeClass(t.status)}`}>{t.status || '—'}</span></td>
                    <td className="p-3 whitespace-nowrap"><span className={`badge ${groupBadgeClass(t.task_group)}`}>{t.task_group || '—'}</span></td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {can.canUpdateProgress(role) && t.status !== 'hoàn thành' && (
                          <button className="btn bg-green-50 border border-green-200 text-green-700 py-1 px-2.5 text-xs" onClick={() => quickComplete(t)}>✓</button>
                        )}
                        <button className="icon-btn text-blue-500" title="Xem chi tiết" onClick={() => setDetailTask(t)}>👁</button>
                        {can.canManageTasks(role) && (
                          <>
                            <button className="icon-btn text-blue-500" title="Chỉnh sửa" onClick={() => setEditTask({ ...t })}>✏️</button>
                            <button className="icon-btn text-red-400" title="Xóa" onClick={() => deleteTask(t.id)}>🗑</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit/Add modal */}
      {editTask && (
        <TaskFormModal task={editTask} depts={depts} role={role} saving={saving}
          onSave={(form, deptId) => saveTask(form, deptId)}
          onClose={() => setEditTask(null)} />
      )}

      {/* Duplicate warning */}
      {dupWarning && (
        <div className="modal-overlay">
          <div className="modal-card card rounded-3xl w-full max-w-md p-6">
            <h3 className="font-extrabold text-lg text-yellow-700 mb-3">⚠️ Trùng số văn bản</h3>
            <p className="text-sm text-slate-600 mb-4">
              Số văn bản <b>{dupWarning.form.doc_number}</b> đã có trong hệ thống với nhiệm vụ:<br/>
              <span className="text-slate-800 font-bold">{dupWarning.dup.title || dupWarning.dup.task_content}</span>
            </p>
            <div className="flex gap-3">
              <button className="btn btn-primary flex-1" onClick={() => saveTask(dupWarning.form, dupWarning.deptId, true)}>Tiếp tục thêm</button>
              <button className="btn btn-ghost flex-1" onClick={() => setDupWarning(null)}>Quay lại</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail/Progress modal */}
      {detailTask && (
        <DetailModal task={detailTask} role={role} profile={profile}
          onSave={saveProgress} onClose={() => setDetailTask(null)} />
      )}
    </div>
  )
}

// ── Task Form Modal ──
function TaskFormModal({ task, depts, role, saving, onSave, onClose }) {
  const [form, setForm]   = useState({ ...task })
  const [deptId, setDept] = useState(task.assigned_to_dept_id || '')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card card rounded-3xl w-full max-w-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-extrabold text-lg">{form.id ? '✏️ Chỉnh sửa nhiệm vụ' : '➕ Thêm nhiệm vụ mới'}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="grid grid-cols-2 gap-4 overflow-auto max-h-[70vh] pr-1">
          <div className="col-span-2">
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Nội dung nhiệm vụ *</label>
            <textarea className="field resize-none" rows={3} value={form.task_content || ''} onChange={e => set('task_content', e.target.value)} placeholder="Mô tả nội dung cụ thể của nhiệm vụ…" />
          </div>
          <div>
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Số văn bản</label>
            <input className="field" value={form.doc_number || ''} onChange={e => set('doc_number', e.target.value)} placeholder="VD: TB số 92-TB/VPĐU" />
          </div>
          <div>
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Ngày ban hành</label>
            <input type="date" className="field" value={form.issue_date || ''} onChange={e => set('issue_date', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Nhóm văn bản</label>
            <select className="field" value={form.task_group || ''} onChange={e => set('task_group', e.target.value)}>
              {GROUP_OPTIONS.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Loại hình</label>
            <select className="field" value={form.horizon || 'short'} onChange={e => set('horizon', e.target.value)}>
              {HORIZON_OPTIONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Đơn vị thực hiện</label>
            <select className="field" value={deptId} onChange={e => setDept(e.target.value)}>
              <option value="">— Chọn đơn vị —</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Hạn chót</label>
            <input type="date" className="field" value={form.deadline || ''} onChange={e => set('deadline', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Trạng thái</label>
            <select className="field" value={form.status || 'chưa thực hiện'} onChange={e => set('status', e.target.value)}>
              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Trích yếu</label>
            <textarea className="field resize-none" rows={2} value={form.summary || ''} onChange={e => set('summary', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Kết quả thực hiện</label>
            <textarea className="field resize-none" rows={3} value={form.result || ''} onChange={e => set('result', e.target.value)} placeholder="Kết quả, tiến độ hiện có…" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Kiến nghị / Xử lý</label>
            <textarea className="field resize-none" rows={2} value={form.recommendation || ''} onChange={e => set('recommendation', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 mt-5 pt-4 border-t border-slate-100">
          <button className="btn btn-primary flex-1" disabled={saving} onClick={() => onSave(form, deptId)}>
            {saving ? '⏳ Đang lưu…' : '💾 Lưu nhiệm vụ'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  )
}

// ── Detail / Progress Modal ──
function DetailModal({ task, role, profile, onSave, onClose }) {
  const [status, setStatus] = useState(task.status || 'đang thực hiện')
  const [result, setResult] = useState(task.result || '')
  const [rec, setRec]       = useState(task.recommendation || '')
  const [note, setNote]     = useState(task.note || '')
  const [saving, setSaving] = useState(false)
  const can = PERMISSIONS

  async function submit() {
    setSaving(true)
    await onSave(task.id, { status, result, recommendation: rec, note })
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card card rounded-3xl w-full max-w-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-extrabold text-lg">📋 Chi tiết nhiệm vụ</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        {/* Info */}
        <div className="bg-slate-50 rounded-2xl p-4 mb-4 space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <span className={`badge ${statusBadgeClass(task.status)}`}>{task.status}</span>
            <span className={`badge ${groupBadgeClass(task.task_group)}`}>{task.task_group}</span>
            {isLongTerm(task) && <span className="badge tenure-chip">nhiệm kỳ</span>}
          </div>
          <p><b>Số VB:</b> {task.doc_number || task.doc_full || '—'}</p>
          <p><b>Ngày:</b> {fmtDate(task.issue_date)}</p>
          <p><b>Trích yếu:</b> {task.summary || '—'}</p>
          <p><b>Nhiệm vụ:</b> {task.title || task.task_content}</p>
          <p><b>Đơn vị:</b> {task.departments?.name || '—'}</p>
          <p><b>Hạn:</b> {task.deadline_text || fmtDate(task.deadline) || 'Chưa có'}</p>
        </div>
        {/* Update form */}
        {can.canUpdateProgress(role) && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Cập nhật trạng thái</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button key={s} onClick={() => setStatus(s)}
                    className={`btn py-2 text-sm ${status === s ? `badge ${statusBadgeClass(s)} border` : 'btn-ghost'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Kết quả thực hiện</label>
              <textarea className="field resize-none" rows={3} value={result} onChange={e => setResult(e.target.value)} placeholder="Ghi nhận kết quả, tiến độ…" />
            </div>
            <div>
              <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Kiến nghị / Xử lý</label>
              <textarea className="field resize-none" rows={2} value={rec} onChange={e => setRec(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Ghi chú</label>
              <input className="field" value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn btn-primary flex-1" disabled={saving} onClick={submit}>
                {saving ? '⏳ Đang lưu…' : '💾 Lưu cập nhật'}
              </button>
              {status !== 'hoàn thành' && (
                <button className="btn btn-green" onClick={() => { setStatus('hoàn thành'); if (!result) setResult('Đã hoàn thành nhiệm vụ.') }}>
                  ✅ Hoàn thành
                </button>
              )}
              <button className="btn btn-ghost" onClick={onClose}>Đóng</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

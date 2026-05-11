'use client'
import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { diffDays, fmtDate, isLongTerm } from '@/lib/constants'
import { Chart as ChartJS, LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
ChartJS.register(LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Filler)

const FONT = { family: '"Be Vietnam Pro", system-ui, sans-serif' }
const opts = (extra={}) => ({ responsive:true, maintainAspectRatio:false, animation:{duration:850}, plugins:{legend:{position:'bottom',labels:{font:FONT}}}, scales:{y:{ticks:{precision:0}}},...extra })

// ══════════ PERIODS VIEW ══════════
export function PeriodsView({ profile, role }) {
  const [periods, setPeriods] = useState([])
  const [tasks, setTasks]     = useState([])
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState({ name:'', from_date:'', to_date:'' })
  const [saving, setSaving]   = useState(false)
  const can = ['admin','van_phong'].includes(role)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const sb = getSupabase()
    const [{ data: p },{ data: t }] = await Promise.all([
      sb.from('periods').select('*').order('created_at'),
      sb.from('tasks').select('*,departments(name)')
    ])
    setPeriods(p||[]); setTasks(t||[])
  }

  function calcCurrent() {
    const total = tasks.length
    const done  = tasks.filter(t=>t.status==='hoàn thành').length
    const open  = tasks.filter(t=>t.status!=='hoàn thành').length
    const late  = tasks.filter(t=>t.status==='quá hạn'||(diffDays(t.deadline)<0&&t.status!=='hoàn thành')).length
    return { total, done, open, late }
  }

  async function closePeriod() {
    const sb = getSupabase(); setSaving(true)
    const prev = periods.at(-1)
    const s = calcCurrent()
    await sb.from('periods').insert({
      ...form, ...s,
      added:              prev ? Math.max(0, s.total - prev.total)        : s.total,
      completed_in_period:prev ? Math.max(0, s.done  - prev.done)         : s.done,
      debt_added:         prev ? Math.max(0, s.open  - prev.open)         : s.open,
      created_by: profile?.id
    })
    setSaving(false); setModal(false); setForm({name:'',from_date:'',to_date:''}); loadAll()
  }

  const unitStats = () => {
    const units = [...new Set(tasks.map(t=>t.departments?.name).filter(Boolean))]
    const last = periods.at(-1)
    return units.map(unit => {
      const ut = tasks.filter(t=>t.departments?.name===unit)
      return {
        unit, total:ut.length,
        done: ut.filter(t=>t.status==='hoàn thành').length,
        late: ut.filter(t=>t.status==='quá hạn'||(diffDays(t.deadline)<0&&t.status!=='hoàn thành')).length,
        open: ut.filter(t=>t.status!=='hoàn thành').length,
      }
    }).sort((a,b)=>b.late-a.late)
  }

  const periodChartData = {
    labels: periods.map(p=>p.name),
    datasets:[
      {label:'Hoàn thành thêm', data:periods.map(p=>p.completed_in_period), borderColor:'#6BCB77', backgroundColor:'rgba(107,203,119,.15)', tension:.35, fill:true},
      {label:'Bổ sung mới',     data:periods.map(p=>p.added),               borderColor:'#4D96FF', backgroundColor:'rgba(77,150,255,.12)',  tension:.35, fill:true},
      {label:'Nợ thêm',         data:periods.map(p=>p.debt_added),           borderColor:'#FF6B6B', backgroundColor:'rgba(255,107,107,.12)', tension:.35, fill:true},
    ]
  }

  const uStats = unitStats()
  const unitDeltaData = {
    labels: uStats.map(u=>u.unit),
    datasets:[
      {label:'Hoàn thành', data:uStats.map(u=>u.done), backgroundColor:'#6BCB77', borderRadius:8},
      {label:'Quá hạn/nợ', data:uStats.map(u=>u.late), backgroundColor:'#FF6B6B', borderRadius:8},
      {label:'Tổng tồn',   data:uStats.map(u=>u.open), backgroundColor:'#4D96FF', borderRadius:8},
    ]
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-xl">Chốt kỳ báo cáo</h2>
          <p className="text-sm text-slate-500">Theo dõi biến động nhiệm vụ qua từng kỳ</p>
        </div>
        {can && <button className="btn btn-primary" onClick={() => setModal(true)}>📸 Chốt kỳ mới</button>}
      </div>

      {/* Current stats */}
      {(() => { const s=calcCurrent(); return (
        <div className="grid grid-cols-4 gap-4">
          {[['Tổng','text-[#4D96FF]',s.total],['Hoàn thành','text-[#6BCB77]',s.done],['Quá hạn','text-[#FF6B6B]',s.late],['Tồn','text-slate-700',s.open]].map(([l,c,v])=>(
            <div key={l} className="card rounded-3xl p-4 text-center"><p className="text-xs font-extrabold text-slate-400 uppercase">{l}</p><p className={`text-3xl font-extrabold mt-1 ${c}`}>{v}</p></div>
          ))}
        </div>
      )})()}

      {/* Charts */}
      {periods.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="card rounded-3xl p-4">
            <h3 className="font-extrabold mb-3">Xu hướng theo kỳ</h3>
            <div className="chart-box"><Line data={periodChartData} options={opts()} /></div>
          </div>
          <div className="card rounded-3xl p-4">
            <h3 className="font-extrabold mb-3">Biến động theo đơn vị</h3>
            <div className="chart-box"><Bar data={unitDeltaData} options={opts({indexAxis:'y',scales:{x:{ticks:{precision:0}}}})} /></div>
          </div>
        </div>
      )}

      {/* Unit table */}
      <div className="card rounded-3xl overflow-hidden">
        <div className="p-4 border-b border-slate-100"><h3 className="font-extrabold">Chi tiết theo đơn vị</h3></div>
        <div className="divide-y divide-slate-100">
          {uStats.map(u=>(
            <div key={u.unit} className="unit-row p-4 flex flex-wrap items-center justify-between gap-3">
              <b className="text-sm">{u.unit}</b>
              <div className="flex gap-2 flex-wrap">
                <span className="badge b-green">HT {u.done}/{u.total}</span>
                <span className="badge b-coral">quá hạn {u.late}</span>
                <span className="badge b-gray">tồn {u.open}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Period history */}
      {periods.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-extrabold">Lịch sử các kỳ</h3>
          {[...periods].reverse().map(p=>(
            <div key={p.id} className="card rounded-3xl p-4">
              <div className="flex justify-between gap-3 mb-3">
                <b>{p.name}</b>
                <span className="badge b-gray">{fmtDate(p.from_date)} – {fmtDate(p.to_date)}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                {[['HT thêm','bg-green-50','text-[#6BCB77]',p.completed_in_period],['Mới','bg-blue-50','text-[#4D96FF]',p.added],['Nợ thêm','bg-red-50','text-[#FF6B6B]',p.debt_added],['Tồn','bg-yellow-50','text-slate-700',p.open]].map(([l,bg,c,v])=>(
                  <div key={l} className={`${bg} rounded-xl p-2`}><b className={c}>{v}</b><p className="text-xs text-slate-500">{l}</p></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chốt kỳ modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-card card rounded-3xl w-full max-w-md p-6" onClick={e=>e.stopPropagation()}>
            <h2 className="font-extrabold text-lg mb-4">📸 Chốt kỳ báo cáo</h2>
            {(() => { const s=calcCurrent(); return (
              <div className="bg-slate-50 rounded-2xl p-3 mb-4 text-sm space-y-1">
                <b>Số liệu hiện tại:</b>
                <p>Tổng: {s.total} | Hoàn thành: {s.done} | Tồn: {s.open} | Quá hạn: {s.late}</p>
              </div>
            )})()}
            <div className="space-y-3">
              <div><label className="text-xs font-extrabold text-slate-500 uppercase mb-1 block">Tên kỳ</label>
                <input className="field" placeholder="VD: Tuần 20, Tháng 5/2026" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-extrabold text-slate-500 uppercase mb-1 block">Từ ngày</label><input type="date" className="field" value={form.from_date} onChange={e=>setForm(f=>({...f,from_date:e.target.value}))} /></div>
                <div><label className="text-xs font-extrabold text-slate-500 uppercase mb-1 block">Đến ngày</label><input type="date" className="field" value={form.to_date} onChange={e=>setForm(f=>({...f,to_date:e.target.value}))} /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="btn btn-primary flex-1" disabled={saving||!form.name} onClick={closePeriod}>{saving?'⏳ Đang lưu…':'✅ Xác nhận chốt kỳ'}</button>
              <button className="btn btn-ghost" onClick={()=>setModal(false)}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════ REPORTS VIEW ══════════
export function ReportsView({ profile, role }) {
  const [tasks, setTasks]     = useState([])
  const [periods, setPeriods] = useState([])
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    const sb = getSupabase()
    Promise.all([
      sb.from('tasks').select('*,departments(name)'),
      sb.from('periods').select('*').order('created_at'),
    ]).then(([{data:t},{data:p}]) => { setTasks(t||[]); setPeriods(p||[]) })
  }, [])

  function generateReport() {
    const total = tasks.length
    const done  = tasks.filter(t=>t.status==='hoàn thành').length
    const open  = tasks.filter(t=>t.status!=='hoàn thành').length
    const late  = tasks.filter(t=>t.status==='quá hạn'||(diffDays(t.deadline)<0&&t.status!=='hoàn thành')).length
    const soon  = tasks.filter(t=>{const d=diffDays(t.deadline);return d>=0&&d<=7&&t.status!=='hoàn thành'}).length
    const tenure = tasks.filter(t=>isLongTerm(t)).length
    const last  = periods.at(-1)
    const units = [...new Set(tasks.map(t=>t.departments?.name).filter(Boolean))]
    const unitLines = units.map(u=>{
      const ut=tasks.filter(t=>t.departments?.name===u)
      return `- ${u}: hoàn thành ${ut.filter(t=>t.status==='hoàn thành').length}, quá hạn ${ut.filter(t=>diffDays(t.deadline)<0&&t.status!=='hoàn thành').length}, tồn ${ut.filter(t=>t.status!=='hoàn thành').length}`
    }).join('\n')
    return `BÁO CÁO MỘT TRANG — UBKT PHƯỜNG TÂN MỸ
${'='.repeat(50)}

1. TỔNG QUAN
- Tổng nhiệm vụ: ${total}
- Hoàn thành: ${done} (${total?Math.round(done/total*100):0}%)
- Đang thực hiện/chưa hoàn thành: ${open}
- Quá hạn: ${late}
- Sắp hạn 7 ngày: ${soon}
- Nhiệm vụ dài hạn/nhiệm kỳ: ${tenure}

2. BIẾN ĐỘNG KỲ GẦN NHẤT (${last?.name||'chưa chốt kỳ'})
- Hoàn thành thêm: ${last?.completed_in_period||0}
- Bổ sung mới: ${last?.added||0}
- Nợ thêm: ${last?.debt_added||0}
- Tồn cuối kỳ: ${last?.open||open}

3. BIẾN ĐỘNG THEO ĐƠN VỊ
${unitLines}

4. KIẾN NGHỊ
- Đôn đốc đơn vị có quá hạn cập nhật kết quả trước kỳ giao ban.
- Duy trì chốt kỳ hằng tuần để so sánh tăng/giảm tồn.
- Đối với nhiệm vụ dài hạn/nhiệm kỳ, kiểm tra định kỳ theo quý.

Ngày tạo: ${new Date().toLocaleDateString('vi-VN')}
${'='.repeat(50)}`
  }

  const report = generateReport()

  function copyReport() {
    navigator.clipboard.writeText(report).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  function downloadReport() {
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `bao-cao-ubkt-${new Date().toISOString().slice(0,10)}.txt`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-extrabold text-xl">Báo cáo một trang</h2><p className="text-sm text-slate-500">Xuất báo cáo tổng hợp định kỳ</p></div>
        <div className="flex gap-3">
          <button className="btn btn-ghost" onClick={copyReport}>{copied ? '✅ Đã sao chép' : '📋 Sao chép'}</button>
          <button className="btn btn-primary" onClick={downloadReport}>⬇️ Tải xuống</button>
        </div>
      </div>
      <div className="card rounded-3xl p-6">
        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-[60vh]">{report}</pre>
      </div>
    </div>
  )
}

// ══════════ ADMIN VIEW ══════════
export function AdminView({ profile: currentProfile, role }) {
  const [users, setUsers]   = useState([])
  const [depts, setDepts]   = useState([])
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState({ email:'', full_name:'', password:'', role:'don_vi', department_id:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const sb = getSupabase()
    const [{ data: u }, { data: d }] = await Promise.all([
      sb.from('profiles').select('*,departments(name)').order('full_name'),
      sb.from('departments').select('*').order('name'),
    ])
    setUsers(u||[]); setDepts(d||[])
  }

  async function createUser() {
    setSaving(true); setError('')
    const sb = getSupabase()
    const { data, error: signUpErr } = await sb.auth.admin?.createUser?.({
      email: form.email, password: form.password,
      user_metadata: { full_name: form.full_name, role: form.role }
    }) || {}
    if (signUpErr) {
      // fallback: guide admin
      setError('Để tạo người dùng, sử dụng Supabase Dashboard → Authentication → Users → Invite user')
      setSaving(false); return
    }
    if (data?.user) {
      await sb.from('profiles').upsert({ id: data.user.id, email: form.email, full_name: form.full_name, role: form.role, department_id: form.department_id || null, created_by: currentProfile?.id })
    }
    setSaving(false); setModal(null); load()
  }

  async function updateUser(u) {
    const sb = getSupabase()
    await sb.from('profiles').update({ role: u.role, department_id: u.department_id || null, is_active: u.is_active }).eq('id', u.id)
    load()
  }

  const ROLE_LABELS = { admin:'Quản trị viên', van_phong:'Văn phòng', lanh_dao:'Lãnh đạo', don_vi:'Đơn vị TH' }
  const ROLE_COLORS = { admin:'b-coral', van_phong:'b-blue', lanh_dao:'b-green', don_vi:'b-gray' }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-extrabold text-xl">Quản trị người dùng</h2><p className="text-sm text-slate-500">Phân quyền và quản lý tài khoản</p></div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>+ Thêm người dùng</button>
      </div>

      {/* Role guide */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { role:'admin',     desc:'Toàn quyền hệ thống, quản lý người dùng' },
          { role:'van_phong', desc:'Tạo/sửa/xóa nhiệm vụ, chốt kỳ, xem tất cả' },
          { role:'lanh_dao',  desc:'Xem dashboard, báo cáo, chốt kỳ (chỉ đọc)' },
          { role:'don_vi',    desc:'Chỉ xem và cập nhật nhiệm vụ đơn vị mình' },
        ].map(r => (
          <div key={r.role} className="card rounded-3xl p-4">
            <span className={`badge ${ROLE_COLORS[r.role]} mb-2`}>{ROLE_LABELS[r.role]}</span>
            <p className="text-xs text-slate-500">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* User list */}
      <div className="card rounded-3xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 font-extrabold">Danh sách tài khoản ({users.length})</div>
        <div className="divide-y divide-slate-100">
          {users.map(u => (
            <div key={u.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{u.full_name || u.email}</p>
                <p className="text-xs text-slate-400">{u.email}</p>
                {u.departments?.name && <p className="text-xs text-slate-500">📍 {u.departments.name}</p>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`badge ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                {!u.is_active && <span className="badge b-coral">Vô hiệu</span>}
                <button className="icon-btn text-blue-500" onClick={() => setModal(u)}>✏️</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Supabase note */}
      <div className="card rounded-3xl p-5 border-l-4 border-[#4D96FF] bg-blue-50/50">
        <p className="font-bold text-sm mb-1">💡 Cách tạo tài khoản mới</p>
        <p className="text-sm text-slate-600">Vào <b>Supabase Dashboard → Authentication → Users → Invite user</b>, nhập email. Người dùng nhận email kích hoạt, sau đó admin vào đây để gán vai trò và đơn vị.</p>
      </div>

      {/* Edit modal */}
      {modal && typeof modal === 'object' && (
        <EditUserModal user={modal} depts={depts} roleLabels={ROLE_LABELS} onSave={updateUser} onClose={() => setModal(null)} />
      )}

      {/* New user info modal */}
      {modal === 'new' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-card card rounded-3xl w-full max-w-md p-6" onClick={e=>e.stopPropagation()}>
            <h2 className="font-extrabold text-lg mb-4">👤 Thêm người dùng</h2>
            {error && <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-2xl p-3 mb-4 text-sm">{error}</div>}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800 mb-4">
              <b>Hướng dẫn:</b> Vào Supabase Dashboard → Authentication → Users → <b>Invite user</b> → nhập email → gửi link. Sau khi kích hoạt, người dùng sẽ xuất hiện ở đây và bạn có thể gán vai trò.
            </div>
            <button className="btn btn-ghost w-full" onClick={() => setModal(null)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditUserModal({ user, depts, roleLabels, onSave, onClose }) {
  const [form, setForm] = useState({ role: user.role, department_id: user.department_id || '', is_active: user.is_active !== false })
  const [saving, setSaving] = useState(false)
  async function save() { setSaving(true); await onSave({ ...user, ...form }); setSaving(false); onClose() }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card card rounded-3xl w-full max-w-sm p-6" onClick={e=>e.stopPropagation()}>
        <h2 className="font-extrabold text-lg mb-4">✏️ Phân quyền: {user.full_name || user.email}</h2>
        <div className="space-y-4">
          <div><label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Vai trò</label>
            <select className="field" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
              {Object.entries(roleLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Đơn vị</label>
            <select className="field" value={form.department_id} onChange={e=>setForm(f=>({...f,department_id:e.target.value}))}>
              <option value="">— Không gán —</option>
              {depts.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))} />
            <span className="font-bold text-sm">Tài khoản đang hoạt động</span>
          </label>
        </div>
        <div className="flex gap-3 mt-5">
          <button className="btn btn-primary flex-1" disabled={saving} onClick={save}>{saving?'⏳ Đang lưu…':'💾 Lưu phân quyền'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  )
}

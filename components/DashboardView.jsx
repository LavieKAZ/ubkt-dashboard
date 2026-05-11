'use client'
import { useEffect, useState, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import { diffDays, fmtDate, isLongTerm, statusBadgeClass, groupBadgeClass } from '@/lib/constants'
import {
  Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale,
  Tooltip, Legend
} from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const FONT = { family: '"Be Vietnam Pro", system-ui, sans-serif' }
const chartOpts = { responsive: true, maintainAspectRatio: false, animation: { duration: 900, easing: 'easeOutQuart' }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: FONT } } } }

export default function DashboardView({ profile, role, onNavigate }) {
  const [tasks,   setTasks]   = useState([])
  const [alerts,  setAlerts]  = useState([])
  const [loading, setLoading] = useState(true)
  const [showAlerts, setShowAlerts] = useState(false)

  useEffect(() => {
    async function load() {
      const sb = getSupabase()
      let q = sb.from('tasks').select('*,departments(name)').order('created_at', { ascending: false })
      if (role === 'don_vi' && profile?.department_id) {
        q = q.eq('assigned_to_dept_id', profile.department_id)
      }
      const { data } = await q
      const t = data || []
      setTasks(t)
      setAlerts(buildAlerts(t))
      setLoading(false)
    }
    load()
  }, [role, profile])

  function buildAlerts(t) {
    const a = []
    t.forEach(task => {
      const d = diffDays(task.deadline)
      const s = task.status
      if (s !== 'hoàn thành' && d < 0) a.push({ type: 'Quá hạn', cls: 'b-coral', task, msg: `Quá hạn ${Math.abs(d)} ngày` })
      if (s !== 'hoàn thành' && d >= 0 && d <= 7) a.push({ type: 'Sắp hạn', cls: 'b-yellow', task, msg: `Còn ${d} ngày đến hạn` })
      if (!task.result?.trim()) a.push({ type: 'Thiếu kết quả', cls: 'b-gray', task, msg: 'Chưa ghi nhận kết quả' })
    })
    return a
  }

  function calc(arr = tasks) {
    return {
      total:   arr.length,
      done:    arr.filter(t => t.status === 'hoàn thành').length,
      doing:   arr.filter(t => t.status === 'đang thực hiện').length,
      late:    arr.filter(t => t.status === 'quá hạn' || (diffDays(t.deadline) < 0 && t.status !== 'hoàn thành')).length,
      soon:    arr.filter(t => { const d = diffDays(t.deadline); return d >= 0 && d <= 7 && t.status !== 'hoàn thành' }).length,
      tenure:  arr.filter(t => isLongTerm(t)).length,
    }
  }

  const s = calc()

  const statusChartData = {
    labels: ['Hoàn thành', 'Đang thực hiện', 'Chưa thực hiện', 'Quá hạn'],
    datasets: [{
      data: [
        tasks.filter(t => t.status === 'hoàn thành').length,
        tasks.filter(t => t.status === 'đang thực hiện').length,
        tasks.filter(t => t.status === 'chưa thực hiện').length,
        tasks.filter(t => t.status === 'quá hạn').length,
      ],
      backgroundColor: ['#6BCB77','#4D96FF','#cbd5e1','#FF6B6B'],
      borderWidth: 3, borderColor: '#fff',
    }],
  }

  const units = [...new Set(tasks.map(t => t.departments?.name || t.assigned_to_dept_id || 'Khác'))].filter(Boolean)
  const unitChartData = {
    labels: units,
    datasets: [
      { label: 'Hoàn thành',    data: units.map(u => tasks.filter(t => (t.departments?.name || 'Khác') === u && t.status === 'hoàn thành').length),     backgroundColor: '#6BCB77', borderRadius: 8 },
      { label: 'Đang thực hiện', data: units.map(u => tasks.filter(t => (t.departments?.name || 'Khác') === u && t.status === 'đang thực hiện').length), backgroundColor: '#4D96FF', borderRadius: 8 },
      { label: 'Quá hạn',       data: units.map(u => tasks.filter(t => (t.departments?.name || 'Khác') === u && (t.status === 'quá hạn' || diffDays(t.deadline) < 0) && t.status !== 'hoàn thành').length), backgroundColor: '#FF6B6B', borderRadius: 8 },
    ],
  }
  const unitChartOpts = { ...chartOpts, indexAxis: 'y', scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true } } }

  const deadlines = tasks
    .filter(t => t.status !== 'hoàn thành')
    .map(t => ({ ...t, d: diffDays(t.deadline) }))
    .filter(t => t.d <= 30)
    .sort((a, b) => a.d - b.d)
    .slice(0, 10)

  const METRICS = [
    { id: 'total',  label: 'Tổng nhiệm vụ',    val: s.total,  color: '#4D96FF', icon: '📋' },
    { id: 'done',   label: 'Hoàn thành',        val: s.done,   color: '#6BCB77', icon: '✅' },
    { id: 'doing',  label: 'Đang thực hiện',    val: s.doing,  color: '#4D96FF', icon: '⏳' },
    { id: 'late',   label: 'Quá hạn',           val: s.late,   color: '#FF6B6B', icon: '🔴' },
    { id: 'soon',   label: 'Sắp hạn 7 ngày',   val: s.soon,   color: '#D6A900', icon: '⚠️' },
    { id: 'tenure', label: 'Nhiệm kỳ/dài hạn', val: s.tenure, color: '#B89400', icon: '📌' },
  ]

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-[#4D96FF] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      {/* Alert bar */}
      {alerts.filter(a => a.type === 'Quá hạn' || a.type === 'Sắp hạn').length > 0 && (
        <div className="card rounded-3xl p-4 border-l-4 border-[#FF6B6B] bg-red-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔔</span>
            <div>
              <p className="font-extrabold text-red-700">Có {alerts.filter(a => a.type === 'Quá hạn').length} nhiệm vụ quá hạn, {alerts.filter(a => a.type === 'Sắp hạn').length} sắp đến hạn</p>
              <p className="text-sm text-red-500">Cần xem xét và xử lý ngay</p>
            </div>
          </div>
          <button onClick={() => setShowAlerts(true)} className="btn btn-danger py-2 text-sm">Xem chi tiết</button>
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {METRICS.map((m, i) => (
          <button key={m.id} onClick={() => onNavigate('tasks')}
            className="metric-card card rounded-3xl p-4 text-left morph-hover reveal"
            style={{ animationDelay: `${i * .05}s` }}>
            <p className="text-xs font-extrabold text-slate-500 uppercase">{m.label}</p>
            <p className="text-3xl font-extrabold mt-2" style={{ color: m.color }}>{m.val}</p>
            <p className="text-lg mt-1">{m.icon}</p>
          </button>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Donut */}
        <div className="card rounded-3xl p-4 xl:col-span-3 reveal">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold">Tỷ lệ trạng thái</h3>
            <span className="badge b-blue">Tổng quan</span>
          </div>
          <div className="chart-box-sm"><Doughnut data={statusChartData} options={chartOpts} /></div>
        </div>

        {/* Bar by unit */}
        <div className="card rounded-3xl p-4 xl:col-span-5 reveal">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold">Theo đơn vị chủ trì</h3>
            <span className="badge b-green">Phân tích</span>
          </div>
          <div className="chart-box"><Bar data={unitChartData} options={unitChartOpts} /></div>
        </div>

        {/* Deadline list */}
        <div className="card rounded-3xl p-4 xl:col-span-4 reveal">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold">Lịch hạn xử lý</h3>
            <span className="badge b-yellow">30 ngày tới</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-auto pr-1">
            {deadlines.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Không có hạn trong 30 ngày</p>}
            {deadlines.map(t => (
              <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-3 soft">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-sm">{fmtDate(t.deadline)}</b>
                  <span className={`badge ${t.d < 0 ? 'b-coral' : t.d <= 7 ? 'b-yellow' : 'b-gray'}`}>
                    {t.d < 0 ? `quá hạn ${Math.abs(t.d)}ng` : t.d === 0 ? 'hôm nay' : `còn ${t.d} ngày`}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 line-clamp-2">{t.title || t.task_content}</p>
                <p className="text-xs text-slate-400 mt-0.5">{t.departments?.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts modal */}
      {showAlerts && (
        <div className="modal-overlay" onClick={() => setShowAlerts(false)}>
          <div className="modal-card card rounded-3xl w-full max-w-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-lg">🔔 Cảnh báo nhiệm vụ</h2>
              <button onClick={() => setShowAlerts(false)} className="icon-btn text-slate-400">✕</button>
            </div>
            <div className="space-y-3 max-h-96 overflow-auto">
              {alerts.slice(0, 50).map((a, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className={`badge ${a.cls}`}>{a.type}</span>
                    <span className="badge b-gray">{a.task.departments?.name}</span>
                  </div>
                  <p className="font-bold text-sm">{a.task.title || a.task.task_content}</p>
                  <p className="text-xs text-slate-500 mt-1">{a.msg}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

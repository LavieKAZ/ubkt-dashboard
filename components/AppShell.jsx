'use client'
import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { ROLES, PERMISSIONS } from '@/lib/constants'
import DashboardView from './DashboardView'
import TaskManager   from './TaskManager'
import { PeriodsView, ReportsView, AdminView } from './Views'

const PAGES = {
  dashboard: 'Dashboard giám sát',
  tasks:     'Nhập và quản lý nhiệm vụ',
  periods:   'Chốt kỳ báo cáo',
  reports:   'Báo cáo một trang',
  admin:     'Quản trị người dùng',
}

export default function AppShell({ profile }) {
  const [page, setPage]           = useState('dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobile]   = useState(false)

  const role = profile?.role || 'don_vi'
  const can  = PERMISSIONS

  async function signOut() {
    await getSupabase().auth.signOut()
  }

  const navItems = [
    { id:'dashboard', icon:'📊', label:'Dashboard' },
    { id:'tasks',     icon:'📋', label:'Nhiệm vụ', hide: !can.canManageTasks(role) && role !== 'don_vi' },
    { id:'periods',   icon:'📅', label:'Chốt kỳ',  hide: !can.canManagePeriods(role) },
    { id:'reports',   icon:'📄', label:'Báo cáo',   hide: !can.canViewReports(role) },
    { id:'admin',     icon:'👤', label:'Quản trị',  hide: !can.canManageUsers(role) },
  ].filter(n => !n.hide)

  return (
    <div className={`flex min-h-screen ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setMobile(false)} />
      )}

      {/* Sidebar */}
      <aside id="sidebar"
        className={`flex-shrink-0 bg-white border-r border-slate-200 flex flex-col transition-all
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          fixed lg:static inset-y-0 left-0 z-40 lg:z-auto
          ${collapsed ? 'w-20' : 'w-64'}`}
        style={{transition:'width .28s cubic-bezier(.22,1,.36,1), transform .28s cubic-bezier(.22,1,.36,1)'}}>

        {/* Logo */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-100">
          <div className="w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl"
            style={{background:'linear-gradient(135deg,#FF6B6B,#4D96FF)'}}>
            🛡️
          </div>
          {!collapsed && (
            <div>
              <p className="font-extrabold text-sm text-ink nav-label sidebar-text">UBKT Phường</p>
              <p className="text-xs text-slate-400 nav-label sidebar-text">Tân Mỹ</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(n => (
            <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`}
              onClick={() => { setPage(n.id); setMobile(false) }}>
              <span className="nav-ico text-base">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </button>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="p-4 border-t border-slate-100">
          {!collapsed && (
            <div className="mb-3">
              <p className="font-extrabold text-sm text-ink sidebar-text truncate">{profile?.full_name || profile?.email}</p>
              <span className={`badge ${ROLES[role]?.color || 'b-gray'} text-xs mt-0.5 sidebar-text`}>
                {ROLES[role]?.label}
              </span>
            </div>
          )}
          <button onClick={signOut} className="nav-item text-slate-400 hover:text-red-500 hover:bg-red-50">
            <span className="nav-ico">🚪</span>
            <span className="nav-label">Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Topbar */}
        <header className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-20">
          <div className="flex items-center gap-4 px-5 h-16">
            <button className="lg:hidden p-2 rounded-xl border border-slate-200 bg-white"
              onClick={() => setMobile(!mobileOpen)}>
              ☰
            </button>
            <button className="hidden lg:flex p-2 rounded-xl border border-slate-200 bg-white soft"
              onClick={() => setCollapsed(!collapsed)} title="Thu/mở sidebar">
              {collapsed ? '▶' : '◀'}
            </button>
            <h1 className="font-extrabold text-lg text-ink truncate">{PAGES[page]}</h1>
            <div className="ml-auto flex items-center gap-3">
              <span className={`badge ${ROLES[role]?.color || 'b-gray'} hidden sm:inline-flex`}>
                {ROLES[role]?.label}
              </span>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF6B6B] to-[#4D96FF] flex items-center justify-center text-white font-extrabold text-sm">
                {(profile?.full_name || profile?.email || '?')[0].toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6">
          {page === 'dashboard' && <DashboardView profile={profile} role={role} onNavigate={setPage} />}
          {page === 'tasks'     && <TaskManager   profile={profile} role={role} />}
          {page === 'periods'   && <PeriodsView   profile={profile} role={role} />}
          {page === 'reports'   && <ReportsView   profile={profile} role={role} />}
          {page === 'admin'     && <AdminView     profile={profile} role={role} />}
        </main>
      </div>
    </div>
  )
}

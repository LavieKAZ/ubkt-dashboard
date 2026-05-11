'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import AppShell from '@/components/AppShell'

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const sb = getSupabase()
      const { data: { session } } = await sb.auth.getSession()
      if (!session) { router.replace('/login'); return }

      const { data: prof } = await sb.from('profiles').select('*,departments(name,code)').eq('id', session.user.id).single()
      if (!prof) { router.replace('/login'); return }

      setProfile(prof)
      setLoading(false)

      // Listen for auth changes
      sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') router.replace('/login')
      })
    }
    init()
  }, [router])

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-4 border-[#4D96FF] border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-500 text-sm font-bold">Đang tải hệ thống…</p>
    </div>
  )

  return <AppShell profile={profile} />
}

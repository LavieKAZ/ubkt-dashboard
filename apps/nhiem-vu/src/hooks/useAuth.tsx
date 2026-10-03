import * as React from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, toLoginEmail } from '@/lib/supabase'
import type { Profile } from '@/lib/roles'

interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in'
  session: Session | null
  profile: Profile | null
  /** Lỗi khi tải hồ sơ (ví dụ mất mạng) – khác với "chưa được duyệt" */
  profileError: string | null
  signIn: (account: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  reloadProfile: () => Promise<void>
}

const AuthContext = React.createContext<AuthState | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, role, unit_name, approval_status, is_active')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Profile) ?? null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [profileError, setProfileError] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<AuthState['status']>('loading')

  const loadProfileFor = React.useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      setStatus('signed-out')
      return
    }
    try {
      setProfileError(null)
      setProfile(await fetchProfile(s.user.id))
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Không tải được hồ sơ tài khoản.')
    }
    setStatus('signed-in')
  }, [])

  React.useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      loadProfileFor(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Chỉ tải lại hồ sơ khi đăng nhập / đăng xuất, không phải mỗi lần làm mới token
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') loadProfileFor(s)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfileFor])

  const signIn = React.useCallback(async (account: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(account), password })
    if (error) {
      if (/invalid login credentials/i.test(error.message)) throw new Error('Sai tài khoản hoặc mật khẩu.')
      if (/email not confirmed/i.test(error.message)) throw new Error('Tài khoản chưa được xác nhận. Liên hệ UBKT để được duyệt.')
      throw new Error(error.message)
    }
  }, [])

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const reloadProfile = React.useCallback(() => loadProfileFor(session), [loadProfileFor, session])

  const value = React.useMemo(
    () => ({ status, session, profile, profileError, signIn, signOut, reloadProfile }),
    [status, session, profile, profileError, signIn, signOut, reloadProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải nằm trong <AuthProvider>')
  return ctx
}

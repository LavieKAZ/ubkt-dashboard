'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { error: err } = await getSupabase().auth.signInWithPassword({ email, password })
    if (err) { setError('Email hoặc mật khẩu không đúng.'); setLoading(false); return }
    router.replace('/dashboard')
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'1.25rem',
      background:'radial-gradient(circle at 20% 20%,rgba(255,217,61,.32),transparent 18rem),radial-gradient(circle at 80% 18%,rgba(77,150,255,.30),transparent 20rem),radial-gradient(circle at 50% 100%,rgba(107,203,119,.26),transparent 18rem),linear-gradient(135deg,#fff9ee,#f6fbff)'
    }}>
      <div className="card rounded-4xl w-full max-w-md p-8 text-center morph-hover">
        {/* Logo */}
        <div className="w-20 h-20 mx-auto mb-5 rounded-full flex items-center justify-content-center shadow-lg"
          style={{background:'linear-gradient(135deg,#FF6B6B,#4D96FF)', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
            <circle cx="21" cy="21" r="20" fill="rgba(255,255,255,.18)" stroke="rgba(255,255,255,.6)" strokeWidth="1.5"/>
            <path d="M21 8L33 13V23C33 30 27.5 35 21 38C14.5 35 9 30 9 23V13Z" fill="rgba(255,255,255,.9)"/>
            <polygon points="21,13 23.5,20 31,20 25,24.5 27.5,31 21,26.5 14.5,31 17,24.5 11,20 18.5,20" fill="#4D96FF"/>
          </svg>
        </div>
        <h1 className="text-xl font-extrabold text-ink mb-1">ỦY BAN KIỂM TRA</h1>
        <p className="text-sm font-bold text-[#4D96FF] mb-1">Đảng ủy Phường Tân Mỹ</p>
        <p className="text-xs text-slate-500 mb-7">Hệ thống giám sát &amp; kiểm tra trên dữ liệu</p>

        <form onSubmit={handleLogin} className="space-y-4 text-left">
          <div>
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Email</label>
            <input type="email" required className="field" placeholder="user@ubkt-tanmy.vn"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-extrabold text-slate-500 uppercase mb-1.5 block">Mật khẩu</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} required className="field pr-12"
                placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold">
                {showPw ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-3 text-sm font-bold">
              {error}
            </div>
          )}
          <button type="submit" disabled={loading}
            className="btn btn-primary w-full text-base mt-2"
            style={{fontSize:'.95rem', padding:'.9rem'}}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                Đang đăng nhập…
              </span>
            ) : 'Đăng nhập hệ thống'}
          </button>
        </form>

        <p className="text-xs text-slate-400 mt-6">
          Liên hệ quản trị viên để được cấp tài khoản
        </p>
      </div>
    </div>
  )
}

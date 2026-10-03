import * as React from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'

export function LoginScreen() {
  const { signIn } = useAuth()
  const [account, setAccount] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPass, setShowPass] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!account.trim()) return setError('Nhập tài khoản hoặc email được cấp.')
    if (!password) return setError('Nhập mật khẩu.')
    setBusy(true)
    setError(null)
    try {
      await signIn(account, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đăng nhập được.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Cột trái: nhận diện cơ quan */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="size-11 rounded-full bg-white p-0.5" />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold">Ủy ban Kiểm tra</p>
            <p className="text-[13px] text-white/70">Đảng ủy phường Tân Mỹ</p>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-[34px] font-semibold leading-[1.2] tracking-[-0.01em]">
            Theo dõi thực hiện kết luận, chỉ đạo của Đảng ủy
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/75">
            Mỗi đơn vị cập nhật tiến độ và tự đánh giá. Văn phòng Đảng ủy thẩm định. Ủy ban Kiểm tra theo dõi toàn bộ.
          </p>
        </div>

        {/* Hoa văn kẻ ô: gợi bảng theo dõi nhiệm vụ */}
        <svg aria-hidden className="pointer-events-none absolute -bottom-10 -right-10 h-72 w-96 text-white/[0.07]" viewBox="0 0 384 288">
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`h${i}`} x1="0" x2="384" y1={i * 36} y2={i * 36} stroke="currentColor" strokeWidth="1.5" />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`v${i}`} y1="0" y2="288" x1={i * 48} x2={i * 48} stroke="currentColor" strokeWidth="1.5" />
          ))}
        </svg>
        <p className="relative text-[12px] text-white/55">Hệ thống giám sát, kiểm tra trên dữ liệu</p>
      </aside>

      {/* Cột phải: biểu mẫu */}
      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="size-10 rounded-full" />
            <div className="leading-tight">
              <p className="text-[15px] font-semibold text-primary">Ủy ban Kiểm tra</p>
              <p className="text-[13px] text-muted-foreground">Đảng ủy phường Tân Mỹ</p>
            </div>
          </div>

          <h2 className="text-[22px] font-semibold tracking-[-0.01em]">Đăng nhập</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Dùng tài khoản đã được Ủy ban Kiểm tra cấp.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="account">Tài khoản hoặc email</Label>
              <Input
                id="account"
                autoComplete="username"
                autoFocus
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-flag-soft px-3 py-2 text-[13px] text-flag">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? 'Đang đăng nhập' : 'Đăng nhập'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}

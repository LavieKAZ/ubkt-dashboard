import { Clock, LogOut, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/overlays'
import { useAuth } from '@/hooks/useAuth'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center px-5">
      <div className="w-full max-w-[420px] rounded-xl border border-border bg-card p-8 shadow-[0_1px_2px_rgba(24,32,43,0.04)]">
        {children}
      </div>
    </div>
  )
}

/** Tài khoản đã đăng nhập nhưng chưa được UBKT duyệt / bị tạm khóa */
export function PendingScreen() {
  const { profile, signOut, reloadProfile } = useAuth()
  const suspended = profile?.approval_status === 'suspended' || profile?.approval_status === 'rejected'
  return (
    <Frame>
      <div className="flex size-10 items-center justify-center rounded-full bg-soon-soft text-soon">
        <Clock className="size-5" />
      </div>
      <h1 className="mt-5 text-lg font-semibold">
        {suspended ? 'Tài khoản đang tạm dừng' : 'Tài khoản đang chờ duyệt'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {suspended
          ? 'Tài khoản này hiện không được phép truy cập. Liên hệ Ủy ban Kiểm tra để được mở lại.'
          : 'Ủy ban Kiểm tra cần duyệt và gán đơn vị cho tài khoản trước khi bạn xem được nhiệm vụ.'}
      </p>
      {profile?.email && <p className="mt-4 text-[13px] text-muted-foreground">Tài khoản: {profile.email}</p>}
      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={reloadProfile}>
          <RefreshCw /> Kiểm tra lại
        </Button>
        <Button variant="ghost" onClick={signOut}>
          <LogOut /> Đăng xuất
        </Button>
      </div>
    </Frame>
  )
}

/** Không tải được hồ sơ (mất mạng, Supabase lỗi) */
export function ProfileErrorScreen({ message }: { message: string }) {
  const { signOut, reloadProfile } = useAuth()
  return (
    <Frame>
      <div className="flex size-10 items-center justify-center rounded-full bg-flag-soft text-flag">
        <WifiOff className="size-5" />
      </div>
      <h1 className="mt-5 text-lg font-semibold">Không tải được thông tin tài khoản</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Kiểm tra kết nối mạng rồi thử lại. Chi tiết: {message}
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reloadProfile}>
          <RefreshCw /> Thử lại
        </Button>
        <Button variant="ghost" onClick={signOut}>
          <LogOut /> Đăng xuất
        </Button>
      </div>
    </Frame>
  )
}

export function BootScreen() {
  return (
    <div className="flex min-h-svh">
      <div className="hidden w-60 border-r border-sidebar-border bg-sidebar p-4 lg:block">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="mt-8 h-8 w-full" />
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-6 h-[60vh] w-full" />
      </div>
    </div>
  )
}

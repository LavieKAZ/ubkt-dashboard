import * as React from 'react'
import { ClipboardList, ExternalLink, LayoutGrid, LogOut, Menu } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/overlays'
import { NotificationBell } from '@/components/app/NotificationBell'
import { useAuth } from '@/hooks/useAuth'
import { displayName, permissionsOf, ROLE_LABEL, type Profile } from '@/lib/roles'
import { cn, initials } from '@/lib/utils'

const LOGO = `${import.meta.env.BASE_URL}logo.png`

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src={LOGO} alt="" className="size-8 rounded-full" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13.5px] font-semibold text-primary">Ủy ban Kiểm tra</p>
        <p className="truncate text-[12px] text-muted-foreground">Đảng ủy phường Tân Mỹ</p>
      </div>
    </div>
  )
}

function NavLink({
  icon: Icon,
  label,
  active,
  href,
  external,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  href: string
  external?: boolean
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors',
        active ? 'bg-ink-soft text-primary' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
      )}
    >
      <Icon className={cn('size-[18px]', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
      <span className="flex-1 truncate">{label}</span>
      {external && <ExternalLink className="size-3.5 opacity-60" />}
    </a>
  )
}

function SidebarBody({ profile }: { profile: Profile }) {
  const perms = permissionsOf(profile.role)
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-sidebar-border px-3">
        <Brand />
      </div>
      <nav className="flex-1 space-y-0.5 p-3" aria-label="Điều hướng chính">
        <NavLink icon={ClipboardList} label="Nhiệm vụ" href={import.meta.env.BASE_URL} active />
        {perms.otherModules && (
          <>
            <p className="px-2.5 pb-1.5 pt-5 text-[12px] font-medium text-muted-foreground/80">Hệ thống chung</p>
            <NavLink icon={LayoutGrid} label="Dashboard tổng" href="/index.html" external />
          </>
        )}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <p className="px-2.5 text-[12px] leading-relaxed text-muted-foreground">
          {profile.role === 'unit' && profile.unit_name ? `Đang xem nhiệm vụ của ${profile.unit_name}` : 'Đang xem nhiệm vụ của tất cả đơn vị'}
        </p>
      </div>
    </div>
  )
}

function UserMenu({ profile }: { profile: Profile }) {
  const { signOut } = useAuth()
  const name = displayName(profile)
  const roleText = profile.role === 'unit' && profile.unit_name ? profile.unit_name : ROLE_LABEL[profile.role]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 text-left transition-colors hover:bg-accent/70">
          <Avatar>
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block max-w-[160px] truncate text-[13px] font-medium">{name}</span>
            <span className="block max-w-[160px] truncate text-[12px] text-muted-foreground">{roleText}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-[12px] font-normal text-muted-foreground">{profile.email}</p>
          <p className="mt-1.5 text-[12px] font-normal text-muted-foreground">Vai trò: {roleText}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut /> Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({
  profile,
  title,
  subtitle,
  actions,
  children,
}: {
  profile: Profile
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  return (
    <div className="flex min-h-svh">
      {/* Sidebar cố định trên máy tính */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarBody profile={profile} />
      </aside>

      {/* Sidebar trượt trên điện thoại */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle className="sr-only">Điều hướng</SheetTitle>
          <SidebarBody profile={profile} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:px-6">
          <Button variant="ghost" size="icon" className="-ml-1.5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Mở menu">
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold leading-tight">{title}</h1>
            {subtitle && <p className="truncate text-[12.5px] text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
          <NotificationBell userId={profile.id} />
          <UserMenu profile={profile} />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}

import { Bell, CalendarClock, CheckCheck, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger, Separator } from '@/components/ui/overlays'
import { useNotifications, type Notice } from '@/hooks/useNotifications'
import { cn, timeAgo } from '@/lib/utils'

function NoticeIcon({ n }: { n: Notice }) {
  const Icon = n.category === 'weekly-appraisal' ? ClipboardCheck : CalendarClock
  return (
    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-soft text-primary">
      <Icon className="size-3.5" />
    </span>
  )
}

export function NotificationBell({ userId }: { userId: string }) {
  const { items, unread, loading, markAllRead, markRead } = useNotifications(userId)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`}>
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-flag px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] max-w-[calc(100vw-24px)] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold">Thông báo</p>
          {unread > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1 text-[12px] font-medium text-primary hover:underline">
              <CheckCheck className="size-3.5" /> Đánh dấu đã đọc
            </button>
          )}
        </div>
        <Separator />
        <div className="max-h-[380px] overflow-y-auto">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Đang tải…</p>
          ) : items.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium">Chưa có thông báo</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Nhắc việc hằng tuần sẽ xuất hiện ở đây vào sáng thứ Hai.</p>
            </div>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => markRead(n.id)}
                    className={cn(
                      'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60',
                      !n.read_at && 'bg-ink-soft/40',
                    )}
                  >
                    <NoticeIcon n={n} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={cn('text-[13px] leading-snug', !n.read_at ? 'font-semibold' : 'font-medium')}>{n.title}</span>
                        {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Chưa đọc" />}
                      </span>
                      {n.body && <span className="mt-1 block text-[12.5px] leading-relaxed text-muted-foreground">{n.body}</span>}
                      <span className="mt-1.5 block text-[11.5px] text-muted-foreground/80">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

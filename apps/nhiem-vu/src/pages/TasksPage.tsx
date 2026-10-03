import * as React from 'react'
import { AlertCircle, Flag, RefreshCw } from 'lucide-react'
import { AppShell } from '@/components/app/AppShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/overlays'
import { permissionsOf, type Profile } from '@/lib/roles'
import { daysToDeadline, fetchTasks, formatDate, progressOf, PROGRESS_LABEL, type Progress, type TaskRow } from '@/lib/tasks'
import { cn } from '@/lib/utils'

const PROGRESS_STYLE: Record<Progress, { bar: string; badge: 'done' | 'flag' | 'soon' | 'default' }> = {
  done: { bar: 'bg-done', badge: 'done' },
  overdue: { bar: 'bg-flag', badge: 'flag' },
  soon: { bar: 'bg-soon', badge: 'soon' },
  doing: { bar: 'bg-primary', badge: 'default' },
}
const ORDER: Progress[] = ['overdue', 'soon', 'doing', 'done']

/** Thanh phân bổ tiến độ: một dải duy nhất cho thấy ngay tỷ lệ Trễ hạn / Sắp đến hạn / Đang làm / Hoàn thành */
function ProgressStrip({ tasks }: { tasks: TaskRow[] }) {
  const counts = React.useMemo(() => {
    const c: Record<Progress, number> = { done: 0, overdue: 0, soon: 0, doing: 0 }
    tasks.forEach((t) => c[progressOf(t)]++)
    return c
  }, [tasks])
  const total = tasks.length || 1
  const flagged = tasks.filter((t) => t.redFlag).length

  return (
    <section className="rounded-xl border border-border bg-card p-5" aria-label="Tổng quan tiến độ">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p className="text-[13px] text-muted-foreground">Tổng số nhiệm vụ</p>
          <p className="mt-0.5 text-[28px] font-semibold leading-none tracking-[-0.02em]">{tasks.length}</p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          {ORDER.map((p) => (
            <div key={p}>
              <dt className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <span className={cn('size-2 rounded-full', PROGRESS_STYLE[p].bar)} />
                {PROGRESS_LABEL[p]}
              </dt>
              <dd className="mt-1 text-lg font-semibold leading-none">{counts[p]}</dd>
            </div>
          ))}
          <div>
            <dt className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Flag className="size-3 text-flag" /> Cờ đỏ
            </dt>
            <dd className="mt-1 text-lg font-semibold leading-none">{flagged}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label="Tỷ lệ tiến độ">
        {ORDER.map((p) => (
          <span key={p} className={PROGRESS_STYLE[p].bar} style={{ width: `${(counts[p] / total) * 100}%` }} />
        ))}
      </div>
    </section>
  )
}

/** Bảng xem trước (Giai đoạn 2). Bảng lưới kiểu Excel đầy đủ sẽ thay thế ở Giai đoạn 3. */
function PreviewTable({ tasks }: { tasks: TaskRow[] }) {
  const rows = tasks.slice(0, 40)
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <p className="shrink-0 text-sm font-semibold">Danh sách nhiệm vụ</p>
        <p className="text-right text-[12.5px] text-muted-foreground">
          Xem trước {rows.length} trên {tasks.length} dòng. Bảng lưới đầy đủ có ở bước tiếp theo.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-[12.5px] text-muted-foreground">
              <th className="w-12 px-4 py-2.5 text-right font-medium">STT</th>
              <th className="w-56 px-3 py-2.5 font-medium">Số văn bản</th>
              <th className="px-3 py-2.5 font-medium">Nội dung kết luận</th>
              <th className="w-44 px-3 py-2.5 font-medium">Đơn vị thực hiện</th>
              <th className="w-28 px-3 py-2.5 font-medium">Thời hạn</th>
              <th className="w-32 px-4 py-2.5 font-medium">Tiến độ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const p = progressOf(t)
              const d = daysToDeadline(t.deadline)
              return (
                <tr key={t.id} className={cn('border-t border-border align-top', t.redFlag && 'bg-flag-soft/60')}>
                  <td className="px-4 py-3 text-right text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-3">
                    <p className="line-clamp-2 font-medium text-primary">{(t.doc || '').replace(/^"+|"+$/g, '') || '—'}</p>
                    {t.date && <p className="mt-0.5 text-[12px] text-muted-foreground">{formatDate(t.date)}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <p className="line-clamp-3 leading-relaxed">{(t.task || t.conclusion || '').replace(/^["\s-]+/, '')}</p>
                    {t.redFlag && t.redFlagNote && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] font-medium text-flag">
                        <Flag className="mt-0.5 size-3 shrink-0" /> {t.redFlagNote}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{t.unit}</td>
                  <td className="px-3 py-3">
                    {t.deadline ? (
                      <>
                        <p>{formatDate(t.deadline)}</p>
                        {d !== null && p !== 'done' && (
                          <p className={cn('text-[12px]', d < 0 ? 'text-flag' : 'text-muted-foreground')}>
                            {d < 0 ? `Quá ${-d} ngày` : d === 0 ? 'Hôm nay' : `Còn ${d} ngày`}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={PROGRESS_STYLE[p].badge}>{PROGRESS_LABEL[p]}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {tasks.length === 0 && (
        <div className="px-6 py-14 text-center">
          <p className="text-sm font-medium">Chưa có nhiệm vụ nào được giao</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Khi Văn phòng Đảng ủy giao việc cho đơn vị, nhiệm vụ sẽ hiện ở đây.</p>
        </div>
      )}
    </section>
  )
}

export function TasksPage({ profile }: { profile: Profile }) {
  const perms = permissionsOf(profile.role)
  const [tasks, setTasks] = React.useState<TaskRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const rows = await fetchTasks()
      // Mới nhất lên đầu: theo ngày văn bản, rồi theo thứ tự trong văn bản
      rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.order ?? 0) - (b.order ?? 0))
      setTasks(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách nhiệm vụ.')
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const scope = perms.seeAllUnits ? 'Tất cả đơn vị' : profile.unit_name || 'Đơn vị của bạn'

  return (
    <AppShell profile={profile} title="Nhiệm vụ" subtitle={scope}>
      <div className="mx-auto max-w-[1400px] space-y-5 p-4 lg:p-6">
        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-flag/30 bg-flag-soft p-5">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-flag" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-flag">Không tải được danh sách nhiệm vụ</p>
              <p className="mt-1 text-[13px] text-foreground/80">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw /> Thử lại
            </Button>
          </div>
        ) : tasks === null ? (
          <>
            <Skeleton className="h-[132px] w-full rounded-xl" />
            <Skeleton className="h-[420px] w-full rounded-xl" />
          </>
        ) : (
          <>
            <ProgressStrip tasks={tasks} />
            <PreviewTable tasks={tasks} />
          </>
        )}
      </div>
    </AppShell>
  )
}

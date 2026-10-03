import { supabase } from '@/lib/supabase'

/** Một dòng nhiệm vụ, chỉ lấy các trường cần hiển thị (không tải cả khối dữ liệu nặng). */
export interface TaskRow {
  id: string
  doc: string | null
  docFull: string | null
  date: string | null
  group: string | null
  task: string | null
  conclusion: string | null
  unit: string | null
  deadline: string | null
  deadlineText: string | null
  vpduAssessment: string | null
  selfAssessment: string | null
  redFlag: boolean
  redFlagNote: string | null
  latestProgressAt: string | null
  order: number | null
}

const COLUMNS = [
  'id',
  'doc:data->>doc',
  'docFull:data->>docFull',
  'date:data->>date',
  'group:data->>group',
  'task:data->>task',
  'conclusion:data->>conclusion',
  'unit:data->>unit',
  'deadline:data->>deadline',
  'deadlineText:data->>deadlineText',
  'vpduAssessment:data->>vpduAssessment',
  'selfAssessment:data->>selfAssessment',
  'redFlag:data->>redFlag',
  'redFlagNote:data->>redFlagNote',
  'latestProgressAt:data->>latestProgressAt',
  'order:data->>order',
].join(',')

type RawRow = Omit<TaskRow, 'redFlag' | 'order'> & { redFlag: string | null; order: string | null }

/** Tải toàn bộ nhiệm vụ mà tài khoản được phép xem (Supabase tự lọc theo đơn vị). Chia trang 1.000 dòng. */
export async function fetchTasks(): Promise<TaskRow[]> {
  const pageSize = 1000
  const out: TaskRow[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('ubkt_tasks')
      .select(COLUMNS)
      .or('data->>is_deleted.is.null,data->>is_deleted.neq.true')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data ?? []) as unknown as RawRow[]
    for (const r of rows) {
      out.push({ ...r, redFlag: r.redFlag === 'true', order: r.order ? Number(r.order) : null })
    }
    if (rows.length < pageSize) break
  }
  return out
}

export type Progress = 'done' | 'overdue' | 'soon' | 'doing'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Số ngày từ hôm nay đến hạn (âm = đã quá hạn). null nếu không có hạn cụ thể. */
export function daysToDeadline(deadline: string | null): number | null {
  if (!deadline || !DATE_RE.test(deadline)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${deadline}T00:00:00`)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

/** Tiến độ tính theo Đánh giá của VPĐU (nguồn số liệu chốt cho Dashboard). */
export function progressOf(t: Pick<TaskRow, 'vpduAssessment' | 'deadline'>): Progress {
  if ((t.vpduAssessment || '').trim().toLowerCase() === 'hoàn thành') return 'done'
  const d = daysToDeadline(t.deadline)
  if (d !== null && d < 0) return 'overdue'
  if (d !== null && d <= 7) return 'soon'
  return 'doing'
}

export const PROGRESS_LABEL: Record<Progress, string> = {
  done: 'Hoàn thành',
  overdue: 'Trễ hạn',
  soon: 'Sắp đến hạn',
  doing: 'Đang làm',
}

export function formatDate(iso: string | null): string {
  if (!iso || !DATE_RE.test(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

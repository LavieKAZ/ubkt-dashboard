export const ROLES = {
  admin:     { label: 'Quản trị viên',    color: 'b-coral' },
  van_phong: { label: 'Văn phòng',         color: 'b-blue'  },
  lanh_dao:  { label: 'Lãnh đạo',          color: 'b-green' },
  don_vi:    { label: 'Đơn vị thực hiện',  color: 'b-gray'  },
}

export const STATUS_OPTIONS = [
  'đang thực hiện',
  'chưa thực hiện',
  'hoàn thành',
  'quá hạn',
]

export const GROUP_OPTIONS = [
  'Thông báo kết luận',
  'Nghị quyết',
  'Chương trình làm việc',
  'Giám sát',
  'Kiểm tra',
  'Khác',
]

export const HORIZON_OPTIONS = [
  { value: 'short',  label: 'Ngắn hạn / tuần / tháng' },
  { value: 'long',   label: 'Dài hạn / nhiệm kỳ' },
]

// What each role can do
export const PERMISSIONS = {
  canManageTasks:   (role) => ['admin','van_phong'].includes(role),
  canDeleteTasks:   (role) => ['admin','van_phong'].includes(role),
  canViewReports:   (role) => ['admin','van_phong','lanh_dao'].includes(role),
  canManagePeriods: (role) => ['admin','van_phong'].includes(role),
  canManageUsers:   (role) => role === 'admin',
  canUpdateProgress:(role) => ['admin','van_phong','don_vi'].includes(role),
}

export function statusBadgeClass(s) {
  if (s === 'hoàn thành')     return 'b-green'
  if (s === 'đang thực hiện') return 'b-blue'
  if (s === 'quá hạn')        return 'b-coral'
  return 'b-gray'
}

export function groupBadgeClass(g) {
  if (g === 'Thông báo kết luận') return 'b-blue'
  if (g?.includes('giám sát'))    return 'b-green'
  if (g?.includes('kiểm tra'))    return 'b-coral'
  if (g === 'Nghị quyết')         return 'b-yellow'
  return 'b-gray'
}

export function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function diffDays(s) {
  if (!s) return 99999
  const d = new Date(s + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.ceil((d - today) / 86400000)
}

export function isLongTerm(t) {
  return t.horizon === 'long' || t.task_group === 'Nghị quyết' || t.task_group === 'Chương trình làm việc'
}

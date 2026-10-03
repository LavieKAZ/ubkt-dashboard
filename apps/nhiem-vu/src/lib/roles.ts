/*
  Phân quyền phía giao diện. Đây chỉ là lớp "ẩn/hiện" cho dễ dùng —
  quyền thật được khóa trên Supabase (RLS), nên dù ai sửa giao diện cũng không vượt quyền được.
*/
export type Role = 'admin' | 'ubkt' | 'vpdu' | 'unit'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: Role
  unit_name: string | null
  approval_status: 'approved' | 'pending' | 'rejected' | 'suspended' | string
  is_active: boolean
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Quản trị',
  ubkt: 'Ủy ban Kiểm tra',
  vpdu: 'Văn phòng Đảng ủy',
  unit: 'Đơn vị',
}

export interface Permissions {
  /** Xem nhiệm vụ của tất cả đơn vị (có tab chuyển đơn vị ở dưới bảng) */
  seeAllUnits: boolean
  /** Gắn / gỡ Cờ đỏ, sửa thông tin giao việc, chốt Đánh giá của VPĐU */
  manageTasks: boolean
  /** Được vào các phân hệ khác của hệ thống cũ (Dashboard, Tổ 1374, Hồ sơ...) */
  otherModules: boolean
  /** Ghi bình luận tiến độ và Tự đánh giá */
  reportProgress: boolean
}

export function permissionsOf(role: Role): Permissions {
  switch (role) {
    case 'admin':
    case 'ubkt':
      return { seeAllUnits: true, manageTasks: true, otherModules: true, reportProgress: true }
    case 'vpdu':
      return { seeAllUnits: true, manageTasks: true, otherModules: false, reportProgress: true }
    default:
      return { seeAllUnits: false, manageTasks: false, otherModules: false, reportProgress: true }
  }
}

export function isApproved(p: Profile | null): boolean {
  return !!p && p.approval_status === 'approved' && p.is_active === true
}

/** Tên hiển thị: họ tên → phần trước @ của email */
export function displayName(p: Pick<Profile, 'full_name' | 'email'> | null): string {
  if (!p) return ''
  return (p.full_name || '').trim() || (p.email || '').split('@')[0] || 'Người dùng'
}

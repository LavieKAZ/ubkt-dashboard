import { createClient } from '@supabase/supabase-js'

// Khóa "publishable" là khóa công khai dành cho trình duyệt (giống config.js của hệ thống cũ).
// Quyền thật sự được kiểm soát bởi các quy tắc RLS trên Supabase, không phải bởi khóa này.
const SUPABASE_URL = 'https://hbygfheibcrqaqzoaass.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_jGSrZLhYPIwvpVZ_j4yo5g_LuVhs0Jh'

// Dùng chung cách lưu phiên với trang cũ (cùng tên miền) → đăng nhập một lần dùng được cả hai.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

/** Trang cũ cho phép gõ tên tài khoản ngắn ("admin", "ubkt") thay vì email đầy đủ. */
export function toLoginEmail(input: string): string {
  const u = input.trim()
  if (u.includes('@')) return u
  if (u.toLowerCase() === 'admin') return 'admin@tanmy.vn'
  return `${u}@tanmy.vn`
}

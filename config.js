// Cấu hình Supabase cho UBKT Dashboard - production
// Chỉ dùng publishable/anon key ở frontend. Không dùng service_role key trong trình duyệt.

window.UBKT_SUPABASE_URL = "https://hbygfheibcrqaqzoaass.supabase.co";

// Dùng publishable key mới của Supabase
window.UBKT_SUPABASE_ANON_KEY = "sb_publishable_jGSrZLhYPIwvpVZ_j4yo5g_LuVhs0Jh";

// Chạy chính thức bằng Supabase Auth
window.UBKT_AUTH_MODE = "supabase";

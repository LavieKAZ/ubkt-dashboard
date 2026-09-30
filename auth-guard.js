(function () {
  "use strict";

  const root = document.documentElement;
  root.style.visibility = "hidden";

  const cfg = {
    url: (window.UBKT_SUPABASE_URL || "").trim(),
    key: (window.UBKT_SUPABASE_ANON_KEY || "").trim(),
    mode: (window.UBKT_AUTH_MODE || "local").trim().toLowerCase(),
    requiredRole: (root.dataset.authRole || "authenticated").trim().toLowerCase()
  };

  function safeNextUrl() {
    const page = location.pathname.split("/").pop() || "index.html";
    return encodeURIComponent(page + location.search + location.hash);
  }

  function showLockedScreen(title, message) {
    root.style.visibility = "visible";
    document.body.innerHTML = [
      '<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f7fb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:20px">',
      '<section style="width:min(420px,100%);background:white;border:1px solid #dce4ef;border-radius:18px;padding:28px;text-align:center;box-shadow:0 18px 50px rgba(20,38,66,.14)">',
      '<div style="font-size:38px;margin-bottom:10px" aria-hidden="true">🔒</div>',
      '<h1 style="font-size:20px;margin:0 0 8px;color:#10203a">' + title + '</h1>',
      '<p style="font-size:14px;line-height:1.6;color:#607089;margin:0 0 18px">' + message + '</p>',
      '<a href="index.html?next=' + safeNextUrl() + '" style="display:inline-flex;align-items:center;justify-content:center;border-radius:10px;background:#0055da;color:white;padding:11px 17px;font-weight:800;text-decoration:none">Về trang đăng nhập</a>',
      '</section></main>'
    ].join("");
  }

  async function guard() {
    if (cfg.mode !== "supabase" || !cfg.url || !cfg.key || !window.supabase) {
      showLockedScreen("Chưa thể xác thực", "Trang nội bộ chỉ hoạt động khi kết nối đăng nhập an toàn được cấu hình.");
      return;
    }

    const client = window.__UBKT_SUPABASE_CLIENT__ || window.supabase.createClient(cfg.url, cfg.key);
    window.__UBKT_SUPABASE_CLIENT__ = client;

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    const session = sessionData?.session;
    if (sessionError || !session) {
      showLockedScreen("Cần đăng nhập", "Vui lòng đăng nhập bằng tài khoản đã được phê duyệt để truy cập trang nội bộ.");
      return;
    }

    const { data: profile, error: profileError } = await client
      .from("user_profiles")
      .select("id,email,full_name,unit_name,role,approval_status,is_active")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileError || !profile || profile.approval_status !== "approved" || profile.is_active !== true) {
      await client.auth.signOut();
      showLockedScreen("Tài khoản chưa được duyệt", "Tài khoản chưa được Admin phê duyệt hoặc đang bị tạm ngưng.");
      return;
    }

    if (cfg.requiredRole === "admin" && profile.role !== "admin") {
      showLockedScreen("Không có quyền truy cập", "Khu vực này chỉ dành cho tài khoản quản trị hệ thống.");
      return;
    }

    window.__UBKT_AUTH_SESSION__ = session;
    window.__UBKT_AUTH_PROFILE__ = profile;
    window.__UBKT_AUTH_READY__ = true;
    root.style.visibility = "visible";
    window.dispatchEvent(new CustomEvent("ubkt-auth-ready", { detail: { session, profile } }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", guard, { once: true });
  } else {
    guard();
  }
})();

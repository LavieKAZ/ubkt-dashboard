(function () {
  "use strict";

  const cfg = {
    url: (window.UBKT_SUPABASE_URL || "").trim(),
    key: (window.UBKT_SUPABASE_ANON_KEY || "").trim(),
    mode: (window.UBKT_AUTH_MODE || "local").trim().toLowerCase()
  };

  if (cfg.mode !== "supabase") return;
  if (!cfg.url || !cfg.key || !window.supabase) return;

  const client = window.__UBKT_SUPABASE_CLIENT__ || window.supabase.createClient(cfg.url, cfg.key);
  window.__UBKT_SUPABASE_CLIENT__ = client;

  function showLockedScreen() {
    const next = encodeURIComponent(location.pathname.split("/").pop() + location.search + location.hash);
    document.body.innerHTML = [
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef3f9;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:20px">',
      '<div style="width:min(380px,100%);background:white;border:1px solid #dce4ef;border-radius:18px;padding:28px;text-align:center;box-shadow:0 18px 50px rgba(20,38,66,.14)">',
      '<div style="font-size:38px;margin-bottom:10px">&#128274;</div>',
      '<h1 style="font-size:20px;margin:0 0 8px;color:#10203a">Can dang nhap</h1>',
      '<p style="font-size:14px;line-height:1.5;color:#607089;margin:0 0 18px">Vui long dang nhap Supabase Auth de truy cap trang noi bo.</p>',
      '<a href="index.html?next=' + next + '" style="display:inline-flex;align-items:center;justify-content:center;border-radius:12px;background:#0055DA;color:white;padding:10px 16px;font-weight:800;text-decoration:none">Ve trang dang nhap</a>',
      '</div></div>'
    ].join("");
  }

  async function guard() {
    const { data, error } = await client.auth.getSession();
    if (error || !data || !data.session) showLockedScreen();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", guard, { once: true });
  } else {
    guard();
  }
})();

const SUPABASE_URL = process.env.UBKT_SUPABASE_URL || "https://hbygfheibcrqaqzoaass.supabase.co";
const SUPABASE_ANON_KEY = process.env.UBKT_SUPABASE_ANON_KEY || "sb_publishable_jGSrZLhYPIwvpVZ_j4yo5g_LuVhs0Jh";
const SOURCE_URL = process.env.UBKT_RESOLUTION_SOURCE_URL || "";
const SOURCE_TOKEN = process.env.UBKT_RESOLUTION_SYNC_TOKEN || "";

function send(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  return res.status(status).json(payload);
}

function bearerToken(req) {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function authenticate(req) {
  const token = bearerToken(req);
  if (!token) throw Object.assign(new Error("Phiên đăng nhập không hợp lệ."), { status: 401 });

  const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!authResponse.ok) throw Object.assign(new Error("Phiên đăng nhập đã hết hạn."), { status: 401 });
  const user = await authResponse.json();

  const profileResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,approval_status,is_active`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  if (!profileResponse.ok) throw Object.assign(new Error("Không kiểm tra được quyền tài khoản."), { status: 403 });
  const [profile] = await profileResponse.json();
  if (!profile || profile.approval_status !== "approved" || profile.is_active !== true) {
    throw Object.assign(new Error("Tài khoản chưa được phép xem dữ liệu Nghị quyết."), { status: 403 });
  }
  return { token, user, profile };
}

async function readSnapshot(auth) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/resolution_sync_snapshots?id=eq.current&select=payload,source_updated_at,synced_at`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.token}` } },
  );
  if (!response.ok) throw new Error("Chưa cài đặt kho lưu bản đồng bộ Nghị quyết trên Supabase.");
  const [row] = await response.json();
  return row || null;
}

function validatePayload(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.resolutions)) {
    throw new Error("Google Sheets trả về dữ liệu không đúng cấu trúc.");
  }
  if (payload.resolutions.length !== 11) {
    throw new Error(`Google Sheets hiện có ${payload.resolutions.length} Nghị quyết, cần đủ 11.`);
  }
  return payload;
}

async function fetchSource() {
  if (!SOURCE_URL || !SOURCE_TOKEN) {
    throw new Error("Vercel chưa có địa chỉ Apps Script hoặc mã đồng bộ Google Sheets.");
  }
  const response = await fetch(SOURCE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "export", token: SOURCE_TOKEN }),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Không đọc được Google Sheets (HTTP ${response.status}).`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error);
  return validatePayload(payload);
}

async function saveSnapshot(auth, payload) {
  const syncedAt = new Date().toISOString();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/resolution_sync_snapshots?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=representation,return=representation",
    },
    body: JSON.stringify({
      id: "current",
      payload,
      source_updated_at: payload.sourceUpdatedAt || syncedAt,
      synced_at: syncedAt,
      synced_by: auth.user.id,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase chưa lưu được bản đồng bộ: ${detail.slice(0, 180)}`);
  }
  const [row] = await response.json();
  return row;
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return send(res, 405, { error: "Phương thức không được hỗ trợ." });
  try {
    const auth = await authenticate(req);
    if (req.method === "GET") {
      const row = await readSnapshot(auth);
      return send(res, 200, row || { payload: null, synced_at: null, source_updated_at: null });
    }
    if (auth.profile.role !== "admin") {
      return send(res, 403, { error: "Chỉ Admin được bấm đồng bộ từ Google Sheets." });
    }
    const payload = await fetchSource();
    const row = await saveSnapshot(auth, payload);
    return send(res, 200, row);
  } catch (error) {
    console.error("resolution sync failed", error);
    return send(res, error.status || 500, { error: error.message || "Không đồng bộ được dữ liệu." });
  }
};

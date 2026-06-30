import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type ReportPayload = {
  reportText?: string;
  metrics?: Record<string, unknown>;
  units?: unknown[];
  riskTasks?: unknown[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function compact(value: unknown, max = 12000) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function verifySupabaseSession(req: Request) {
  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  const auth = req.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey) return { ok: false, error: "Thiếu cấu hình xác thực Supabase cho Edge Function." };
  if (!auth.startsWith("Bearer ")) return { ok: false, error: "Bạn cần đăng nhập để dùng chức năng phân tích AI." };

  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: auth,
    },
  });

  if (!resp.ok) return { ok: false, error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." };
  return { ok: true, error: "" };
}

function buildPrompt(payload: ReportPayload) {
  const reportText = compact(payload.reportText, 14000);
  const metrics = JSON.stringify(payload.metrics || {}, null, 2);
  const units = JSON.stringify((payload.units || []).slice(0, 20), null, 2);
  const riskTasks = JSON.stringify((payload.riskTasks || []).slice(0, 25), null, 2);

  return `Bạn là trợ lý phân tích nghiệp vụ hành chính cho hệ thống giám sát nhiệm vụ.

Hãy đọc báo cáo một trang và dữ liệu nhiệm vụ bên dưới, sau đó viết bản phân tích ngắn gọn, dùng văn phong hành chính, không nêu tên công cụ AI hay nhà cung cấp.

Yêu cầu đầu ra:
1. Nhận định chung: 3-5 câu.
2. Điểm nổi bật: gạch đầu dòng, dựa trên số liệu.
3. Rủi ro/tồn đọng cần chú ý: gạch đầu dòng, ưu tiên đơn vị/nhiệm vụ quá hạn.
4. Kiến nghị xử lý: 4-6 việc cụ thể có thể giao ngay.
5. Câu kết luận dùng được trong báo cáo giao ban.

Không bịa số liệu. Nếu thiếu dữ liệu, ghi rõ là chưa đủ dữ liệu.

SỐ LIỆU TỔNG HỢP:
${metrics}

THỐNG KÊ THEO ĐƠN VỊ:
${units}

NHIỆM VỤ RỦI RO/TỒN ĐỌNG:
${riskTasks}

NỘI DUNG BÁO CÁO MỘT TRANG HIỆN TẠI:
${reportText}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const auth = await verifySupabaseSession(req);
  if (!auth.ok) return json({ error: auth.error }, { status: 401 });

  const apiKey = env("AI_API_KEY");
  const baseUrl = env("AI_BASE_URL");
  const model = env("AI_MODEL");

  if (!apiKey || !baseUrl || !model) {
    return json({ error: "Chưa cấu hình AI_API_KEY, AI_BASE_URL hoặc AI_MODEL trong Edge Function secrets." }, { status: 500 });
  }

  let payload: ReportPayload;
  try {
    payload = await req.json();
  } catch (_err) {
    return json({ error: "Body phải là JSON hợp lệ." }, { status: 400 });
  }

  if (!compact(payload.reportText, 200)) {
    return json({ error: "Chưa có nội dung báo cáo để phân tích." }, { status: 400 });
  }

  const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1800,
      messages: [
        { role: "system", content: "Bạn viết phân tích hành chính chính xác, ngắn gọn, dựa trên dữ liệu được cung cấp." },
        { role: "user", content: buildPrompt(payload) },
      ],
    }),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return json({ error: data?.error?.message || `AI service error ${upstream.status}` }, { status: 502 });
  }

  const analysis = data?.choices?.[0]?.message?.content || "";
  return json({ analysis, usage: data?.usage || null });
});

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ChatResponse } from "@/lib/types";

const SYSTEM_PROMPT = `Bạn là Trợ lý ảo của Ủy ban. Hôm nay là 01/07/2026.
Nhiệm vụ: Phân tích yêu cầu đặt lịch công tác từ người dùng.
Chỉ trả về JSON hợp lệ theo schema: {"intent":"schedule|unknown","title":"Tiêu đề lịch","date":"YYYY-MM-DD","time":"HH:MM","reply":"Câu trả lời ngắn gọn"}.
Nếu thiếu ngày hoặc giờ, đặt intent là "unknown" và hỏi lại thông tin còn thiếu. Không thêm markdown.`;

function normalizeChatResponse(value: Partial<ChatResponse>): ChatResponse {
  if (value.intent === "schedule" && value.title && /^\d{4}-\d{2}-\d{2}$/.test(value.date ?? "") && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time ?? "")) return { intent: "schedule", title: value.title, date: value.date, time: value.time, reply: value.reply || "Tôi đã chuẩn bị form lịch công tác." };
  return { intent: value.intent === "error" ? "error" : "unknown", reply: value.reply || "Tôi chưa đủ thông tin để tạo lịch. Đồng chí vui lòng bổ sung ngày và giờ." };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { message } = (await request.json()) as { message?: string };
  if (!message?.trim()) return NextResponse.json({ error: "Missing message" }, { status: 400 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json(normalizeChatResponse({ intent: "error", reply: "Chưa cấu hình GEMINI_API_KEY trên server." }), { status: 500 });
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: SYSTEM_PROMPT, generationConfig: { responseMimeType: "application/json" } });
    const result = await model.generateContent(message);
    return NextResponse.json(normalizeChatResponse(JSON.parse(result.response.text()) as Partial<ChatResponse>));
  } catch (error) {
    return NextResponse.json(normalizeChatResponse({ intent: "error", reply: error instanceof Error ? `Không thể kết nối Gemini: ${error.message}` : "Không thể kết nối Gemini." }), { status: 500 });
  }
}

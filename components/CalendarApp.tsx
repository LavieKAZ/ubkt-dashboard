"use client";

import {
  Calendar as CalendarIcon,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  ExternalLink,
  Loader2,
  LogOut,
  Mail,
  Plus,
  Send,
  Sparkles,
  Square,
  X
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import type { CalendarEvent, ChatResponse, Contact, EventPayload } from "@/lib/types";

type Message = { id: number; role: "user" | "bot"; text: string };
type Props = { contacts: Contact[]; initialEvents: CalendarEvent[]; userEmail?: string };

const GOOGLE_CALENDAR_SRC =
  "https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Asia%2FHo_Chi_Minh&hl=vi&src=MDQwNDAxMjQwMDgyQHN0LmJ1aC5lZHUudm4&src=Y19mYmIxYzcwNDFlYmRiNmFkYTI5M2U4NjIxNGU3N2U2MDU2NWE3MTE0MTJiMTU5NmQwMzkzYWMyMGIyOTg2MzNiQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20&src=Y19jbGFzc3Jvb20yNzYxM2RmYUBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&src=ZW4udmlldG5hbWVzZSNob2xpZGF5QGdyb3VwLnYuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&src=dmkudmlldG5hbWVzZSNob2xpZGF5QGdyb3VwLnYuY2FsZW5kYXIuZ29vZ2xlLmNvbQ&color=%23039be5&color=%23ef6c00&color=%23137333&color=%230b8043&color=%230b8043";

const emptyForm: EventPayload = { date: "", time: "08:00", title: "", attendees: [] };

export default function CalendarApp({ contacts, initialEvents, userEmail }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [formData, setFormData] = useState<EventPayload>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "bot", text: "Chào đồng chí. Đồng chí cần hỗ trợ gì?" }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isAssistantOpen) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAssistantOpen]);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = window.setTimeout(() => setToastMsg(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toastMsg]);

  function openModal(date = new Date().toISOString().slice(0, 10)) {
    setFormData({ ...emptyForm, date });
    setIsModalOpen(true);
  }

  function toggleContact(id: string) {
    setFormData((prev) => ({
      ...prev,
      attendees: prev.attendees.includes(id)
        ? prev.attendees.filter((contactId) => contactId !== id)
        : [...prev.attendees, id]
    }));
  }

  function selectedEmails() {
    return contacts.filter((contact) => formData.attendees.includes(contact.id)).map((contact) => contact.email);
  }

  function openManualMail() {
    const subject = encodeURIComponent(`Thông báo lịch họp: ${formData.title}`);
    const body = encodeURIComponent(
      `Kính gửi đồng chí,\n\nThông tin lịch họp:\n- Nội dung: ${formData.title}\n- Ngày: ${formData.date}\n- Thời gian: ${formData.time}\n\nĐề nghị đồng chí sắp xếp tham dự đúng lịch.`
    );
    window.location.href = `mailto:${selectedEmails().join(",")}?subject=${subject}&body=${body}`;
  }

  async function saveEvent() {
    if (!formData.title.trim()) return;
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const payload = (await response.json()) as {
        event?: CalendarEvent;
        sent?: number;
        manualRecipients?: string[];
        warning?: string;
        error?: string;
      };

      if (!response.ok && response.status !== 207) throw new Error(payload.error || "Không thể lưu lịch.");
      if (payload.event) setEvents((prev) => [...prev, payload.event as CalendarEvent]);
      setIsModalOpen(false);
      setToastMsg(
        payload.warning ??
          (payload.manualRecipients?.length
            ? "Đã lưu lịch. Có thể gửi email thủ công bằng nút mailto."
            : `Đã lưu lịch và gửi ${payload.sent ?? 0} email.`)
      );
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Có lỗi khi xử lý lịch công tác.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function askAssistant(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!inputValue.trim()) return;

    const text = inputValue;
    setInputValue("");
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", text }]);
    setIsChatLoading(true);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    const payload = (await response.json()) as ChatResponse | { error?: string };
    setIsChatLoading(false);

    if (response.ok && "intent" in payload && payload.intent === "schedule" && payload.title && payload.date && payload.time) {
      setFormData({ date: payload.date, time: payload.time, title: payload.title, attendees: [] });
      setIsModalOpen(true);
      setIsAssistantOpen(false);
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "bot", text: "Tôi đã điền sẵn form lịch. Đồng chí chọn người nhận rồi bấm lưu." }]);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: Date.now() + 1, role: "bot", text: ("reply" in payload && payload.reply) || ("error" in payload && payload.error) || "Tôi chưa rõ thời gian." }
    ]);
  }

  return (
    <main className="min-h-screen relative flex items-center justify-center p-4 md:p-8 font-sans overflow-hidden bg-[#F3F4F6]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] bg-purple-300 rounded-full mix-blend-multiply blur-[140px] opacity-70" />
        <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-blue-300 rounded-full mix-blend-multiply blur-[120px] opacity-60" />
        <div className="absolute bottom-[-10%] left-[20%] w-[700px] h-[700px] bg-indigo-200 rounded-full mix-blend-multiply blur-[150px] opacity-50" />
      </div>

      {toastMsg ? (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100]">
          <div className="bg-white/80 backdrop-blur-xl border border-white/60 shadow-lg rounded-full px-5 py-2.5 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-[13px] font-medium text-gray-800">{toastMsg}</span>
          </div>
        </div>
      ) : null}

      <section className="w-full max-w-6xl h-[85vh] min-h-[650px] bg-white/40 backdrop-blur-[30px] rounded-[24px] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.15),inset_0_0_0_1px_rgba(255,255,255,0.5)] flex flex-col overflow-hidden relative z-10">
        <header className="h-[65px] border-b border-white/30 flex items-center justify-between px-6 bg-white/20">
          <div className="flex items-center gap-5">
            <div className="flex gap-2"><span className="w-3 h-3 rounded-full bg-[#FF5F56]" /><span className="w-3 h-3 rounded-full bg-[#FFBD2E]" /><span className="w-3 h-3 rounded-full bg-[#27C93F]" /></div>
            <h1 className="text-[17px] font-bold text-gray-800/90">Dashboard lịch công tác</h1>
          </div>

          <div className="flex items-center gap-3">
            {userEmail ? <span className="hidden lg:block text-[12px] text-gray-600">{userEmail}</span> : null}
            <a href={GOOGLE_CALENDAR_SRC} target="_blank" rel="noreferrer" className="hidden sm:flex bg-white/40 border border-white/50 rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-700 items-center gap-1">
              <ExternalLink className="w-4 h-4" /> Mở Google Calendar
            </a>
            <button onClick={() => openModal()} className="bg-gradient-to-r from-[#4A90E2] to-[#9013FE] text-white px-3 py-1.5 rounded-lg flex items-center text-[13px] font-medium"><Plus className="w-4 h-4 mr-1" /> Thêm lịch</button>
            <form action="/auth/signout" method="post"><button aria-label="Đăng xuất" className="bg-white/40 border border-white/50 rounded-lg p-1.5"><LogOut className="w-4 h-4" /></button></form>
          </div>
        </header>

        <div className="flex-1 min-h-0 bg-white/20 p-3 md:p-4">
          <div className="h-full overflow-hidden rounded-2xl border border-white/70 bg-white/70 shadow-inner">
            <iframe title="Google Calendar lịch công tác" src={GOOGLE_CALENDAR_SRC} className="h-full w-full border-0 bg-white" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        </div>

        <div className="border-t border-white/30 bg-white/20 px-4 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Lịch đã lưu trong hệ thống</p>
          <p className="text-[12px] text-gray-500">{events.length} sự kiện nội bộ dùng để gửi thông báo và lưu vết.</p>
          {events.length ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {events.slice(-8).reverse().map((calendarEvent) => (
                <button key={calendarEvent.id} type="button" onClick={() => openModal(calendarEvent.date)} className="min-w-[220px] rounded-xl border border-white/70 bg-white/65 px-3 py-2 text-left shadow-sm">
                  <div className="truncate text-[12px] font-bold text-gray-800">{calendarEvent.title}</div>
                  <div className="mt-1 text-[11px] text-gray-500">{calendarEvent.date} · {calendarEvent.time.slice(0, 5)}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isModalOpen ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900/10 backdrop-blur-[4px]">
            <div className="bg-white/85 backdrop-blur-3xl border border-white rounded-3xl shadow-xl w-[440px] overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200/50 flex justify-between items-center bg-white/40">
                <h2 className="text-[15px] font-bold text-gray-800 flex items-center"><CalendarIcon className="w-4 h-4 mr-2 text-[#4A90E2]" /> Thêm Lịch Công tác</h2>
                <button onClick={() => setIsModalOpen(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="p-5 space-y-4">
                <input value={formData.title} onChange={(event) => setFormData({ ...formData, title: event.target.value })} placeholder="VD: Họp giao ban cơ quan..." className="w-full bg-white/50 border border-white/60 rounded-xl px-3 py-2 text-[13px]" />
                <div className="flex gap-4">
                  <input type="date" value={formData.date} onChange={(event) => setFormData({ ...formData, date: event.target.value })} className="flex-1 bg-white/50 border border-white/60 rounded-xl px-3 py-2 text-[13px]" />
                  <input type="time" value={formData.time} onChange={(event) => setFormData({ ...formData, time: event.target.value })} className="flex-1 bg-white/50 border border-white/60 rounded-xl px-3 py-2 text-[13px]" />
                </div>
                <div className="bg-white/40 border border-white/60 rounded-xl p-1.5 max-h-[150px] overflow-y-auto">
                  {contacts.map((contact) => (
                    <button type="button" key={contact.id} onClick={() => toggleContact(contact.id)} className="w-full flex items-center px-3 py-2 hover:bg-white/80 rounded-lg">
                      <span className="mr-3 text-[#4A90E2]">{formData.attendees.includes(contact.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}</span>
                      <span className="text-[12.5px] font-medium text-gray-800">{contact.name}</span>
                      <span className="ml-auto text-[11px] text-gray-500">{contact.email}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-5 py-4 border-t flex justify-end gap-3 bg-gray-50/50">
                <button onClick={openManualMail} className="px-4 py-2 bg-white border border-gray-300 rounded-xl text-[13px] font-medium">Gửi thủ công</button>
                <button onClick={saveEvent} disabled={!formData.title.trim() || isSubmitting} className="px-4 py-2 rounded-xl flex items-center text-[13px] font-medium bg-gradient-to-r from-[#4A90E2] to-[#9013FE] text-white disabled:bg-gray-200 disabled:text-gray-400">{isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Đang xử lý...</> : <><Mail className="w-4 h-4 mr-2" /> Lưu lịch</>}</button>
              </div>
            </div>
          </div>
        ) : null}

        <aside className={`absolute top-0 bottom-0 right-0 w-[340px] bg-white/70 backdrop-blur-3xl border-l border-white/60 shadow-xl transform transition-transform z-40 flex flex-col ${isAssistantOpen ? "translate-x-0" : "translate-x-full"}`}>
          <div className="h-[65px] flex items-center justify-between px-5 border-b border-white/40"><span className="text-[14px] font-bold text-gray-800 flex items-center"><Sparkles className="w-5 h-5 mr-2 text-[#9013FE]" /> Trợ lý Cơ quan</span><button onClick={() => setIsAssistantOpen(false)}><ChevronRight className="w-4 h-4" /></button></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] ${message.role === "user" ? "bg-gradient-to-br from-[#4A90E2] to-[#9013FE] text-white" : "bg-white/70 text-gray-800"}`}>{message.text}</div></div>)}
            {isChatLoading ? <div className="pl-4 text-xs text-gray-500">Đang phân tích...</div> : null}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={askAssistant} className="p-4 border-t border-white/40 relative"><input value={inputValue} onChange={(event) => setInputValue(event.target.value)} placeholder="Ra lệnh tạo lịch..." className="w-full bg-white/60 border border-white rounded-full pl-4 pr-10 py-2.5 text-[13px]" /><button type="submit" className="absolute right-5 top-5 p-1.5 rounded-full bg-gradient-to-r from-[#4A90E2] to-[#9013FE] text-white"><Send className="w-3.5 h-3.5" /></button></form>
        </aside>
      </section>

      <button onClick={() => setIsAssistantOpen(!isAssistantOpen)} className="absolute bottom-6 right-6 z-50 p-3 rounded-full shadow-lg border border-white/80 bg-white/80 backdrop-blur-xl hover:scale-110 transition">{isAssistantOpen ? <X className="w-5 h-5" /> : <Sparkles className="w-6 h-6 text-[#9013FE]" />}</button>
    </main>
  );
}

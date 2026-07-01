export type Contact = { id: string; name: string; email: string };
export type CalendarEvent = { id: string; title: string; date: string; time: string; attendees: string[]; created_at?: string };
export type EventPayload = { title: string; date: string; time: string; attendees: string[] };
export type ChatResponse = { intent: "schedule" | "unknown" | "error"; title?: string; date?: string; time?: string; reply: string };

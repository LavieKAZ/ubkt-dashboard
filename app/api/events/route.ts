import { NextResponse } from "next/server";
import { sendEventEmail } from "@/lib/mail";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { EventPayload } from "@/lib/types";

function isValidDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`)); }
function isValidTime(value: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

export async function POST(request: Request) {
  const userClient = await createClient();
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as Partial<EventPayload>;
  const title = body.title?.trim();
  const date = body.date;
  const time = body.time;
  const attendees = Array.isArray(body.attendees) ? body.attendees : [];
  if (!title || !date || !time || !isValidDate(date) || !isValidTime(time)) return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
  const supabase = createAdminClient();
  const attendeeIds = attendees.filter(isUuid);
  const attendeeEmails = attendees.filter((value) => !isUuid(value));
  const [byId, byEmail] = await Promise.all([
    attendeeIds.length ? supabase.from("contacts").select("id,email").in("id", attendeeIds) : Promise.resolve({ data: [], error: null }),
    attendeeEmails.length ? supabase.from("contacts").select("id,email").in("email", attendeeEmails) : Promise.resolve({ data: [], error: null })
  ]);
  if (byId.error) return NextResponse.json({ error: byId.error.message }, { status: 500 });
  if (byEmail.error) return NextResponse.json({ error: byEmail.error.message }, { status: 500 });
  const contacts = [...new Map([...(byId.data ?? []), ...(byEmail.data ?? [])].map((c) => [c.id, c])).values()];
  const contactIds = contacts.map((contact) => contact.id);
  const recipientEmails = contacts.map((contact) => contact.email);
  const { data: event, error: insertError } = await supabase.from("events").insert({ title, date, time, attendees: contactIds }).select("id,title,date,time,attendees,created_at").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  try {
    const mail = await sendEventEmail({ title, date, time, recipients: recipientEmails });
    return NextResponse.json({ event, sent: mail.sent, manualRecipients: mail.skipped ? recipientEmails : [] });
  } catch (error) {
    return NextResponse.json({ event, sent: 0, manualRecipients: recipientEmails, warning: error instanceof Error ? `Đã lưu lịch. Email tự động lỗi: ${error.message}` : "Đã lưu lịch. Email tự động lỗi." }, { status: 207 });
  }
}

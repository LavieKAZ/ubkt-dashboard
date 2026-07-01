import { createAdminClient } from "@/lib/supabase/admin";
import type { CalendarEvent, Contact } from "@/lib/types";

export async function getCalendarData(): Promise<{ contacts: Contact[]; events: CalendarEvent[] }> {
  const supabase = createAdminClient();
  const [{ data: contacts, error: contactsError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from("contacts").select("id,name,email").order("name"),
    supabase.from("events").select("id,title,date,time,attendees,created_at").order("date", { ascending: true }).order("time", { ascending: true })
  ]);
  if (contactsError) throw new Error(`Cannot load contacts: ${contactsError.message}`);
  if (eventsError) throw new Error(`Cannot load events: ${eventsError.message}`);
  return { contacts: contacts ?? [], events: events ?? [] };
}

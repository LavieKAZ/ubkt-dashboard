import CalendarApp from "@/components/CalendarApp";
import { getCalendarData } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const { contacts, events } = await getCalendarData();
  return <CalendarApp contacts={contacts} initialEvents={events} userEmail={data.user?.email} />;
}

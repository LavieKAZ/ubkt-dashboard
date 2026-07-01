import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/env";
import type { CalendarEvent, Contact } from "@/lib/types";

type Database = { public: { Tables: { contacts: { Row: Contact; Insert: Omit<Contact, "id"> & { id?: string }; Update: Partial<Contact> }; events: { Row: CalendarEvent; Insert: Omit<CalendarEvent, "id" | "created_at"> & { id?: string; created_at?: string }; Update: Partial<CalendarEvent> } } } };

export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient<Database>(getSupabaseUrl(), serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

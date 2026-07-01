"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserKey, getSupabaseUrl } from "@/lib/supabase/env";

export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseBrowserKey());
}

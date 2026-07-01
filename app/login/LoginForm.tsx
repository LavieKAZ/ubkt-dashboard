"use client";

import { CalendarDays, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const searchParams = useSearchParams();
  async function handleGoogleLogin() {
    setIsLoading(true);
    setErrorMessage("");
    const supabase = createClient();
    const next = searchParams.get("next") ?? "/";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) { setErrorMessage(error.message); setIsLoading(false); }
  }
  return <main className="min-h-screen relative flex items-center justify-center overflow-hidden bg-[#F3F4F6] p-6 font-sans"><div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] bg-purple-300 rounded-full mix-blend-multiply blur-[140px] opacity-70"/><div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-blue-300 rounded-full mix-blend-multiply blur-[120px] opacity-60"/></div><section className="relative z-10 w-full max-w-sm rounded-[24px] border border-white/70 bg-white/55 p-6 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.16)] backdrop-blur-[30px]"><div className="mb-8 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4A90E2] to-[#9013FE] text-white"><CalendarDays className="h-5 w-5"/></div><div><h1 className="text-lg font-bold text-gray-900">Lịch công tác cơ quan</h1><p className="text-xs font-medium text-gray-500">Đăng nhập bằng tài khoản Google</p></div></div><button type="button" onClick={handleGoogleLogin} disabled={isLoading} className="flex w-full items-center justify-center rounded-xl border border-white/70 bg-white/70 px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm hover:bg-white disabled:opacity-70">{isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Đang chuyển hướng...</> : "Tiếp tục với Google"}</button>{errorMessage ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50/80 px-3 py-2 text-xs font-medium text-red-700">{errorMessage}</p> : null}</section></main>;
}

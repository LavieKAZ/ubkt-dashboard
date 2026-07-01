"use client";

import { CalendarDays, Loader2, Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const searchParams = useSearchParams();

  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setErrorMessage("Vui lòng nhập email để nhận link đăng nhập.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const supabase = createClient();
    const next = searchParams.get("next") ?? "/";
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo,
        shouldCreateUser: true
      }
    });

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    setSuccessMessage("Đã gửi link đăng nhập. Đồng chí vui lòng mở email và bấm vào liên kết xác nhận.");
    setIsLoading(false);
  }

  return (
    <main className="min-h-screen relative flex items-center justify-center overflow-hidden bg-[#F3F4F6] p-6 font-sans">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] bg-purple-300 rounded-full mix-blend-multiply blur-[140px] opacity-70" />
        <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-blue-300 rounded-full mix-blend-multiply blur-[120px] opacity-60" />
      </div>

      <section className="relative z-10 w-full max-w-sm rounded-[24px] border border-white/70 bg-white/55 p-6 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.16)] backdrop-blur-[30px]">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4A90E2] to-[#9013FE] text-white">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Lịch công tác cơ quan</h1>
            <p className="text-xs font-medium text-gray-500">Đăng nhập bằng email cơ quan</p>
          </div>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="email">
            Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-500" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ten.canbo@coquan.gov.vn"
              className="w-full rounded-xl border border-white/70 bg-white/70 py-3 pl-10 pr-3 text-sm font-medium text-gray-800 shadow-inner outline-none transition placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-[#4A90E2]/35"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="flex w-full items-center justify-center rounded-xl border border-white/70 bg-gradient-to-r from-[#4A90E2] to-[#9013FE] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang gửi link...
              </>
            ) : (
              "Gửi link đăng nhập"
            )}
          </button>
        </form>

        {successMessage ? (
          <p className="mt-4 rounded-xl border border-green-200 bg-green-50/80 px-3 py-2 text-xs font-medium text-green-700">
            {successMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50/80 px-3 py-2 text-xs font-medium text-red-700">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
}

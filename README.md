# UBKT Dashboard - Lịch công tác cơ quan

Next.js App Router chuyển từ prototype React sang ứng dụng production-ready: Supabase Auth bằng email magic link, Supabase database, API Gemini server-side, lưu lịch công tác và hỗ trợ gửi email.

## Biến môi trường Vercel

```env
NEXT_PUBLIC_SUPABASE_URL=https://hbygfheibcrqaqzoaass.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
SMTP_EMAIL=...
SMTP_PASSWORD=...
```

`SMTP_PASSWORD` là Gmail App Password. Nếu chưa có, ứng dụng vẫn lưu lịch và có nút gửi email thủ công bằng `mailto:`.

## Auth không dùng Google Cloud

Ứng dụng dùng Supabase Email Magic Link, không cần Google Cloud OAuth.

Trong Supabase Dashboard:

1. Vào `Authentication > Providers > Email`.
2. Bật Email provider.
3. Vào `Authentication > URL Configuration`.
4. Đặt Site URL:

```text
https://ubkt-dashboard-qycx.vercel.app
```

5. Thêm Redirect URLs:

```text
https://ubkt-dashboard-qycx.vercel.app/**
http://localhost:3000/**
```

## Database

Database Supabase cần 2 bảng:

- `contacts`: `id`, `name`, `email`
- `events`: `id`, `title`, `date`, `time`, `attendees uuid[]`

Schema nằm trong `supabase/schema.sql`.

## Chạy local

```bash
npm install
npm run dev
```

## Deploy

Import repo trên Vercel, chọn framework Next.js và nhập env ở trên.

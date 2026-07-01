# UBKT Dashboard - Lịch công tác cơ quan

Next.js App Router chuyển từ prototype React sang ứng dụng production-ready: Supabase Auth Google OAuth, Supabase database, API Gemini server-side, lưu lịch công tác và hỗ trợ gửi email.

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

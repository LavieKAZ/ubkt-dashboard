# AI phân tích Báo cáo một trang

Tính năng này thêm nút **Phân tích bằng AI** trong tab **Báo cáo một trang**.

## Nguyên tắc bảo mật

- Không đưa API key vào `index.html`, `config.js` hoặc bất kỳ file frontend nào.
- Không commit API key lên GitHub.
- API key chỉ đặt trong secret/environment variable của Edge Function.
- Giao diện không hiển thị tên nhà cung cấp AI.
- Function chỉ đọc payload báo cáo được gửi lên, không ghi database và không sửa schema.

## Biến môi trường cần cấu hình

Trong Supabase Dashboard, vào **Edge Functions > Secrets** và thêm:

```env
AI_API_KEY=...
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-pro
```

Nếu dùng Supabase CLI:

```bash
supabase secrets set AI_API_KEY="..." AI_BASE_URL="https://api.deepseek.com" AI_MODEL="deepseek-v4-pro"
```

API key bạn đã từng gửi trong chat nên được thu hồi và tạo key mới trước khi dùng.

## Deploy Edge Function

```bash
supabase functions deploy ai-one-page-report
```

Function nằm tại:

```text
supabase/functions/ai-one-page-report/index.ts
```

Config:

```text
supabase/config.toml
```

`verify_jwt = false` vì function tự kiểm tra session bằng Supabase Auth trong code. Người dùng vẫn cần đăng nhập để gọi tính năng này.

## Cách frontend gọi function

Module frontend tự suy ra endpoint từ `window.UBKT_SUPABASE_URL`:

```text
https://<project-ref>.supabase.co/functions/v1/ai-one-page-report
```

Nếu cần dùng endpoint khác, đặt biến runtime:

```js
window.UBKT_AI_REPORT_ENDPOINT = "https://example.com/api/ai-one-page-report";
```

## Kiểm tra sau deploy

1. Đăng nhập hệ thống.
2. Mở tab **Báo cáo một trang**.
3. Bấm **Phân tích bằng AI**.
4. Nếu báo lỗi cấu hình, kiểm tra lại Edge Function secrets.
5. Nếu báo lỗi đăng nhập, refresh phiên đăng nhập hoặc đăng nhập lại.

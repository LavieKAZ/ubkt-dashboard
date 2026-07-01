# UBKT Dashboard - Supabase Ready

## Các file

- `index.html`: giao diện hệ thống đã gắn Supabase client.
- `config.js`: điền Supabase URL, anon key, chế độ đăng nhập.
- `supabase_schema.sql`: chạy trong Supabase SQL Editor để tạo database.

## Chế độ vận hành

### 1. Chạy cục bộ chưa nối Supabase
Giữ `UBKT_AUTH_MODE = "local"` trong `config.js`.
Dữ liệu lưu ở trình duyệt bằng localStorage.

### 2. Chạy chính thức có Supabase
Trong `config.js`:

```js
window.UBKT_SUPABASE_URL = "https://xxxxx.supabase.co";
window.UBKT_SUPABASE_ANON_KEY = "ey...";
window.UBKT_AUTH_MODE = "supabase";
```

Sau đó tạo user trong Supabase Authentication. Người dùng đăng nhập bằng email + mật khẩu đã tạo.

## Ghi chú bảo mật

Không đưa `service_role key` vào `config.js` hoặc `index.html`.
Chỉ dùng `anon public key` ở frontend.

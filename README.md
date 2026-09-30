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

## Giao diện Project Management

- Dashboard tổng quan, Dự án/Chương trình, Trung tâm nhiệm vụ, Kanban và Roadmap dùng chung dữ liệu nhiệm vụ hiện có.
- Roadmap có hai góc nhìn Dòng thời gian và Epic/Sprint; nhiệm vụ chưa có thời hạn được thống kê riêng để bổ sung dữ liệu.
- Biểu mẫu nhập từ văn bản chỉ đạo vẫn là luồng chính; ngoài ra có nhập hàng loạt, theo dõi hoạt động, bình luận, liên kết tệp và thời gian xử lý.
- Khối “Nhiệm vụ tồn đọng” mặc định thu gọn, chỉ hiển thị khi người dùng bấm “Mở rộng”.
- Toàn bộ trường nhập ngày dùng định dạng Việt Nam `dd/mm/yyyy`; dữ liệu vẫn lưu và gửi API theo chuẩn ISO `yyyy-mm-dd`.
- Lớp giao diện mới nằm tại `assets/project-manager-v3.css`; màn hình đăng nhập không bị thay đổi bởi lớp này.

## Tài khoản đơn vị và phê duyệt tiến độ

- Đơn vị tự đăng ký tại màn hình đăng nhập; tài khoản mới ở trạng thái chờ duyệt.
- Admin `admin@tanmy.vn` duyệt tài khoản và gán đúng tên đơn vị.
- Tài khoản đơn vị chỉ đọc các nhiệm vụ được giao cho đơn vị mình.
- Cập nhật tiến độ của đơn vị được đưa vào hàng đợi; dữ liệu nhiệm vụ chỉ đổi sau khi Admin phê duyệt.
- Bản nâng cấp cơ sở dữ liệu nằm tại `supabase/migrations/20260728120000_unit_accounts_and_task_approvals.sql`.

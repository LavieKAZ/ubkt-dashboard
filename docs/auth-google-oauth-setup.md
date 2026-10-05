# Đăng nhập Google, quên mật khẩu, đăng ký đơn vị: cấu hình vận hành

Tài liệu dành cho người vận hành (Codex/Admin). Mã nguồn **không** chứa Client ID/Secret của Google,
service-role key, mật khẩu hay token. Mọi khóa được nhập trực tiếp trên Google Cloud Console và Supabase Dashboard.

- Supabase project: `hbygfheibcrqaqzoaass`
- Supabase callback (dùng cho Google): `https://hbygfheibcrqaqzoaass.supabase.co/auth/v1/callback`
- Production: `https://ubkt-dashboard.vercel.app`. Hãy xác nhận lại tên miền production đang dùng thật, kể cả tên miền riêng nếu có.
- Preview (Vercel): `https://<project>-<hash>-nguyentrandangkhoa96-3582s-projects.vercel.app`
  (ví dụ `https://ubkt-dashboard-bdiukdvhz-nguyentrandangkhoa96-3582s-projects.vercel.app`,
  `https://project-rw7wz-m4wzyyifc-nguyentrandangkhoa96-3582s-projects.vercel.app`)

Ứng dụng luôn gửi `redirectTo = location.origin + location.pathname` (chính trang đang mở). Ứng dụng không bao giờ lấy
địa chỉ chuyển hướng từ query string. Vì vậy chỉ cần khai báo đúng tên miền trong danh sách cho phép của Supabase.

## 1. Áp migration (chỉ khi đã duyệt)

1. Sao lưu: `pg_dump` hoặc bật PITR, rồi chụp lại `public.user_profiles`.
2. Áp `supabase/migrations/20261005200000_auth_registration_google.sql`.
3. Kiểm tra:
   ```sql
   select column_name from information_schema.columns where table_name='user_profiles' and column_name='position_title';
   select proname, prosecdef, proconfig from pg_proc where proname in ('submit_unit_registration','admin_list_user_accounts','handle_new_user_profile');
   select id, email, role, approval_status, is_active, unit_name from public.user_profiles order by created_at; -- phải y hệt trước khi áp
   ```
4. Quay lại nếu cần: `supabase/rollbacks/20261005200000_auth_registration_google.rollback.sql`.
   Rollback sẽ xóa cột `position_title`.

Nếu chưa áp migration, giao diện mới vẫn chạy, với các giới hạn sau:
- Bước "Hoàn tất đăng ký" sau Google chỉ lưu được họ tên và đơn vị. Chức vụ không được lưu.
- Lỗi cũ vẫn còn: hồ sơ người đăng ký mới bị tạo `role='viewer'`, `is_active=true`. Tài khoản này vẫn bị chặn vì đang `pending`.

## 2. Google Cloud Console

Vào **APIs & Services → Credentials → Create credentials → OAuth client ID**:

| Mục | Giá trị |
|---|---|
| Application type | Web application |
| Name | UBKT Dashboard (Supabase) |
| Authorized JavaScript origins | `https://ubkt-dashboard.vercel.app` (cộng thêm tên miền production riêng, nếu có) |
| Authorized redirect URIs | `https://hbygfheibcrqaqzoaass.supabase.co/auth/v1/callback` |

Lưu ý:
- Google không chấp nhận ký tự `*` trong origin. Preview vẫn đăng nhập được, vì Google chỉ chuyển hướng về callback của Supabase. Sau đó Supabase mới chuyển về trang Preview theo danh sách Redirect URLs ở bước 3. Muốn khai báo một Preview cụ thể thì thêm đúng origin đó vào danh sách.
- OAuth consent screen:
  - User type: chọn *External* (hoặc *Internal* nếu dùng Google Workspace của cơ quan).
  - Scopes: chỉ cần `openid`, `email`, `profile`.
  - Điền tên ứng dụng, email hỗ trợ và logo.
  - Nếu để chế độ *Testing*, phải thêm từng email thử nghiệm.
- Lưu Client ID và Client Secret vào trình quản lý bí mật. **Không** dán vào repo, issue, PR hay log.

## 3. Supabase Dashboard

**Authentication → Sign In / Providers → Google**
- Enable: bật.
- Nhập Client ID và Client Secret từ bước 2.
- "Skip nonce check": để tắt.

**Authentication → URL Configuration**
- Site URL: `https://ubkt-dashboard.vercel.app`
- Redirect URLs (thêm từng dòng):
  ```
  https://ubkt-dashboard.vercel.app/**
  https://*-nguyentrandangkhoa96-3582s-projects.vercel.app/**
  ```
  Thêm tên miền production riêng (nếu có), dạng `https://<ten-mien>/**`.

**Authentication → Sign In / Providers → Email** (giữ nguyên cấu hình hiện tại)
- "Confirm email" đang bật. Admin/UBKT duyệt tài khoản thì `review_user_account` tự đánh dấu email đã xác nhận.
- Có thể đặt Minimum password length = 8 để khớp với kiểm tra ở giao diện.

**Authentication → Emails → Templates**
- "Reset Password": giữ biến `{{ .ConfirmationURL }}`, nên Việt hóa nội dung.
- SMTP: SMTP mặc định của Supabase giới hạn số email mỗi giờ rất thấp. Nên cấu hình SMTP riêng (Authentication → Emails → SMTP Settings) trước khi mở chức năng quên mật khẩu cho toàn bộ đơn vị.

**Liên kết danh tính (identity linking)**
- Supabase tự liên kết đăng nhập Google vào tài khoản sẵn có cùng email, nếu email Google đã được xác minh.
- Không bật "Manual linking". Không cần thao tác gì thêm.

## 4. Luồng hoạt động sau cấu hình

| Tình huống | Kết quả |
|---|---|
| Email/mật khẩu như cũ (kể cả `admin`, `ubkt`, tên ngắn → `@tanmy.vn`) | Giữ nguyên |
| Google, email trùng tài khoản đã duyệt | Liên kết vào tài khoản đó. Vai trò và đơn vị giữ nguyên. |
| Google, email mới | Hồ sơ mới `unit / pending / is_active=false`. Người dùng phải chọn đơn vị trong danh mục, sau đó thấy màn "Chờ phê duyệt". Admin/UBKT duyệt ở trang **Tài khoản đơn vị**, nơi có nhãn "Google" và chức vụ. |
| Tài khoản chờ duyệt / bị từ chối / tạm ngưng | Bị chặn, kèm màn hướng dẫn liên hệ. Phiên đăng nhập được đóng ngay. |
| Quên mật khẩu | Luôn báo trung lập. Mỗi trình duyệt chỉ gửi lại được sau 60 giây. Liên kết trong email mở màn "Đặt mật khẩu mới". |

Không có cách nào tự cấp quyền `admin`/`ubkt`/`vpdu`: vai trò chỉ được Admin/UBKT đặt bằng RPC trên máy chủ.

## 5. Kiểm thử sau khi cấu hình (trên Preview trước)

1. Đăng nhập `admin` bằng mật khẩu hiện có. Đăng nhập tài khoản UBKT, VPĐU và đơn vị: phạm vi trang phải như trước.
2. Quên mật khẩu với email thử nghiệm: nhận email, mở liên kết, đặt mật khẩu mới, đăng nhập lại.
3. Google với email thử nghiệm chưa có tài khoản: chọn đơn vị, thấy "Chờ phê duyệt". Admin duyệt rồi đăng nhập Google lại: vào đúng đơn vị.
4. Google với email đã có tài khoản đơn vị: vào thẳng, vai trò và đơn vị không đổi. Kiểm tra `auth.identities` có thêm dòng `google`; `user_profiles` không có dòng trùng.
5. Thử trên Safari macOS và Safari iPhone (bật/tắt "Prevent cross-site tracking").

# Tab Nhiệm vụ (bản mới)

Ứng dụng React + Vite + Tailwind + shadcn/ui, chạy tại `/nhiem-vu/` trên cùng tên miền Vercel với hệ thống cũ.
Dùng chung đăng nhập Supabase với `index.html`: đăng nhập một lần là dùng được cả hai.

## Cấu trúc

| Đường dẫn | Vai trò |
|---|---|
| `apps/nhiem-vu/src/` | Mã nguồn (sửa ở đây) |
| `apps/nhiem-vu/src/components/ui/` | Thành phần giao diện theo chuẩn shadcn/ui |
| `apps/nhiem-vu/src/components/app/` | Khung ứng dụng: đăng nhập, sidebar, chuông thông báo |
| `apps/nhiem-vu/src/pages/` | Các trang (hiện có: Nhiệm vụ) |
| `apps/nhiem-vu/src/lib/roles.ts` | Quy tắc ẩn/hiện theo vai trò (quyền thật nằm ở RLS Supabase) |
| `nhiem-vu/` (gốc repo) | **Bản build tự sinh**, Vercel phục vụ trực tiếp. Không sửa tay. |

## Phân quyền

| Vai trò | Thấy gì | Làm được gì |
|---|---|---|
| `admin`, `ubkt` | Tất cả đơn vị, mọi phân hệ | Toàn quyền |
| `vpdu` | Tất cả đơn vị, chỉ Tab Nhiệm vụ | Cờ đỏ, sửa thông tin gốc, chốt Đánh giá của VPĐU |
| `unit` | Chỉ nhiệm vụ của đơn vị mình | Bình luận tiến độ, Tự đánh giá |

## Build sau khi sửa mã nguồn

```bash
cd apps/nhiem-vu
npm install
npm run build      # xuất ra thư mục /nhiem-vu ở gốc repo
```

Commit cả thư mục `nhiem-vu/` mới sinh ra rồi push. Vercel sẽ tự triển khai.

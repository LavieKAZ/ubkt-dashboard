# Đo và tối ưu tốc độ Dashboard (07/10/2026)

Nhánh `claude/google-oauth-performance`, tạo từ `474ea05`. Không thay đổi database, RLS hay dữ liệu.
Index đề xuất là migration riêng, **chưa áp** production.

## 1. Số đo phía Supabase (production, chỉ đọc)

| Bảng | Số dòng | Dung lượng JSON | Truy vấn lúc đăng nhập (pg_stat_statements, trung bình / tối đa) |
|---|---:|---:|---|
| `ubkt_audit_logs` | 30.936 | ~79 MB | SELECT toàn bảng: **1.096 / 6.898 ms** · COUNT exact: **353 / 2.212 ms** |
| `ubkt_tasks` | 582 | ~2,0 MB | SELECT: 80 / 2.951 ms · COUNT: 33 ms |
| `ubkt_base_reports` | 2.484 | ~0,27 MB | SELECT: 100 / 2.009 ms |
| Các bảng còn lại | < 70 | < 20 kB | < 20 ms |

- `EXPLAIN ANALYZE ... ubkt_audit_logs ORDER BY updated_at LIMIT 1000`: Seq Scan 30.936 dòng, 474 ms. Bảng không có index nào ngoài khóa chính.
- PostgREST giới hạn mỗi lần trả tối đa 1.000 dòng (mặc định của Supabase). Vì vậy mỗi lần đăng nhập, Admin/UBKT tải 1.000 dòng nhật ký **cũ nhất** (~2,7 MB) mà không dùng tới.
- Nội dung nhiệm vụ (`task`, `conclusion`, `summary`, `result`) chiếm ~1,6 MB / 2,0 MB. Đây là dữ liệu thật mà Tab Nhiệm vụ cần, nên giữ nguyên.

## 2. Đo trên trình duyệt (trước / sau)

**Cách đo**
- Playwright + Chromium.
- Supabase giả lập bằng dữ liệu có **đúng số dòng và dung lượng** như production; độ trễ máy chủ lấy từ `pg_stat_statements`.
- Độ trễ mạng tới Singapore: 40 ms (desktop) / 80 ms (4G); băng thông 30 / 10 Mbps; nén JSON ~25%.
- Điện thoại: CPU chậm ×4.
- Mỗi trường hợp chạy 3 lần, lấy trung vị; đo cả tải lạnh (cache trống) và tải lại.
- Máy chủ tĩnh mô phỏng header Cache-Control của `vercel.json`, có gzip.
- Số đo là **mô phỏng**, dùng để so sánh trước/sau; cần đo lại trên Production thật bằng DevTools.

| Vai trò | Thiết bị | Lần tải | Hiện màn đăng nhập (ms) | Đăng nhập → Dashboard dùng được (ms) | Thay đổi |
|---|---|---|---|---|---|
| Admin/UBKT | Desktop | lạnh | 275 → 263 | **2.567 → 1.059** | −59% |
| Admin/UBKT | Desktop | tải lại | 242 → 253 | **2.536 → 1.152** | −55% |
| Admin/UBKT | Điện thoại 4G | lạnh | 621 → 575 | **3.780 → 2.160** | −43% |
| Admin/UBKT | Điện thoại 4G | tải lại | 608 → 542 | **3.784 → 2.106** | −44% |
| VPĐU | Desktop | lạnh / tải lại | 269 → 244 / 273 → 224 | 1.064 → 1.083 / 1.025 → 1.098 | ±5% (nhiễu) |
| VPĐU | Điện thoại 4G | lạnh / tải lại | 636 → 538 / 632 → 569 | 2.464 → 2.264 / 2.287 → 2.203 | −4…8% |
| Đơn vị | Desktop | lạnh / tải lại | 235 → 250 / 246 → 241 | 685 → 678 / 663 → 673 | ±2% (nhiễu) |
| Đơn vị | Điện thoại 4G | lạnh / tải lại | 612 → 551 / 622 → 589 | 1.249 → 1.355 / 1.452 → 1.306 | ±10% (nhiễu) |

| Chỉ số (Admin, desktop) | Trước | Sau |
|---|---:|---:|
| Request Supabase sau khi bấm Đăng nhập | 22 | 12 |
| Request phải xong trước khi Dashboard dùng được | 21 | 6 |
| Số đợt chạy nối tiếp trên đường găng | 5 | 3 |
| Dữ liệu tải trước khi dùng được | 5,8 MB | 2,7 MB |
| Request trùng lặp | 0 | 0 |

**Tài nguyên tĩnh** (tải lạnh): HTML 113 kB nén (494 kB gốc), JS 193 kB nén (650 kB), CSS 65 kB nén (300 kB).
Đo được: DOMContentLoaded ~0,3 s (desktop) / ~0,8 s (4G); FCP/LCP màn đăng nhập ~0,32 s / ~0,6 s.

## 3. Nguyên nhân chậm theo số đo

- **Supabase / dữ liệu (chính, chỉ với Admin/UBKT)**
  - Mỗi lần đăng nhập đọc bảng nhật ký 31.000 dòng: COUNT exact 0,35 s, rồi SELECT 1,1 s (có lúc tới 6,9 s) và tải ~2,7 MB không dùng tới.
  - Hai bước này chạy **nối tiếp**, cộng thêm 8 truy vấn đếm `count=exact` chỉ để kiểm tra bảng có rỗng hay không.
- **Frontend**
  - Các bước tải chạy nối tiếp: truy vấn đếm → toàn bộ bảng → hàng đợi duyệt → thông báo.
  - Sau khi có dữ liệu, toàn trang bị vẽ lại 2 lần liền nhau.
  - Trong lúc chờ, Dashboard để trống.
- **Vercel**: **không** phải điểm nghẽn. Màn đăng nhập hiện sau ~0,25 s (desktop) / ~0,6 s (4G); `index.html` dùng `no-store` theo `vercel.json` nên luôn tải lại ~113 kB nén.
- **VPĐU / đơn vị**: vốn đã chỉ tải nhiệm vụ. Thời gian chủ yếu là 3 lượt mạng (đăng nhập → hồ sơ → nhiệm vụ) và dữ liệu nhiệm vụ 2,7 MB (VPĐU) / 0,3 MB (đơn vị). Không phải do gói Free; truy vấn nhiệm vụ trên máy chủ chỉ ~80 ms.

## 4. Đã sửa (không đổi database)

1. **Bỏ 8 truy vấn đếm** `count=exact` khi trình duyệt không có dữ liệu mẫu cần nạp. Logic nạp mẫu giữ nguyên: bảng trống mà có dữ liệu mẫu thì vẫn nạp.
2. **Pha 1 (đường găng)**: chỉ tải nhiệm vụ + hàng đợi duyệt + thông báo, chạy song song bằng `Promise.all`.
3. **Pha 2 (chạy nền sau khi Dashboard dùng được)**: Dư luận, Kết luận, Cơ sở, Báo cáo cơ sở, Hồ sơ, Kỳ báo cáo.
   `saveAllToDatabase` chỉ ghi các bảng **đã tải**, nên dữ liệu mẫu trên trình duyệt không bao giờ đè dữ liệu thật của bảng chưa tải xong.
4. **Nhật ký thao tác** không tải lúc đăng nhập. Khi mở mới tải **250 dòng mới nhất** (`order updated_at desc limit 250`); trước đây là 1.000 dòng cũ nhất.
   Lưu tự động chỉ gửi các dòng nhật ký **mới phát sinh** thay vì gửi lại toàn bộ.
5. **Khung chờ** cho Dashboard (KPI, tiến độ, đơn vị, lịch) và Tab Nhiệm vụ. Không còn hiện "Chưa có nhiệm vụ" trong lúc đang tải.
6. Bỏ lần vẽ lại toàn trang thứ 2 ngay sau khi tải. Thông báo tải song song thay vì nối tiếp.
7. `chart.umd` và `supabase-js` trong `<head>` chuyển sang `defer` (không chặn hiển thị màn đăng nhập).
8. Giữ nguyên: Tab Nhiệm vụ đã phân trang 30 dòng; lịch sử kết quả chỉ tải khi mở nhiệm vụ. Dashboard vẫn tính theo "Đánh giá của VPĐU" và chỉ vẽ lại khối có thay đổi.
   `localStorage` không chứa nội dung nhiệm vụ (đã kiểm tra: chỉ cài đặt giao diện và phiên Supabase).

## 5. Đề xuất cần Codex duyệt (chưa áp)

- `supabase/migrations/20261007150000_audit_logs_recent_index.sql` (kèm rollback và kiểm thử PGlite): index `ubkt_audit_logs (updated_at desc)`.
  Truy vấn "250 nhật ký mới nhất" chuyển từ Seq Scan sang Index Scan; PGlite đo 50 ms → 7 ms với 31.000 dòng. Không đổi dữ liệu.
- Chưa nên làm RPC tổng hợp Dashboard: truy vấn nhiệm vụ trên máy chủ chỉ ~80 ms, và Dashboard vẫn cần danh sách nhiệm vụ cho mục "Sắp đến hạn" / "Tồn đọng".
- Nên xem xét sau: `saveAllToDatabase` đang ghi lại **toàn bộ** 582 nhiệm vụ mỗi lần lưu tự động (pg_stat_statements: 982 lần upsert). Nên chuyển dần sang chỉ ghi dòng thay đổi. Việc này đụng hàm lưu nên tách thành PR riêng.
- Có thể thêm `Cache-Control: public, max-age=31536000, immutable` cho `/assets/*.js|css`, vì các file đã có tham số `?v=`. Hiện chúng phải hỏi lại máy chủ (304) mỗi lần tải. Cần sửa `vercel.json`, nên để Codex quyết định.

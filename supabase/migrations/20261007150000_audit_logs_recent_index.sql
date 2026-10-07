-- ĐỀ XUẤT (chưa áp production): index cho truy vấn "Nhật ký thao tác mới nhất".
-- Số đo production 07/10/2026 (chỉ đọc):
--   ubkt_audit_logs: 30.936 dòng, ~79 MB JSON. Không có index nào ngoài khóa chính.
--   pg_stat_statements: SELECT toàn bảng mean 1.096 ms, max 6.898 ms (497 lần gọi);
--   EXPLAIN ANALYZE ... ORDER BY updated_at LIMIT 1000 → Seq Scan 30.936 dòng + top-N heapsort, 474 ms.
-- Frontend mới chỉ tải 250 dòng mới nhất khi mở "Nhật ký thao tác":
--   select id,data,updated_at from ubkt_audit_logs order by updated_at desc limit 250
-- Index này cho phép đọc thẳng 250 dòng mới nhất thay vì quét toàn bảng.
-- Không đổi dữ liệu, RLS hay quyền. Bảng ~31k dòng: tạo index mất dưới 1 giây.
-- Nếu muốn không khóa ghi, có thể chạy riêng (ngoài transaction):
--   create index concurrently if not exists ubkt_audit_logs_updated_at_idx on public.ubkt_audit_logs (updated_at desc);
-- Quay lại: supabase/rollbacks/20261007150000_audit_logs_recent_index.rollback.sql

create index if not exists ubkt_audit_logs_updated_at_idx
  on public.ubkt_audit_logs (updated_at desc);

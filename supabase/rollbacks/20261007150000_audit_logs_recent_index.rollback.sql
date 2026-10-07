-- Quay lại migration 20261007150000_audit_logs_recent_index.sql (chỉ xóa index, không đụng dữ liệu).
drop index if exists public.ubkt_audit_logs_updated_at_idx;

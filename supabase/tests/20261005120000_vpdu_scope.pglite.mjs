// Kiểm thử migration 20261005120000 trên Postgres chạy cục bộ (PGlite) — KHÔNG kết nối Supabase thật.
// Chạy: npm i @electric-sql/pglite@0.2 && node supabase/tests/20261005120000_vpdu_scope.pglite.mjs
// Khung bảng/hàm private.* mô phỏng production; định nghĩa cũ lấy từ file rollback (= bản đang chạy).
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const R = new URL("../", import.meta.url).pathname;
const mig = fs.readFileSync(R + "migrations/20261005120000_vpdu_scope_and_update_review.sql", "utf8");
const rb = fs.readFileSync(R + "rollbacks/20261005120000_vpdu_scope_and_update_review.rollback.sql", "utf8");
const db = new PGlite();
const q = (s, p) => db.query(s, p);
// Khung giống production; hàm cũ lấy nguyên văn từ file rollback (= định nghĩa production hiện tại)
await db.exec(`
create schema auth; create schema private;
create role authenticated; create role anon; create role service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, confirmation_sent_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz, updated_at timestamptz);
create table public.user_profiles(id uuid primary key, email text, full_name text, phone text, role text, approval_status text, is_active boolean, unit_name text, requested_unit text, review_note text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.ubkt_tasks(id text primary key, data jsonb not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
create table public.ubkt_audit_logs(id text primary key, data jsonb not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
create table public.task_update_requests(id uuid primary key default gen_random_uuid(), task_id text not null references public.ubkt_tasks(id), requested_by uuid not null, unit_name text not null, proposed_data jsonb not null default '{}', status text not null default 'pending', review_note text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.resolution_sync_snapshots(id uuid primary key default gen_random_uuid(), synced_by uuid, data jsonb);
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.role in ('admin','vpdu','ubkt') and p.approval_status='approved' and p.is_active is true) $$;
create function private.is_full_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.role in ('admin','ubkt') and p.approval_status='approved' and p.is_active is true) $$;
create function private.is_system_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.role='admin' and p.approval_status='approved' and p.is_active is true) $$;
`);
// trạng thái production hiện tại = nội dung file rollback (tạo hàm/policy cũ)
await db.exec(rb.replace(/reindex index[^;]+;/g, "").replace("drop function if exists public.list_task_update_requests();", ""));
await db.exec(`
create index ubkt_tasks_canonical_unit_idx on public.ubkt_tasks (private.normalize_unit_name(data ->> 'unit'));
create index ubkt_tasks_canonical_co_unit_idx on public.ubkt_tasks (private.normalize_unit_name(data ->> 'coUnit'));
alter table public.task_update_requests enable row level security;
create policy task_update_requests_read_own_or_admin on public.task_update_requests for select to authenticated using ((requested_by=(select auth.uid())) or (select private.is_admin()));
grant select, update on public.task_update_requests to authenticated; alter table public.resolution_sync_snapshots enable row level security; create policy rs_read on public.resolution_sync_snapshots for select to authenticated using (true); grant select, insert, update on public.resolution_sync_snapshots to authenticated; grant usage on schema private, auth to authenticated;
insert into public.user_profiles(id,email,full_name,phone,role,approval_status,is_active,unit_name) values
 ('00000000-0000-0000-0000-000000000001','admin@x','Quản trị','0900','admin','approved',true,null),
 ('00000000-0000-0000-0000-000000000002','ubkt@x','Lê Thị Phương','0901','ubkt','approved',true,null),
 ('00000000-0000-0000-0000-000000000003','vpdu@x','Nguyễn Thị May','0902','vpdu','approved',true,null),
 ('00000000-0000-0000-0000-000000000004','mttq@x','Trần Văn Bình','0903','unit','approved',true,'MTTQ'),
 ('00000000-0000-0000-0000-000000000005','new@x','Người mới','0904','unit','pending',false,null);
insert into auth.users(id,email) select id,email from public.user_profiles;
insert into public.ubkt_tasks(id,data) values ('T1','{"unit":"MTTQ","status":"đang thực hiện","progress":20,"result":"cũ"}'),('T2','{"unit":"HĐND"}');
insert into public.task_update_requests(id,task_id,requested_by,unit_name,proposed_data) values
 ('10000000-0000-0000-0000-000000000001','T1','00000000-0000-0000-0000-000000000004','MTTQ','{"status":"hoàn thành","progress":100,"result":"mới"}'),
 ('10000000-0000-0000-0000-000000000002','T1','00000000-0000-0000-0000-000000000004','MTTQ','{"progress":50}'),
 ('10000000-0000-0000-0000-000000000003','T1','00000000-0000-0000-0000-000000000004','MTTQ','{"progress":60}');
`);
const U = n => "00000000-0000-0000-0000-00000000000" + n;
const results = [];
async function as(uid, sql, label, expectOk, check) {
  await db.exec(`savepoint sp; select set_config('test.uid','${uid}',false); set role authenticated;`);
  let ok = true, msg = "", rows;
  try { const r = await q(sql); rows = r.rows; msg = JSON.stringify(rows?.[0] ?? r.affectedRows ?? "").slice(0, 110); if (check && !check(rows)) { ok = false; msg = "check failed " + msg; } } catch (e) { ok = false; msg = e.message.slice(0, 110); await db.exec("rollback to savepoint sp"); }
  await db.exec("reset role; release savepoint sp");
  results.push({ pass: ok === expectOk ? "✔" : "✘", label, msg });
}
// Đo kết quả chuẩn hóa trước migration
const sample = ["Ban Xây dựng Đảng","BCHQS","Đảng uỷ - BCH Công an phường","HĐND","MTTQ","TTCT","UBKT","UBND Phường","VPĐU","Chưa xác định đơn vị","ubnd","Văn phòng Đảng ủy","Trung tâm Chính trị","Ban Chỉ huy Quân sự","BCH Công an phường"];
const before = (await q(`select v, private.normalize_unit_name(v) n from unnest($1::text[]) v`, [sample])).rows;

await db.exec("BEGIN");
await db.exec(mig);
const after = (await q(`select v, private.normalize_unit_name(v) n from unnest($1::text[]) v`, [sample])).rows;
results.push({ pass: JSON.stringify(before) === JSON.stringify(after) ? "✔" : "✘", label: "giá trị đơn vị đang lưu cho kết quả y hệt trước migration", msg: "" });
const aliases = (await q(`select v, private.normalize_unit_name(v) n from unnest($1::text[]) v`, [["Quân sự","Công an","BCH Công an","UBND","Trung tâm Chính trị","Văn phòng Đảng ủy","Ban Chỉ huy Quân sự","BCHQS – Ban Chỉ huy Quân sự","Đảng ủy – BCH Công an phường","TTCT – Trung tâm Chính trị","Đơn vị lạ"]])).rows;
const expectAlias = ["BCHQS","Đảng uỷ - BCH Công an phường","Đảng uỷ - BCH Công an phường","UBND Phường","TTCT","VPĐU","BCHQS","BCHQS","Đảng uỷ - BCH Công an phường","TTCT",null];
results.push({ pass: JSON.stringify(aliases.map(r => r.n)) === JSON.stringify(expectAlias) ? "✔" : "✘", label: "tên cũ (Quân sự, Công an, BCH Công an, UBND, gạch dài…) về đúng danh mục", msg: aliases.map(r => r.n).join(" | ").slice(0, 110) });

await as(U(3), "select count(*) from public.admin_list_user_accounts()", "VPĐU gọi danh sách tài khoản → bị chặn", false);
await as(U(1), "select count(*)::int n from public.admin_list_user_accounts()", "Admin xem danh sách tài khoản", true, r => r[0].n === 5);
await as(U(2), "select count(*)::int n from public.admin_list_user_accounts()", "UBKT xem danh sách tài khoản", true, r => r[0].n === 5);
await as(U(3), `select * from public.review_user_account('${U(5)}','approved','MTTQ',null)`, "VPĐU duyệt tài khoản → bị chặn", false);
await as(U(3), "select * from public.list_task_update_requests()", "VPĐU xem hàng đợi kèm họ tên", true, r => r.length === 3 && r[0].requester_name === "Trần Văn Bình" && !("email" in r[0]));
await as(U(4), "select * from public.list_task_update_requests()", "Đơn vị gọi hàng đợi tổng → bị chặn", false);
await as(U(3), "update public.task_update_requests set status='approved' where id='10000000-0000-0000-0000-000000000002' returning id", "VPĐU sửa thẳng trạng thái đề nghị (bỏ qua RPC) → không sửa được", true, r => r.length === 0);
await as(U(3), "select status from public.review_task_update('10000000-0000-0000-0000-000000000002','rejected','')", "Từ chối không có lý do → bị chặn", false);
await as(U(3), "select status, review_note, reviewed_by from public.review_task_update('10000000-0000-0000-0000-000000000002','rejected','Thiếu minh chứng')", "VPĐU từ chối có lý do", true, r => r[0].status === "rejected" && r[0].reviewed_by === U(3));
await as(U(3), "select status from public.review_task_update('10000000-0000-0000-0000-000000000002','approved',null)", "Duyệt lại đề nghị đã xử lý → bị chặn", false);
await as(U(3), "select status from public.review_task_update('10000000-0000-0000-0000-000000000001','approved',null)", "VPĐU phê duyệt", true, r => r[0].status === "approved");
const t1 = (await q("select data from public.ubkt_tasks where id='T1'")).rows[0].data;
results.push({ pass: t1.progress === 100 && t1.result === "mới" && t1.unit === "MTTQ" ? "✔" : "✘", label: "Sau phê duyệt: nhiệm vụ cập nhật đúng trường đề nghị, giữ nguyên trường khác", msg: JSON.stringify(t1) });
await as(U(4), "select status from public.review_task_update('10000000-0000-0000-0000-000000000003','approved',null)", "Đơn vị tự duyệt → bị chặn", false);
await as(U(2), "select status from public.review_task_update('10000000-0000-0000-0000-000000000003','approved','OK')", "UBKT phê duyệt", true);
await as(U(3), `insert into public.resolution_sync_snapshots(synced_by,data) values ('${U(3)}','{}') returning id`, "VPĐU ghi đồng bộ Nghị quyết → bị chặn", false);
await as(U(2), `insert into public.resolution_sync_snapshots(synced_by,data) values ('${U(2)}','{}') returning id`, "UBKT ghi đồng bộ Nghị quyết → được", true);
const audits = (await q("select count(*)::int n from public.ubkt_audit_logs")).rows[0].n;
results.push({ pass: audits === 3 ? "✔" : "✘", label: "mỗi lần xử lý ghi một dòng nhật ký (3 lần)", msg: "audit=" + audits });
await db.exec("ROLLBACK");
const restored = (await q("select pg_get_functiondef('public.admin_list_user_accounts'::regproc) d")).rows[0].d;
results.push({ pass: /private\.is_admin\(\)/.test(restored) && !/is_full_admin/.test(restored) ? "✔" : "✘", label: "BEGIN…ROLLBACK: trạng thái cũ còn nguyên", msg: "" });
// Áp thật trên bản thử + rollback file + áp lại 2 lần (idempotent)
await db.exec(mig); await db.exec(mig);
await db.exec(rb);
const fnLeft = (await q("select count(*)::int n from pg_proc where proname='list_task_update_requests'")).rows[0].n;
const back = (await q(`select private.normalize_unit_name('Quân sự') n`)).rows[0].n;
results.push({ pass: fnLeft === 0 && back === null ? "✔" : "✘", label: "file rollback trả về định nghĩa cũ; migration chạy lặp không lỗi", msg: `fn=${fnLeft} QuânSự→${back}` });
console.table(results);
process.exit(results.every(r => r.pass === "✔") ? 0 : 1);

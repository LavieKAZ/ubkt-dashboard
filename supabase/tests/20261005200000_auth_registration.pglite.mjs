// Kiểm thử migration 20261005200000 trên Postgres chạy cục bộ (PGlite) — KHÔNG kết nối Supabase thật.
// Chạy: npm i @electric-sql/pglite@0.2 && node supabase/tests/20261005200000_auth_registration.pglite.mjs
// Khung auth.users/auth.identities và 2 trigger AFTER INSERT mô phỏng production
// (on_auth_user_created → handle_new_user tạo 'viewer'; on_auth_user_created_create_profile → handle_new_user_profile).
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const R = new URL("../", import.meta.url).pathname;
const mig = fs.readFileSync(R + "migrations/20261005200000_auth_registration_google.sql", "utf8");
const rb = fs.readFileSync(R + "rollbacks/20261005200000_auth_registration_google.rollback.sql", "utf8");
const prev = fs.readFileSync(R + "migrations/20261005120000_vpdu_scope_and_update_review.sql", "utf8");
const normalizeFn = prev.slice(prev.indexOf("create or replace function private.normalize_unit_name"));
const normalizeSql = normalizeFn.slice(0, normalizeFn.indexOf("$$;") + 3);

const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
create schema auth; create schema private;
create role authenticated; create role anon; create role supabase_auth_admin;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz, confirmation_sent_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz, updated_at timestamptz);
create table auth.identities(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), provider text not null);
create table public.user_profiles(id uuid primary key, email text, full_name text, role text default 'viewer', is_active boolean default true, created_at timestamptz default now(), updated_at timestamptz default now(), phone text, requested_unit text, unit_name text, approval_status text default 'pending', review_note text, reviewed_by uuid, reviewed_at timestamptz);
alter table public.user_profiles enable row level security;
create function private.is_full_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.role in ('admin','ubkt') and p.approval_status='approved' and p.is_active is true) $$;
create policy user_profiles_read_own_or_admin on public.user_profiles for select to authenticated using ((id = (select auth.uid())) or (select private.is_full_admin()));
create policy user_profiles_update_own_contact on public.user_profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.user_profiles to authenticated;
grant update (full_name, phone, requested_unit) on public.user_profiles to authenticated;
grant usage on schema private, auth to authenticated;
${normalizeSql}
-- trigger cũ trên production (nguyên văn)
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin insert into public.user_profiles (id, email, role) values (new.id, new.email, 'viewer') on conflict (id) do nothing; return new; end; $$;
`);
// handle_new_user_profile + admin_list_user_accounts bản cũ = nội dung rollback (trừ drop cột/hàm mới)
await db.exec(rb);
await db.exec(`
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger on_auth_user_created_create_profile after insert on auth.users for each row execute function public.handle_new_user_profile();
`);
const U = n => "00000000-0000-0000-0000-0000000000" + String(n).padStart(2, "0");
// Tài khoản hiện có (giống production): admin, ubkt, vpdu, unit đã duyệt
await db.exec(`
insert into public.user_profiles(id,email,full_name,phone,role,approval_status,is_active,unit_name,reviewed_at) values
 ('${U(1)}','admin@tanmy.vn','Quản trị','0900','admin','approved',true,null,now()),
 ('${U(2)}','ubkt@tanmy.hcm','UBKT','0901','ubkt','approved',true,null,now()),
 ('${U(3)}','vpdu@gmail.com','VPĐU','0902','vpdu','approved',true,null,now()),
 ('${U(4)}','mttq@gmail.com','Đơn vị MTTQ','0903','unit','approved',true,'MTTQ',now());
insert into auth.users(id,email) select id,email from public.user_profiles where false;
`);
// Hành vi hiện tại (trước migration) — đăng ký mới bị kẹt role viewer
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${U(10)}','old@x.vn','{"full_name":"Trước migration","requested_unit":"MTTQ"}')`);
const beforeBug = (await q(`select role,is_active,approval_status from public.user_profiles where id='${U(10)}'`)).rows[0];

const snapshot = async () => JSON.stringify((await q(`select id,email,full_name,phone,role,approval_status,is_active,unit_name,requested_unit,reviewed_at from public.user_profiles where id in ('${U(1)}','${U(2)}','${U(3)}','${U(4)}') order by id`)).rows);
const existingBefore = await snapshot();

const results = [];
const push = (pass, label, msg = "") => results.push({ pass: pass ? "✔" : "✘", label, msg: String(msg).slice(0, 120) });
async function as(uid, sql, label, expectOk, check) {
  await db.exec(`savepoint sp; select set_config('test.uid','${uid}',false); set role authenticated;`);
  let ok = true, msg = "", rows;
  try { const r = await q(sql); rows = r.rows; msg = JSON.stringify(rows?.[0] ?? r.affectedRows ?? ""); if (check && !check(rows)) { ok = false; msg = "check failed " + msg; } }
  catch (e) { ok = false; msg = e.message; await db.exec("rollback to savepoint sp"); }
  await db.exec("reset role; release savepoint sp");
  push(ok === expectOk, label, msg);
}
push(beforeBug.role === "viewer" && beforeBug.is_active === true, "Xác nhận lỗi hiện tại: đăng ký mới bị tạo role=viewer, is_active=true", JSON.stringify(beforeBug));

await db.exec("BEGIN");
await db.exec(mig);
await db.exec(mig); // chạy lại lần 2 phải an toàn
push(true, "Migration chạy 2 lần liên tiếp không lỗi");
push((await snapshot()) === existingBefore, "Tài khoản hiện có (admin/ubkt/vpdu/unit) giữ nguyên vai trò, đơn vị, trạng thái");
const old10 = (await q(`select role,is_active,approval_status from public.user_profiles where id='${U(10)}'`)).rows[0];
push(old10.role === "viewer", "Migration KHÔNG tự sửa dữ liệu cũ (hồ sơ tạo trước migration giữ nguyên)", JSON.stringify(old10));

// Đăng ký email/mật khẩu mới
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${U(11)}','Moi@Gmail.com','{"full_name":"  Nguyễn Văn Mới ","requested_unit":"Văn phòng Đảng ủy","position_title":"Chuyên viên","phone":"0912","role":"admin"}')`);
await db.exec(`insert into auth.identities(user_id,provider) values ('${U(11)}','email')`);
const p11 = (await q(`select * from public.user_profiles where id='${U(11)}'`)).rows[0];
push(p11.role === "unit" && p11.is_active === false && p11.approval_status === "pending", "Đăng ký email mới → unit / pending / is_active=false (metadata role=admin bị bỏ qua)", JSON.stringify({ r: p11.role, a: p11.is_active, s: p11.approval_status }));
push(p11.full_name === "Nguyễn Văn Mới" && p11.requested_unit === "VPĐU" && p11.position_title === "Chuyên viên" && p11.email === "moi@gmail.com", "Hồ sơ lưu họ tên, đơn vị chuẩn hóa, chức vụ, email chữ thường", JSON.stringify([p11.full_name, p11.requested_unit, p11.position_title, p11.email]));

// Người dùng Google mới (metadata Google: name/full_name, không có requested_unit)
await db.exec(`insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values ('${U(12)}','google.user@gmail.com','{"name":"Google User","avatar_url":"x","email_verified":true}',now())`);
await db.exec(`insert into auth.identities(user_id,provider) values ('${U(12)}','google')`);
const p12 = (await q(`select * from public.user_profiles where id='${U(12)}'`)).rows[0];
push(p12.role === "unit" && !p12.is_active && p12.approval_status === "pending" && p12.requested_unit === null && p12.full_name === "Google User", "Google lần đầu → unit / pending / inactive, chưa có đơn vị (phải hoàn tất đăng ký)", JSON.stringify([p12.role, p12.is_active, p12.requested_unit, p12.full_name]));
push((await q(`select count(*)::int n from public.user_profiles where id='${U(12)}'`)).rows[0].n === 1, "Không tạo hồ sơ trùng lặp");

// Liên kết Google vào tài khoản ĐÃ CÓ (Supabase chỉ thêm dòng identities, không INSERT auth.users)
await db.exec(`insert into auth.users(id,email) values ('${U(4)}','mttq@gmail.com') on conflict do nothing`);
await db.exec(`insert into auth.identities(user_id,provider) values ('${U(4)}','email'),('${U(4)}','google')`);
const p4 = (await q(`select role,unit_name,approval_status,is_active from public.user_profiles where id='${U(4)}'`)).rows[0];
push(p4.role === "unit" && p4.unit_name === "MTTQ" && p4.approval_status === "approved" && p4.is_active, "Tài khoản đơn vị đã duyệt liên kết Google → giữ nguyên vai trò/đơn vị/trạng thái", JSON.stringify(p4));
// Trường hợp xấu: auth.users bị INSERT lại cho id đã có hồ sơ admin (không xảy ra thực tế) → không hạ quyền
await db.exec(`savepoint s1`);
await db.exec(`delete from auth.users where id='${U(1)}'`);
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${U(1)}','admin@tanmy.vn','{"full_name":"X"}')`);
const p1 = (await q(`select role,is_active,approval_status,full_name from public.user_profiles where id='${U(1)}'`)).rows[0];
push(p1.role === "admin" && p1.is_active && p1.full_name === "Quản trị", "Trigger không bao giờ ghi đè vai trò/họ tên của hồ sơ đã có", JSON.stringify(p1));
await db.exec(`rollback to savepoint s1`);

// RPC submit_unit_registration
await as(U(12), `select * from public.submit_unit_registration('Trần Google','ubnd','Phó phòng','0987')`, "Người dùng Google hoàn tất đăng ký (đơn vị alias 'ubnd')", true, r => r[0].requested_unit === "UBND Phường" && r[0].role === "unit" && r[0].approval_status === "pending" && r[0].is_active === false);
await as(U(12), `select * from public.submit_unit_registration('Trần Google','Đơn vị tự đặt',null,null)`, "Đơn vị ngoài danh mục → bị chặn", false);
await as(U(12), `select * from public.submit_unit_registration(' ','MTTQ',null,null)`, "Thiếu họ tên → bị chặn", false);
await as(U(4), `select * from public.submit_unit_registration('Đổi đơn vị','HĐND',null,null)`, "Tài khoản đơn vị đã duyệt gọi RPC → bị chặn (không tự đổi đơn vị)", false);
await as(U(3), `select * from public.submit_unit_registration('VPĐU','MTTQ',null,null)`, "Tài khoản VPĐU gọi RPC → bị chặn (không bị hạ thành unit)", false);
await as(U(1), `select * from public.submit_unit_registration('Admin','MTTQ',null,null)`, "Tài khoản Admin gọi RPC → bị chặn", false);
await as("", `select * from public.submit_unit_registration('Ẩn danh','MTTQ',null,null)`, "Không đăng nhập → bị chặn", false);
await db.exec(`update public.user_profiles set approval_status='rejected', reviewed_at=now() where id='${U(11)}'`);
await as(U(11), `select * from public.submit_unit_registration('Gửi lại','MTTQ',null,null)`, "Tài khoản bị từ chối không tự gửi lại để vượt duyệt", false);
await db.exec(`update public.user_profiles set approval_status='pending', reviewed_at=null where id='${U(11)}'`);
await as(U(12), `update public.user_profiles set role='admin', is_active=true where id='${U(12)}' returning id`, "Người dùng tự sửa role/is_active qua API → bị chặn", false);
await as(U(12), `update public.user_profiles set position_title='x' where id='${U(12)}' returning id`, "Người dùng sửa thẳng position_title (không qua RPC) → bị chặn", false);
await db.exec(`savepoint s2; set role anon;`);
let anonBlocked = false; try { await q(`select * from public.submit_unit_registration('a','MTTQ',null,null)`); } catch { anonBlocked = true; await db.exec("rollback to savepoint s2"); }
await db.exec(`reset role; release savepoint s2`);
push(anonBlocked, "Vai trò anon không có quyền EXECUTE RPC");

// Danh sách tài khoản
await as(U(1), `select * from public.admin_list_user_accounts()`, "Admin xem danh sách: có position_title + auth_providers", true, r => { const g = r.find(x => x.id === U(12)); const m = r.find(x => x.id === U(4)); return g.position_title === "Phó phòng" && JSON.stringify(g.auth_providers) === '["google"]' && JSON.stringify(m.auth_providers) === '["email","google"]'; });
await as(U(2), `select count(*)::int n from public.admin_list_user_accounts()`, "UBKT xem danh sách tài khoản", true, r => r[0].n >= 7);
await as(U(3), `select count(*) from public.admin_list_user_accounts()`, "VPĐU xem danh sách tài khoản → bị chặn", false);
await as(U(4), `select count(*) from public.admin_list_user_accounts()`, "Đơn vị xem danh sách tài khoản → bị chặn", false);
await as(U(12), `select count(*)::int n from public.user_profiles`, "RLS: người chờ duyệt chỉ thấy hồ sơ của mình", true, r => r[0].n === 1);
const secDef = (await q(`select p.proname, p.prosecdef, p.proconfig from pg_proc p where p.proname in ('submit_unit_registration','admin_list_user_accounts','handle_new_user_profile') order by 1`)).rows;
push(secDef.every(r => r.prosecdef && JSON.stringify(r.proconfig).includes("search_path=")), "Hàm mới SECURITY DEFINER và cố định search_path", JSON.stringify(secDef.map(r => r.proname + ":" + r.proconfig)));
await db.exec("COMMIT");

// Rollback
const before = (await q(`select pg_get_functiondef('public.handle_new_user_profile'::regproc) d`)).rows[0].d;
await db.exec("BEGIN"); await db.exec(rb); await db.exec(rb); await db.exec("COMMIT");
const cols = (await q(`select column_name from information_schema.columns where table_name='user_profiles' and column_name='position_title'`)).rows.length;
const rpc = (await q(`select count(*)::int n from pg_proc where proname='submit_unit_registration'`)).rows[0].n;
const listCols = (await q(`select pg_get_function_result('public.admin_list_user_accounts'::regproc) r`)).rows[0].r;
push(cols === 0 && rpc === 0 && !listCols.includes("position_title"), "Rollback (chạy 2 lần) gỡ cột, RPC; danh sách tài khoản về 16 cột", listCols.slice(-60));
const after = (await q(`select pg_get_functiondef('public.handle_new_user_profile'::regproc) d`)).rows[0].d;
push(before !== after && !after.includes("position_title"), "Rollback trả trigger về định nghĩa production cũ");
push((await snapshot()) === existingBefore, "Sau rollback: tài khoản hiện có vẫn nguyên vẹn");
await db.exec(`select set_config('test.uid','${U(1)}',false); set role authenticated;`);
const n = (await q(`select count(*)::int n from public.admin_list_user_accounts()`)).rows[0].n;
await db.exec(`reset role`);
push(n >= 7, "Sau rollback: Admin vẫn gọi được danh sách tài khoản");

for (const r of results) console.log(r.pass, r.label, r.msg ? "— " + r.msg : "");
const fail = results.filter(r => r.pass !== "✔").length;
console.log(`\n${results.length - fail}/${results.length} đạt`);
process.exit(fail ? 1 : 0);

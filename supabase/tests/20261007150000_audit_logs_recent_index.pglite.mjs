// Kiểm thử migration 20261007150000 trên PGlite (Postgres cục bộ) — KHÔNG kết nối Supabase thật.
// Chạy: npm i @electric-sql/pglite@0.2 && node supabase/tests/20261007150000_audit_logs_recent_index.pglite.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const R = new URL("../", import.meta.url).pathname;
const mig = fs.readFileSync(R + "migrations/20261007150000_audit_logs_recent_index.sql", "utf8");
const rb = fs.readFileSync(R + "rollbacks/20261007150000_audit_logs_recent_index.rollback.sql", "utf8");
const db = new PGlite();
const results = [];
const push = (ok, label, msg = "") => results.push({ pass: ok ? "✔" : "✘", label, msg: String(msg).slice(0, 140) });
await db.exec(`
create table public.ubkt_audit_logs(id text primary key, data jsonb not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
insert into public.ubkt_audit_logs(id,data,updated_at)
select 'A'||g, jsonb_build_object('action','Chỉnh sửa','doc','Thông báo số '||g,'details',repeat('x',1500)), timestamptz '2026-01-01' + (g||' minutes')::interval
from generate_series(1,31000) g;
analyze public.ubkt_audit_logs;`);
const Q = "select id,data,updated_at from public.ubkt_audit_logs order by updated_at desc limit 250";
const plan = async () => (await db.query("explain " + Q)).rows.map(r => r["QUERY PLAN"]).join(" | ");
const time = async () => { const t = performance.now(); for (let i = 0; i < 5; i++) await db.query(Q); return (performance.now() - t) / 5; };
const top = async () => (await db.query(Q)).rows.map(r => r.id).join(",");
const p0 = await plan(), t0 = await time(), r0 = await top();
const before = (await db.query("select count(*)::int n, md5(string_agg(id||data::text||updated_at::text, ',' order by id)) h from public.ubkt_audit_logs")).rows[0];
push(/Seq Scan/.test(p0), "Trước migration: quét toàn bảng (Seq Scan)", p0);
await db.exec(mig); await db.exec(mig);
push(true, "Migration chạy 2 lần không lỗi");
const p1 = await plan(), t1 = await time(), r1 = await top();
push(/Index Scan using ubkt_audit_logs_updated_at_idx/.test(p1) && !/Seq Scan/.test(p1), "Sau migration: dùng index, không quét toàn bảng", p1);
push(r0 === r1, "Kết quả 250 dòng mới nhất y hệt trước migration");
push(t1 < t0, `Thời gian truy vấn: ${t0.toFixed(1)} ms → ${t1.toFixed(1)} ms`);
const after = (await db.query("select count(*)::int n, md5(string_agg(id||data::text||updated_at::text, ',' order by id)) h from public.ubkt_audit_logs")).rows[0];
push(before.n === after.n && before.h === after.h, "Dữ liệu không thay đổi");
await db.exec(rb); await db.exec(rb);
const idx = (await db.query("select count(*)::int n from pg_indexes where indexname='ubkt_audit_logs_updated_at_idx'")).rows[0].n;
push(idx === 0 && /Seq Scan/.test(await plan()), "Rollback (chạy 2 lần) xóa index, truy vấn trở lại như cũ");
for (const r of results) console.log(r.pass, r.label, r.msg ? "— " + r.msg : "");
const fail = results.filter(r => r.pass !== "✔").length;
console.log(`\n${results.length - fail}/${results.length} đạt`);
process.exit(fail ? 1 : 0);

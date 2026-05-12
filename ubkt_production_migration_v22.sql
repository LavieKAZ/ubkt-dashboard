
update public.ubkt_tasks
set data = jsonb_set(data, '{unit}', to_jsonb('Ban Xây dựng Đảng'::text), true), updated_at = now()
where coalesce(data->>'unit','') in ('Ban XDĐ','Ban XD Đảng','Ban X D Đảng','Ban XD \nĐảng');

update public.ubkt_tasks
set data = jsonb_set(data, '{unit}', to_jsonb('Đảng uỷ - BCH Công an phường'::text), true), updated_at = now()
where coalesce(data->>'unit','') in ('Đảng ủy - BCH Công an Phường','Đảng ủy - BCH \nCông an Phường','Đảng uỷ - BCH Công an phường');

update public.ubkt_tasks
set data = jsonb_set(data, '{coUnit}', to_jsonb('Ban Xây dựng Đảng'::text), true), updated_at = now()
where coalesce(data->>'coUnit','') in ('Ban XDĐ','Ban XD Đảng','Ban X D Đảng','Ban XD \nĐảng');

update public.ubkt_tasks
set data = jsonb_set(data, '{coUnit}', to_jsonb('Đảng uỷ - BCH Công an phường'::text), true), updated_at = now()
where coalesce(data->>'coUnit','') in ('Đảng ủy - BCH Công an Phường','Đảng ủy - BCH \nCông an Phường','Đảng uỷ - BCH Công an phường');

create table if not exists public.ubkt_base_orgs (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ubkt_base_reports (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ubkt_dossiers (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_ubkt_base_orgs_updated_at on public.ubkt_base_orgs;
create trigger set_ubkt_base_orgs_updated_at before update on public.ubkt_base_orgs for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_base_reports_updated_at on public.ubkt_base_reports;
create trigger set_ubkt_base_reports_updated_at before update on public.ubkt_base_reports for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_dossiers_updated_at on public.ubkt_dossiers;
create trigger set_ubkt_dossiers_updated_at before update on public.ubkt_dossiers for each row execute function public.set_updated_at();

alter table public.ubkt_base_orgs enable row level security;
alter table public.ubkt_base_reports enable row level security;
alter table public.ubkt_dossiers enable row level security;

drop policy if exists "ubkt_base_orgs_authenticated_select" on public.ubkt_base_orgs;
drop policy if exists "ubkt_base_orgs_authenticated_insert" on public.ubkt_base_orgs;
drop policy if exists "ubkt_base_orgs_authenticated_update" on public.ubkt_base_orgs;
drop policy if exists "ubkt_base_orgs_authenticated_delete" on public.ubkt_base_orgs;
drop policy if exists "ubkt_base_reports_authenticated_select" on public.ubkt_base_reports;
drop policy if exists "ubkt_base_reports_authenticated_insert" on public.ubkt_base_reports;
drop policy if exists "ubkt_base_reports_authenticated_update" on public.ubkt_base_reports;
drop policy if exists "ubkt_base_reports_authenticated_delete" on public.ubkt_base_reports;
drop policy if exists "ubkt_dossiers_authenticated_select" on public.ubkt_dossiers;
drop policy if exists "ubkt_dossiers_authenticated_insert" on public.ubkt_dossiers;
drop policy if exists "ubkt_dossiers_authenticated_update" on public.ubkt_dossiers;
drop policy if exists "ubkt_dossiers_authenticated_delete" on public.ubkt_dossiers;

create policy "ubkt_base_orgs_authenticated_select" on public.ubkt_base_orgs for select to authenticated using (true);
create policy "ubkt_base_orgs_authenticated_insert" on public.ubkt_base_orgs for insert to authenticated with check (true);
create policy "ubkt_base_orgs_authenticated_update" on public.ubkt_base_orgs for update to authenticated using (true) with check (true);
create policy "ubkt_base_orgs_authenticated_delete" on public.ubkt_base_orgs for delete to authenticated using (true);

create policy "ubkt_base_reports_authenticated_select" on public.ubkt_base_reports for select to authenticated using (true);
create policy "ubkt_base_reports_authenticated_insert" on public.ubkt_base_reports for insert to authenticated with check (true);
create policy "ubkt_base_reports_authenticated_update" on public.ubkt_base_reports for update to authenticated using (true) with check (true);
create policy "ubkt_base_reports_authenticated_delete" on public.ubkt_base_reports for delete to authenticated using (true);

create policy "ubkt_dossiers_authenticated_select" on public.ubkt_dossiers for select to authenticated using (true);
create policy "ubkt_dossiers_authenticated_insert" on public.ubkt_dossiers for insert to authenticated with check (true);
create policy "ubkt_dossiers_authenticated_update" on public.ubkt_dossiers for update to authenticated using (true) with check (true);
create policy "ubkt_dossiers_authenticated_delete" on public.ubkt_dossiers for delete to authenticated using (true);

grant select, insert, update, delete on public.ubkt_base_orgs to authenticated;
grant select, insert, update, delete on public.ubkt_base_reports to authenticated;
grant select, insert, update, delete on public.ubkt_dossiers to authenticated;

insert into public.ubkt_base_orgs (id, data) values
("CS-01", {"id": "CS-01", "order": 1, "name": "Đảng bộ các Cơ quan Đảng", "members": 54, "type": "Đảng bộ"}::jsonb),
("CS-02", {"id": "CS-02", "order": 2, "name": "Đảng bộ UBND", "members": 66, "type": "Đảng bộ"}::jsonb),
("CS-03", {"id": "CS-03", "order": 3, "name": "Đảng bộ Công an", "members": 78, "type": "Đảng bộ"}::jsonb),
("CS-04", {"id": "CS-04", "order": 4, "name": "Đảng bộ Bệnh viện Đa  khoa Nguyễn Thị Thập", "members": 80, "type": "Đảng bộ"}::jsonb),
("CS-05", {"id": "CS-05", "order": 5, "name": "Đảng bộ Công ty TNHH MTV Dịch vụ công ích", "members": 66, "type": "Đảng bộ"}::jsonb),
("CS-06", {"id": "CS-06", "order": 6, "name": "Đảng bộ Trường THPT Ngô Quyền", "members": 42, "type": "Đảng bộ"}::jsonb),
("CS-07", {"id": "CS-07", "order": 7, "name": "Đảng bộ Công ty CP Sữa Việt Nam", "members": 471, "type": "Đảng bộ"}::jsonb),
("CS-08", {"id": "CS-08", "order": 8, "name": "Chi bộ Quân sự phường", "members": 24, "type": "Chi bộ"}::jsonb),
("CS-09", {"id": "CS-09", "order": 9, "name": "Chi bộ Ban Bồi thường Giải phóng Mặt bằng", "members": 15, "type": "Chi bộ"}::jsonb),
("CS-10", {"id": "CS-10", "order": 10, "name": "Chi bộ Ban Quản lý Dự án Đầu tư Xây dựng", "members": 20, "type": "Chi bộ"}::jsonb),
("CS-11", {"id": "CS-11", "order": 11, "name": "Chi bộ Trạm Y tế", "members": 22, "type": "Chi bộ"}::jsonb),
("CS-12", {"id": "CS-12", "order": 12, "name": "Chi bộ Trung tâm Cung ứng Dịch vụ công", "members": 17, "type": "Chi bộ"}::jsonb),
("CS-13", {"id": "CS-13", "order": 13, "name": "Chi bộ Trường Mầm non Tân Phú", "members": 24, "type": "Chi bộ"}::jsonb),
("CS-14", {"id": "CS-14", "order": 14, "name": "Chi bộ Trường Mầm non Phú Mỹ", "members": 30, "type": "Chi bộ"}::jsonb),
("CS-15", {"id": "CS-15", "order": 15, "name": "Chi bộ Trường Tiểu học Đinh Bộ Lĩnh", "members": 29, "type": "Chi bộ"}::jsonb),
("CS-16", {"id": "CS-16", "order": 16, "name": "Chi bộ Trường Tiểu học Lê Văn Tám", "members": 32, "type": "Chi bộ"}::jsonb),
("CS-17", {"id": "CS-17", "order": 17, "name": "Chi bộ Trường Tiểu học Phú Mỹ", "members": 29, "type": "Chi bộ"}::jsonb),
("CS-18", {"id": "CS-18", "order": 18, "name": "Chi bộ Trường Tiểu học Phạm Hữu Lầu", "members": 31, "type": "Chi bộ"}::jsonb),
("CS-19", {"id": "CS-19", "order": 19, "name": "Chi bộ Trường THCS Phạm Hữu Lầu", "members": 31, "type": "Chi bộ"}::jsonb),
("CS-20", {"id": "CS-20", "order": 20, "name": "Chi bộ Trường THCS Hoàng Quốc Việt", "members": 41, "type": "Chi bộ"}::jsonb),
("CS-21", {"id": "CS-21", "order": 21, "name": "Chi bộ Công ty CP Trường TH, THCS và THPT Quốc tế Canada", "members": 9, "type": "Chi bộ"}::jsonb),
("CS-22", {"id": "CS-22", "order": 22, "name": "Chi bộ Trung tâm Âm nhạc Nam Sài Gòn", "members": 3, "type": "Chi bộ"}::jsonb),
("CS-23", {"id": "CS-23", "order": 23, "name": "Chi bộ Công ty TNHH TM – SX Tiến Hùng", "members": 5, "type": "Chi bộ"}::jsonb),
("CS-24", {"id": "CS-24", "order": 24, "name": "Chi bộ Công ty CP Victory Capital", "members": 2, "type": "Chi bộ"}::jsonb),
("CS-25", {"id": "CS-25", "order": 25, "name": "Chi bộ Công ty CP Đức Khải", "members": 5, "type": "Chi bộ"}::jsonb),
("CS-26", {"id": "CS-26", "order": 26, "name": "Chi bộ Công ty CP Sohafarm", "members": 5, "type": "Chi bộ"}::jsonb),
("CS-27", {"id": "CS-27", "order": 27, "name": "Chi bộ khu phố 1", "members": 20, "type": "Chi bộ"}::jsonb),
("CS-28", {"id": "CS-28", "order": 28, "name": "Chi bộ khu phố 2", "members": 17, "type": "Chi bộ"}::jsonb),
("CS-29", {"id": "CS-29", "order": 29, "name": "Chi bộ khu phố 3", "members": 16, "type": "Chi bộ"}::jsonb),
("CS-30", {"id": "CS-30", "order": 30, "name": "Chi bộ khu phố 4", "members": 58, "type": "Chi bộ"}::jsonb),
("CS-31", {"id": "CS-31", "order": 31, "name": "Chi bộ khu phố 5", "members": 18, "type": "Chi bộ"}::jsonb),
("CS-32", {"id": "CS-32", "order": 32, "name": "Chi bộ khu phố 6", "members": 17, "type": "Chi bộ"}::jsonb),
("CS-33", {"id": "CS-33", "order": 33, "name": "Chi bộ khu phố 7", "members": 10, "type": "Chi bộ"}::jsonb),
("CS-34", {"id": "CS-34", "order": 34, "name": "Chi bộ khu phố 8", "members": 6, "type": "Chi bộ"}::jsonb),
("CS-35", {"id": "CS-35", "order": 35, "name": "Chi bộ khu phố 9", "members": 5, "type": "Chi bộ"}::jsonb),
("CS-36", {"id": "CS-36", "order": 36, "name": "Chi bộ khu phố 10", "members": 23, "type": "Chi bộ"}::jsonb),
("CS-37", {"id": "CS-37", "order": 37, "name": "Chi bộ khu phố 11", "members": 22, "type": "Chi bộ"}::jsonb),
("CS-38", {"id": "CS-38", "order": 38, "name": "Chi bộ khu phố 12", "members": 16, "type": "Chi bộ"}::jsonb),
("CS-39", {"id": "CS-39", "order": 39, "name": "Chi bộ khu phố 13", "members": 30, "type": "Chi bộ"}::jsonb),
("CS-40", {"id": "CS-40", "order": 40, "name": "Chi bộ khu phố 14", "members": 19, "type": "Chi bộ"}::jsonb),
("CS-41", {"id": "CS-41", "order": 41, "name": "Chi bộ khu phố 15", "members": 16, "type": "Chi bộ"}::jsonb),
("CS-42", {"id": "CS-42", "order": 42, "name": "Chi bộ khu phố 16", "members": 15, "type": "Chi bộ"}::jsonb),
("CS-43", {"id": "CS-43", "order": 43, "name": "Chi bộ khu phố 17", "members": 12, "type": "Chi bộ"}::jsonb),
("CS-44", {"id": "CS-44", "order": 44, "name": "Chi bộ khu phố 18", "members": 16, "type": "Chi bộ"}::jsonb),
("CS-45", {"id": "CS-45", "order": 45, "name": "Chi bộ khu phố 19", "members": 26, "type": "Chi bộ"}::jsonb),
("CS-46", {"id": "CS-46", "order": 46, "name": "Chi bộ khu phố 20", "members": 34, "type": "Chi bộ"}::jsonb),
("CS-47", {"id": "CS-47", "order": 47, "name": "Chi bộ khu phố 21", "members": 3, "type": "Chi bộ"}::jsonb),
("CS-48", {"id": "CS-48", "order": 48, "name": "Chi bộ khu phố 22", "members": 3, "type": "Chi bộ"}::jsonb),
("CS-49", {"id": "CS-49", "order": 49, "name": "Chi bộ khu phố 23", "members": 5, "type": "Chi bộ"}::jsonb),
("CS-50", {"id": "CS-50", "order": 50, "name": "Chi bộ khu phố 24", "members": 31, "type": "Chi bộ"}::jsonb),
("CS-51", {"id": "CS-51", "order": 51, "name": "Chi bộ khu phố 25", "members": 38, "type": "Chi bộ"}::jsonb),
("CS-52", {"id": "CS-52", "order": 52, "name": "Chi bộ khu phố 26", "members": 13, "type": "Chi bộ"}::jsonb),
("CS-53", {"id": "CS-53", "order": 53, "name": "Chi bộ khu phố 27", "members": 29, "type": "Chi bộ"}::jsonb),
("CS-54", {"id": "CS-54", "order": 54, "name": "Chi bộ khu phố 28", "members": 43, "type": "Chi bộ"}::jsonb),
("CS-55", {"id": "CS-55", "order": 55, "name": "Chi bộ khu phố 29", "members": 21, "type": "Chi bộ"}::jsonb),
("CS-56", {"id": "CS-56", "order": 56, "name": "Chi bộ khu phố 30", "members": 39, "type": "Chi bộ"}::jsonb),
("CS-57", {"id": "CS-57", "order": 57, "name": "Chi bộ khu phố 31", "members": 23, "type": "Chi bộ"}::jsonb),
("CS-58", {"id": "CS-58", "order": 58, "name": "Chi bộ khu phố 32", "members": 40, "type": "Chi bộ"}::jsonb),
("CS-59", {"id": "CS-59", "order": 59, "name": "Chi bộ khu phố 33", "members": 59, "type": "Chi bộ"}::jsonb),
("CS-60", {"id": "CS-60", "order": 60, "name": "Chi bộ khu phố 34", "members": 25, "type": "Chi bộ"}::jsonb),
("CS-61", {"id": "CS-61", "order": 61, "name": "Chi bộ khu phố 35", "members": 2, "type": "Chi bộ"}::jsonb),
("CS-62", {"id": "CS-62", "order": 62, "name": "Chi bộ khu phố 36", "members": 15, "type": "Chi bộ"}::jsonb),
("CS-63", {"id": "CS-63", "order": 63, "name": "Chi bộ khu phố 37", "members": 21, "type": "Chi bộ"}::jsonb),
("CS-64", {"id": "CS-64", "order": 64, "name": "Chi bộ khu phố 38", "members": 23, "type": "Chi bộ"}::jsonb),
("CS-65", {"id": "CS-65", "order": 65, "name": "Chi bộ khu phố 39", "members": 25, "type": "Chi bộ"}::jsonb),
("CS-66", {"id": "CS-66", "order": 66, "name": "Chi bộ khu phố 40", "members": 47, "type": "Chi bộ"}::jsonb),
("CS-67", {"id": "CS-67", "order": 67, "name": "Chi bộ khu phố 41", "members": 23, "type": "Chi bộ"}::jsonb),
("CS-68", {"id": "CS-68", "order": 68, "name": "Chi bộ khu phố 42", "members": 9, "type": "Chi bộ"}::jsonb),
("CS-69", {"id": "CS-69", "order": 69, "name": "Chi bộ khu phố 43", "members": 40, "type": "Chi bộ"}::jsonb)
on conflict (id) do update set data = excluded.data, updated_at = now();

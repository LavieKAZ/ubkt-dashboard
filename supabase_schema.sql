-- UBKT Dashboard Supabase schema
-- Chạy toàn bộ file này trong Supabase SQL Editor.
-- Bản an toàn khuyến nghị: chỉ user đã đăng nhập Supabase Auth mới được đọc/ghi.
-- KHÔNG dùng service_role key trong trình duyệt.

create table if not exists public.ubkt_tasks (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ubkt_periods (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ubkt_opinions (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ubkt_conclusions (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ubkt_audit_logs (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.ubkt_programs (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ubkt_indicators (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ubkt_indicator_updates (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ubkt_ktgs_reports (
  id text primary key,
  org_id text,
  org_name text,
  period_id text,
  period_text text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ubkt_ktgs_report_periods (
  id text primary key,
  title text,
  period_text text,
  period_type text,
  status text not null default 'Dang mo',
  opened_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ubkt_ptdl_monthly (
  id text primary key,
  org_id text,
  org_name text,
  period_id text,
  period_text text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ban_do_state (
  key text primary key,
  state_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ubkt_tasks_updated_at on public.ubkt_tasks;
create trigger set_ubkt_tasks_updated_at
before update on public.ubkt_tasks
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_periods_updated_at on public.ubkt_periods;
create trigger set_ubkt_periods_updated_at
before update on public.ubkt_periods
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_opinions_updated_at on public.ubkt_opinions;
create trigger set_ubkt_opinions_updated_at
before update on public.ubkt_opinions
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_conclusions_updated_at on public.ubkt_conclusions;
create trigger set_ubkt_conclusions_updated_at
before update on public.ubkt_conclusions
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_audit_logs_updated_at on public.ubkt_audit_logs;
create trigger set_ubkt_audit_logs_updated_at
before update on public.ubkt_audit_logs
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_base_orgs_updated_at on public.ubkt_base_orgs;
create trigger set_ubkt_base_orgs_updated_at
before update on public.ubkt_base_orgs
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_base_reports_updated_at on public.ubkt_base_reports;
create trigger set_ubkt_base_reports_updated_at
before update on public.ubkt_base_reports
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_dossiers_updated_at on public.ubkt_dossiers;
create trigger set_ubkt_dossiers_updated_at
before update on public.ubkt_dossiers
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_programs_updated_at on public.ubkt_programs;
create trigger set_ubkt_programs_updated_at
before update on public.ubkt_programs
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_indicators_updated_at on public.ubkt_indicators;
create trigger set_ubkt_indicators_updated_at
before update on public.ubkt_indicators
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_indicator_updates_updated_at on public.ubkt_indicator_updates;
create trigger set_ubkt_indicator_updates_updated_at
before update on public.ubkt_indicator_updates
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_ktgs_reports_updated_at on public.ubkt_ktgs_reports;
create trigger set_ubkt_ktgs_reports_updated_at
before update on public.ubkt_ktgs_reports
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_ktgs_report_periods_updated_at on public.ubkt_ktgs_report_periods;
create trigger set_ubkt_ktgs_report_periods_updated_at
before update on public.ubkt_ktgs_report_periods
for each row execute function public.set_updated_at();

drop trigger if exists set_ubkt_ptdl_monthly_updated_at on public.ubkt_ptdl_monthly;
create trigger set_ubkt_ptdl_monthly_updated_at
before update on public.ubkt_ptdl_monthly
for each row execute function public.set_updated_at();

drop trigger if exists set_ban_do_state_updated_at on public.ban_do_state;
create trigger set_ban_do_state_updated_at
before update on public.ban_do_state
for each row execute function public.set_updated_at();

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

alter table public.ubkt_tasks enable row level security;
alter table public.ubkt_periods enable row level security;
alter table public.ubkt_opinions enable row level security;
alter table public.ubkt_conclusions enable row level security;
alter table public.ubkt_audit_logs enable row level security;
alter table public.ubkt_base_orgs enable row level security;
alter table public.ubkt_base_reports enable row level security;
alter table public.ubkt_dossiers enable row level security;
alter table public.ubkt_programs enable row level security;
alter table public.ubkt_indicators enable row level security;
alter table public.ubkt_indicator_updates enable row level security;
alter table public.ubkt_ktgs_reports enable row level security;
alter table public.ubkt_ktgs_report_periods enable row level security;
alter table public.ubkt_ptdl_monthly enable row level security;
alter table public.ban_do_state enable row level security;
alter table public.user_profiles enable row level security;

-- Xóa policy cũ nếu chạy lại nhiều lần
drop policy if exists "ubkt_tasks_authenticated_select" on public.ubkt_tasks;
drop policy if exists "ubkt_tasks_authenticated_insert" on public.ubkt_tasks;
drop policy if exists "ubkt_tasks_authenticated_update" on public.ubkt_tasks;
drop policy if exists "ubkt_tasks_authenticated_delete" on public.ubkt_tasks;

drop policy if exists "ubkt_periods_authenticated_select" on public.ubkt_periods;
drop policy if exists "ubkt_periods_authenticated_insert" on public.ubkt_periods;
drop policy if exists "ubkt_periods_authenticated_update" on public.ubkt_periods;
drop policy if exists "ubkt_periods_authenticated_delete" on public.ubkt_periods;

drop policy if exists "ubkt_opinions_authenticated_select" on public.ubkt_opinions;
drop policy if exists "ubkt_opinions_authenticated_insert" on public.ubkt_opinions;
drop policy if exists "ubkt_opinions_authenticated_update" on public.ubkt_opinions;
drop policy if exists "ubkt_opinions_authenticated_delete" on public.ubkt_opinions;

drop policy if exists "ubkt_conclusions_authenticated_select" on public.ubkt_conclusions;
drop policy if exists "ubkt_conclusions_authenticated_insert" on public.ubkt_conclusions;
drop policy if exists "ubkt_conclusions_authenticated_update" on public.ubkt_conclusions;
drop policy if exists "ubkt_conclusions_authenticated_delete" on public.ubkt_conclusions;

drop policy if exists "ubkt_audit_logs_authenticated_select" on public.ubkt_audit_logs;
drop policy if exists "ubkt_audit_logs_authenticated_insert" on public.ubkt_audit_logs;
drop policy if exists "ubkt_audit_logs_authenticated_update" on public.ubkt_audit_logs;
drop policy if exists "ubkt_audit_logs_authenticated_delete" on public.ubkt_audit_logs;

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

drop policy if exists "ubkt_programs_authenticated_select" on public.ubkt_programs;
drop policy if exists "ubkt_programs_authenticated_insert" on public.ubkt_programs;
drop policy if exists "ubkt_programs_authenticated_update" on public.ubkt_programs;
drop policy if exists "ubkt_programs_authenticated_delete" on public.ubkt_programs;

drop policy if exists "ubkt_indicators_authenticated_select" on public.ubkt_indicators;
drop policy if exists "ubkt_indicators_authenticated_insert" on public.ubkt_indicators;
drop policy if exists "ubkt_indicators_authenticated_update" on public.ubkt_indicators;
drop policy if exists "ubkt_indicators_authenticated_delete" on public.ubkt_indicators;

drop policy if exists "ubkt_indicator_updates_authenticated_select" on public.ubkt_indicator_updates;
drop policy if exists "ubkt_indicator_updates_authenticated_insert" on public.ubkt_indicator_updates;
drop policy if exists "ubkt_indicator_updates_authenticated_update" on public.ubkt_indicator_updates;
drop policy if exists "ubkt_indicator_updates_authenticated_delete" on public.ubkt_indicator_updates;

drop policy if exists "ubkt_ktgs_reports_authenticated_select" on public.ubkt_ktgs_reports;
drop policy if exists "ubkt_ktgs_reports_authenticated_insert" on public.ubkt_ktgs_reports;
drop policy if exists "ubkt_ktgs_reports_authenticated_update" on public.ubkt_ktgs_reports;
drop policy if exists "ubkt_ktgs_reports_authenticated_delete" on public.ubkt_ktgs_reports;

drop policy if exists "ubkt_ktgs_report_periods_authenticated_select" on public.ubkt_ktgs_report_periods;
drop policy if exists "ubkt_ktgs_report_periods_authenticated_insert" on public.ubkt_ktgs_report_periods;
drop policy if exists "ubkt_ktgs_report_periods_authenticated_update" on public.ubkt_ktgs_report_periods;
drop policy if exists "ubkt_ktgs_report_periods_authenticated_delete" on public.ubkt_ktgs_report_periods;

drop policy if exists "ubkt_ptdl_monthly_authenticated_select" on public.ubkt_ptdl_monthly;
drop policy if exists "ubkt_ptdl_monthly_authenticated_insert" on public.ubkt_ptdl_monthly;
drop policy if exists "ubkt_ptdl_monthly_authenticated_update" on public.ubkt_ptdl_monthly;
drop policy if exists "ubkt_ptdl_monthly_authenticated_delete" on public.ubkt_ptdl_monthly;

drop policy if exists "ban_do_state_authenticated_select" on public.ban_do_state;
drop policy if exists "ban_do_state_authenticated_insert" on public.ban_do_state;
drop policy if exists "ban_do_state_authenticated_update" on public.ban_do_state;
drop policy if exists "ban_do_state_authenticated_delete" on public.ban_do_state;

drop policy if exists "user_profiles_self_select" on public.user_profiles;
drop policy if exists "user_profiles_self_insert" on public.user_profiles;
drop policy if exists "user_profiles_self_update" on public.user_profiles;

-- Policies: mọi tài khoản Supabase Auth đã đăng nhập đều được dùng hệ thống.
-- Khi cần phân quyền sâu hơn, bổ sung bảng roles/profiles sau.
create policy "ubkt_tasks_authenticated_select" on public.ubkt_tasks for select to authenticated using (true);
create policy "ubkt_tasks_authenticated_insert" on public.ubkt_tasks for insert to authenticated with check (true);
create policy "ubkt_tasks_authenticated_update" on public.ubkt_tasks for update to authenticated using (true) with check (true);
create policy "ubkt_tasks_authenticated_delete" on public.ubkt_tasks for delete to authenticated using (true);

create policy "ubkt_periods_authenticated_select" on public.ubkt_periods for select to authenticated using (true);
create policy "ubkt_periods_authenticated_insert" on public.ubkt_periods for insert to authenticated with check (true);
create policy "ubkt_periods_authenticated_update" on public.ubkt_periods for update to authenticated using (true) with check (true);
create policy "ubkt_periods_authenticated_delete" on public.ubkt_periods for delete to authenticated using (true);

create policy "ubkt_opinions_authenticated_select" on public.ubkt_opinions for select to authenticated using (true);
create policy "ubkt_opinions_authenticated_insert" on public.ubkt_opinions for insert to authenticated with check (true);
create policy "ubkt_opinions_authenticated_update" on public.ubkt_opinions for update to authenticated using (true) with check (true);
create policy "ubkt_opinions_authenticated_delete" on public.ubkt_opinions for delete to authenticated using (true);

create policy "ubkt_conclusions_authenticated_select" on public.ubkt_conclusions for select to authenticated using (true);
create policy "ubkt_conclusions_authenticated_insert" on public.ubkt_conclusions for insert to authenticated with check (true);
create policy "ubkt_conclusions_authenticated_update" on public.ubkt_conclusions for update to authenticated using (true) with check (true);
create policy "ubkt_conclusions_authenticated_delete" on public.ubkt_conclusions for delete to authenticated using (true);

create policy "ubkt_audit_logs_authenticated_select" on public.ubkt_audit_logs for select to authenticated using (true);
create policy "ubkt_audit_logs_authenticated_insert" on public.ubkt_audit_logs for insert to authenticated with check (true);
create policy "ubkt_audit_logs_authenticated_update" on public.ubkt_audit_logs for update to authenticated using (true) with check (true);
create policy "ubkt_audit_logs_authenticated_delete" on public.ubkt_audit_logs for delete to authenticated using (true);

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

create policy "ubkt_programs_authenticated_select" on public.ubkt_programs for select to authenticated using (true);
create policy "ubkt_programs_authenticated_insert" on public.ubkt_programs for insert to authenticated with check (true);
create policy "ubkt_programs_authenticated_update" on public.ubkt_programs for update to authenticated using (true) with check (true);
create policy "ubkt_programs_authenticated_delete" on public.ubkt_programs for delete to authenticated using (true);

create policy "ubkt_indicators_authenticated_select" on public.ubkt_indicators for select to authenticated using (true);
create policy "ubkt_indicators_authenticated_insert" on public.ubkt_indicators for insert to authenticated with check (true);
create policy "ubkt_indicators_authenticated_update" on public.ubkt_indicators for update to authenticated using (true) with check (true);
create policy "ubkt_indicators_authenticated_delete" on public.ubkt_indicators for delete to authenticated using (true);

create policy "ubkt_indicator_updates_authenticated_select" on public.ubkt_indicator_updates for select to authenticated using (true);
create policy "ubkt_indicator_updates_authenticated_insert" on public.ubkt_indicator_updates for insert to authenticated with check (true);
create policy "ubkt_indicator_updates_authenticated_update" on public.ubkt_indicator_updates for update to authenticated using (true) with check (true);
create policy "ubkt_indicator_updates_authenticated_delete" on public.ubkt_indicator_updates for delete to authenticated using (true);

create policy "ubkt_ktgs_reports_authenticated_select" on public.ubkt_ktgs_reports for select to authenticated using (true);
create policy "ubkt_ktgs_reports_authenticated_insert" on public.ubkt_ktgs_reports for insert to authenticated with check (true);
create policy "ubkt_ktgs_reports_authenticated_update" on public.ubkt_ktgs_reports for update to authenticated using (true) with check (true);
create policy "ubkt_ktgs_reports_authenticated_delete" on public.ubkt_ktgs_reports for delete to authenticated using (true);

create policy "ubkt_ktgs_report_periods_authenticated_select" on public.ubkt_ktgs_report_periods for select to authenticated using (true);
create policy "ubkt_ktgs_report_periods_authenticated_insert" on public.ubkt_ktgs_report_periods for insert to authenticated with check (true);
create policy "ubkt_ktgs_report_periods_authenticated_update" on public.ubkt_ktgs_report_periods for update to authenticated using (true) with check (true);
create policy "ubkt_ktgs_report_periods_authenticated_delete" on public.ubkt_ktgs_report_periods for delete to authenticated using (true);

create policy "ubkt_ptdl_monthly_authenticated_select" on public.ubkt_ptdl_monthly for select to authenticated using (true);
create policy "ubkt_ptdl_monthly_authenticated_insert" on public.ubkt_ptdl_monthly for insert to authenticated with check (true);
create policy "ubkt_ptdl_monthly_authenticated_update" on public.ubkt_ptdl_monthly for update to authenticated using (true) with check (true);
create policy "ubkt_ptdl_monthly_authenticated_delete" on public.ubkt_ptdl_monthly for delete to authenticated using (true);

create policy "ban_do_state_authenticated_select" on public.ban_do_state for select to authenticated using (true);
create policy "ban_do_state_authenticated_insert" on public.ban_do_state for insert to authenticated with check (true);
create policy "ban_do_state_authenticated_update" on public.ban_do_state for update to authenticated using (true) with check (true);
create policy "ban_do_state_authenticated_delete" on public.ban_do_state for delete to authenticated using (true);

create policy "user_profiles_self_select" on public.user_profiles for select to authenticated
using (id = (select auth.uid()));
create policy "user_profiles_self_insert" on public.user_profiles for insert to authenticated
with check (id = (select auth.uid()));
create policy "user_profiles_self_update" on public.user_profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.ubkt_tasks to authenticated;
grant select, insert, update, delete on public.ubkt_periods to authenticated;
grant select, insert, update, delete on public.ubkt_opinions to authenticated;
grant select, insert, update, delete on public.ubkt_conclusions to authenticated;
grant select, insert, update, delete on public.ubkt_audit_logs to authenticated;
grant select, insert, update, delete on public.ubkt_base_orgs to authenticated;
grant select, insert, update, delete on public.ubkt_base_reports to authenticated;
grant select, insert, update, delete on public.ubkt_dossiers to authenticated;
grant select, insert, update, delete on public.ubkt_programs to authenticated;
grant select, insert, update, delete on public.ubkt_indicators to authenticated;
grant select, insert, update, delete on public.ubkt_indicator_updates to authenticated;
grant select, insert, update, delete on public.ubkt_ktgs_reports to authenticated;
grant select, insert, update, delete on public.ubkt_ktgs_report_periods to authenticated;
grant select, insert, update, delete on public.ubkt_ptdl_monthly to authenticated;
grant select, insert, update, delete on public.ban_do_state to authenticated;
grant select, insert, update on public.user_profiles to authenticated;

-- UBKT multi-tenant accounts and task update approvals.
-- This migration preserves every existing task and business-data row.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter table public.user_profiles
  add column if not exists phone text,
  add column if not exists requested_unit text,
  add column if not exists unit_name text,
  add column if not exists approval_status text not null default 'pending',
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;
alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('admin', 'unit', 'viewer'));

alter table public.user_profiles
  drop constraint if exists user_profiles_approval_status_check;
alter table public.user_profiles
  add constraint user_profiles_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected', 'suspended'));

create table if not exists public.task_update_requests (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.ubkt_tasks(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  unit_name text not null,
  proposed_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_update_requests_task_id_idx
  on public.task_update_requests(task_id);
create index if not exists task_update_requests_requested_by_idx
  on public.task_update_requests(requested_by);
create index if not exists task_update_requests_status_created_idx
  on public.task_update_requests(status, created_at desc);

drop trigger if exists set_task_update_requests_updated_at on public.task_update_requests;
create trigger set_task_update_requests_updated_at
before update on public.task_update_requests
for each row execute function public.set_updated_at();

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.approval_status = 'approved'
      and p.is_active is true
  );
$$;

create or replace function private.is_approved_unit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid())
      and p.role = 'unit'
      and p.approval_status = 'approved'
      and p.is_active is true
      and nullif(btrim(p.unit_name), '') is not null
  );
$$;

create or replace function private.current_unit()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.unit_name
  from public.user_profiles p
  where p.id = (select auth.uid())
    and p.role = 'unit'
    and p.approval_status = 'approved'
    and p.is_active is true
  limit 1;
$$;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_approved_unit() from public, anon;
revoke all on function private.current_unit() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_approved_unit() to authenticated;
grant execute on function private.current_unit() to authenticated;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    full_name,
    phone,
    requested_unit,
    role,
    is_active,
    approval_status
  )
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'requested_unit', '')), ''),
    'unit',
    false,
    'pending'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
      phone = coalesce(public.user_profiles.phone, excluded.phone),
      requested_unit = coalesce(public.user_profiles.requested_unit, excluded.requested_unit),
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

insert into public.user_profiles (
  id,
  email,
  full_name,
  role,
  is_active,
  approval_status,
  created_at,
  updated_at
)
select
  u.id,
  u.email,
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  case when lower(u.email) = 'admin@tanmy.vn' then 'admin' else 'unit' end,
  lower(u.email) = 'admin@tanmy.vn',
  case when lower(u.email) = 'admin@tanmy.vn' then 'approved' else 'pending' end,
  u.created_at,
  now()
from auth.users u
on conflict (id) do update
set email = excluded.email,
    role = case
      when lower(excluded.email) = 'admin@tanmy.vn' then 'admin'
      when public.user_profiles.role = 'admin' then public.user_profiles.role
      else 'unit'
    end,
    is_active = case
      when lower(excluded.email) = 'admin@tanmy.vn' then true
      else coalesce(public.user_profiles.is_active, false)
    end,
    approval_status = case
      when lower(excluded.email) = 'admin@tanmy.vn' then 'approved'
      when public.user_profiles.approval_status is null then 'pending'
      else public.user_profiles.approval_status
    end,
    updated_at = now();

create or replace function public.review_user_account(
  p_user_id uuid,
  p_decision text,
  p_unit_name text default null,
  p_note text default null
)
returns public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.user_profiles;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
begin
  if not private.is_admin() then
    raise exception 'Chỉ Admin được duyệt tài khoản.';
  end if;
  if v_decision not in ('approved', 'rejected', 'suspended') then
    raise exception 'Trạng thái duyệt không hợp lệ.';
  end if;
  if v_decision = 'approved' and nullif(btrim(coalesce(p_unit_name, '')), '') is null then
    raise exception 'Cần chọn đơn vị trước khi duyệt.';
  end if;

  update public.user_profiles
  set role = case when role = 'admin' then role else 'unit' end,
      unit_name = case
        when role = 'admin' then unit_name
        when v_decision = 'approved' then btrim(p_unit_name)
        else unit_name
      end,
      approval_status = v_decision,
      is_active = (v_decision = 'approved'),
      review_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where id = p_user_id
    and id <> (select auth.uid())
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Không tìm thấy tài khoản hoặc không thể tự thay đổi tài khoản Admin.';
  end if;
  return v_profile;
end;
$$;

create or replace function public.review_task_update(
  p_request_id uuid,
  p_decision text,
  p_review_note text default null
)
returns public.task_update_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.task_update_requests;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_patch jsonb;
begin
  if not private.is_admin() then
    raise exception 'Chỉ Admin được duyệt cập nhật nhiệm vụ.';
  end if;
  if v_decision not in ('approved', 'rejected') then
    raise exception 'Quyết định duyệt không hợp lệ.';
  end if;

  select *
  into v_request
  from public.task_update_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Không tìm thấy đề nghị cập nhật.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Đề nghị này đã được xử lý.';
  end if;

  if v_decision = 'approved' then
    v_patch := jsonb_strip_nulls(jsonb_build_object(
      'status', v_request.proposed_data -> 'status',
      'progress', v_request.proposed_data -> 'progress',
      'result', v_request.proposed_data -> 'result',
      'recommendation', v_request.proposed_data -> 'recommendation',
      'kien_nghi_xu_ly', v_request.proposed_data -> 'kien_nghi_xu_ly',
      'note', v_request.proposed_data -> 'note',
      'updatedAt', v_request.proposed_data -> 'updatedAt'
    ));

    update public.ubkt_tasks
    set data = data || v_patch,
        updated_at = now()
    where id = v_request.task_id;

    if not found then
      raise exception 'Nhiệm vụ gốc không còn tồn tại.';
    end if;
  end if;

  update public.task_update_requests
  set status = v_decision,
      review_note = nullif(btrim(coalesce(p_review_note, '')), ''),
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id
  returning * into v_request;

  insert into public.ubkt_audit_logs(id, data)
  values (
    gen_random_uuid()::text,
    jsonb_build_object(
      'action', case when v_decision = 'approved'
        then 'Duyệt cập nhật nhiệm vụ'
        else 'Từ chối cập nhật nhiệm vụ'
      end,
      'taskId', v_request.task_id,
      'requestId', v_request.id,
      'unit', v_request.unit_name,
      'reviewNote', v_request.review_note,
      'createdAt', now()
    )
  );

  return v_request;
end;
$$;

revoke all on function public.review_user_account(uuid, text, text, text) from public, anon;
revoke all on function public.review_task_update(uuid, text, text) from public, anon;
grant execute on function public.review_user_account(uuid, text, text, text) to authenticated;
grant execute on function public.review_task_update(uuid, text, text) to authenticated;

alter table public.user_profiles enable row level security;
alter table public.ubkt_tasks enable row level security;
alter table public.task_update_requests enable row level security;

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'user_profiles',
        'ubkt_tasks',
        'task_update_requests',
        'ubkt_periods',
        'ubkt_opinions',
        'ubkt_conclusions',
        'ubkt_audit_logs',
        'ubkt_base_orgs',
        'ubkt_base_reports',
        'ubkt_dossiers',
        'ubkt_programs',
        'ubkt_indicators',
        'ubkt_indicator_updates',
        'ubkt_ktgs_reports',
        'ubkt_ktgs_report_periods',
        'ubkt_ptdl_monthly',
        'ban_do_state'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end
$$;

create policy user_profiles_read_own_or_admin
on public.user_profiles
for select
to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

create policy user_profiles_update_own_contact
on public.user_profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy ubkt_tasks_read_assigned_or_admin
on public.ubkt_tasks
for select
to authenticated
using (
  (select private.is_admin())
  or (
    (select private.is_approved_unit())
    and (
      lower(btrim(coalesce(data ->> 'unit', ''))) =
        lower(btrim(coalesce((select private.current_unit()), '')))
      or lower(btrim(coalesce(data ->> 'coUnit', ''))) =
        lower(btrim(coalesce((select private.current_unit()), '')))
    )
  )
);

create policy ubkt_tasks_admin_insert
on public.ubkt_tasks
for insert
to authenticated
with check ((select private.is_admin()));

create policy ubkt_tasks_admin_update
on public.ubkt_tasks
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy ubkt_tasks_admin_delete
on public.ubkt_tasks
for delete
to authenticated
using ((select private.is_admin()));

create policy task_update_requests_read_own_or_admin
on public.task_update_requests
for select
to authenticated
using (requested_by = (select auth.uid()) or (select private.is_admin()));

create policy task_update_requests_submit_assigned
on public.task_update_requests
for insert
to authenticated
with check (
  requested_by = (select auth.uid())
  and status = 'pending'
  and (select private.is_approved_unit())
  and lower(btrim(unit_name)) =
    lower(btrim(coalesce((select private.current_unit()), '')))
  and exists (
    select 1
    from public.ubkt_tasks t
    where t.id = task_id
  )
);

create policy task_update_requests_admin_update
on public.task_update_requests
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'ubkt_periods',
    'ubkt_opinions',
    'ubkt_conclusions',
    'ubkt_audit_logs',
    'ubkt_base_orgs',
    'ubkt_base_reports',
    'ubkt_dossiers',
    'ubkt_programs',
    'ubkt_indicators',
    'ubkt_indicator_updates',
    'ubkt_ktgs_reports',
    'ubkt_ktgs_report_periods',
    'ubkt_ptdl_monthly',
    'ban_do_state'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      v_table || '_admin_only',
      v_table
    );
  end loop;
end
$$;

revoke all on public.user_profiles from anon, authenticated;
revoke all on public.task_update_requests from anon, authenticated;
grant select on public.user_profiles to authenticated;
grant update(full_name, phone, requested_unit) on public.user_profiles to authenticated;
grant select, insert, update on public.task_update_requests to authenticated;

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

-- Existing reporting views must respect the caller's RLS policies.
alter view if exists public.ubkt_documents_with_counts set (security_invoker = true);
alter view if exists public.ubkt_indicators_with_units set (security_invoker = true);
alter view if exists public.ubkt_task_sync_v1 set (security_invoker = true);
alter view if exists public.ubkt_kp_report_summary set (security_invoker = true);
alter view if exists public.ubkt_ktgs_report_summary set (security_invoker = true);
alter view if exists public.ubkt_map_region_fields set (security_invoker = true);

-- Keep the dedicated UBKT account as an approved administrator.
update public.user_profiles
set role = 'admin',
    approval_status = 'approved',
    is_active = true,
    unit_name = null,
    review_note = 'Tài khoản quản trị UBKT',
    reviewed_at = now(),
    updated_at = now()
where lower(email) = 'ubkt@tanmy.hcm';

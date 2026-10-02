-- Final task-management grid, oversight RBAC and weekly reminders.
-- This migration is additive: no existing task, profile or audit row is removed.

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;
alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('admin', 'vpdu', 'ubkt', 'unit', 'viewer'));

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
      and p.role in ('admin', 'vpdu', 'ubkt')
      and p.approval_status = 'approved'
      and p.is_active is true
  );
$$;

create or replace function private.is_system_admin()
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

revoke all on function private.is_system_admin() from public, anon;
grant execute on function private.is_system_admin() to authenticated;

create table if not exists public.task_progress_logs (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.ubkt_tasks(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  author_name text not null,
  content text not null,
  self_assessment text,
  assessment_note text,
  reporting_period text not null,
  evidence_url text,
  evidence_path text,
  evidence_name text,
  created_at timestamptz not null default now(),
  constraint task_progress_logs_content_check check (length(btrim(content)) between 1 and 10000),
  constraint task_progress_logs_self_assessment_check check (
    self_assessment is null or self_assessment in (
      'Chưa tự đánh giá', 'Đang thực hiện', 'Hoàn thành', 'Chậm tiến độ', 'Cần hỗ trợ'
    )
  )
);

create index if not exists task_progress_logs_task_created_idx
  on public.task_progress_logs(task_id, created_at desc);
create index if not exists task_progress_logs_author_created_idx
  on public.task_progress_logs(author_id, created_at desc);

alter table public.task_progress_logs enable row level security;

drop policy if exists task_progress_logs_read_scope on public.task_progress_logs;
create policy task_progress_logs_read_scope
on public.task_progress_logs
for select
to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1
    from public.ubkt_tasks task
    where task.id = task_progress_logs.task_id
      and (select private.is_approved_unit())
      and (
        private.normalize_unit_name(task.data ->> 'unit') = (select private.current_unit())
        or private.normalize_unit_name(task.data ->> 'coUnit') = (select private.current_unit())
      )
  )
);

drop policy if exists task_progress_logs_append_scope on public.task_progress_logs;
create policy task_progress_logs_append_scope
on public.task_progress_logs
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and (
    (select private.is_admin())
    or exists (
      select 1
      from public.ubkt_tasks task
      where task.id = task_progress_logs.task_id
        and (select private.is_approved_unit())
        and (
          private.normalize_unit_name(task.data ->> 'unit') = (select private.current_unit())
          or private.normalize_unit_name(task.data ->> 'coUnit') = (select private.current_unit())
        )
    )
  )
);

revoke all on public.task_progress_logs from anon, authenticated;
grant select, insert on public.task_progress_logs to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-evidence',
  'task-evidence',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists task_evidence_read_scope on storage.objects;
create policy task_evidence_read_scope
on storage.objects
for select
to authenticated
using (
  bucket_id = 'task-evidence'
  and (
    (select private.is_admin())
    or exists (
      select 1
      from public.ubkt_tasks task
      where task.id = (storage.foldername(name))[1]
        and (select private.is_approved_unit())
        and (
          private.normalize_unit_name(task.data ->> 'unit') = (select private.current_unit())
          or private.normalize_unit_name(task.data ->> 'coUnit') = (select private.current_unit())
        )
    )
  )
);

drop policy if exists task_evidence_insert_scope on storage.objects;
create policy task_evidence_insert_scope
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'task-evidence'
  and owner_id = (select auth.uid()::text)
  and (
    (select private.is_admin())
    or exists (
      select 1
      from public.ubkt_tasks task
      where task.id = (storage.foldername(name))[1]
        and (select private.is_approved_unit())
        and (
          private.normalize_unit_name(task.data ->> 'unit') = (select private.current_unit())
          or private.normalize_unit_name(task.data ->> 'coUnit') = (select private.current_unit())
        )
    )
  )
);

-- Existing statuses are copied once into the new final-appraisal field.
-- The legacy status remains untouched for compatibility and audit history.
update public.ubkt_tasks
set data = jsonb_set(
      data,
      '{vpduAssessment}',
      to_jsonb(
        case lower(btrim(coalesce(data ->> 'status', '')))
          when 'hoàn thành' then 'Hoàn thành'
          when 'đã hoàn thành' then 'Hoàn thành'
          when 'quá hạn' then 'Trễ hạn'
          when 'đang thực hiện' then 'Đang xử lý'
          when 'chưa thực hiện' then 'Đang xử lý'
          else 'Chưa thẩm định'
        end
      ),
      true
    ),
    updated_at = now()
where nullif(btrim(coalesce(data ->> 'vpduAssessment', '')), '') is null;

create table if not exists public.system_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'system',
  title text not null,
  body text not null,
  action_page text,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, dedupe_key)
);

create index if not exists system_notifications_recipient_created_idx
  on public.system_notifications(recipient_id, created_at desc);

alter table public.system_notifications enable row level security;
drop policy if exists system_notifications_read_own on public.system_notifications;
create policy system_notifications_read_own
on public.system_notifications
for select
to authenticated
using (recipient_id = (select auth.uid()));
drop policy if exists system_notifications_update_own on public.system_notifications;
create policy system_notifications_update_own
on public.system_notifications
for update
to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

revoke all on public.system_notifications from anon, authenticated;
grant select, update(read_at) on public.system_notifications to authenticated;

create or replace function public.enqueue_weekly_appraisal_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  week_key text := to_char(timezone('Asia/Ho_Chi_Minh', now()), 'IYYY-IW');
begin
  insert into public.system_notifications (
    recipient_id, category, title, body, action_page, dedupe_key
  )
  select
    profile.id,
    'weekly-appraisal',
    'Nhắc thẩm định tiến độ hằng tuần',
    'Vui lòng kiểm tra báo cáo kết quả của các đơn vị và chốt Đánh giá của VPĐU để số liệu Dashboard được cập nhật.',
    'tasks',
    'weekly-appraisal-' || week_key
  from public.user_profiles profile
  where profile.role in ('admin', 'vpdu', 'ubkt')
    and profile.approval_status = 'approved'
    and profile.is_active is true
  on conflict (recipient_id, dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

select public.enqueue_weekly_appraisal_reminders();

revoke all on function public.enqueue_weekly_appraisal_reminders() from public, anon, authenticated;

create or replace function public.set_user_account_access(
  p_user_id uuid,
  p_role text,
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
  v_previous public.user_profiles;
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_unit text := private.normalize_unit_name(p_unit_name);
begin
  if not private.is_system_admin() then
    raise exception 'Chỉ Admin được thay đổi quyền tài khoản.';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'Không thể tự thay đổi vai trò hoặc trạng thái tài khoản đang đăng nhập.';
  end if;
  if v_role not in ('admin', 'vpdu', 'ubkt', 'unit') then
    raise exception 'Vai trò không hợp lệ.';
  end if;
  if v_decision not in ('approved', 'rejected', 'suspended') then
    raise exception 'Trạng thái truy cập không hợp lệ.';
  end if;
  if v_role = 'unit' and v_decision = 'approved' and v_unit is null then
    raise exception 'Tài khoản đơn vị đang hoạt động phải được gán đơn vị hợp lệ.';
  end if;

  select * into v_previous
  from public.user_profiles
  where id = p_user_id
  for update;
  if v_previous.id is null then raise exception 'Không tìm thấy tài khoản.'; end if;

  update public.user_profiles
  set role = v_role,
      unit_name = case when v_role = 'unit' then v_unit else null end,
      approval_status = v_decision,
      is_active = (v_decision = 'approved'),
      review_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  if v_decision = 'approved' then
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
    where id = p_user_id;
  end if;

  insert into public.ubkt_audit_logs(id, data)
  values (gen_random_uuid()::text, jsonb_build_object(
    'action', 'Cập nhật quyền truy cập tài khoản',
    'userId', v_profile.id,
    'email', v_profile.email,
    'previousRole', v_previous.role,
    'role', v_profile.role,
    'previousUnit', v_previous.unit_name,
    'unit', v_profile.unit_name,
    'status', v_profile.approval_status,
    'reviewedBy', (select auth.uid()),
    'createdAt', now()
  ));
  return v_profile;
end;
$$;

revoke all on function public.set_user_account_access(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_user_account_access(uuid, text, text, text, text)
  to authenticated;

-- Monday 07:30, Asia/Ho_Chi_Minh (00:30 UTC).
create extension if not exists pg_cron with schema extensions;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ubkt-weekly-appraisal-reminder') then
    perform cron.unschedule('ubkt-weekly-appraisal-reminder');
  end if;
  perform cron.schedule(
    'ubkt-weekly-appraisal-reminder',
    '30 0 * * 1',
    'select public.enqueue_weekly_appraisal_reminders();'
  );
end
$$;

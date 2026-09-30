-- Canonical organization units and strict tenant scope for unit accounts.
-- Existing tasks and profiles are preserved; only recognized unit aliases are normalized.

create or replace function private.normalize_unit_name(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case regexp_replace(lower(btrim(p_value)), '\s+', ' ', 'g')
    when 'ban xây dựng đảng' then 'Ban Xây dựng Đảng'
    when 'ban xdd' then 'Ban Xây dựng Đảng'
    when 'ban xd đảng' then 'Ban Xây dựng Đảng'

    when 'bchqs' then 'BCHQS'
    when 'ban chỉ huy quân sự' then 'BCHQS'

    when 'đảng uỷ - bch công an phường' then 'Đảng uỷ - BCH Công an phường'
    when 'đảng ủy - bch công an phường' then 'Đảng uỷ - BCH Công an phường'
    when 'bch công an phường' then 'Đảng uỷ - BCH Công an phường'
    when 'công an phường' then 'Đảng uỷ - BCH Công an phường'

    when 'hđnd' then 'HĐND'
    when 'hội đồng nhân dân' then 'HĐND'

    when 'mttq' then 'MTTQ'
    when 'ủy ban mttq' then 'MTTQ'
    when 'ủy ban mttq việt nam' then 'MTTQ'
    when 'ủy ban mttq việt nam phường' then 'MTTQ'
    when 'ủy ban mặt trận tổ quốc việt nam phường' then 'MTTQ'

    when 'ttct' then 'TTCT'
    when 'trung tâm chính trị' then 'TTCT'

    when 'ubkt' then 'UBKT'
    when 'ủy ban kiểm tra' then 'UBKT'
    when 'ủy ban kiểm tra đảng ủy' then 'UBKT'
    when 'ủy ban kiểm tra đảng uỷ' then 'UBKT'

    when 'ubnd' then 'UBND Phường'
    when 'ubnd phường' then 'UBND Phường'
    when 'ủy ban nhân dân' then 'UBND Phường'
    when 'ủy ban nhân dân phường' then 'UBND Phường'

    when 'vpđu' then 'VPĐU'
    when 'văn phòng đảng ủy' then 'VPĐU'
    when 'văn phòng đảng uỷ' then 'VPĐU'
    when 'văn phòng đảng ủy phường' then 'VPĐU'
    when 'văn phòng đảng uỷ phường' then 'VPĐU'
    else null
  end;
$$;

revoke all on function private.normalize_unit_name(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.normalize_unit_name(text) to authenticated;

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
      and private.normalize_unit_name(p.unit_name) is not null
  );
$$;

create or replace function private.current_unit()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.normalize_unit_name(p.unit_name)
  from public.user_profiles p
  where p.id = (select auth.uid())
    and p.role = 'unit'
    and p.approval_status = 'approved'
    and p.is_active is true
    and private.normalize_unit_name(p.unit_name) is not null
  limit 1;
$$;

revoke all on function private.is_approved_unit() from public, anon;
revoke all on function private.current_unit() from public, anon;
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
    private.normalize_unit_name(new.raw_user_meta_data ->> 'requested_unit'),
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
  v_unit text := private.normalize_unit_name(p_unit_name);
begin
  if not private.is_admin() then
    raise exception 'Chỉ Admin được duyệt tài khoản.';
  end if;
  if v_decision not in ('approved', 'rejected', 'suspended') then
    raise exception 'Trạng thái duyệt không hợp lệ.';
  end if;
  if v_decision = 'approved' and v_unit is null then
    raise exception 'Cần chọn đơn vị hợp lệ trong danh mục trước khi duyệt.';
  end if;

  update public.user_profiles
  set role = case when role = 'admin' then role else 'unit' end,
      unit_name = case
        when role = 'admin' then unit_name
        when v_decision = 'approved' then v_unit
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

  if v_decision = 'approved' then
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = p_user_id;
  end if;

  insert into public.ubkt_audit_logs(id, data)
  values (
    gen_random_uuid()::text,
    jsonb_build_object(
      'action', case v_decision
        when 'approved' then 'Phê duyệt và kích hoạt tài khoản'
        when 'suspended' then 'Tạm ngưng tài khoản'
        else 'Từ chối tài khoản'
      end,
      'userId', v_profile.id,
      'email', v_profile.email,
      'unit', v_profile.unit_name,
      'reviewNote', v_profile.review_note,
      'createdAt', now()
    )
  );

  return v_profile;
end;
$$;

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
revoke all on function public.review_user_account(uuid, text, text, text) from public, anon;
grant execute on function public.review_user_account(uuid, text, text, text) to authenticated;

-- Normalize recognized aliases without deleting or restructuring any business row.
update public.user_profiles
set requested_unit = private.normalize_unit_name(requested_unit),
    updated_at = now()
where requested_unit is not null
  and private.normalize_unit_name(requested_unit) is not null
  and requested_unit is distinct from private.normalize_unit_name(requested_unit);

update public.user_profiles
set unit_name = private.normalize_unit_name(unit_name),
    updated_at = now()
where unit_name is not null
  and private.normalize_unit_name(unit_name) is not null
  and unit_name is distinct from private.normalize_unit_name(unit_name);

update public.ubkt_tasks
set data = jsonb_set(
      data,
      '{unit}',
      to_jsonb(private.normalize_unit_name(data ->> 'unit')),
      true
    ),
    updated_at = now()
where private.normalize_unit_name(data ->> 'unit') is not null
  and (data ->> 'unit') is distinct from private.normalize_unit_name(data ->> 'unit');

update public.ubkt_tasks
set data = jsonb_set(
      data,
      '{coUnit}',
      to_jsonb(private.normalize_unit_name(data ->> 'coUnit')),
      true
    ),
    updated_at = now()
where private.normalize_unit_name(data ->> 'coUnit') is not null
  and (data ->> 'coUnit') is distinct from private.normalize_unit_name(data ->> 'coUnit');

create index if not exists ubkt_tasks_canonical_unit_idx
  on public.ubkt_tasks (private.normalize_unit_name(data ->> 'unit'));
create index if not exists ubkt_tasks_canonical_co_unit_idx
  on public.ubkt_tasks (private.normalize_unit_name(data ->> 'coUnit'));

drop policy if exists ubkt_tasks_read_assigned_or_admin on public.ubkt_tasks;
create policy ubkt_tasks_read_assigned_or_admin
on public.ubkt_tasks
for select
to authenticated
using (
  (select private.is_admin())
  or (
    (select private.is_approved_unit())
    and (
      private.normalize_unit_name(data ->> 'unit') =
        (select private.current_unit())
      or private.normalize_unit_name(data ->> 'coUnit') =
        (select private.current_unit())
    )
  )
);

drop policy if exists task_update_requests_submit_assigned on public.task_update_requests;
create policy task_update_requests_submit_assigned
on public.task_update_requests
for insert
to authenticated
with check (
  requested_by = (select auth.uid())
  and status = 'pending'
  and (select private.is_approved_unit())
  and private.normalize_unit_name(unit_name) =
    (select private.current_unit())
  and exists (
    select 1
    from public.ubkt_tasks t
    where t.id = task_id
      and (
        private.normalize_unit_name(t.data ->> 'unit') =
          (select private.current_unit())
        or private.normalize_unit_name(t.data ->> 'coUnit') =
          (select private.current_unit())
      )
  )
);

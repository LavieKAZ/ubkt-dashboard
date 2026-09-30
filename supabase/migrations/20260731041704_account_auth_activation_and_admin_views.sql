-- Keep application approval and Supabase Auth activation in one Admin action.
-- Existing business data and task rows are not changed.

alter table public.user_profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists is_active boolean not null default false;

update public.user_profiles
set is_active = (approval_status = 'approved'),
    updated_at = now()
where is_active is distinct from (approval_status = 'approved');

create or replace function public.admin_list_user_accounts()
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  role text,
  is_active boolean,
  requested_unit text,
  unit_name text,
  approval_status text,
  review_note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  email_confirmed_at timestamptz,
  confirmation_sent_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Chỉ Admin được xem danh sách tài khoản.';
  end if;

  return query
  select
    p.id,
    coalesce(p.email, u.email)::text,
    p.full_name,
    p.phone,
    p.role,
    p.is_active,
    p.requested_unit,
    p.unit_name,
    p.approval_status,
    p.review_note,
    p.created_at,
    p.reviewed_at,
    u.email_confirmed_at,
    u.confirmation_sent_at,
    u.last_sign_in_at,
    u.banned_until
  from public.user_profiles p
  left join auth.users u on u.id = p.id
  order by p.created_at desc;
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
begin
  if not private.is_admin() then
    raise exception 'Chỉ Admin được duyệt tài khoản.';
  end if;
  if v_decision not in ('approved', 'rejected', 'suspended') then
    raise exception 'Trạng thái duyệt không hợp lệ.';
  end if;
  if v_decision = 'approved'
    and nullif(btrim(coalesce(p_unit_name, '')), '') is null then
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

  -- Admin approval is the final identity-verification step in this closed system.
  -- Without this synchronization, Auth rejects the password before the app can
  -- read the already-approved user_profiles row.
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

-- Repair accounts that the Admin approved before Auth activation was linked.
update auth.users u
set email_confirmed_at = coalesce(u.email_confirmed_at, now()),
    updated_at = now()
from public.user_profiles p
where p.id = u.id
  and p.approval_status = 'approved'
  and p.is_active is true
  and u.email_confirmed_at is null;

revoke all on function public.admin_list_user_accounts() from public, anon;
revoke all on function public.review_user_account(uuid, text, text, text) from public, anon;
grant execute on function public.admin_list_user_accounts() to authenticated;
grant execute on function public.review_user_account(uuid, text, text, text) to authenticated;

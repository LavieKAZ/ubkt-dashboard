-- Allow an approved Admin to assign or change another account's system role.
-- Authorization continues to come from user_profiles through private.is_admin();
-- no user-editable Auth metadata is used for access decisions.

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
  if not private.is_admin() then
    raise exception 'Chỉ Admin được thay đổi quyền tài khoản.';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'Không thể tự thay đổi vai trò hoặc trạng thái của tài khoản Admin đang đăng nhập.';
  end if;

  if v_role not in ('admin', 'unit') then
    raise exception 'Vai trò không hợp lệ. Chỉ chấp nhận Admin hoặc Đơn vị.';
  end if;

  if v_decision not in ('approved', 'rejected', 'suspended') then
    raise exception 'Trạng thái truy cập không hợp lệ.';
  end if;

  if v_role = 'unit' and v_decision = 'approved' and v_unit is null then
    raise exception 'Tài khoản đơn vị đang hoạt động phải được gán đơn vị hợp lệ.';
  end if;

  select *
  into v_previous
  from public.user_profiles
  where id = p_user_id
  for update;

  if v_previous.id is null then
    raise exception 'Không tìm thấy tài khoản cần cập nhật.';
  end if;

  update public.user_profiles
  set role = v_role,
      unit_name = case when v_role = 'admin' then null else v_unit end,
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
    set email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = p_user_id;
  end if;

  insert into public.ubkt_audit_logs(id, data)
  values (
    gen_random_uuid()::text,
    jsonb_build_object(
      'action', 'Cập nhật quyền truy cập tài khoản',
      'userId', v_profile.id,
      'email', v_profile.email,
      'previousRole', v_previous.role,
      'role', v_profile.role,
      'previousUnit', v_previous.unit_name,
      'unit', v_profile.unit_name,
      'previousStatus', v_previous.approval_status,
      'status', v_profile.approval_status,
      'reviewNote', v_profile.review_note,
      'reviewedBy', (select auth.uid()),
      'createdAt', now()
    )
  );

  return v_profile;
end;
$$;

revoke all on function public.set_user_account_access(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_user_account_access(uuid, text, text, text, text)
  to authenticated;

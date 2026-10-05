-- Quay lại migration 20261005200000_auth_registration_google.sql
-- Trả hàm về đúng định nghĩa đang chạy trên production trước migration (commit 105af0c).
-- LƯU Ý: bước cuối xóa cột position_title → mất thông tin "Chức vụ/bộ phận" đã khai báo sau migration.
-- Không đụng tới vai trò, đơn vị, trạng thái duyệt hay mật khẩu của bất kỳ tài khoản nào.

-- 1) Danh sách tài khoản: về kiểu trả về cũ (16 cột) ---------------------------------
drop function if exists public.admin_list_user_accounts();
-- 1) Danh sách tài khoản: chỉ Admin/UBKT ----------------------------------------
create function public.admin_list_user_accounts()
returns table(
  id uuid, email text, full_name text, phone text, role text, is_active boolean,
  requested_unit text, unit_name text, approval_status text, review_note text,
  created_at timestamptz, reviewed_at timestamptz, email_confirmed_at timestamptz,
  confirmation_sent_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_full_admin()) then
    raise exception 'Chỉ Admin hoặc UBKT được xem danh sách tài khoản.' using errcode = '42501';
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


revoke all on function public.admin_list_user_accounts() from public, anon;
grant execute on function public.admin_list_user_accounts() to authenticated;

-- 2) Bỏ RPC tự hoàn tất đăng ký -----------------------------------------------------
drop function if exists public.submit_unit_registration(text, text, text, text);

-- 3) Trigger tạo hồ sơ: định nghĩa production cũ ------------------------------------
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

-- 4) Cột chức vụ/bộ phận -------------------------------------------------------------
alter table public.user_profiles drop column if exists position_title;

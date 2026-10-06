-- Hoàn thiện đăng ký tài khoản đơn vị (email/mật khẩu và Google).
-- Chỉ BỔ SUNG; không xóa/chuyển đổi dữ liệu, không đổi vai trò/đơn vị/trạng thái của tài khoản hiện có.
-- Chạy lại nhiều lần an toàn.
-- Quay lại: supabase/rollbacks/20261005200000_auth_registration_google.rollback.sql
--
-- 1) Cột position_title (Chức vụ/bộ phận — không bắt buộc).
-- 2) Sửa trigger tạo hồ sơ: trên production có 2 trigger AFTER INSERT trên auth.users;
--    trigger cũ on_auth_user_created (handle_new_user) chạy TRƯỚC và tạo hồ sơ role='viewer',
--    is_active=true. Trigger handle_new_user_profile khi xung đột chỉ cập nhật email/họ tên…
--    nên người đăng ký mới bị kẹt role='viewer', is_active=true. Bản mới: với hồ sơ VỪA tạo,
--    chưa từng được duyệt (viewer + pending + reviewed_at null) → chuyển về unit/pending/inactive.
--    Hồ sơ đã duyệt/đã có vai trò khác KHÔNG bị đụng tới.
-- 3) RPC public.submit_unit_registration: người dùng mới (thường là đăng nhập Google lần đầu)
--    tự hoàn tất thông tin đăng ký cho CHÍNH MÌNH. Không thể tự chọn vai trò; luôn unit/pending/inactive.
-- 4) admin_list_user_accounts trả thêm position_title và auth_providers (email/google) để
--    Admin/UBKT nhận biết khi duyệt. Quyền giữ nguyên: chỉ Admin/UBKT.

-- 1) Cột chức vụ/bộ phận ----------------------------------------------------------
alter table public.user_profiles add column if not exists position_title text;

-- 2) Trigger tạo hồ sơ khi có người dùng auth mới -----------------------------------
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');
begin
  -- raw_user_meta_data do người dùng gửi: CHỈ dùng làm thông tin hiển thị, không dùng cho phân quyền.
  insert into public.user_profiles (
    id,
    email,
    full_name,
    phone,
    requested_unit,
    position_title,
    role,
    is_active,
    approval_status
  )
  values (
    new.id,
    lower(new.email),
    left(v_full_name, 120),
    left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''), 30),
    private.normalize_unit_name(new.raw_user_meta_data ->> 'requested_unit'),
    left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'position_title', '')), ''), 120),
    'unit',
    false,
    'pending'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
      phone = coalesce(public.user_profiles.phone, excluded.phone),
      requested_unit = coalesce(public.user_profiles.requested_unit, excluded.requested_unit),
      position_title = coalesce(public.user_profiles.position_title, excluded.position_title),
      -- Hồ sơ "viewer" vừa được trigger cũ tạo trong CÙNG lệnh INSERT, chưa từng duyệt
      -- → đưa về mặc định an toàn của người đăng ký mới.
      role = case
        when public.user_profiles.role = 'viewer'
         and public.user_profiles.approval_status = 'pending'
         and public.user_profiles.reviewed_at is null
        then 'unit' else public.user_profiles.role end,
      is_active = case
        when public.user_profiles.role = 'viewer'
         and public.user_profiles.approval_status = 'pending'
         and public.user_profiles.reviewed_at is null
        then false else public.user_profiles.is_active end,
      updated_at = now();
  return new;
end;
$$;

-- 3) Người dùng mới tự hoàn tất thông tin đăng ký ----------------------------------
create or replace function public.submit_unit_registration(
  p_full_name text,
  p_requested_unit text,
  p_position_title text default null,
  p_phone text default null
)
returns table(id uuid, email text, full_name text, requested_unit text, position_title text,
              role text, approval_status text, is_active boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := left(nullif(btrim(coalesce(p_full_name, '')), ''), 120);
  v_unit text := private.normalize_unit_name(p_requested_unit);
  v_position text := left(nullif(btrim(coalesce(p_position_title, '')), ''), 120);
  v_phone text := left(nullif(btrim(coalesce(p_phone, '')), ''), 30);
  v_profile public.user_profiles;
begin
  if v_uid is null then
    raise exception 'Phiên đăng nhập không hợp lệ.' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) < 2 then
    raise exception 'Vui lòng nhập họ và tên.' using errcode = '22023';
  end if;
  if v_unit is null then
    raise exception 'Vui lòng chọn đơn vị trong danh mục.' using errcode = '22023';
  end if;

  select * into v_profile from public.user_profiles p where p.id = v_uid for update;
  if v_profile.id is null then
    raise exception 'Không tìm thấy hồ sơ tài khoản.' using errcode = 'P0002';
  end if;
  -- Chỉ hồ sơ đang chờ duyệt, chưa từng được xử lý, vai trò đơn vị/viewer mới được tự khai báo.
  -- Tài khoản admin/ubkt/vpdu, đã duyệt, bị từ chối hoặc tạm ngưng: không thay đổi gì.
  if v_profile.approval_status <> 'pending'
     or v_profile.reviewed_at is not null
     or v_profile.role not in ('unit', 'viewer') then
    raise exception 'Tài khoản này không thể gửi lại yêu cầu đăng ký. Vui lòng liên hệ quản trị viên.'
      using errcode = '42501';
  end if;

  update public.user_profiles p
  set full_name = v_name,
      requested_unit = v_unit,
      position_title = coalesce(v_position, p.position_title),
      phone = coalesce(v_phone, p.phone),
      role = 'unit',
      is_active = false,
      approval_status = 'pending',
      updated_at = now()
  where p.id = v_uid
  returning * into v_profile;

  return query select v_profile.id, v_profile.email, v_profile.full_name, v_profile.requested_unit,
    v_profile.position_title, v_profile.role, v_profile.approval_status, v_profile.is_active;
end;
$$;

revoke all on function public.submit_unit_registration(text, text, text, text) from public, anon;
grant execute on function public.submit_unit_registration(text, text, text, text) to authenticated;

-- 4) Danh sách tài khoản: thêm chức vụ và phương thức đăng nhập ----------------------
-- Kiểu trả về thay đổi nên phải drop rồi tạo lại (trong cùng giao dịch migration).
drop function if exists public.admin_list_user_accounts();
create function public.admin_list_user_accounts()
returns table(
  id uuid, email text, full_name text, phone text, role text, is_active boolean,
  requested_unit text, unit_name text, approval_status text, review_note text,
  created_at timestamptz, reviewed_at timestamptz, email_confirmed_at timestamptz,
  confirmation_sent_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz,
  position_title text, auth_providers text[]
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
    u.banned_until,
    p.position_title,
    coalesce(
      (select array_agg(distinct i.provider::text order by i.provider::text)
         from auth.identities i where i.user_id = p.id),
      array[]::text[]
    )
  from public.user_profiles p
  left join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_user_accounts() from public, anon;
grant execute on function public.admin_list_user_accounts() to authenticated;

-- Khóa đúng phạm vi tài khoản VPĐU và hoàn thiện luồng Duyệt cập nhật tiến độ.
-- Bổ sung/siết quyền, KHÔNG xóa hay chuyển đổi dữ liệu. Chạy lại nhiều lần an toàn.
-- Quay lại: supabase/rollbacks/20261005120000_vpdu_scope_and_update_review.rollback.sql
--
-- Vai trò:
--   private.is_system_admin()  : admin
--   private.is_full_admin()    : admin, ubkt          (toàn quyền hệ thống)
--   private.is_admin()         : admin, ubkt, vpdu    (nhóm theo dõi nhiệm vụ — giữ nguyên định nghĩa)
--   private.is_approved_unit() : tài khoản đơn vị đã duyệt
--
-- Lỗi được sửa: một số hàm quản trị tài khoản dùng private.is_admin() nên VPĐU
-- xem được danh sách tài khoản (email, số điện thoại) và duyệt được tài khoản.

-- 1) Danh sách tài khoản: chỉ Admin/UBKT ----------------------------------------
create or replace function public.admin_list_user_accounts()
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

-- 2) Duyệt tài khoản đăng ký: chỉ Admin/UBKT (nội dung giữ nguyên) ---------------
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
  if not (select private.is_full_admin()) then
    raise exception 'Chỉ Admin hoặc UBKT được duyệt tài khoản.' using errcode = '42501';
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

-- 3) Duyệt cập nhật tiến độ: Admin/UBKT/VPĐU; từ chối bắt buộc có lý do ---------
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
  v_note text := nullif(btrim(coalesce(p_review_note, '')), '');
  v_patch jsonb;
begin
  if not (select private.is_admin()) then
    raise exception 'Chỉ Admin, UBKT hoặc VPĐU được duyệt cập nhật nhiệm vụ.' using errcode = '42501';
  end if;
  if v_decision not in ('approved', 'rejected') then
    raise exception 'Quyết định duyệt không hợp lệ.';
  end if;
  if v_decision = 'rejected' and v_note is null then
    raise exception 'Cần nhập lý do từ chối.' using errcode = '22023';
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
      review_note = v_note,
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
      'reviewedBy', v_request.reviewed_by,
      'createdAt', now()
    )
  );

  return v_request;
end;
$$;

-- 4) Danh sách đề nghị kèm HỌ TÊN người gửi/người xử lý cho người duyệt -----------
--    (VPĐU không đọc được bảng user_profiles; hàm chỉ trả đúng tên hiển thị, không trả email/điện thoại)
create or replace function public.list_task_update_requests()
returns table(
  id uuid, task_id text, requested_by uuid, requester_name text, unit_name text,
  proposed_data jsonb, status text, review_note text, reviewed_by uuid, reviewer_name text,
  reviewed_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Chỉ Admin, UBKT hoặc VPĐU được xem hàng đợi duyệt.' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.task_id,
    r.requested_by,
    coalesce(nullif(btrim(requester.full_name), ''), 'Tài khoản đơn vị')::text,
    r.unit_name,
    r.proposed_data,
    r.status,
    r.review_note,
    r.reviewed_by,
    case when r.reviewed_by is null then null
         else coalesce(nullif(btrim(reviewer.full_name), ''),
           case reviewer.role when 'vpdu' then 'Văn phòng Đảng ủy' when 'ubkt' then 'Ủy ban Kiểm tra' else 'Quản trị hệ thống' end)
    end::text,
    r.reviewed_at,
    r.created_at
  from public.task_update_requests r
  left join public.user_profiles requester on requester.id = r.requested_by
  left join public.user_profiles reviewer on reviewer.id = r.reviewed_by
  order by r.created_at desc;
end;
$$;

revoke all on function public.list_task_update_requests() from public, anon;
grant execute on function public.list_task_update_requests() to authenticated;

-- 5) Không ai sửa trực tiếp trạng thái đề nghị ngoài Admin/UBKT; VPĐU xử lý qua RPC ở trên
drop policy if exists task_update_requests_admin_update on public.task_update_requests;
create policy task_update_requests_admin_update
on public.task_update_requests
for update
to authenticated
using ((select private.is_full_admin()))
with check ((select private.is_full_admin()));

-- 6) Đồng bộ "Theo dõi 11 Nghị quyết" (ghi) chỉ dành cho Admin/UBKT --------------
drop policy if exists resolution_snapshots_admin_insert on public.resolution_sync_snapshots;
create policy resolution_snapshots_admin_insert
on public.resolution_sync_snapshots
for insert
to authenticated
with check ((select private.is_full_admin()) and synced_by = (select auth.uid()));

drop policy if exists resolution_snapshots_admin_update on public.resolution_sync_snapshots;
create policy resolution_snapshots_admin_update
on public.resolution_sync_snapshots
for update
to authenticated
using ((select private.is_full_admin()))
with check ((select private.is_full_admin()) and synced_by = (select auth.uid()));

-- 7) Chuẩn hóa tên đơn vị: thêm tên cũ (Quân sự, Công an, BCH Công an...) và gạch ngang dài.
--    Mọi giá trị đang lưu vẫn cho ra đúng kết quả cũ (chỉ thêm ánh xạ mới), không đổi dữ liệu.
create or replace function private.normalize_unit_name(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case regexp_replace(regexp_replace(lower(btrim(p_value)), '\s*[–—-]\s*', ' - ', 'g'), '\s+', ' ', 'g')
    when 'ban xây dựng đảng' then 'Ban Xây dựng Đảng'
    when 'ban xdd' then 'Ban Xây dựng Đảng'
    when 'ban xd đảng' then 'Ban Xây dựng Đảng'

    when 'bchqs' then 'BCHQS'
    when 'ban chỉ huy quân sự' then 'BCHQS'
    when 'bchqs - ban chỉ huy quân sự' then 'BCHQS'
    when 'ban chỉ huy quân sự phường' then 'BCHQS'
    when 'quân sự' then 'BCHQS'

    when 'đảng uỷ - bch công an phường' then 'Đảng uỷ - BCH Công an phường'
    when 'đảng ủy - bch công an phường' then 'Đảng uỷ - BCH Công an phường'
    when 'bch công an phường' then 'Đảng uỷ - BCH Công an phường'
    when 'bch công an' then 'Đảng uỷ - BCH Công an phường'
    when 'công an phường' then 'Đảng uỷ - BCH Công an phường'
    when 'công an' then 'Đảng uỷ - BCH Công an phường'

    when 'hđnd' then 'HĐND'
    when 'hội đồng nhân dân' then 'HĐND'

    when 'mttq' then 'MTTQ'
    when 'ủy ban mttq' then 'MTTQ'
    when 'ủy ban mttq việt nam' then 'MTTQ'
    when 'ủy ban mttq việt nam phường' then 'MTTQ'
    when 'ủy ban mặt trận tổ quốc việt nam phường' then 'MTTQ'

    when 'ttct' then 'TTCT'
    when 'trung tâm chính trị' then 'TTCT'
    when 'ttct - trung tâm chính trị' then 'TTCT'

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

-- Hàm dùng trong chỉ mục: dựng lại hai chỉ mục (bảng nhỏ, vài trăm dòng).
reindex index public.ubkt_tasks_canonical_unit_idx;
reindex index public.ubkt_tasks_canonical_co_unit_idx;

-- =====================================================================
-- Giai đoạn 1: Phân quyền Tab Nhiệm vụ
--   * UBKT / Admin : toàn quyền mọi phân hệ
--   * VPĐU         : chỉ phân hệ Nhiệm vụ (xem mọi đơn vị, cờ đỏ, sửa thông tin
--                    gốc, chốt Đánh giá của VPĐU) – không vào các phân hệ khác
--   * Đơn vị       : chỉ xem nhiệm vụ của đơn vị mình, ghi bình luận tiến độ
--                    và tự đánh giá (qua bảng task_progress_logs)
--
-- Quy ước hàm:
--   private.is_admin()       = người quản lý nhiệm vụ (admin, ubkt, vpdu)  [giữ nguyên]
--   private.is_full_admin()  = toàn quyền hệ thống (admin, ubkt)            [mới]
-- =====================================================================

-- 1) Hàm "toàn quyền" mới -------------------------------------------------
create or replace function private.is_full_admin()
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
      and p.role in ('admin', 'ubkt')
      and p.approval_status = 'approved'
      and p.is_active is true
  );
$$;

grant execute on function private.is_full_admin() to authenticated;

-- 2) Các phân hệ ngoài Nhiệm vụ: chỉ UBKT/Admin --------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'ban_do_state', 'ubkt_base_orgs', 'ubkt_base_reports', 'ubkt_conclusions',
    'ubkt_dossiers', 'ubkt_indicator_updates', 'ubkt_indicators',
    'ubkt_ktgs_report_periods', 'ubkt_ktgs_reports', 'ubkt_opinions',
    'ubkt_periods', 'ubkt_programs', 'ubkt_ptdl_monthly'
  ] loop
    execute format(
      'alter policy %I on public.%I using ((select private.is_full_admin())) with check ((select private.is_full_admin()))',
      t || '_admin_only', t
    );
  end loop;
end $$;

-- Nhật ký thao tác: UBKT/Admin xem & quản lý; VPĐU chỉ được ghi thêm dòng mới
alter policy ubkt_audit_logs_admin_only on public.ubkt_audit_logs
  using ((select private.is_full_admin()))
  with check ((select private.is_full_admin()));

drop policy if exists ubkt_audit_logs_task_manager_insert on public.ubkt_audit_logs;
create policy ubkt_audit_logs_task_manager_insert on public.ubkt_audit_logs
  for insert to authenticated
  with check ((select private.is_admin()));

-- Hồ sơ người dùng: chỉ UBKT/Admin xem được danh sách; ai cũng xem được hồ sơ của mình
alter policy user_profiles_read_own_or_admin on public.user_profiles
  using ((id = (select auth.uid())) or (select private.is_full_admin()));

-- 3) Vá lỗ hổng: các bảng đang cho cả người CHƯA đăng nhập xem/sửa/xóa -----
do $$
declare
  t text;
  op text;
begin
  foreach t in array array[
    'ubkt_documents', 'ubkt_document_links', 'ubkt_indicator_units',
    'ubkt_kp_report_entries', 'ubkt_kp_report_paper_logs', 'ubkt_kp_report_periods'
  ] loop
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', t || '_' || op || '_all', t);
      execute format('drop policy if exists %I on public.%I', t || '_' || op || '_authenticated', t);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select_authenticated', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_insert_authenticated', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update_authenticated', t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)', t || '_delete_authenticated', t);
  end loop;
end $$;

-- 4) Nhắc việc hằng tuần: thêm nhắc cho từng Đơn vị -----------------------
create or replace function public.enqueue_weekly_appraisal_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_admin integer := 0;
  inserted_unit integer := 0;
  week_key text := to_char(timezone('Asia/Ho_Chi_Minh', now()), 'IYYY-IW');
  today date := (timezone('Asia/Ho_Chi_Minh', now()))::date;
begin
  -- a) UBKT / VPĐU / Admin: nhắc thẩm định
  insert into public.system_notifications (recipient_id, category, title, body, action_page, dedupe_key)
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
  get diagnostics inserted_admin = row_count;

  -- b) Từng Đơn vị: số việc quá hạn / sắp đến hạn / chưa cập nhật trong 7 ngày
  with unit_stats as (
    select
      private.normalize_unit_name(t.data ->> 'unit') as unit_name,
      count(*) filter (
        where coalesce(t.data ->> 'deadline', '') ~ '^\d{4}-\d{2}-\d{2}$'
          and (t.data ->> 'deadline')::date < today
      ) as overdue,
      count(*) filter (
        where coalesce(t.data ->> 'deadline', '') ~ '^\d{4}-\d{2}-\d{2}$'
          and (t.data ->> 'deadline')::date between today and today + 7
      ) as due_soon,
      count(*) filter (
        where not exists (
          select 1 from public.task_progress_logs l
          where l.task_id = t.id and l.created_at > now() - interval '7 days'
        )
      ) as stale
    from public.ubkt_tasks t
    where coalesce(t.data ->> 'vpduAssessment', '') <> 'Hoàn thành'
      and coalesce(t.data ->> 'is_deleted', 'false') <> 'true'
    group by 1
  )
  insert into public.system_notifications (recipient_id, category, title, body, action_page, dedupe_key)
  select
    profile.id,
    'weekly-unit-reminder',
    'Nhắc cập nhật tiến độ nhiệm vụ',
    format(
      'Đơn vị đang có %s nhiệm vụ quá hạn, %s nhiệm vụ đến hạn trong 7 ngày tới và %s nhiệm vụ chưa cập nhật tiến độ trong tuần qua. Vui lòng cập nhật kết quả thực hiện và tự đánh giá.',
      s.overdue, s.due_soon, s.stale
    ),
    'tasks',
    'weekly-unit-' || week_key
  from public.user_profiles profile
  join unit_stats s on s.unit_name = private.normalize_unit_name(profile.unit_name)
  where profile.role = 'unit'
    and profile.approval_status = 'approved'
    and profile.is_active is true
    and (s.overdue + s.due_soon + s.stale) > 0
  on conflict (recipient_id, dedupe_key) do nothing;
  get diagnostics inserted_unit = row_count;

  return inserted_admin + inserted_unit;
end;
$$;

-- 5) Gán lại vai trò tài khoản theo xác nhận của anh Kaz ------------------
update public.user_profiles
set role = 'vpdu', unit_name = null, approval_status = 'approved', is_active = true,
    review_note = 'Giai đoạn 1: chuyển sang vai trò VPĐU', reviewed_at = now(), updated_at = now()
where lower(email) = 'nguyenthimay51982@gmail.com';

update public.user_profiles
set role = 'ubkt', unit_name = null, approval_status = 'approved', is_active = true,
    review_note = 'Giai đoạn 1: tài khoản Ủy ban Kiểm tra', reviewed_at = now(), updated_at = now()
where lower(email) = 'ltphuong.tanmy@tphcm.gov.vn';

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
where lower(email) = 'ltphuong.tanmy@tphcm.gov.vn';

insert into public.ubkt_audit_logs (id, data)
values (
  gen_random_uuid()::text,
  jsonb_build_object(
    'action', 'Giai đoạn 1: cập nhật phân quyền',
    'time', now(),
    'details', 'VPĐU chỉ dùng phân hệ Nhiệm vụ; khóa truy cập ẩn danh; gán vai trò: nguyenthimay51982@gmail.com → vpdu, ltphuong.tanmy@tphcm.gov.vn → ubkt'
  )
);

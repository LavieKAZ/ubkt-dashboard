-- Phân quyền Tab Nhiệm vụ theo vai trò (bổ sung, không xóa dữ liệu).
-- 1) Tài khoản đơn vị được sửa ĐÚNG ô Thời hạn của nhiệm vụ thuộc đơn vị mình
--    (đơn vị vẫn không có quyền UPDATE trực tiếp bảng ubkt_tasks).
-- 2) Chỉ Admin và UBKT được xóa nhiệm vụ (VPĐU vẫn thêm và cập nhật được như hiện nay).
-- Quay lại: supabase/rollbacks/20261005090000_task_role_scope.rollback.sql

create or replace function public.unit_set_task_deadline(
  p_task_id text,
  p_deadline text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit text := (select private.current_unit());
  v_deadline text := nullif(btrim(coalesce(p_deadline, '')), '');
  v_today text := to_char((now() at time zone 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD');
  v_task public.ubkt_tasks%rowtype;
  v_data jsonb;
begin
  if v_unit is null then
    raise exception 'Chỉ tài khoản đơn vị đã được duyệt mới dùng chức năng này'
      using errcode = '42501';
  end if;

  if v_deadline is not null then
    if v_deadline !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Ngày không đúng định dạng YYYY-MM-DD' using errcode = '22007';
    end if;
    perform v_deadline::date; -- báo lỗi với ngày không tồn tại, ví dụ 2026-02-31
  end if;

  select * into v_task from public.ubkt_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Không tìm thấy nhiệm vụ' using errcode = 'P0002';
  end if;

  if private.normalize_unit_name(v_task.data ->> 'unit') is distinct from v_unit then
    raise exception 'Nhiệm vụ không thuộc đơn vị của tài khoản' using errcode = '42501';
  end if;

  update public.ubkt_tasks
     set data = coalesce(data, '{}'::jsonb)
                || jsonb_build_object('deadline', coalesce(v_deadline, ''), 'updatedAt', v_today),
         updated_at = now()
   where id = p_task_id
  returning data into v_data;

  insert into public.ubkt_audit_logs (id, data)
  values (
    'unit-deadline-' || gen_random_uuid()::text,
    jsonb_build_object(
      'time', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'action', 'Đơn vị sửa thời hạn',
      'doc', coalesce(v_task.data ->> 'doc', v_task.data ->> 'docFull', ''),
      'unit', coalesce(v_task.data ->> 'unit', ''),
      'task', left(coalesce(v_task.data ->> 'task', ''), 180),
      'details', format('deadline: %s → %s', coalesce(v_task.data ->> 'deadline', ''), coalesce(v_deadline, '')),
      'actor', (select auth.uid())
    )
  );

  return jsonb_build_object('id', p_task_id, 'deadline', coalesce(v_deadline, ''), 'updatedAt', v_today);
end;
$$;

revoke all on function public.unit_set_task_deadline(text, text) from public, anon;
grant execute on function public.unit_set_task_deadline(text, text) to authenticated;

-- Chỉ Admin/UBKT xóa nhiệm vụ.
drop policy if exists ubkt_tasks_admin_delete on public.ubkt_tasks;
create policy ubkt_tasks_admin_delete
on public.ubkt_tasks
for delete
to authenticated
using ((select private.is_full_admin()));

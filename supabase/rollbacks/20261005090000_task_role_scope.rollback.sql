-- Quay lại migration 20261005090000_task_role_scope.sql (trạng thái trước đó).
drop function if exists public.unit_set_task_deadline(text, text);

drop policy if exists ubkt_tasks_admin_delete on public.ubkt_tasks;
create policy ubkt_tasks_admin_delete
on public.ubkt_tasks
for delete
to authenticated
using ((select private.is_admin()));

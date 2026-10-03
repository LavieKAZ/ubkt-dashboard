-- Keep the task grid and appraisal-driven Dashboard synchronized across active sessions.
-- RLS policies continue to decide which rows each signed-in user may receive.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ubkt_tasks'
  ) then
    alter publication supabase_realtime add table public.ubkt_tasks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_progress_logs'
  ) then
    alter publication supabase_realtime add table public.task_progress_logs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'system_notifications'
  ) then
    alter publication supabase_realtime add table public.system_notifications;
  end if;
end
$$;

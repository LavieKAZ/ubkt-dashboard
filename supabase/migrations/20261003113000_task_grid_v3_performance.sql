-- Task grid V3 performance indexes and progress snapshots.
-- Additive only: existing tasks and progress history are preserved.

create extension if not exists pg_trgm with schema extensions;

create index if not exists ubkt_tasks_search_trgm_idx
  on public.ubkt_tasks
  using gin (
    (lower(
      coalesce(data ->> 'doc', '') || ' ' ||
      coalesce(data ->> 'conclusion', '') || ' ' ||
      coalesce(data ->> 'task', '')
    )) extensions.gin_trgm_ops
  );

create index if not exists ubkt_tasks_deadline_idx
  on public.ubkt_tasks ((data ->> 'deadline'));

create index if not exists ubkt_tasks_vpdu_assessment_idx
  on public.ubkt_tasks ((data ->> 'vpduAssessment'));

create or replace function private.sync_task_progress_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ubkt_tasks
  set data = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              coalesce(data, '{}'::jsonb),
              '{latestProgressSummary}',
              to_jsonb(new.content),
              true
            ),
            '{selfAssessment}',
            to_jsonb(coalesce(new.self_assessment, 'Chưa tự đánh giá')),
            true
          ),
          '{latestProgressAt}',
          to_jsonb(new.created_at::text),
          true
        ),
        '{latestProgressAuthor}',
        to_jsonb(new.author_name),
        true
      ),
      updated_at = now()
  where id = new.task_id;

  return new;
end;
$$;

revoke all on function private.sync_task_progress_snapshot() from public, anon, authenticated;

drop trigger if exists sync_task_progress_snapshot_after_insert on public.task_progress_logs;
create trigger sync_task_progress_snapshot_after_insert
after insert on public.task_progress_logs
for each row execute function private.sync_task_progress_snapshot();

-- Backfill the newest progress record into each task so the grid can render
-- summaries without loading the full activity feed for every row.
with latest as (
  select distinct on (task_id)
    task_id,
    content,
    self_assessment,
    created_at,
    author_name
  from public.task_progress_logs
  order by task_id, created_at desc
)
update public.ubkt_tasks as task
set data = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(task.data, '{}'::jsonb),
            '{latestProgressSummary}',
            to_jsonb(latest.content),
            true
          ),
          '{selfAssessment}',
          to_jsonb(coalesce(latest.self_assessment, 'Chưa tự đánh giá')),
          true
        ),
        '{latestProgressAt}',
        to_jsonb(latest.created_at::text),
        true
      ),
      '{latestProgressAuthor}',
      to_jsonb(latest.author_name),
      true
    ),
    updated_at = now()
from latest
where task.id = latest.task_id;

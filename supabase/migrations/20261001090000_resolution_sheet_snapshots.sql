-- One lightweight current snapshot makes manual Google Sheets sync visible to all approved accounts.
-- Google Sheets remains the source of truth; existing UBKT business tables are not changed.

create table if not exists public.resolution_sync_snapshots (
  id text primary key default 'current' check (id = 'current'),
  payload jsonb not null,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  synced_by uuid references auth.users(id) on delete set null
);

alter table public.resolution_sync_snapshots enable row level security;

drop policy if exists resolution_snapshots_read_approved on public.resolution_sync_snapshots;
create policy resolution_snapshots_read_approved
on public.resolution_sync_snapshots
for select
to authenticated
using (
  private.is_admin()
  or private.is_approved_unit()
  or exists (
    select 1 from public.user_profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'viewer'
      and profile.approval_status = 'approved'
      and profile.is_active is true
  )
);

drop policy if exists resolution_snapshots_admin_insert on public.resolution_sync_snapshots;
create policy resolution_snapshots_admin_insert
on public.resolution_sync_snapshots
for insert
to authenticated
with check (private.is_admin() and synced_by = (select auth.uid()));

drop policy if exists resolution_snapshots_admin_update on public.resolution_sync_snapshots;
create policy resolution_snapshots_admin_update
on public.resolution_sync_snapshots
for update
to authenticated
using (private.is_admin())
with check (private.is_admin() and synced_by = (select auth.uid()));

revoke all on table public.resolution_sync_snapshots from anon, authenticated;
grant select, insert, update on table public.resolution_sync_snapshots to authenticated;

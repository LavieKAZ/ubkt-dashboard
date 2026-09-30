begin;

-- Public visitors must never read or mutate internal UBKT business data.
revoke all on table public.user_profiles from anon;
revoke all on table public.ubkt_tasks from anon;
revoke all on table public.task_update_requests from anon;
revoke all on table public.ubkt_periods from anon;
revoke all on table public.ubkt_opinions from anon;
revoke all on table public.ubkt_conclusions from anon;
revoke all on table public.ubkt_audit_logs from anon;
revoke all on table public.ubkt_base_orgs from anon;
revoke all on table public.ubkt_base_reports from anon;
revoke all on table public.ubkt_dossiers from anon;
revoke all on table public.ubkt_programs from anon;
revoke all on table public.ubkt_indicators from anon;
revoke all on table public.ubkt_indicator_updates from anon;
revoke all on table public.ubkt_ktgs_reports from anon;
revoke all on table public.ubkt_ktgs_report_periods from anon;
revoke all on table public.ubkt_ptdl_monthly from anon;
revoke all on table public.ban_do_state from anon;

-- Keep RLS mandatory on every table exposed by the REST API.
alter table public.user_profiles enable row level security;
alter table public.ubkt_tasks enable row level security;
alter table public.task_update_requests enable row level security;
alter table public.ubkt_periods enable row level security;
alter table public.ubkt_opinions enable row level security;
alter table public.ubkt_conclusions enable row level security;
alter table public.ubkt_audit_logs enable row level security;
alter table public.ubkt_base_orgs enable row level security;
alter table public.ubkt_base_reports enable row level security;
alter table public.ubkt_dossiers enable row level security;
alter table public.ubkt_programs enable row level security;
alter table public.ubkt_indicators enable row level security;
alter table public.ubkt_indicator_updates enable row level security;
alter table public.ubkt_ktgs_reports enable row level security;
alter table public.ubkt_ktgs_report_periods enable row level security;
alter table public.ubkt_ptdl_monthly enable row level security;
alter table public.ban_do_state enable row level security;

-- Prevent an authenticated account from changing its role/approval/unit fields.
revoke all on table public.user_profiles from authenticated;
grant select on table public.user_profiles to authenticated;
grant update (full_name, phone, requested_unit) on table public.user_profiles to authenticated;

-- Administrative RPCs may only be invoked by an authenticated session; each
-- function still validates the caller's admin role internally.
revoke execute on function public.review_user_account(uuid, text, text, text) from public, anon;
revoke execute on function public.review_task_update(uuid, text, text) from public, anon;
grant execute on function public.review_user_account(uuid, text, text, text) to authenticated;
grant execute on function public.review_task_update(uuid, text, text) to authenticated;

-- Views must evaluate the caller's RLS rules instead of the view owner's rights.
alter view if exists public.ubkt_documents_with_counts set (security_invoker = true);
alter view if exists public.ubkt_indicators_with_units set (security_invoker = true);
alter view if exists public.ubkt_task_sync_v1 set (security_invoker = true);
alter view if exists public.ubkt_kp_report_summary set (security_invoker = true);
alter view if exists public.ubkt_ktgs_report_summary set (security_invoker = true);
alter view if exists public.ubkt_map_region_fields set (security_invoker = true);

commit;

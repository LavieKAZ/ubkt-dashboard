create extension if not exists "pgcrypto";

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  time time not null,
  attendees uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists events_date_time_idx on public.events (date, time);
create index if not exists events_attendees_gin_idx on public.events using gin (attendees);

alter table public.contacts enable row level security;
alter table public.events enable row level security;

drop policy if exists "Authenticated users can read contacts" on public.contacts;
create policy "Authenticated users can read contacts" on public.contacts for select to authenticated using (true);

drop policy if exists "Authenticated users can read events" on public.events;
create policy "Authenticated users can read events" on public.events for select to authenticated using (true);

insert into public.contacts (name, email)
values
  ('Đ/c Chủ nhiệm UB', 'chunhiem@ubkt.gov.vn'),
  ('Đ/c Phó Chủ nhiệm', 'phochunhiem@ubkt.gov.vn'),
  ('Phòng Tổng hợp', 'tonghop@ubkt.gov.vn'),
  ('Phòng Nghiệp vụ 1', 'nv1@ubkt.gov.vn'),
  ('Phòng Nghiệp vụ 2', 'nv2@ubkt.gov.vn')
on conflict (email) do update set name = excluded.name;

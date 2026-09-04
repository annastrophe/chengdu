-- Chengdu Ledger — Supabase schema
-- Run this once in your Supabase project: Database -> SQL Editor -> New query
-- -> paste this whole file -> Run.

create table if not exists trip_meta (
  id text primary key,
  name text not null default 'Chengdu',
  subtitle text not null default '',
  route text not null default '',
  rate numeric not null default 5.26
);

create table if not exists entries (
  id text primary key,
  category text not null,
  description text not null,
  amount numeric not null,
  currency text not null default 'SGD',
  paid_by text not null,
  date text default '',
  reference text default '',
  split_mode text not null default 'even',
  split_among jsonb not null default '[]',
  custom_shares jsonb,
  status text not null default 'confirmed',
  created_at timestamptz not null default now()
);

create table if not exists settlements (
  id text primary key,
  from_couple text not null,
  to_couple text not null,
  amount numeric not null,
  currency text not null default 'SGD',
  date text default '',
  note text default '',
  created_at timestamptz not null default now()
);

-- Row Level Security -----------------------------------------------------
alter table trip_meta enable row level security;
alter table entries enable row level security;
alter table settlements enable row level security;

-- These policies let anyone holding your site's anon key (embedded in
-- config.js, so effectively anyone with your site's URL) read and write
-- all three tables. There's no login step — the trust model is "whoever
-- has the link." That mirrors a shared trip spreadsheet: fine for two
-- couples you've sent the link to directly, but don't post the URL
-- somewhere public. If you later want real per-person accounts, look into
-- Supabase Auth (magic-link email sign-in) and scope these policies to
-- authenticated users instead.

create policy "public read trip_meta" on trip_meta for select using (true);
create policy "public insert trip_meta" on trip_meta for insert with check (true);
create policy "public update trip_meta" on trip_meta for update using (true);

create policy "public read entries" on entries for select using (true);
create policy "public insert entries" on entries for insert with check (true);
create policy "public update entries" on entries for update using (true);
create policy "public delete entries" on entries for delete using (true);

create policy "public read settlements" on settlements for select using (true);
create policy "public insert settlements" on settlements for insert with check (true);
create policy "public update settlements" on settlements for update using (true);
create policy "public delete settlements" on settlements for delete using (true);

-- Realtime -----------------------------------------------------------------
-- Lets everyone's open tab update live when someone else logs an entry.
-- Most projects already have a `supabase_realtime` publication; this adds
-- the three tables to it. If this errors ("publication does not exist"),
-- instead go to Database -> Replication in the dashboard and toggle these
-- three tables on there.
alter publication supabase_realtime add table trip_meta;
alter publication supabase_realtime add table entries;
alter publication supabase_realtime add table settlements;

-- Seed the single trip-meta row (safe to run even if it already exists).
insert into trip_meta (id, name, subtitle, route, rate)
values ('main', 'Chengdu', '8–15 April 2027', 'SIN → CTU', 5.26)
on conflict (id) do nothing;

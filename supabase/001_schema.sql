-- PERN Database Schema
-- Run this in Supabase SQL Editor

-- Players table
create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team text not null check (team in ('Dan', 'Ian')),
  is_captain boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Matchups table
create table matchups (
  id uuid primary key default gen_random_uuid(),
  player_a_id uuid not null references players(id),
  player_b_id uuid not null references players(id),
  matchup_number integer not null,
  created_at timestamptz not null default now()
);

-- Event log table
create table event_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  event_type text not null check (event_type in ('collision', 'system', 'flavor')),
  created_at timestamptz not null default now()
);

-- Profiles table (links auth users to players)
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  player_id uuid unique references players(id),
  ghin_number text,
  handicap_index numeric(4,1),
  ghin_last_updated_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_matchups_created_at on matchups(created_at desc);
create index idx_event_logs_created_at on event_logs(created_at desc);
create index idx_players_team on players(team);
create index idx_players_active on players(is_active);

-- Enable Row Level Security
alter table players enable row level security;
alter table matchups enable row level security;
alter table event_logs enable row level security;
alter table profiles enable row level security;

-- RLS Policies: players, matchups, event_logs are publicly readable
create policy "Players are viewable by everyone"
  on players for select using (true);

create policy "Matchups are viewable by everyone"
  on matchups for select using (true);

create policy "Event logs are viewable by everyone"
  on event_logs for select using (true);

-- Profiles: users can read all, but only update their own
create policy "Profiles are viewable by everyone"
  on profiles for select using (true);

create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can insert/update everything (for backend API routes)
-- These use the service_role key, which bypasses RLS

-- Enable Realtime on matchups and event_logs
alter publication supabase_realtime add table matchups;
alter publication supabase_realtime add table event_logs;

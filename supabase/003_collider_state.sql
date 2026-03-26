-- Shared collider state (single row)
create table collider_state (
  id uuid primary key default gen_random_uuid(),
  is_running boolean not null default false,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Insert the single state row
insert into collider_state (is_running) values (false);

-- RLS
alter table collider_state enable row level security;

create policy "Collider state is viewable by everyone"
  on collider_state for select using (true);

-- Enable Realtime
alter publication supabase_realtime add table collider_state;

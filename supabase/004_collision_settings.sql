-- Add collision speed setting to collider_state
alter table collider_state add column collision_speed integer not null default 5;

-- Speed 1 = very slow (~45 min), 5 = medium (~10 min), 10 = testing (~1 min)

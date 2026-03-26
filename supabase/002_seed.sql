-- PERN Seed Data: 12 Players
-- Run this after 001_schema.sql

-- Team Dan (clockwise)
insert into players (name, team, is_captain) values
  ('Dan',    'Dan', true),
  ('Lusty',  'Dan', false),
  ('Marino', 'Dan', false),
  ('Kyle',   'Dan', false),
  ('Musket', 'Dan', false),
  ('Mallon', 'Dan', false);

-- Team Ian (counterclockwise)
insert into players (name, team, is_captain) values
  ('Ian',    'Ian', true),
  ('Andy',   'Ian', false),
  ('Carty',  'Ian', false),
  ('Truant', 'Ian', false),
  ('Munley', 'Ian', false),
  ('Fran',   'Ian', false);

-- Initial system event
insert into event_logs (message, event_type) values
  ('PERN system initialized', 'system');

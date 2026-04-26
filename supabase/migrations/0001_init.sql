-- QuestMaster v2 schema
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text not null default '',
  role text not null default 'participant' check (role in ('participant','educator','admin')),
  xp int not null default 0,
  level int not null default 1,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists hunts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  theme text default '',
  description text default '',
  location text default '',
  start_time timestamptz not null default now(),
  end_time timestamptz not null default now(),
  team_size int not null default 1,
  max_teams int not null default 10,
  status text not null default 'draft' check (status in ('draft','active','completed')),
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references hunts(id) on delete cascade,
  title text not null,
  description text,
  order_index int not null default 0,
  points int not null default 0,
  created_at timestamptz default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references hunts(id) on delete cascade,
  name text not null,
  members uuid[] default '{}',
  total_points int not null default 0,
  created_at timestamptz default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  hunt_id uuid not null references hunts(id),
  user_id uuid not null references users(id),
  team_id uuid references teams(id),
  content text not null default '',
  media_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  feedback text,
  reviewed_by uuid references users(id),
  awarded_points int not null default 0,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create table if not exists leaderboard (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references hunts(id) on delete cascade,
  user_id uuid not null references users(id),
  team_id uuid references teams(id),
  total_points int not null default 0,
  rank int,
  updated_at timestamptz default now()
);

-- RLS (enable when ready)
alter table users enable row level security;
alter table hunts enable row level security;
alter table challenges enable row level security;
alter table teams enable row level security;
alter table submissions enable row level security;
alter table leaderboard enable row level security;

-- Allow authenticated reads (permissive, tighten later)
create policy "users_read" on users for select using (true);
create policy "hunts_read" on hunts for select using (true);
create policy "challenges_read" on challenges for select using (true);
create policy "teams_read" on teams for select using (true);
create policy "submissions_read" on submissions for select using (true);
create policy "leaderboard_read" on leaderboard for select using (true);

-- 0075_arena.sql
-- Kuizen Arena: kuiz gaya ZEP QUIZ (6 jenis soalan, 5 mod, paparan senarai/peta 2D).
--
-- Lima jadual baharu berawalan qm_arena_. Tiada jadual sedia ada diubah.
-- RLS dihidupkan TANPA polisi: hanya service role (laluan pelayan) boleh
-- membaca/menulis. Semua semakan pemilik dibuat dalam laluan API, dan
-- qm_arena_questions.data (kunci jawapan) tidak pernah sampai kepada peserta.
-- Idempoten: create table/index if not exists.

create table if not exists public.qm_arena_sets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid        not null references public.qm_profiles(id) on delete cascade,
  title       text        not null check (char_length(title) between 1 and 200),
  description text,
  settings    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists qm_arena_sets_owner_idx on public.qm_arena_sets (owner_id, created_at desc);
alter table public.qm_arena_sets enable row level security;

create table if not exists public.qm_arena_questions (
  id             uuid primary key default gen_random_uuid(),
  set_id         uuid        not null references public.qm_arena_sets(id) on delete cascade,
  order_idx      integer     not null default 0,
  type           text        not null check (type in ('multiple','subjective','ox','essay','match','order')),
  prompt         text        not null check (char_length(prompt) between 1 and 300),
  data           jsonb       not null default '{}'::jsonb, -- RAHSIA: kunci jawapan
  hint           jsonb,
  points         integer     not null default 100 check (points between 1 and 10000),
  time_limit_sec integer     not null default 30 check (time_limit_sec between 5 and 600),
  origin         text        not null default 'manual' check (origin in ('ai','manual','duplicate','similar')),
  created_at     timestamptz not null default now()
);
create index if not exists qm_arena_questions_set_idx on public.qm_arena_questions (set_id, order_idx);
alter table public.qm_arena_questions enable row level security;

create table if not exists public.qm_arena_sessions (
  id               uuid primary key default gen_random_uuid(),
  set_id           uuid        not null references public.qm_arena_sets(id) on delete cascade,
  host_id          uuid        not null references public.qm_profiles(id),
  code             text        not null unique check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
  mode             text        not null check (mode in ('sequencing','freestyle','round','team','coop')),
  view             text        not null default 'list' check (view in ('list','map')),
  status           text        not null default 'lobby' check (status in ('lobby','playing','ended')),
  frozen           boolean     not null default false,
  current_index    integer     not null default -1,
  round_started_at timestamptz,
  ends_at          timestamptz,
  map_id           text        not null default 'kampus',
  team_count       integer     not null default 2 check (team_count between 2 and 4),
  reset_seq        integer     not null default 0,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  ended_at         timestamptz
);
create index if not exists qm_arena_sessions_set_idx on public.qm_arena_sessions (set_id, created_at desc);
alter table public.qm_arena_sessions enable row level security;

create table if not exists public.qm_arena_players (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid        not null references public.qm_arena_sessions(id) on delete cascade,
  nickname      text        not null check (char_length(nickname) between 1 and 24),
  player_token  text        not null unique,
  avatar        integer     not null default 0 check (avatar between 0 and 7),
  team          integer,
  pos_x         real        not null default 0,
  pos_y         real        not null default 0,
  score         integer     not null default 0,
  last_seen_at  timestamptz not null default now(),
  joined_at     timestamptz not null default now(),
  unique (session_id, nickname)
);
create index if not exists qm_arena_players_session_idx on public.qm_arena_players (session_id);
alter table public.qm_arena_players enable row level security;

create table if not exists public.qm_arena_answers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid        not null references public.qm_arena_sessions(id) on delete cascade,
  player_id   uuid        not null references public.qm_arena_players(id) on delete cascade,
  question_id uuid        not null references public.qm_arena_questions(id) on delete cascade,
  answer      jsonb       not null,
  is_correct  boolean,    -- null = esei menunggu gred
  score       integer     not null default 0,
  elapsed_ms  integer,
  graded_by   uuid references public.qm_profiles(id),
  graded_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique (player_id, question_id)
);
create index if not exists qm_arena_answers_session_idx on public.qm_arena_answers (session_id);
alter table public.qm_arena_answers enable row level security;

notify pgrst, 'reload schema';

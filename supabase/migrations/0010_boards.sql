-- ============================================================================
-- 0010_boards.sql
-- Boards feature: Introduction Board (per class) + Quest Submission Board (per quest)
-- Padlet/Wakelet-style content sharing for Cendekia
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) qm_boards: parent table for both board types
-- ----------------------------------------------------------------------------
create table if not exists public.qm_boards (
  id uuid primary key default gen_random_uuid(),
  board_type text not null check (board_type in ('introduction','quest_submission')),
  -- Scope: introduction -> class_id required; quest_submission -> hunt_id required
  class_id uuid references public.qm_classes(id) on delete cascade,
  hunt_id  uuid references public.qm_hunts(id)   on delete cascade,
  title text not null,
  description text,
  layout_mode text not null default 'grid'
    check (layout_mode in ('media','compact','grid','moodboard','columns')),
  cover_color text default '#7F77DD',
  -- Quest-specific fields (nullable for intro)
  due_date timestamptz,
  max_score int,
  show_scores_publicly boolean not null default false,
  -- audit
  owner_id uuid not null references public.qm_profiles(id) on delete cascade,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- exclusive scope
  constraint qm_boards_scope_check check (
    (board_type = 'introduction'    and class_id is not null and hunt_id is null)
    or (board_type = 'quest_submission' and hunt_id is not null)
  ),
  -- one introduction board per class
  constraint qm_boards_unique_intro unique (class_id, board_type)
);

-- ----------------------------------------------------------------------------
-- 2) qm_intro_posts: one post per (board, user) for introduction boards
-- ----------------------------------------------------------------------------
create table if not exists public.qm_intro_posts (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.qm_boards(id) on delete cascade,
  author_id uuid not null references public.qm_profiles(id) on delete cascade,
  display_name text not null,
  description text,
  image_url text not null,
  image_path text not null, -- storage path, used for delete
  is_hidden boolean not null default false,
  hidden_by uuid references public.qm_profiles(id) on delete set null,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qm_intro_posts_unique unique (board_id, author_id)
);

-- ----------------------------------------------------------------------------
-- 3) qm_group_submissions: one submission per (board, team)
-- ----------------------------------------------------------------------------
create table if not exists public.qm_group_submissions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.qm_boards(id) on delete cascade,
  team_id  uuid not null references public.qm_teams(id)  on delete cascade,
  submitted_by uuid not null references public.qm_profiles(id) on delete cascade,
  title text not null,
  description text,
  file_url  text not null,
  file_path text not null,
  file_name text not null,
  file_type text not null check (file_type in ('image','pdf','document','other')),
  file_size_bytes bigint not null default 0,
  status text not null default 'in_review'
    check (status in ('in_review','needs_revision','complete')),
  score int,
  feedback text,
  graded_by uuid references public.qm_profiles(id) on delete set null,
  graded_at timestamptz,
  is_late boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qm_group_submissions_unique unique (board_id, team_id)
);

-- ----------------------------------------------------------------------------
-- 4) indexes
-- ----------------------------------------------------------------------------
create index if not exists qm_boards_class_idx       on public.qm_boards(class_id);
create index if not exists qm_boards_hunt_idx        on public.qm_boards(hunt_id);
create index if not exists qm_boards_owner_idx       on public.qm_boards(owner_id);
create index if not exists qm_intro_posts_board_idx  on public.qm_intro_posts(board_id, created_at desc);
create index if not exists qm_intro_posts_author_idx on public.qm_intro_posts(author_id);
create index if not exists qm_group_subs_board_idx   on public.qm_group_submissions(board_id, created_at desc);
create index if not exists qm_group_subs_team_idx    on public.qm_group_submissions(team_id);

-- ----------------------------------------------------------------------------
-- 5) updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function public.qm_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_qm_boards_updated on public.qm_boards;
create trigger trg_qm_boards_updated before update on public.qm_boards
for each row execute function public.qm_set_updated_at();

drop trigger if exists trg_qm_intro_posts_updated on public.qm_intro_posts;
create trigger trg_qm_intro_posts_updated before update on public.qm_intro_posts
for each row execute function public.qm_set_updated_at();

drop trigger if exists trg_qm_group_subs_updated on public.qm_group_submissions;
create trigger trg_qm_group_subs_updated before update on public.qm_group_submissions
for each row execute function public.qm_set_updated_at();

-- ----------------------------------------------------------------------------
-- 6) Helper: am I educator/admin (owner of class or hunt) for a board?
-- ----------------------------------------------------------------------------
create or replace function public.qm_can_manage_board(p_board_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select
      public.is_admin()
      or b.owner_id = auth.uid()
      or (b.class_id is not null and exists(
            select 1 from public.qm_classes c
            where c.id = b.class_id and c.owner_id = auth.uid()))
      or (b.hunt_id is not null and exists(
            select 1 from public.qm_hunts h
            where h.id = b.hunt_id and h.owner_id = auth.uid()))
    from public.qm_boards b where b.id = p_board_id
  ), false);
$$;

-- Helper: am I a member of the class for a board?
create or replace function public.qm_is_class_member_for_board(p_board_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select exists (
      select 1 from public.qm_boards b
      join public.qm_class_members cm on cm.class_id = b.class_id
      where b.id = p_board_id
        and b.class_id is not null
        and cm.user_id = auth.uid()
    )
  ), false);
$$;

-- Helper: am I a member of the hunt's class (or hunt membership) for a board?
create or replace function public.qm_is_hunt_member_for_board(p_board_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select exists (
      select 1 from public.qm_boards b
      join public.qm_hunts h on h.id = b.hunt_id
      left join public.qm_memberships m
        on m.hunt_id = h.id and m.user_id = auth.uid()
      left join public.qm_class_members cm
        on cm.class_id = h.class_id and cm.user_id = auth.uid()
      where b.id = p_board_id
        and b.hunt_id is not null
        and (m.user_id is not null or cm.user_id is not null)
    )
  ), false);
$$;

-- Helper: which team_id does the current user belong to for a given board's hunt
create or replace function public.qm_my_team_for_board(p_board_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select tm.team_id
  from public.qm_boards b
  join public.qm_teams t on t.hunt_id = b.hunt_id
  join public.qm_team_members tm on tm.team_id = t.id
  where b.id = p_board_id
    and tm.user_id = auth.uid()
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- 7) Enable RLS
-- ----------------------------------------------------------------------------
alter table public.qm_boards            enable row level security;
alter table public.qm_intro_posts       enable row level security;
alter table public.qm_group_submissions enable row level security;

-- ----------------------------------------------------------------------------
-- 8) RLS: qm_boards
-- ----------------------------------------------------------------------------
drop policy if exists p_boards_select on public.qm_boards;
create policy p_boards_select on public.qm_boards for select using (
  public.is_admin()
  or owner_id = auth.uid()
  or (class_id is not null and exists(
        select 1 from public.qm_classes c where c.id = class_id and c.owner_id = auth.uid()))
  or (class_id is not null and exists(
        select 1 from public.qm_class_members cm where cm.class_id = qm_boards.class_id and cm.user_id = auth.uid()))
  or (hunt_id is not null and exists(
        select 1 from public.qm_hunts h where h.id = hunt_id and h.owner_id = auth.uid()))
  or (hunt_id is not null and exists(
        select 1 from public.qm_memberships m where m.hunt_id = qm_boards.hunt_id and m.user_id = auth.uid()))
  or (hunt_id is not null and exists(
        select 1 from public.qm_hunts h
        join public.qm_class_members cm on cm.class_id = h.class_id
        where h.id = qm_boards.hunt_id and cm.user_id = auth.uid()))
);

drop policy if exists p_boards_insert on public.qm_boards;
create policy p_boards_insert on public.qm_boards for insert with check (
  public.is_admin()
  or (
    owner_id = auth.uid()
    and (
      (class_id is not null and exists(
         select 1 from public.qm_classes c where c.id = class_id and c.owner_id = auth.uid()))
      or (hunt_id is not null and exists(
         select 1 from public.qm_hunts h where h.id = hunt_id and h.owner_id = auth.uid()))
    )
  )
);

drop policy if exists p_boards_update on public.qm_boards;
create policy p_boards_update on public.qm_boards for update using (
  public.is_admin() or owner_id = auth.uid()
  or (class_id is not null and exists(select 1 from public.qm_classes c where c.id = class_id and c.owner_id = auth.uid()))
  or (hunt_id is not null and exists(select 1 from public.qm_hunts h where h.id = hunt_id and h.owner_id = auth.uid()))
) with check (true);

drop policy if exists p_boards_delete on public.qm_boards;
create policy p_boards_delete on public.qm_boards for delete using (
  public.is_admin() or owner_id = auth.uid()
);

-- ----------------------------------------------------------------------------
-- 9) RLS: qm_intro_posts
-- ----------------------------------------------------------------------------
drop policy if exists p_intro_select on public.qm_intro_posts;
create policy p_intro_select on public.qm_intro_posts for select using (
  not is_hidden
  and (
    public.is_admin()
    or author_id = auth.uid()
    or public.qm_can_manage_board(board_id)
    or public.qm_is_class_member_for_board(board_id)
  )
);

drop policy if exists p_intro_insert on public.qm_intro_posts;
create policy p_intro_insert on public.qm_intro_posts for insert with check (
  author_id = auth.uid()
  and public.qm_is_class_member_for_board(board_id)
);

drop policy if exists p_intro_update on public.qm_intro_posts;
create policy p_intro_update on public.qm_intro_posts for update using (
  author_id = auth.uid() or public.qm_can_manage_board(board_id) or public.is_admin()
) with check (true);

drop policy if exists p_intro_delete on public.qm_intro_posts;
create policy p_intro_delete on public.qm_intro_posts for delete using (
  author_id = auth.uid() or public.qm_can_manage_board(board_id) or public.is_admin()
);

-- ----------------------------------------------------------------------------
-- 10) RLS: qm_group_submissions
-- ----------------------------------------------------------------------------
drop policy if exists p_subs_select on public.qm_group_submissions;
create policy p_subs_select on public.qm_group_submissions for select using (
  public.is_admin()
  or public.qm_can_manage_board(board_id)
  or public.qm_is_hunt_member_for_board(board_id)
);

drop policy if exists p_subs_insert on public.qm_group_submissions;
create policy p_subs_insert on public.qm_group_submissions for insert with check (
  submitted_by = auth.uid()
  and team_id = public.qm_my_team_for_board(board_id)
);

-- update: educator can grade; team member can edit their own (in_review/needs_revision)
drop policy if exists p_subs_update on public.qm_group_submissions;
create policy p_subs_update on public.qm_group_submissions for update using (
  public.is_admin()
  or public.qm_can_manage_board(board_id)
  or (
    team_id = public.qm_my_team_for_board(board_id)
    and status in ('in_review','needs_revision')
  )
) with check (true);

drop policy if exists p_subs_delete on public.qm_group_submissions;
create policy p_subs_delete on public.qm_group_submissions for delete using (
  public.is_admin() or public.qm_can_manage_board(board_id)
);

-- ----------------------------------------------------------------------------
-- 11) Auto-create Introduction Board when a new class is created
-- ----------------------------------------------------------------------------
create or replace function public.qm_auto_create_intro_board()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.qm_boards (board_type, class_id, title, description, layout_mode, owner_id)
  values (
    'introduction',
    new.id,
    coalesce(new.name, 'Class') || ' - Introduction Board',
    'Ice-breaking board: introduce yourself with a photo and short bio.',
    'grid',
    new.owner_id
  )
  on conflict (class_id, board_type) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_qm_class_create_intro_board on public.qm_classes;
create trigger trg_qm_class_create_intro_board
after insert on public.qm_classes
for each row execute function public.qm_auto_create_intro_board();

-- ----------------------------------------------------------------------------
-- 12) Auto-create Quest Submission Board when a new hunt (quest) is created
-- ----------------------------------------------------------------------------
create or replace function public.qm_auto_create_quest_board()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.qm_boards (board_type, hunt_id, title, description, layout_mode, owner_id)
  values (
    'quest_submission',
    new.id,
    coalesce(new.title, 'Quest') || ' - Submissions',
    'Group submission board for this quest.',
    'columns',
    new.owner_id
  );
  return new;
end;
$$;

drop trigger if exists trg_qm_hunt_create_quest_board on public.qm_hunts;
create trigger trg_qm_hunt_create_quest_board
after insert on public.qm_hunts
for each row execute function public.qm_auto_create_quest_board();

-- ----------------------------------------------------------------------------
-- 13) Backfill: create boards for existing classes & hunts
-- ----------------------------------------------------------------------------
insert into public.qm_boards (board_type, class_id, title, description, layout_mode, owner_id)
select 'introduction', c.id,
       coalesce(c.name,'Class') || ' - Introduction Board',
       'Ice-breaking board: introduce yourself with a photo and short bio.',
       'grid', c.owner_id
from public.qm_classes c
left join public.qm_boards b on b.class_id = c.id and b.board_type = 'introduction'
where b.id is null;

insert into public.qm_boards (board_type, hunt_id, title, description, layout_mode, owner_id)
select 'quest_submission', h.id,
       coalesce(h.title,'Quest') || ' - Submissions',
       'Group submission board for this quest.',
       'columns', h.owner_id
from public.qm_hunts h
left join public.qm_boards b on b.hunt_id = h.id and b.board_type = 'quest_submission'
where b.id is null;

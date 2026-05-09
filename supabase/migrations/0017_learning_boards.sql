-- ============================================================================
-- 0017_learning_boards.sql
-- Wakelet/Padlet-style Learning Boards: one per class, with columns and cards.
-- Phase 1: video (Adilo), link, image, text card types. No drag-reorder yet.
-- ============================================================================

-- 1) qm_learning_boards: one per class
create table if not exists public.qm_learning_boards (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null unique references public.qm_classes(id) on delete cascade,
  title text not null default 'Learning Board',
  description text,
  adilo_project_id text,         -- one Adilo project per class learning board
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qm_learning_boards_class on public.qm_learning_boards(class_id);

-- 2) qm_learning_columns: shelves like "Pengenalan", "Modul 1"
create table if not exists public.qm_learning_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.qm_learning_boards(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qm_learning_columns_board on public.qm_learning_columns(board_id, position);

-- 3) qm_learning_cards: items inside a column
create table if not exists public.qm_learning_cards (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references public.qm_learning_columns(id) on delete cascade,
  board_id uuid not null references public.qm_learning_boards(id) on delete cascade,
  position integer not null default 0,
  card_type text not null check (card_type in ('video','link','image','text')),
  title text,
  description text,
  -- video specific (Adilo)
  adilo_file_id text,
  adilo_project_id text,
  video_thumbnail_url text,
  video_duration_seconds integer,
  -- link specific (with OG metadata)
  link_url text,
  link_title text,
  link_description text,
  link_image_url text,
  link_site_name text,
  link_favicon_url text,
  -- image specific (Supabase Storage)
  image_url text,
  image_path text,
  -- audit
  created_by uuid not null references public.qm_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qm_learning_cards_column on public.qm_learning_cards(column_id, position);
create index if not exists idx_qm_learning_cards_board on public.qm_learning_cards(board_id);

-- 4) updated_at triggers (reuse existing public.tg_set_updated_at if available)
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'tg_set_updated_at') then
    create or replace function public.tg_set_updated_at()
    returns trigger language plpgsql as $f$
    begin
      new.updated_at = now();
      return new;
    end;
    $f$;
  end if;
end$$;

drop trigger if exists trg_qm_learning_boards_updated on public.qm_learning_boards;
create trigger trg_qm_learning_boards_updated before update on public.qm_learning_boards
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_qm_learning_columns_updated on public.qm_learning_columns;
create trigger trg_qm_learning_columns_updated before update on public.qm_learning_columns
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_qm_learning_cards_updated on public.qm_learning_cards;
create trigger trg_qm_learning_cards_updated before update on public.qm_learning_cards
for each row execute function public.tg_set_updated_at();

-- 5) Row Level Security
alter table public.qm_learning_boards  enable row level security;
alter table public.qm_learning_columns enable row level security;
alter table public.qm_learning_cards   enable row level security;

-- ---- qm_learning_boards policies ----------------------------------------
drop policy if exists qm_lb_select on public.qm_learning_boards;
create policy qm_lb_select on public.qm_learning_boards for select
using (
  exists (select 1 from public.qm_classes c
          where c.id = qm_learning_boards.class_id and c.owner_id = auth.uid())
  or exists (select 1 from public.qm_class_members cm
             where cm.class_id = qm_learning_boards.class_id and cm.user_id = auth.uid())
);

drop policy if exists qm_lb_insert on public.qm_learning_boards;
create policy qm_lb_insert on public.qm_learning_boards for insert
with check (
  exists (select 1 from public.qm_classes c
          where c.id = qm_learning_boards.class_id and c.owner_id = auth.uid())
);

drop policy if exists qm_lb_update on public.qm_learning_boards;
create policy qm_lb_update on public.qm_learning_boards for update
using (
  exists (select 1 from public.qm_classes c
          where c.id = qm_learning_boards.class_id and c.owner_id = auth.uid())
)
with check (
  exists (select 1 from public.qm_classes c
          where c.id = qm_learning_boards.class_id and c.owner_id = auth.uid())
);

drop policy if exists qm_lb_delete on public.qm_learning_boards;
create policy qm_lb_delete on public.qm_learning_boards for delete
using (
  exists (select 1 from public.qm_classes c
          where c.id = qm_learning_boards.class_id and c.owner_id = auth.uid())
);

-- ---- qm_learning_columns policies ---------------------------------------
drop policy if exists qm_lc_select on public.qm_learning_columns;
create policy qm_lc_select on public.qm_learning_columns for select
using (
  exists (
    select 1 from public.qm_learning_boards lb
    join public.qm_classes c on c.id = lb.class_id
    where lb.id = qm_learning_columns.board_id
      and (c.owner_id = auth.uid()
           or exists (select 1 from public.qm_class_members cm
                      where cm.class_id = c.id and cm.user_id = auth.uid()))
  )
);

drop policy if exists qm_lc_modify on public.qm_learning_columns;
create policy qm_lc_modify on public.qm_learning_columns for all
using (
  exists (
    select 1 from public.qm_learning_boards lb
    join public.qm_classes c on c.id = lb.class_id
    where lb.id = qm_learning_columns.board_id and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.qm_learning_boards lb
    join public.qm_classes c on c.id = lb.class_id
    where lb.id = qm_learning_columns.board_id and c.owner_id = auth.uid()
  )
);

-- ---- qm_learning_cards policies -----------------------------------------
drop policy if exists qm_lcard_select on public.qm_learning_cards;
create policy qm_lcard_select on public.qm_learning_cards for select
using (
  exists (
    select 1 from public.qm_learning_boards lb
    join public.qm_classes c on c.id = lb.class_id
    where lb.id = qm_learning_cards.board_id
      and (c.owner_id = auth.uid()
           or exists (select 1 from public.qm_class_members cm
                      where cm.class_id = c.id and cm.user_id = auth.uid()))
  )
);

drop policy if exists qm_lcard_modify on public.qm_learning_cards;
create policy qm_lcard_modify on public.qm_learning_cards for all
using (
  exists (
    select 1 from public.qm_learning_boards lb
    join public.qm_classes c on c.id = lb.class_id
    where lb.id = qm_learning_cards.board_id and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.qm_learning_boards lb
    join public.qm_classes c on c.id = lb.class_id
    where lb.id = qm_learning_cards.board_id and c.owner_id = auth.uid()
  )
);

-- 6) Storage bucket for image cards (idempotent)
insert into storage.buckets (id, name, public)
values ('learning-cards', 'learning-cards', true)
on conflict (id) do nothing;

-- Storage policies for image cards
drop policy if exists qm_lc_storage_read on storage.objects;
create policy qm_lc_storage_read on storage.objects for select
using (bucket_id = 'learning-cards');

drop policy if exists qm_lc_storage_write on storage.objects;
create policy qm_lc_storage_write on storage.objects for insert
with check (
  bucket_id = 'learning-cards' and auth.uid() is not null
);

drop policy if exists qm_lc_storage_delete on storage.objects;
create policy qm_lc_storage_delete on storage.objects for delete
using (
  bucket_id = 'learning-cards' and auth.uid() is not null
);

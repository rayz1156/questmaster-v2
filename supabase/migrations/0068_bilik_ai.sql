-- 0068_bilik_ai.sql: Bilik AI fasa 1 (KZ-033).
--
-- Sembang kelas masa nyata + "Tanya AI" melalui OpenRouter. Lima jadual
-- baharu `qm_ai_*`; tiada jadual sedia ada diubah. Semua akses pengguna
-- melalui laluan API Next.js yang menyemak kebenaran terlebih dahulu dan
-- kemudian bekerja dengan service role; RLS diaktifkan tanpa polisi
-- supaya PostgREST (anon/authenticated) tidak melihat apa-apa.
--
-- Dijalankan oleh CTO di VPS:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     < supabase/migrations/0068_bilik_ai.sql
--
-- Ujian berkanun: supabase/tests/KZ-033.sql (BEGIN ... ROLLBACK).

-- ============================================================
-- 1. qm_ai_models: senarai kecil model yang didayakan untuk dipilih
--    dalam bilik. `model_id` OpenRouter bukan rahsia (id awam).
-- ============================================================
create table if not exists public.qm_ai_models (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'openrouter'
    check (provider in ('openrouter')),
  model_id text not null unique,
  label text not null,
  enabled boolean not null default true,
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Indeks unik separa: paling banyak satu baris `is_default = true`.
create unique index if not exists qm_ai_models_satu_lalai_uniq
  on public.qm_ai_models (is_default) where is_default;

-- Benih fasa 1: murah dan pantas sebagai lalai, dua Claude.
insert into public.qm_ai_models (model_id, label, enabled, is_default, sort_order) values
  ('deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash (pantas, jimat)', true,  true,  1),
  ('anthropic/claude-haiku-5.5', 'Claude Haiku 5.5',                 true,  false, 2),
  ('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5 (kuat, mahal)',  false, false, 3)
on conflict (model_id) do nothing;

-- ============================================================
-- 2. qm_ai_rooms: satu bilik sembang dalam satu kelas.
-- ============================================================
create table if not exists public.qm_ai_rooms (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.qm_classes(id) on delete cascade,
  created_by uuid not null references public.qm_profiles(id),
  title text not null check (char_length(title) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  join_code text not null unique
    check (join_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
  model_id uuid references public.qm_ai_models(id),
  ai_enabled boolean not null default true,
  context_enabled boolean not null default true,
  context_window int not null default 20 check (context_window between 0 and 50),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qm_ai_rooms_kelas_idx on public.qm_ai_rooms (class_id);

-- ============================================================
-- 3. qm_ai_room_members: kehadiran guru dan pelajar. Kunci komposit;
--    `muted` dipertahankan oleh upsert laluan, `role` dikira semula
--    oleh laluan setiap kali (pelayan, bukan klien).
-- ============================================================
create table if not exists public.qm_ai_room_members (
  room_id uuid not null references public.qm_ai_rooms(id) on delete cascade,
  user_id uuid not null references public.qm_profiles(id) on delete cascade,
  role text not null check (role in ('teacher','student')),
  muted boolean not null default false,
  last_seen_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- ============================================================
-- 4. qm_ai_messages: mesej manusia, AI dan sistem. `seq` identiti
--    menaik untuk peninjauan klien (`seq > after`).
-- ============================================================
create table if not exists public.qm_ai_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  room_id uuid not null references public.qm_ai_rooms(id) on delete cascade,
  author_kind text not null check (author_kind in ('human','ai','system')),
  author_id uuid references public.qm_profiles(id) on delete set null,
  asked_by uuid references public.qm_profiles(id) on delete set null,
  reply_to uuid references public.qm_ai_messages(id) on delete set null,
  body text not null default '' check (char_length(body) <= 20000),
  ai_status text check (
    ai_status is null or ai_status in ('queued','streaming','complete','error','stopped')
  ),
  model_label text,
  deleted_at timestamptz,
  deleted_by uuid references public.qm_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Mesej AI mesti membawa ai_status; mesej bukan AI tidak boleh
  -- membawanya (human dan sistem tiada keadaan strim).
  constraint qm_ai_messages_status_mengikut_jenis_chk check (
    (author_kind = 'ai' and ai_status is not null)
    or (author_kind <> 'ai' and ai_status is null)
  )
);

create index if not exists qm_ai_messages_bilik_seq_idx
  on public.qm_ai_messages (room_id, seq);
create index if not exists qm_ai_messages_bilik_updated_idx
  on public.qm_ai_messages (room_id, updated_at);

-- ============================================================
-- 5. qm_ai_usage: kuota harian per (pengguna, bilik) dan rekod kos.
--    `user_id` sengaja tanpa FK: baris ini terusar untuk audit kos
--    selepas profil dipadam. Hari ikut zon Asia/Kuala_Lumpur.
-- ============================================================
create table if not exists public.qm_ai_usage (
  user_id uuid not null,
  room_id uuid not null references public.qm_ai_rooms(id) on delete cascade,
  day date not null,
  asks int not null default 0,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  primary key (user_id, room_id, day)
);

-- ============================================================
-- 6. RLS pada kelima-lima jadual: aktif TANPA polisi untuk
--    anon/authenticated. Semua akses melalui laluan API (service
--    role), kebenaran disemak dalam laluan sebelum sebarang
--    bacaan/tulisan, corak sama seperti qm_live_* (migrasi 0017).
-- ============================================================
alter table public.qm_ai_models enable row level security;
alter table public.qm_ai_rooms enable row level security;
alter table public.qm_ai_room_members enable row level security;
alter table public.qm_ai_messages enable row level security;
alter table public.qm_ai_usage enable row level security;

revoke all on public.qm_ai_models from anon, authenticated;
revoke all on public.qm_ai_rooms from anon, authenticated;
revoke all on public.qm_ai_room_members from anon, authenticated;
revoke all on public.qm_ai_messages from anon, authenticated;
revoke all on public.qm_ai_usage from anon, authenticated;

-- ============================================================
-- 7. Fungsi kuota. Hanya service_role boleh memanggil kedua-duanya
--    (REVOKE + GRANT di bawah); oleh itu TIADA semakan auth.uid()
--    dalam badan fungsi: parameter p_user sentiasa ditulis oleh
--    laluan API yang sudah menyahkan Bearer pengguna.
-- ============================================================

-- Rizab satu tanya AI hari ini, secara atomik. Pulangkan:
--   'OK'       kuota diluluskan dan sudah ditambah;
--   'USER_CAP' pengguna sudah mencapai had hariannya;
--   'ROOM_CAP' bilik sudah mencapai jumlah had harian.
create or replace function public.qm_ai_reserve_ask(
  p_user uuid,
  p_room uuid,
  p_user_cap int,
  p_room_cap int
) returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_day date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_user_asks int;
  v_room_asks int;
begin
  -- Kunci penasihat transaksi pada (bilik, hari): setiap reserve_ask
  -- untuk bilik yang sama pada hari yang sama diserialkan. Ini penting
  -- pada hari baharu apabila tiada lagi baris untuk dikunci FOR UPDATE
  -- dan dua pengguna pertama boleh berlumba.
  perform pg_advisory_xact_lock(
    hashtext('qm_ai_ask:' || p_room::text || ':' || v_day::text)
  );

  -- Baris pengguna hari ini (no-op update untuk mengunci baris).
  insert into public.qm_ai_usage (user_id, room_id, day, asks)
  values (p_user, p_room, v_day, 0)
  on conflict (user_id, room_id, day)
  do update set asks = public.qm_ai_usage.asks;

  select asks into v_user_asks
    from public.qm_ai_usage
    where user_id = p_user and room_id = p_room and day = v_day;

  select coalesce(sum(asks), 0) into v_room_asks
    from public.qm_ai_usage
    where room_id = p_room and day = v_day;

  if v_user_asks >= p_user_cap then
    return 'USER_CAP';
  end if;
  if v_room_asks >= p_room_cap then
    return 'ROOM_CAP';
  end if;

  update public.qm_ai_usage
    set asks = asks + 1
    where user_id = p_user and room_id = p_room and day = v_day;

  return 'OK';
end
$fn$;

-- Tambah token yang dilaporkan penyedia ke baris hari ini.
create or replace function public.qm_ai_add_tokens(
  p_user uuid,
  p_room uuid,
  p_prompt int,
  p_completion int
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_day date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  insert into public.qm_ai_usage (user_id, room_id, day, prompt_tokens, completion_tokens)
  values (
    p_user, p_room, v_day,
    greatest(coalesce(p_prompt, 0), 0),
    greatest(coalesce(p_completion, 0), 0)
  )
  on conflict (user_id, room_id, day)
  do update set
    prompt_tokens = public.qm_ai_usage.prompt_tokens + excluded.prompt_tokens,
    completion_tokens = public.qm_ai_usage.completion_tokens + excluded.completion_tokens;
end
$fn$;

revoke all on function public.qm_ai_reserve_ask(uuid, uuid, int, int)
  from public, anon, authenticated;
grant execute on function public.qm_ai_reserve_ask(uuid, uuid, int, int)
  to service_role;

revoke all on function public.qm_ai_add_tokens(uuid, uuid, int, int)
  from public, anon, authenticated;
grant execute on function public.qm_ai_add_tokens(uuid, uuid, int, int)
  to service_role;

-- Pastikan PostgREST melihat jadual baharu.
notify pgrst, 'reload schema';
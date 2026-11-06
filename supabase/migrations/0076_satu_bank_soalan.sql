-- 0076_satu_bank_soalan.sql
-- KZ-045: satu bank soalan. Kuiz (Live Quiz) menjadi bank tunggal; Arena
-- menjadi "cara main".
--
-- qm_live_questions dilanjutkan untuk 6 jenis soalan Arena. Enjin Live
-- (klasik, lumba, raksasa) hanya memainkan soalan serasi Live: qtype dalam
-- ('multiple','ox') dengan TEPAT satu jawapan betul (correct_key <> '').
-- Fungsi yang MEMILIH soalan untuk dimainkan ditapis di bawah; salinan
-- definisi diambil daripada migrasi terakhir yang menulisnya (0058, 0060)
-- dan hanya pertanyaan pemilihan soalan diubah.
--
-- Set sedia ada qm_arena_sets disalin ke bank Kuiz oleh fungsi
-- qm_arena_copy_sets (idempoten; dipanggil sekali di hujung migrasi ini dan
-- oleh supabase/tests/KZ-045.sql dua kali).
--
-- Idempoten: setiap alter dibungkus if not exists / add column if not exists.
-- Tiada drop jadual, tiada perubahan data sedia ada selain menanda salinan.
-- NOTA: mengikut peraturan pasukan, fail ini tidak mengandungi BEGIN/COMMIT
-- (corak 0067 dan 0075); "satu transaksi" dicapai dengan satu larian psql.

-- ============================================================ 1. qm_live_questions
alter table public.qm_live_questions
  add column if not exists qtype text not null default 'multiple'
    check (qtype in ('multiple','subjective','ox','essay','match','order')),
  add column if not exists data jsonb,
  add column if not exists hint jsonb;

-- Longgarkan semakan options: baris bukan multiple/ox boleh options '[]' dan
-- correct_key ''. Nama kekangan dicari melalui pg_constraint, jangan teka.
do $$
declare
  v_nama text;
begin
  select c.conname into v_nama
    from pg_constraint c
   where c.conrelid = 'public.qm_live_questions'::regclass
     and c.contype = 'c'
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.conrelid
          and a.attname = 'options'
          and a.attnum = any(c.conkey)
     )
   order by c.conname
   limit 1;
  if v_nama is not null then
    execute format('alter table public.qm_live_questions drop constraint %I', v_nama);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'qm_live_questions_options_qtype_check'
       and conrelid = 'public.qm_live_questions'::regclass
  ) then
    alter table public.qm_live_questions
      add constraint qm_live_questions_options_qtype_check
      check (
        (qtype in ('multiple','ox') and jsonb_array_length(options) between 2 and 6)
        or (qtype not in ('multiple','ox'))
      );
  end if;
end $$;

-- ============================================================ 2. qm_arena_sessions
alter table public.qm_arena_sessions
  add column if not exists quiz_id uuid
    references public.qm_live_quizzes(id) on delete cascade;

-- set_id menjadi boleh null: sesi baharu memakan soalan daripada bank Kuiz.
alter table public.qm_arena_sessions alter column set_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'qm_arena_sessions_sumber_check'
       and conrelid = 'public.qm_arena_sessions'::regclass
  ) then
    alter table public.qm_arena_sessions
      add constraint qm_arena_sessions_sumber_check
      check ((set_id is not null) or (quiz_id is not null));
  end if;
end $$;

-- Paparan baharu: pulau (Pulau Harta Karun, KZ-047) dan hantu (Kejar Hantu,
-- KZ-048). Nama kekangan sedia ada dicari melalui pg_constraint.
do $$
declare
  v_nama text;
begin
  select c.conname into v_nama
    from pg_constraint c
   where c.conrelid = 'public.qm_arena_sessions'::regclass
     and c.contype = 'c'
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.conrelid
          and a.attname = 'view'
          and a.attnum = any(c.conkey)
     )
   order by c.conname
   limit 1;
  if v_nama is not null then
    execute format('alter table public.qm_arena_sessions drop constraint %I', v_nama);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'qm_arena_sessions_view_check'
       and conrelid = 'public.qm_arena_sessions'::regclass
  ) then
    alter table public.qm_arena_sessions
      add constraint qm_arena_sessions_view_check
      check (view in ('list','map','pulau','hantu'));
  end if;
end $$;

-- ============================================================ 3. qm_arena_players
alter table public.qm_arena_players
  add column if not exists user_id uuid
    references public.qm_profiles(id) on delete set null;

-- ============================================================ 4. qm_arena_answers
alter table public.qm_arena_answers
  add column if not exists live_question_id uuid
    references public.qm_live_questions(id) on delete cascade;

alter table public.qm_arena_answers alter column question_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'qm_arena_answers_sumber_check'
       and conrelid = 'public.qm_arena_answers'::regclass
  ) then
    alter table public.qm_arena_answers
      add constraint qm_arena_answers_sumber_check
      check ((question_id is not null) or (live_question_id is not null));
  end if;
end $$;

-- Satu jawapan setiap soalan kuiz, selari kekangan (player_id, question_id).
create unique index if not exists qm_arena_answers_player_live_question_key
  on public.qm_arena_answers (player_id, live_question_id)
  where live_question_id is not null;

-- ============================================================ 5. penanda salinan set
alter table public.qm_arena_sets
  add column if not exists live_quiz_id uuid;

-- ============================================================ 6. fungsi salinan set
-- Salin setiap qm_arena_sets (yang belum disalin) ke qm_live_quizzes dan
-- setiap qm_arena_questions ke qm_live_questions. Idempoten: set yang sudah
-- ada live_quiz_id dilangkau. Pemetaan jenis:
--   multiple satu jawapan betul: options dari choiceList, correct_key kunci
--     betul, data null;
--   multiple banyak jawapan: options juga diisi, correct_key '', data asal;
--   ox: options O/Betul X/Salah, correct_key huruf besar, data null;
--   subjective/essay/match/order: options '[]', correct_key '', data asal.
create or replace function public.qm_arena_copy_sets()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_kuiz uuid;
begin
  for r in select * from qm_arena_sets where live_quiz_id is null order by created_at loop
    insert into qm_live_quizzes (class_id, owner_id, title, description)
    values (null, r.owner_id, r.title, r.description)
    returning id into v_kuiz;

    update qm_arena_sets set live_quiz_id = v_kuiz where id = r.id;

    insert into qm_live_questions
      (quiz_id, order_idx, prompt, options, correct_key, data, hint, points, time_limit_sec, qtype)
    select
      v_kuiz,
      q.order_idx,
      q.prompt,
      case
        when q.type = 'ox' then '[{"key":"O","text":"Betul"},{"key":"X","text":"Salah"}]'::jsonb
        when q.type = 'multiple' then (
          select coalesce(jsonb_agg(jsonb_build_object('key', c->>'key', 'text', c->>'text')
                    order by ord), '[]'::jsonb)
            from jsonb_array_elements(q.data->'choiceList') with ordinality as x(c, ord)
        )
        else '[]'::jsonb
      end,
      case
        when q.type = 'ox' then upper(q.data->>'answer')
        when q.type = 'multiple' and (
          select count(*) from jsonb_array_elements(q.data->'choiceList') c
            where (c->>'isAnswer')::boolean
        ) = 1 then (
          select c->>'key'
            from jsonb_array_elements(q.data->'choiceList') c
           where (c->>'isAnswer')::boolean
           limit 1
        )
        else ''
      end,
      case
        when q.type = 'multiple' and (
          select count(*) from jsonb_array_elements(q.data->'choiceList') c
            where (c->>'isAnswer')::boolean
        ) = 1 then null
        else q.data
      end,
      q.hint,
      q.points,
      q.time_limit_sec,
      q.type
    from qm_arena_questions q
   where q.set_id = r.id
   order by q.order_idx, q.created_at;
  end loop;
end $$;

revoke all on function public.qm_arena_copy_sets() from public, anon, authenticated;
grant execute on function public.qm_arena_copy_sets() to service_role;

-- Jalankan salinan sekarang (set sedia ada di produksi: 1 set).
select public.qm_arena_copy_sets();

-- ============================================================ 7. enjin Live menapis
-- soalan tidak serasi. Definisi disalin TEPAT daripada migrasi terakhir yang
-- menulis fungsi berken; hanya pertanyaan pemilihan soalan ditambah penapis
-- "and qtype in ('multiple','ox') and correct_key <> ''".
-- security definer, search_path dan geran kekal sama.

-- qm_race_serve: salinan 0058:80, baris gilir diisi hanya dengan soalan
-- serasi Live.
create or replace function public.qm_race_serve(p_player uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_quiz uuid; v_queue uuid[]; v_prev uuid; v_q uuid;
begin
  select s.quiz_id, p.race_queue, p.race_question_id
    into v_quiz, v_queue, v_prev
    from qm_live_players p join qm_live_sessions s on s.id = p.session_id
   where p.id = p_player;
  if coalesce(array_length(v_queue, 1), 0) = 0 then
    select coalesce(array_agg(id order by random()), '{}') into v_queue
      from qm_live_questions
     where quiz_id = v_quiz
       and qtype in ('multiple','ox')
       and correct_key <> '';
    if array_length(v_queue, 1) > 1 and v_queue[1] = v_prev then
      v_queue := v_queue[2:2] || v_queue[1:1] || v_queue[3:];
    end if;
  end if;
  v_q := v_queue[1];
  update qm_live_players
     set race_queue = coalesce(v_queue[2:], '{}'),
         race_question_id = v_q,
         race_served_at = now()
   where id = p_player;
  return v_q;
end $$;

-- qm_race_start: salinan 0058:106, kiraan soalan hanya soalan serasi Live
-- (kuiz yang tiada soalan serasi tidak boleh dilumba).
create or replace function public.qm_race_start(p_session uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_ends timestamptz; v_n int; r record;
begin
  select count(*) into v_n from qm_live_questions q
    join qm_live_sessions s on s.quiz_id = q.quiz_id
   where s.id = p_session
     and q.qtype in ('multiple','ox')
     and q.correct_key <> '';
  if v_n < 1 then
    raise exception 'This quiz has no questions.' using errcode = 'RACE1';
  end if;
  update qm_live_sessions
     set status = 'asking', current_index = 0, question_started_at = now(),
         race_ends_at = now() + make_interval(mins => race_minutes), race_finished = 0
   where id = p_session and game_mode = 'race' and status = 'lobby'
  returning race_ends_at into v_ends;
  if v_ends is null then
    raise exception 'The race is not in the lobby.' using errcode = 'RACE2';
  end if;
  for r in select id from qm_live_players where session_id = p_session loop
    update qm_live_players
       set race_distance = 0, race_wrong = 0, race_frozen_until = null, race_rank = null,
           race_finished_at = null, race_queue = '{}', race_question_id = null,
           score = 0, total_ms = 0, streak = 0, best_streak = 0
     where id = r.id;
    perform qm_race_serve(r.id);
  end loop;
  return v_ends;
end $$;

-- qm_boss_start: salinan 0060:75, kiraan soalan hanya soalan serasi Live.
create or replace function public.qm_boss_start(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s qm_live_sessions%rowtype; v_n int; v_q int; v_hp int; r record;
begin
  select * into s from qm_live_sessions where id = p_session for update;
  if not found or s.game_mode <> 'boss' then
    raise exception 'This session is not a Boss Battle.' using errcode = 'BOSS4';
  end if;
  if s.status <> 'lobby' then
    raise exception 'The battle is not in the lobby.' using errcode = 'BOSS2';
  end if;
  select count(*) into v_q from qm_live_questions
   where quiz_id = s.quiz_id
     and qtype in ('multiple','ox')
     and correct_key <> '';
  if v_q < 1 then
    raise exception 'This quiz has no questions.' using errcode = 'BOSS1';
  end if;
  select count(*) into v_n from qm_live_players where session_id = p_session;
  if v_n < 1 then
    raise exception 'Nobody has joined yet.' using errcode = 'BOSS3';
  end if;
  v_hp := greatest(1, v_n * s.race_minutes * s.boss_k);
  update qm_live_sessions
     set status = 'asking', current_index = 0, question_started_at = now(),
         race_ends_at = now() + make_interval(mins => race_minutes),
         boss_max_hp = v_hp, boss_hp = v_hp, boss_crits = 0, boss_healed = 0,
         boss_last_hit = null, boss_result = null, review_index = -1, review_revealed = false
   where id = p_session;
  for r in select id from qm_live_players where session_id = p_session loop
    update qm_live_players
       set race_wrong = 0, race_frozen_until = null, race_queue = '{}', race_question_id = null,
           score = 0, total_ms = 0, streak = 0, best_streak = 0, boss_damage = 0
     where id = r.id;
    perform qm_race_serve(r.id);
  end loop;
  return jsonb_build_object('maxHp', v_hp, 'endsAt', (select race_ends_at from qm_live_sessions where id = p_session));
end $$;

-- Geran kekal seperti sebelum ini (create or replace mengekalkan geran sedia
-- ada; nyatakan semula supaya niat jelas).
revoke all on function public.qm_race_serve(uuid) from public, anon, authenticated;
revoke all on function public.qm_race_start(uuid) from public, anon, authenticated;
revoke all on function public.qm_boss_start(uuid) from public, anon, authenticated;
grant execute on function public.qm_race_serve(uuid) to service_role;
grant execute on function public.qm_race_start(uuid) to service_role;
grant execute on function public.qm_boss_start(uuid) to service_role;

notify pgrst, 'reload schema';

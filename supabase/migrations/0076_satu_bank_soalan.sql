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

-- ---------------------------------------------------------------------------
-- Pembetulan PM: qm_insights_kelas (0051) hanya mengira soalan yang dimainkan
-- enjin Live. Salinan TEPAT definisi production (pg_get_functiondef, 7 Nov
-- 2026) dengan penapis serasi pada CTE mata_kuiz dan soalan_kelas, supaya
-- jumlah markah kuiz (penyebut peratus) tidak termasuk soalan jenis Arena
-- yang tidak dimainkan dalam Live.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_insights_kelas(p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_class_id IS NULL THEN
    RAISE EXCEPTION 'class_id required';
  END IF;

  IF NOT public.qm_boleh_urus_insights(p_class_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH ahli AS (
    SELECT cm.user_id AS uid_ahli, p.display_name AS nama, cm.joined_at AS sertai
    FROM public.qm_class_members cm
    JOIN public.qm_profiles p ON p.id = cm.user_id
    WHERE cm.class_id = p_class_id
  ),
  markah AS (
    SELECT s.user_id AS uid, s.task_score, s.live_score, s.adjustment_score,
           s.total_score, s.live_sessions
    FROM public.qm_class_individual_scores s
    WHERE s.class_id = p_class_id
  ),
  sesi_kelas AS (
    SELECT ls.id AS sesi, ls.quiz_id AS kuiz, ls.status AS status_sesi
    FROM public.qm_live_sessions ls
    JOIN public.qm_live_quizzes lq ON lq.id = ls.quiz_id
    WHERE lq.class_id = p_class_id
  ),
  mata_kuiz AS (
    SELECT q.quiz_id AS kuiz, SUM(q.points) AS jumlah
    FROM public.qm_live_questions q
    WHERE q.qtype IN ('multiple','ox') AND q.correct_key <> ''
    GROUP BY q.quiz_id
  ),
  pemain AS (
    SELECT lp.user_id AS uid, lp.session_id AS sesi, lp.score,
           lp.joined_at AS main_pada, sk.kuiz, sk.status_sesi
    FROM public.qm_live_players lp
    JOIN sesi_kelas sk ON sk.sesi = lp.session_id
    WHERE lp.user_id IS NOT NULL
  ),
  -- quiz_title dan session_ended_at ialah medan tambahan untuk tajuk lajur
  -- eksport CSV trend; empat medan wajib (session_id, played_at, score, pct)
  -- kekal pada kedudukan pertama.
  trend AS (
    SELECT pe.uid AS uid, pe.sesi AS sesi, pe.main_pada AS played_at,
           pe.score AS score,
           CASE WHEN mk.jumlah IS NULL OR mk.jumlah = 0 THEN NULL
                ELSE ROUND(100.0 * pe.score / mk.jumlah, 1) END AS pct,
           lq3.title AS quiz_title,
           ls3.ended_at AS session_ended_at
    FROM pemain pe
    JOIN public.qm_live_sessions ls3 ON ls3.id = pe.sesi
    JOIN public.qm_live_quizzes lq3 ON lq3.id = pe.kuiz
    LEFT JOIN mata_kuiz mk ON mk.kuiz = pe.kuiz
    WHERE pe.status_sesi = 'ended'
  ),
  trend_json AS (
    SELECT t3.uid AS uid,
           COALESCE(jsonb_agg(
             jsonb_build_object(
               'session_id', t3.sesi,
               'played_at', t3.played_at,
               'score', t3.score,
               'pct', t3.pct,
               'quiz_title', t3.quiz_title,
               'session_ended_at', t3.session_ended_at
             ) ORDER BY t3.played_at, t3.sesi
           ), '[]'::jsonb) AS data
    FROM trend t3
    GROUP BY t3.uid
  ),
  jawapan AS (
    SELECT lp.user_id AS uid,
           COUNT(*) AS answered,
           COUNT(*) FILTER (WHERE la.is_correct) AS correct,
           AVG(la.ms_taken) AS avg_ms
    FROM public.qm_live_answers la
    JOIN public.qm_live_players lp ON lp.id = la.player_id
    JOIN sesi_kelas sk ON sk.sesi = la.session_id
    WHERE lp.user_id IS NOT NULL
    GROUP BY lp.user_id
  ),
  hantar AS (
    SELECT s.user_id AS uid,
           COUNT(*) FILTER (WHERE s.status = 'approved') AS approved,
           COUNT(*) FILTER (WHERE s.status = 'pending')  AS pending,
           COUNT(*) FILTER (WHERE s.status = 'rejected') AS rejected,
           MIN(s.created_at) FILTER (WHERE s.status = 'pending') AS pending_lama
    FROM public.qm_submissions s
    JOIN public.qm_challenges ch ON ch.id = s.challenge_id
    JOIN public.qm_hunts h ON h.id = ch.hunt_id
    WHERE h.class_id = p_class_id
    GROUP BY s.user_id
  ),
  terakhir AS (
    SELECT ta.user_id AS uid, ta.last_active
    FROM public.qm_aktiviti_terakhir_ahli(p_class_id) ta
  ),
  pasukan_ahli AS (
    SELECT tm.user_id AS uid, tm.team_id,
           ROW_NUMBER() OVER (PARTITION BY tm.user_id ORDER BY t.created_at, t.id) AS rn
    FROM public.qm_team_members tm
    JOIN public.qm_teams t ON t.id = tm.team_id
    WHERE t.class_id = p_class_id
  ),
  sempit AS (
    SELECT COUNT(*) AS bil_ahli,
           percentile_cont(0.2) WITHIN GROUP (ORDER BY COALESCE(mk.total_score, 0)) AS p20,
           ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(mk.total_score, 0))::numeric, 1) AS median_total,
           ROUND(AVG(COALESCE(mk.total_score, 0))::numeric, 1) AS avg_total
    FROM ahli a
    LEFT JOIN markah mk ON mk.uid = a.uid_ahli
  ),
  ada_sesi_ended AS (
    SELECT EXISTS (SELECT 1 FROM sesi_kelas sk WHERE sk.status_sesi = 'ended') AS ada
  ),
  trend_penuh AS (
    SELECT t4.uid AS uid, t4.pct AS pct,
           ROW_NUMBER() OVER (PARTITION BY t4.uid ORDER BY t4.played_at, t4.sesi) AS rn,
           COUNT(*) OVER (PARTITION BY t4.uid) AS bil_sesi
    FROM trend t4
  ),
  purata AS (
    SELECT tp.uid AS uid,
           MAX(tp.bil_sesi) AS bil_sesi,
           AVG(tp.pct) FILTER (WHERE tp.rn > tp.bil_sesi - 3) AS akhir3,
           AVG(tp.pct) FILTER (WHERE tp.rn <= tp.bil_sesi - 3) AS dahulu
    FROM trend_penuh tp
    GROUP BY tp.uid
  ),
  pelajar AS (
    SELECT
      a.uid_ahli AS user_id,
      a.nama AS name,
      COALESCE(mk.task_score, 0) AS task_score,
      COALESCE(mk.live_score, 0) AS live_score,
      COALESCE(mk.adjustment_score, 0) AS adjustment_score,
      COALESCE(mk.total_score, 0) AS total_score,
      -- RANK tanpa pemutus seri supaya markah sama berkongsi kedudukan.
      RANK() OVER (ORDER BY COALESCE(mk.total_score, 0) DESC) AS rank,
      COALESCE(mk.live_sessions, 0) AS live_sessions,
      COALESCE(jw.answered, 0) AS answered,
      COALESCE(jw.correct, 0) AS correct,
      CASE WHEN COALESCE(jw.answered, 0) > 0
           THEN ROUND(100.0 * jw.correct / jw.answered, 1) END AS accuracy_pct,
      CASE WHEN COALESCE(jw.answered, 0) > 0
           THEN ROUND(jw.avg_ms::numeric, 1) END AS avg_ms,
      COALESCE(hn.approved, 0) AS approved,
      COALESCE(hn.pending, 0)  AS pending,
      COALESCE(hn.rejected, 0) AS rejected,
      tk.last_active AS last_active,
      pa.team_id AS team_id,
      t2.name AS team_name
    FROM ahli a
    LEFT JOIN markah mk ON mk.uid = a.uid_ahli
    LEFT JOIN jawapan jw ON jw.uid = a.uid_ahli
    LEFT JOIN hantar hn ON hn.uid = a.uid_ahli
    LEFT JOIN terakhir tk ON tk.uid = a.uid_ahli
    LEFT JOIN pasukan_ahli pa ON pa.uid = a.uid_ahli AND pa.rn = 1
    LEFT JOIN public.qm_teams t2 ON t2.id = pa.team_id
  ),
  students_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'user_id', pl.user_id,
        'name', pl.name,
        'task_score', pl.task_score,
        'live_score', pl.live_score,
        'adjustment_score', pl.adjustment_score,
        'total_score', pl.total_score,
        'rank', pl.rank,
        'live_sessions', pl.live_sessions,
        'answered', pl.answered,
        'correct', pl.correct,
        'accuracy_pct', pl.accuracy_pct,
        'avg_ms', pl.avg_ms,
        'approved', pl.approved,
        'pending', pl.pending,
        'rejected', pl.rejected,
        'last_active', pl.last_active,
        'team_id', pl.team_id,
        'team_name', pl.team_name,
        'trend', COALESCE(tj.data, '[]'::jsonb),
        'flags', to_jsonb(ARRAY_REMOVE(ARRAY[
          CASE WHEN sp.bil_ahli >= 5 AND sp.p20 IS NOT NULL
                    AND pl.total_score <= sp.p20 THEN 'bottom_20' END,
          CASE WHEN pu.bil_sesi >= 4 AND pu.akhir3 IS NOT NULL AND pu.dahulu IS NOT NULL
                    AND pu.akhir3 <= pu.dahulu - 15 THEN 'declining' END,
          CASE WHEN pl.last_active < now() - interval '7 days' THEN 'inactive_7d' END,
          CASE WHEN ase.ada AND NOT EXISTS
                    (SELECT 1 FROM pemain pe WHERE pe.uid = pl.user_id) THEN 'never_live' END,
          CASE WHEN hn2.pending_lama IS NOT NULL
                    AND hn2.pending_lama < now() - interval '3 days' THEN 'pending_old' END,
          CASE WHEN pu.bil_sesi >= 4 AND pu.akhir3 IS NOT NULL AND pu.dahulu IS NOT NULL
                    AND pu.akhir3 >= pu.dahulu + 15 THEN 'improving' END
        ], NULL))
      ) ORDER BY pl.rank, pl.name, pl.user_id
    ), '[]'::jsonb) AS data
    FROM pelajar pl
    LEFT JOIN trend_json tj ON tj.uid = pl.user_id
    LEFT JOIN purata pu ON pu.uid = pl.user_id
    LEFT JOIN hantar hn2 ON hn2.uid = pl.user_id
    CROSS JOIN sempit sp
    CROSS JOIN ada_sesi_ended ase
  ),
  nilai AS (
    SELECT 'total' AS jenis, COALESCE(mk.total_score, 0)::numeric AS v
    FROM ahli a LEFT JOIN markah mk ON mk.uid = a.uid_ahli
    UNION ALL
    SELECT 'task', COALESCE(mk2.task_score, 0)::numeric
    FROM ahli a2 LEFT JOIN markah mk2 ON mk2.uid = a2.uid_ahli
    UNION ALL
    SELECT 'live', COALESCE(mk3.live_score, 0)::numeric
    FROM ahli a3 LEFT JOIN markah mk3 ON mk3.uid = a3.uid_ahli
  ),
  lebar AS (
    SELECT jenis,
           CASE WHEN MAX(v) <= 0 THEN 1 ELSE MAX(v) / 10.0 END AS lebar
    FROM nilai
    GROUP BY jenis
  ),
  bin_nilai AS (
    SELECT n.jenis AS jenis, LEAST(FLOOR(n.v / l.lebar)::int, 9) AS idx
    FROM nilai n
    JOIN lebar l ON l.jenis = n.jenis
  ),
  agihan AS (
    SELECT l.jenis AS jenis, gs.i AS idx,
           ROUND(gs.i * l.lebar, 1) AS dari,
           ROUND((gs.i + 1) * l.lebar, 1) AS sampai,
           COALESCE(b.bil, 0) AS bil
    FROM lebar l
    CROSS JOIN generate_series(0, 9) AS gs(i)
    LEFT JOIN (
      SELECT jenis, idx, COUNT(*) AS bil FROM bin_nilai GROUP BY jenis, idx
    ) b ON b.jenis = l.jenis AND b.idx = gs.i
  ),
  agihan_json AS (
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object('from', dari, 'to', sampai, 'count', bil)
        ORDER BY idx) FILTER (WHERE jenis = 'total'), '[]'::jsonb) AS total,
      COALESCE(jsonb_agg(jsonb_build_object('from', dari, 'to', sampai, 'count', bil)
        ORDER BY idx) FILTER (WHERE jenis = 'task'), '[]'::jsonb) AS task,
      COALESCE(jsonb_agg(jsonb_build_object('from', dari, 'to', sampai, 'count', bil)
        ORDER BY idx) FILTER (WHERE jenis = 'live'), '[]'::jsonb) AS live
    FROM agihan
  ),
  soalan_kelas AS (
    SELECT q.id AS soalan, q.prompt AS prompt, q.options AS options,
           q.correct_key AS correct_key, lq.title AS tajuk_kuiz
    FROM public.qm_live_questions q
    JOIN public.qm_live_quizzes lq ON lq.id = q.quiz_id
    WHERE lq.class_id = p_class_id
      AND q.qtype IN ('multiple','ox') AND q.correct_key <> ''
  ),
  jawapan_soalan AS (
    SELECT la.question_id AS soalan, la.choice_key AS choice_key,
           la.is_correct AS is_correct, la.ms_taken AS ms_taken
    FROM public.qm_live_answers la
    JOIN public.qm_live_sessions ls ON ls.id = la.session_id
    JOIN public.qm_live_quizzes lq2 ON lq2.id = ls.quiz_id
    WHERE lq2.class_id = p_class_id
  ),
  hq AS (
    SELECT sk.soalan AS soalan, sk.tajuk_kuiz AS tajuk_kuiz,
           sk.prompt AS prompt, sk.options AS options,
           sk.correct_key AS correct_key,
           COUNT(jsa.soalan) AS answered,
           ROUND(100.0 * COUNT(jsa.soalan) FILTER (WHERE jsa.is_correct)
                 / NULLIF(COUNT(jsa.soalan), 0), 1) AS correct_pct,
           ROUND(AVG(jsa.ms_taken)::numeric, 1) AS avg_ms
    FROM soalan_kelas sk
    LEFT JOIN jawapan_soalan jsa ON jsa.soalan = sk.soalan
    GROUP BY sk.soalan, sk.tajuk_kuiz, sk.prompt, sk.options, sk.correct_key
    HAVING COUNT(jsa.soalan) >= 3
  ),
  hq15 AS (
    SELECT * FROM hq
    ORDER BY correct_pct ASC NULLS LAST, answered DESC, soalan
    LIMIT 15
  ),
  salah AS (
    SELECT jsa.soalan AS soalan, jsa.choice_key AS choice_key, COUNT(*) AS bil
    FROM jawapan_soalan jsa
    WHERE NOT jsa.is_correct
    GROUP BY jsa.soalan, jsa.choice_key
  ),
  salah_top AS (
    SELECT DISTINCT ON (s.soalan) s.soalan AS soalan, s.choice_key AS choice_key, s.bil AS bil
    FROM salah s
    ORDER BY s.soalan, s.bil DESC, s.choice_key
  ),
  label_pilihan AS (
    SELECT sk.soalan AS soalan, opt->>'key' AS kunci, opt->>'text' AS label
    FROM soalan_kelas sk
    CROSS JOIN LATERAL jsonb_array_elements(sk.options) AS opt
  ),
  hq_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'question_id', hq2.soalan,
        'quiz_title', hq2.tajuk_kuiz,
        'prompt', left(hq2.prompt, 200),
        'answered', hq2.answered,
        'correct_pct', hq2.correct_pct,
        'avg_ms', hq2.avg_ms,
        'top_wrong_choice', CASE WHEN st.soalan IS NOT NULL THEN
          jsonb_build_object(
            'key', st.choice_key,
            'label', lp.label,
            'count', st.bil
          ) END,
        'correct_label', lc.label
      ) ORDER BY hq2.correct_pct ASC NULLS LAST, hq2.answered DESC, hq2.soalan
    ), '[]'::jsonb) AS data
    FROM hq15 hq2
    LEFT JOIN salah_top st ON st.soalan = hq2.soalan
    LEFT JOIN label_pilihan lp ON lp.soalan = hq2.soalan AND lp.kunci = st.choice_key
    LEFT JOIN label_pilihan lc ON lc.soalan = hq2.soalan AND lc.kunci = hq2.correct_key
  ),
  hc AS (
    SELECT ch.id AS cabaran, ch.title AS title, h.title AS hunt_title,
           COUNT(s.id) AS submitted,
           COUNT(s.id) FILTER (WHERE s.status = 'approved') AS approved,
           COUNT(s.id) FILTER (WHERE s.status = 'rejected') AS rejected,
           COUNT(s.id) FILTER (WHERE s.status = 'pending')  AS pending
    FROM public.qm_challenges ch
    JOIN public.qm_hunts h ON h.id = ch.hunt_id
    LEFT JOIN public.qm_submissions s ON s.challenge_id = ch.id
    WHERE h.class_id = p_class_id
    GROUP BY ch.id, ch.title, h.title
    HAVING COUNT(s.id) >= 2
  ),
  hc15 AS (
    SELECT hc.*, ROUND(100.0 * hc.rejected / NULLIF(hc.approved + hc.rejected, 0), 1) AS rejected_pct
    FROM hc
    ORDER BY rejected_pct DESC NULLS LAST, rejected DESC, cabaran
    LIMIT 15
  ),
  hc_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'challenge_id', h3.cabaran,
        'title', h3.title,
        'hunt_title', h3.hunt_title,
        'submitted', h3.submitted,
        'approved', h3.approved,
        'rejected', h3.rejected,
        'rejected_pct', h3.rejected_pct,
        'pending', h3.pending
      ) ORDER BY h3.rejected_pct DESC NULLS LAST, h3.rejected DESC, h3.cabaran
    ), '[]'::jsonb) AS data
    FROM hc15 h3
  ),
  pasukan AS (
    SELECT ts.team_id AS team_id, ts.team_name AS team_name, ts.total_score AS total_score,
           COUNT(tm.user_id) AS members,
           COALESCE(ARRAY_AGG(tm.user_id ORDER BY tm.user_id)
                    FILTER (WHERE tm.user_id IS NOT NULL), ARRAY[]::uuid[]) AS member_ids
    FROM public.qm_class_team_scores ts
    LEFT JOIN public.qm_team_members tm ON tm.team_id = ts.team_id
    WHERE ts.class_id = p_class_id
    GROUP BY ts.team_id, ts.team_name, ts.total_score
  ),
  pasukan_markah AS (
    SELECT pk.team_id AS team_id,
           SUM(COALESCE(mk.total_score, 0)) AS jumlah_individu,
           MAX(COALESCE(mk.total_score, 0)) AS maks_individu,
           COUNT(*) FILTER (WHERE COALESCE(mk.total_score, 0) = 0) AS sifar
    FROM pasukan pk
    JOIN public.qm_team_members tm2 ON tm2.team_id = pk.team_id
    LEFT JOIN markah mk ON mk.uid = tm2.user_id
    GROUP BY pk.team_id
  ),
  pasukan_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'team_id', pk.team_id,
        'name', pk.team_name,
        'members', pk.members,
        'total_score', pk.total_score,
        'avg_per_member', CASE WHEN pk.members > 0
          THEN ROUND(pk.total_score::numeric / pk.members, 1) END,
        'top_member_share_pct', CASE WHEN COALESCE(pm.jumlah_individu, 0) > 0
          THEN ROUND(100.0 * pm.maks_individu / pm.jumlah_individu, 1) END,
        'zero_members', COALESCE(pm.sifar, 0),
        'flag_unbalanced', COALESCE(pm.jumlah_individu, 0) > 0
          AND 100.0 * pm.maks_individu / pm.jumlah_individu > 60
          AND pk.members >= 2,
        'member_ids', pk.member_ids
      ) ORDER BY pk.total_score DESC, pk.team_name, pk.team_id
    ), '[]'::jsonb) AS data
    FROM pasukan pk
    LEFT JOIN pasukan_markah pm ON pm.team_id = pk.team_id
  ),
  pulse AS (
    SELECT
      sp.bil_ahli AS members,
      sp.avg_total AS avg_total,
      sp.median_total AS median_total,
      CASE WHEN sp.bil_ahli > 0 THEN
        ROUND(100.0 * (SELECT COUNT(DISTINCT pe2.uid) FROM pemain pe2) / sp.bil_ahli, 1)
      END AS live_participation_pct,
      CASE WHEN (SELECT COALESCE(SUM(jw2.answered), 0) FROM jawapan jw2) > 0 THEN
        ROUND(100.0 * (SELECT COALESCE(SUM(jw2.correct), 0) FROM jawapan jw2)
              / (SELECT COALESCE(SUM(jw2.answered), 0) FROM jawapan jw2), 1)
      END AS accuracy_pct,
      (SELECT COUNT(*) FROM public.qm_submissions s2
         JOIN public.qm_challenges ch2 ON ch2.id = s2.challenge_id
         JOIN public.qm_hunts h2 ON h2.id = ch2.hunt_id
        WHERE h2.class_id = p_class_id AND s2.status = 'pending') AS pending_reviews,
      (SELECT COUNT(*) FROM sesi_kelas sk3 WHERE sk3.status_sesi = 'ended') AS live_sessions
    FROM sempit sp
  )
  SELECT jsonb_build_object(
    'class_id', p_class_id,
    'pulse', (SELECT row_to_json(pulse) FROM pulse),
    'students', (SELECT data FROM students_json),
    'distribution', (SELECT row_to_json(agihan_json) FROM agihan_json),
    'hard_questions', (SELECT data FROM hq_json),
    'hard_challenges', (SELECT data FROM hc_json),
    'teams', (SELECT data FROM pasukan_json),
    'generated_at', now()
  )
  INTO v_result;

  RETURN v_result;
END;
$function$

;

revoke all on function public.qm_insights_kelas(uuid) from public, anon;
grant execute on function public.qm_insights_kelas(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

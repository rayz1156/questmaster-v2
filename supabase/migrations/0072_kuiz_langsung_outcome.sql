-- 0072_kuiz_langsung_outcome.sql: tag Kuiz Langsung kepada Outcome (KZ-037).
--
-- Guru memilih Outcome bagi SELURUH Kuiz Langsung (bukan setiap soalan).
-- Jawapan betul dan salah pelajar yang log masuk kemudian dikira dalam
-- penguasaan Outcome melalui qm_mastery_summary. Pemain tetamu
-- (user_id null) dan pemain yang bukan ahli kelas tidak dikira.
--
-- Semua tulisan melalui laluan API Next.js dengan service role selepas
-- semakan akses di pelayan; RLS aktif tanpa polisi supaya PostgREST
-- (anon/authenticated) tidak melihat apa-apa (corak migrasi 0068 dan
-- 0070). Nombor 0072 dikekalkan walaupun 0071 belum wujud dalam
-- cawangan kerja ini: KZ-036 mengambil 0071.
--
-- Dijalankan oleh CTO di VPS:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     < supabase/migrations/0072_kuiz_langsung_outcome.sql
--
-- Ujian berkanun: supabase/tests/KZ-037.sql (BEGIN ... ROLLBACK).

-- ============================================================
-- 1. qm_live_quiz_outcomes: tag satu Kuiz Langsung kepada satu
--    Outcome kelas yang sama. Kunci komposit (quiz_id,
--    outcome_id): satu Outcome sekali sahaja bagi satu kuiz.
--    `weight` disimpan tetapi sentiasa 1.00 (pemberat selain 1
--    di luar skop KZ-037).
-- ============================================================
create table if not exists public.qm_live_quiz_outcomes (
  quiz_id uuid not null references public.qm_live_quizzes(id) on delete cascade,
  outcome_id uuid not null references public.qm_learning_outcomes(id) on delete cascade,
  weight numeric(4,2) not null default 1.00,
  created_at timestamptz not null default now(),
  primary key (quiz_id, outcome_id)
);

-- Indeks pada outcome_id: kaskad padam Outcome mencari semua tag
-- kuiznya tanpa imbasan penuh, dan qm_mastery_summary menyertai
-- daripada pihak outcome.
create index if not exists qm_lqo_outcome_idx on public.qm_live_quiz_outcomes (outcome_id);

-- ============================================================
-- 2. Pencetus BEFORE INSERT OR UPDATE: kuiz dan Outcome mesti
--    dari kelas yang sama; kuiz tanpa kelas tidak boleh ditag.
--    SECURITY DEFINER supaya pencetus tetap boleh membaca
--    qm_live_quizzes walaupun pemanggil INSERT tiada kebenaran
--    bacaan pada jadual itu. Tiada semakan auth.uid() di sini:
--    pemanggil pencetus ialah service role (auth.uid() null);
--    kebenaran pengguna dikawal oleh laluan API dan oleh REVOKE
--    jadual di bawah (tiada INSERT dari anon/authenticated).
-- ============================================================
create or replace function public.qm_lqo_sama_kelas()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_kelas_kuiz    uuid;
  v_kelas_outcome uuid;
begin
  select class_id into v_kelas_kuiz from qm_live_quizzes where id = new.quiz_id;
  select class_id into v_kelas_outcome from qm_learning_outcomes where id = new.outcome_id;

  if v_kelas_kuiz is null then
    raise exception 'Share the quiz with a class before choosing Outcomes.';
  end if;
  if v_kelas_outcome is null then
    raise exception 'Outcome not found.';
  end if;
  if v_kelas_kuiz <> v_kelas_outcome then
    raise exception 'The Outcome belongs to a different class.';
  end if;

  return new;
end;
$fn$;

-- Fungsi pencetus tidak boleh dipanggil terus oleh sesiapa pun,
-- tetapi tutuk kebenaran pelaksanaan sebagai pertahanan mendalam.
revoke all on function public.qm_lqo_sama_kelas() from public, anon, authenticated;

drop trigger if exists qm_lqo_sama_kelas_trg on public.qm_live_quiz_outcomes;
create trigger qm_lqo_sama_kelas_trg
  before insert or update on public.qm_live_quiz_outcomes
  for each row execute function public.qm_lqo_sama_kelas();

-- ============================================================
-- 3. RLS hidup tanpa polisi + keizinan ditutup. Semua bacaan
--    dan tulisan berlaku melalui laluan API dengan service role
--    selepas semakan akses di pelayan.
-- ============================================================
alter table public.qm_live_quiz_outcomes enable row level security;

revoke all on public.qm_live_quiz_outcomes from anon, authenticated;

-- ============================================================
-- 4. qm_mastery_summary: tambah sumber kedua, jawapan Kuiz
--    Langsung. Definisi asas disalin daripada versi produksi
--    (skema _skema-kz036-037.txt selepas =====FUNC) dan diubah:
--      - sumber kedua `live_oq`: tag kuiz langsung kelas ini;
--      - `sumber_gabung`: satu baris setiap kejadian kedua-dua
--        sumber; jawapan langsung betul dipetakan 'approved',
--        salah 'rejected'; hanya pemain yang log masuk dan ahli
--        kelas; semua sesi termasuk ulangan;
--      - grid `per_user_grid` menggantikan CROSS JOIN oc supaya
--        baris (pelajar, outcome) tetap wujud untuk outcome yang
--        hanya ditag pada kuiz langsung tanpa satu pun cabaran
--        (not_attempted dikira dengan betul);
--      - medan tambahan `tagged_live_quizzes` dalam setiap baris
--        `outcomes` dan dalam `totals` (tambahan sahaja; medan
--        lama, semakan kebenaran, ambang bucket dan bentuk output
--        lain tidak berubah).
--    `grant execute` tidak disentuh: fungsi sudah wujud dan
--    `create or replace` mengekalkan ACL.
-- ============================================================
create or replace function public.qm_mastery_summary(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_authorised boolean;
  v_result jsonb;
begin
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM qm_classes c
    WHERE c.id = p_class_id
      AND (c.owner_id = v_uid
           OR EXISTS (SELECT 1 FROM qm_class_educators ce WHERE ce.class_id = c.id AND ce.educator_id = v_uid
                       -- Pembetulan CTO (kzsec): ko-pendidik mesti sudah menerima jemputan.
                       AND ce.accepted_at IS NOT NULL))
  ) INTO v_authorised;
  IF NOT v_authorised THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH class_hunts AS (
    SELECT id FROM qm_hunts WHERE class_id = p_class_id
  ),
  class_challenges AS (
    SELECT id FROM qm_challenges WHERE hunt_id IN (SELECT id FROM class_hunts)
  ),
  outcomes AS (
    SELECT lo.id, lo.code, lo.label, lo.description
    FROM qm_learning_outcomes lo
    WHERE lo.class_id = p_class_id
  ),
  -- Sumber pertama (seperti sedia ada): cabaran kelas yang ditag.
  oc AS (
    SELECT co.outcome_id, co.challenge_id, co.weight
    FROM qm_challenge_outcomes co
    JOIN outcomes o ON o.id = co.outcome_id
    WHERE co.challenge_id IN (SELECT id FROM class_challenges)
  ),
  -- Sumber kedua (KZ-037): kuiz langsung kelas ini yang ditag.
  -- Kuiz tanpa kelas tidak masuk (pencetus sudah menolak
  -- penagannya; saringan class_id di sini pertahanan kedua).
  live_oq AS (
    SELECT lqo.outcome_id, lqo.quiz_id
    FROM qm_live_quiz_outcomes lqo
    JOIN qm_live_quizzes q ON q.id = lqo.quiz_id
    JOIN outcomes o ON o.id = lqo.outcome_id
    WHERE q.class_id = p_class_id
  ),
  outcome_counts AS (
    SELECT o.id AS outcome_id, COUNT(DISTINCT oc.challenge_id)::int AS tagged_challenges  -- Pembetulan CTO (kzqa): elak dabaran dua LEFT JOIN,
           COUNT(DISTINCT live_oq.quiz_id)::int AS tagged_live_quizzes
    FROM outcomes o
    LEFT JOIN oc ON oc.outcome_id = o.id
    LEFT JOIN live_oq ON live_oq.outcome_id = o.id
    GROUP BY o.id
  ),
  members AS (
    SELECT cm.user_id, p.display_name, p.username
    FROM qm_class_members cm
    LEFT JOIN qm_profiles p ON p.id = cm.user_id
    WHERE cm.class_id = p_class_id
  ),
  -- Outcome yang ditag oleh sekurang-kurangnya satu sumber
  -- (cabaran ATAU kuiz langsung). Grid pelajar x outcome ini
  -- menggantikan CROSS JOIN oc yang lama, supaya baris (pelajar,
  -- outcome) tetap wujud untuk outcome yang hanya ditag pada
  -- kuiz langsung tanpa satu pun cabaran.
  tagged_outcomes AS (
    SELECT DISTINCT outcome_id FROM oc
    UNION
    SELECT DISTINCT outcome_id FROM live_oq
  ),
  per_user_grid AS (
    SELECT m.user_id, t.outcome_id
    FROM members m
    CROSS JOIN tagged_outcomes t
  ),
  -- Satu baris setiap kejadian sumber:
  --  - sumber cabaran: satu baris setiap (pelajar, outcome,
  --    cabaran yang ditag); status daripada hantaran, null jika
  --    belum menghantar;
  --  - sumber langsung: satu baris setiap jawapan pemain yang log
  --    masuk dan ahli kelas, pada sesi kuiz kelas ini yang
  --    ditag, semua sesi termasuk ulangan. `join members`
  --    menapis pemain tetamu (user_id null) dan bukan ahli.
  sumber_gabung AS (
    SELECT m.user_id, oc.outcome_id, s.status
    FROM members m
    CROSS JOIN oc
    LEFT JOIN qm_submissions s
      ON s.user_id = m.user_id
     AND s.challenge_id = oc.challenge_id
    UNION ALL
    SELECT p.user_id, lqo.outcome_id,
           CASE WHEN a.is_correct THEN 'approved' ELSE 'rejected' END
    FROM qm_live_answers a
    JOIN qm_live_players p ON p.id = a.player_id
    JOIN qm_live_sessions ls ON ls.id = a.session_id
    JOIN live_oq lqo ON lqo.quiz_id = ls.quiz_id
    JOIN members m ON m.user_id = p.user_id
  ),
  per_user_outcome AS (
    SELECT
      g.user_id,
      g.outcome_id,
      COUNT(sg.outcome_id) FILTER (WHERE sg.status = 'approved') AS approved,
      COUNT(sg.outcome_id) FILTER (WHERE sg.status = 'rejected') AS rejected,
      COUNT(sg.outcome_id) FILTER (WHERE sg.status IN ('approved','rejected')) AS scored,
      COUNT(sg.outcome_id) AS total
    FROM per_user_grid g
    LEFT JOIN sumber_gabung sg
      ON sg.user_id = g.user_id
     AND sg.outcome_id = g.outcome_id
    GROUP BY g.user_id, g.outcome_id
  ),
  per_user_outcome_scored AS (
    SELECT
      puo.user_id,
      puo.outcome_id,
      puo.approved,
      puo.rejected,
      puo.scored,
      puo.total,
      CASE
        WHEN puo.scored = 0 THEN NULL
        ELSE ROUND((puo.approved::numeric / puo.scored) * 100)::int
      END AS mastery_pct,
      CASE
        WHEN puo.scored = 0 THEN 'not_attempted'
        WHEN puo.approved::numeric / puo.scored >= 0.8 AND puo.scored >= 2 THEN 'mastered'
        WHEN puo.approved::numeric / puo.scored < 0.4 AND puo.scored >= 2 THEN 'struggling'
        ELSE 'developing'
      END AS bucket
    FROM per_user_outcome puo
  ),
  outcomes_arr AS (
    SELECT jsonb_agg(jsonb_build_object(
      'outcome_id', o.id,
      'code', o.code,
      'label', o.label,
      'description', o.description,
      'tagged_challenges', COALESCE(oct.tagged_challenges, 0),
      'tagged_live_quizzes', COALESCE(oct.tagged_live_quizzes, 0),
      'mastered_students', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.outcome_id = o.id AND x.bucket = 'mastered'
      ),
      'struggling_students', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.outcome_id = o.id AND x.bucket = 'struggling'
      ),
      'developing_students', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.outcome_id = o.id AND x.bucket = 'developing'
      ),
      'not_attempted_students', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.outcome_id = o.id AND x.bucket = 'not_attempted'
      ),
      'avg_mastery_pct', (
        SELECT ROUND(AVG(x.mastery_pct))::int FROM per_user_outcome_scored x
        WHERE x.outcome_id = o.id AND x.mastery_pct IS NOT NULL
      )
    ) ORDER BY o.code NULLS LAST, o.label) AS rows
    FROM outcomes o LEFT JOIN outcome_counts oct ON oct.outcome_id = o.id
  ),
  students_arr AS (
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', m.user_id,
      'name', COALESCE(m.display_name, m.username, 'Student'),
      'outcomes', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'outcome_id', x.outcome_id,
          'approved', x.approved,
          'rejected', x.rejected,
          'scored', x.scored,
          'total', x.total,
          'mastery_pct', x.mastery_pct,
          'bucket', x.bucket
        )), '[]'::jsonb)
        FROM per_user_outcome_scored x WHERE x.user_id = m.user_id
      ),
      'mastered_count', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.user_id = m.user_id AND x.bucket = 'mastered'
      ),
      'struggling_count', (
        SELECT COUNT(*) FROM per_user_outcome_scored x
        WHERE x.user_id = m.user_id AND x.bucket = 'struggling'
      )
    ) ORDER BY COALESCE(m.display_name, m.username, '')) AS rows
    FROM members m
  )
  SELECT jsonb_build_object(
    'class_id', p_class_id,
    'totals', jsonb_build_object(
      'outcomes', (SELECT COUNT(*) FROM outcomes),
      'tagged_challenges', (SELECT COUNT(DISTINCT challenge_id) FROM oc),
      'tagged_live_quizzes', (SELECT COUNT(DISTINCT quiz_id) FROM live_oq),
      'students', (SELECT COUNT(*) FROM members)
    ),
    'outcomes', COALESCE((SELECT rows FROM outcomes_arr), '[]'::jsonb),
    'students', COALESCE((SELECT rows FROM students_arr), '[]'::jsonb),
    'generated_at', now()
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

-- Pastikan PostgREST melihat jadual baharu.
notify pgrst, 'reload schema';
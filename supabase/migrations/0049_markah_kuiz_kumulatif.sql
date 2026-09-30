-- 0049_markah_kuiz_kumulatif.sql (V2-012)
--
-- Markah Live Quiz disimpan pada akaun (user_id qm_live_players) dan
-- dikumpulkan dalam kedudukan individu kelas. Empat perkara:
--   1. Indeks unik separa (session_id, user_id): satu akaun satu baris
--      pemain setiap sesi, supaya markah tidak dikira dua kali dalam view.
--      Sebelum indeks dicipta, pendua sedia ada diperiksa; jika ada, migrasi
--      BERHENTI dengan RAISE dan tidak memadam apa-apa data.
--   2. Jadual sandaran public.qm_live_players_pautan_0049 merekodkan setiap
--      pautan lama yang dibuat oleh backfill, untuk pemulihan jika padanan
--      nama tersilap. RLS hidup tanpa polisi: hanya pemilik jadual dan
--      service_role (yang memintas RLS) boleh membacanya.
--      GUGURKAN jadual ini selepas 30 Okt 2026 jika tiada aduan:
--        drop table if exists public.qm_live_players_pautan_0049;
--   3. Fungsi backfill public.qm_live_paut_pemain_lama(): pemain tetamu lama
--      (user_id null) dipautkan secara automatik kepada ahli kelas kuiz itu
--      jika nama pemain sama tepat dengan TEPAT SATU ahli (tidak peka huruf
--      besar, btrim), pengguna itu belum ada baris lain dalam sesi sama, dan
--      tiada pemain lain dalam sesi sama yang padan pengguna yang sama.
--      Nama samar (dua ahli bernama sama, atau dua pemain sesi sama padan
--      pengguna sama) dilangkau sepenuhnya. Ringkasan ditulis ke qm_audit_log.
--   4. CREATE OR REPLACE VIEW qm_class_individual_scores: empat lajur asal
--      kekal pada kedudukan asal, empat lajur baharu ditambah di hujung
--      (task_score, live_score, adjustment_score, live_sessions). Geran,
--      pemilikan dan tingkah laku akses sedia ada kekal kerana CREATE OR
--      REPLACE tidak menyentuhnya. total_score kini task + live + adjustment.
--      Sesi 'lobby' dikecualikan daripada live_score dan live_sessions: sesi
--      yang ditetapkan semula ke lobby oleh hos masih menyimpan skor lama
--      pemain dan markah itu tidak boleh masuk kedudukan kelas.
--
-- Idempoten: semua create memakai IF NOT EXISTS / OR REPLACE, dan fungsi
-- backfill tidak mengubah apa-apa pada kali kedua (pemain yang sudah berpaut
-- tidak lagi user_id null).

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Semakan pendua SEBELUM indeks unik (jangan padam data)
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_bil bigint;
BEGIN
  SELECT COUNT(*) INTO v_bil
  FROM (
    SELECT 1
    FROM public.qm_live_players
    WHERE user_id IS NOT NULL
    GROUP BY session_id, user_id
    HAVING COUNT(*) > 1
  ) d;
  IF v_bil > 0 THEN
    RAISE EXCEPTION 'duplicate registered players found in % session(s). Resolve them by hand before running this migration; nothing was deleted.', v_bil;
  END IF;
END
$chk$;

-- ---------------------------------------------------------------------
-- 2. Indeks unik separa: satu akaun, satu baris pemain, setiap sesi
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS qm_live_players_sesi_pengguna_uniq
  ON public.qm_live_players (session_id, user_id)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. Jadual sandaran pautan (gugurkan selepas 30 Okt 2026 jika tiada aduan)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qm_live_players_pautan_0049 (
  player_id   uuid        PRIMARY KEY,
  user_id     uuid        NOT NULL,
  class_id    uuid        NOT NULL,
  dipaut_pada timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qm_live_players_pautan_0049 ENABLE ROW LEVEL SECURITY;

-- Tiada polisi: anon dan authenticated mendapat lalai tolak. service_role
-- sahaja diberi baca (ia memintas RLS), selain pemilik jadual.
GRANT SELECT ON public.qm_live_players_pautan_0049 TO service_role;

-- ---------------------------------------------------------------------
-- 4. Fungsi backfill: pautkan pemain tetamu lama kepada ahli kelas
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_live_paut_pemain_lama()
RETURNS TABLE (linked bigint, skipped_ambiguous bigint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_linked  bigint := 0;
  v_skipped bigint := 0;
  r         record;
  v_bil_calon integer;
  v_pengguna  uuid;
  v_bil       integer;
BEGIN
  -- Semakan peranan pemanggil: fungsi ini mengubah data pukal, ia bukan
  -- untuk anon atau authenticated melalui PostgREST. Kebenaran pelaksanaan
  -- juga ditarik dalam migrasi ini; semakan ini ialah baris kedua.
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Pemain tetamu dalam sesi kuiz yang dimiliki sesuatu kelas sahaja.
  -- ORDER BY memaksa hasil pertanyaan disusun (dan dibekukan) sebelum
  -- kemaskini bermula, supaya baris yang dipaut dalam gelung ini tidak
  -- mengubah pemacu gelung.
  FOR r IN
    SELECT lp.id AS player_id,
           lp.session_id AS session_id,
           lp.nickname AS nickname,
           q.class_id AS class_id
    FROM public.qm_live_players lp
    JOIN public.qm_live_sessions s ON s.id = lp.session_id
    JOIN public.qm_live_quizzes q ON q.id = s.quiz_id
    WHERE lp.user_id IS NULL
      AND q.class_id IS NOT NULL
    ORDER BY lp.joined_at, lp.id
  LOOP
    -- Calon ahli kelas: nama sama tepat, tidak peka huruf besar dan ruang
    -- tepi (btrim pada kedua-dua pihak).
    SELECT COUNT(DISTINCT cm.user_id), MIN(cm.user_id)
      INTO v_bil_calon, v_pengguna
      FROM public.qm_class_members cm
      JOIN public.qm_profiles pr ON pr.id = cm.user_id
      WHERE cm.class_id = r.class_id
        AND lower(btrim(coalesce(pr.display_name, ''))) = lower(btrim(r.nickname));

    -- Tiada ahli dengan nama itu: pemain tetamu biasa, bukan kes samar.
    IF v_bil_calon = 0 THEN
      CONTINUE;
    END IF;

    -- Dua ahli atau lebih bernama sama: langkau (contoh dua "Amin").
    IF v_bil_calon > 1 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Pengguna itu sudah ada baris lain dalam sesi sama (contoh dia masuk
    -- berdaftar selepas bermain sebagai tetamu): jangan paut kali kedua.
    SELECT COUNT(*) INTO v_bil
    FROM public.qm_live_players pl
    WHERE pl.session_id = r.session_id
      AND pl.user_id = v_pengguna;
    IF v_bil > 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Pemain tetamu lain dalam sesi sama yang juga padan pengguna ini:
    -- jika ada, kedua-duanya dilangkau (contoh "Siti" dan "Siti ").
    SELECT COUNT(*) INTO v_bil
    FROM public.qm_live_players pl
    JOIN public.qm_class_members cm2
      ON cm2.class_id = r.class_id AND cm2.user_id = v_pengguna
    JOIN public.qm_profiles pr2 ON pr2.id = cm2.user_id
    WHERE pl.session_id = r.session_id
      AND pl.user_id IS NULL
      AND lower(btrim(coalesce(pr2.display_name, ''))) = lower(btrim(pl.nickname));
    IF v_bil > 1 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Paut: jadual sandaran dahulu (untuk pemulihan), kemudian baris pemain.
    INSERT INTO public.qm_live_players_pautan_0049 (player_id, user_id, class_id)
      VALUES (r.player_id, v_pengguna, r.class_id)
      ON CONFLICT (player_id) DO NOTHING;

    UPDATE public.qm_live_players
       SET user_id = v_pengguna
     WHERE id = r.player_id
       AND user_id IS NULL;

    IF FOUND THEN
      v_linked := v_linked + 1;
    END IF;
  END LOOP;

  -- Satu baris audit ringkasan setiap kali pautan benar-benar berlaku.
  -- Ketika kali kedua fungsi ini dipanggil tiada pautan baharu, maka tiada
  -- baris audit baharu: fungsi benar-benar idempoten.
  IF v_linked > 0 THEN
    INSERT INTO public.qm_audit_log (actor_id, action, target_type, meta)
    VALUES (
      NULL,
      'live_scores_backfill',
      'system',
      jsonb_build_object('linked', v_linked, 'skipped_ambiguous', v_skipped)
    );
  END IF;

  RAISE NOTICE 'backfill 0049: % pemain dipaut, % dilangkau kerana nama samar', v_linked, v_skipped;

  linked := v_linked;
  skipped_ambiguous := v_skipped;
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.qm_live_paut_pemain_lama() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qm_live_paut_pemain_lama() TO service_role;

-- ---------------------------------------------------------------------
-- 5. Jalankan backfill (sekali; kali kedua tidak mengubah apa-apa)
-- ---------------------------------------------------------------------
SELECT public.qm_live_paut_pemain_lama();

-- ---------------------------------------------------------------------
-- 6. View kedudukan individu: tambah markah Live Quiz kumulatif
-- ---------------------------------------------------------------------
-- Lajur asal kekal pada kedudukan asal (class_id, user_id, display_name,
-- total_score) supaya pengguna sedia ada (termasuk fungsi sijil 0042 yang
-- membaca total_score) tidak berubah tingkah laku. Lajur baharu hanya
-- ditambah di hujung. total_score kini task_score + live_score +
-- adjustment_score. Sesi 'lobby' tidak dikira dalam live_score mahupun
-- live_sessions.
CREATE OR REPLACE VIEW public.qm_class_individual_scores AS
SELECT cm.class_id,
       cm.user_id,
       p.display_name,
       COALESCE((SELECT SUM(ch.points)
                   FROM public.qm_submissions s
                   JOIN public.qm_challenges ch ON ch.id = s.challenge_id
                   JOIN public.qm_hunts h ON h.id = ch.hunt_id
                  WHERE s.user_id = cm.user_id
                    AND s.status = 'approved'
                    AND h.class_id = cm.class_id), 0::bigint)
     + COALESCE((SELECT SUM(lp.score)
                   FROM public.qm_live_players lp
                   JOIN public.qm_live_sessions ls ON ls.id = lp.session_id
                   JOIN public.qm_live_quizzes lq ON lq.id = ls.quiz_id
                  WHERE lp.user_id = cm.user_id
                    AND lq.class_id = cm.class_id
                    AND ls.status <> 'lobby'), 0::bigint)
     + COALESCE((SELECT SUM(a.delta)
                   FROM public.qm_student_score_adjustments a
                  WHERE a.user_id = cm.user_id
                    AND a.class_id = cm.class_id), 0::bigint) AS total_score,
       COALESCE((SELECT SUM(ch.points)
                   FROM public.qm_submissions s
                   JOIN public.qm_challenges ch ON ch.id = s.challenge_id
                   JOIN public.qm_hunts h ON h.id = ch.hunt_id
                  WHERE s.user_id = cm.user_id
                    AND s.status = 'approved'
                    AND h.class_id = cm.class_id), 0::bigint) AS task_score,
       COALESCE((SELECT SUM(lp.score)
                   FROM public.qm_live_players lp
                   JOIN public.qm_live_sessions ls ON ls.id = lp.session_id
                   JOIN public.qm_live_quizzes lq ON lq.id = ls.quiz_id
                  WHERE lp.user_id = cm.user_id
                    AND lq.class_id = cm.class_id
                    AND ls.status <> 'lobby'), 0::bigint) AS live_score,
       COALESCE((SELECT SUM(a.delta)
                   FROM public.qm_student_score_adjustments a
                  WHERE a.user_id = cm.user_id
                    AND a.class_id = cm.class_id), 0::bigint) AS adjustment_score,
       (SELECT COUNT(DISTINCT lp.session_id)
          FROM public.qm_live_players lp
          JOIN public.qm_live_sessions ls ON ls.id = lp.session_id
          JOIN public.qm_live_quizzes lq ON lq.id = ls.quiz_id
         WHERE lp.user_id = cm.user_id
           AND lq.class_id = cm.class_id
           AND ls.status <> 'lobby') AS live_sessions
  FROM public.qm_class_members cm
  JOIN public.qm_profiles p ON p.id = cm.user_id;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 0051_insights_markah_kelas.sql (V2-014a)
--
-- Backend Insights markah kelas: pembantu kebenaran, aktiviti terakhir ahli,
-- pembaikan angka 0 pada /educator/analytics, dan fungsi baru qm_insights_kelas.
--
-- Pepijat yang dibaiki (disahkan CTO): qm_analytics_events di produksi ada
-- 22,953 baris dan SEMUANYA class_id IS NULL, jadi qm_engagement_summary dan
-- qm_at_risk_summary yang menapis WHERE class_id = p_class_id sentiasa kosong
-- (Learners 0, Active in 30 days 0). Selain itu, p_class_id NULL mengira
-- acara SELURUH platform, bukan kelas pemanggil sahaja.
--
-- Perubahan tingkah laku:
--   1. qm_boleh_urus_insights(p_class): pemilik, educator DITERIMA, admin
--      aktif atau service_role. Ahli biasa TIDAK dibenarkan.
--   2. qm_aktiviti_terakhir_ahli(p_class): aktiviti terakhir setiap ahli
--      (acara analitik tanpa tapis class, submission cabaran kelas, jawapan
--      Live Quiz sesi kelas, joined_at). Tanpa kebenaran pulangkan kosong.
--   3. qm_engagement_summary: set ahli berasaskan keahlian (bukan acara);
--      acara ditapis user_id IN ahli; unique_users = bilangan ahli
--      (Learners); daily.dau/hourly menggabungkan submission dan jawapan
--      Live Quiz; NULL bermakna gabungan kelas yang pemanggil urus.
--   4. qm_at_risk_summary: ev menapis user_id IN ahli; last_event_at dan
--      days_since_event guna aktiviti terakhir gabungan.
--   5. qm_insights_kelas: pulse, students (markah, trend, flags), agihan,
--      soalan susar, cabaran susar, pasukan. Untuk tab Insights (UI V2-014b).
--
-- Bentuk JSON engagement dan at_risk KEKAL SAMA seperti sebelumnya.
-- Idempoten: CREATE OR REPLACE dan REVOKE/GRANT boleh diulang.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Pembantu kebenaran: satu tempat untuk semua fungsi Insights
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qm_boleh_urus_insights(p_class uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    -- Klien perkhidmatan memanggil tanpa JWT pengguna.
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.qm_classes c
      WHERE c.id = p_class AND c.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.qm_class_educators ce
      WHERE ce.class_id = p_class
        AND ce.educator_id = auth.uid()
        AND ce.accepted_at IS NOT NULL
    )
    OR public.qm_admin_aktif();
$fn$;

REVOKE ALL ON FUNCTION public.qm_boleh_urus_insights(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_boleh_urus_insights(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Aktiviti terakhir setiap ahli kelas
-- ---------------------------------------------------------------------
-- GREATEST daripada: MAX created_at acara analitik pengguna (TANPA tapis
-- class_id, kerana AnalyticsTracker tidak menghantar class_id), MAX created_at
-- submission pada cabaran kelas itu, MAX created_at jawapan Live Quiz pada
-- sesi kuiz kelas itu (melalui qm_live_players.user_id), dan joined_at.
-- Tanpa kebenaran qm_boleh_urus_insights: pulangkan kosong, bukan ralat,
-- supaya tidak membocorkan sama ada kelas itu wujud.
CREATE OR REPLACE FUNCTION public.qm_aktiviti_terakhir_ahli(p_class uuid)
RETURNS TABLE(user_id uuid, last_active timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.qm_boleh_urus_insights(p_class) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ahli AS (
    SELECT cm.user_id AS uid_ahli, cm.joined_at AS sertai
    FROM public.qm_class_members cm
    WHERE cm.class_id = p_class
  ),
  cabaran_kelas AS (
    SELECT ch.id AS cabaran
    FROM public.qm_challenges ch
    JOIN public.qm_hunts h ON h.id = ch.hunt_id
    WHERE h.class_id = p_class
  ),
  sesi_kelas AS (
    SELECT ls.id AS sesi
    FROM public.qm_live_sessions ls
    JOIN public.qm_live_quizzes lq ON lq.id = ls.quiz_id
    WHERE lq.class_id = p_class
  ),
  acara AS (
    SELECT e.user_id AS uid, MAX(e.created_at) AS maks
    FROM public.qm_analytics_events e
    GROUP BY e.user_id
  ),
  hantar AS (
    SELECT s.user_id AS uid, MAX(s.created_at) AS maks
    FROM public.qm_submissions s
    JOIN cabaran_kelas cc ON cc.cabaran = s.challenge_id
    GROUP BY s.user_id
  ),
  jawab AS (
    SELECT lp.user_id AS uid, MAX(la.created_at) AS maks
    FROM public.qm_live_answers la
    JOIN public.qm_live_players lp ON lp.id = la.player_id
    JOIN sesi_kelas sk ON sk.sesi = la.session_id
    WHERE lp.user_id IS NOT NULL
    GROUP BY lp.user_id
  )
  SELECT a.uid_ahli,
         GREATEST(
           a.sertai,
           COALESCE(ac.maks, a.sertai),
           COALESCE(hn.maks, a.sertai),
           COALESCE(jw.maks, a.sertai)
         ) AS last_active
  FROM ahli a
  LEFT JOIN acara ac ON ac.uid = a.uid_ahli
  LEFT JOIN hantar hn ON hn.uid = a.uid_ahli
  LEFT JOIN jawab jw ON jw.uid = a.uid_ahli;
END;
$fn$;

REVOKE ALL ON FUNCTION public.qm_aktiviti_terakhir_ahli(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_aktiviti_terakhir_ahli(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. qm_engagement_summary: bentuk JSON sama, set ahli baharu
-- ---------------------------------------------------------------------
-- Set ahli: ahli kelas p_class_id (dengan semakan qm_boleh_urus_insights,
-- jika tidak RAISE 'Forbidden'), atau jika NULL, gabungan ahli semua kelas
-- yang pemanggil boleh urus (pemilik atau educator diterima; admin aktif
-- TIDAK automatik nampak seluruh platform di sini).
-- Acara: acara 90 hari yang user_id dalam set ahli, tanpa tapis class_id.
-- unique_users = bilangan ahli (dinamakan Learners di UI).
-- inactivity: aktiviti terakhir gabungan seperti qm_aktiviti_terakhir_ahli.
-- daily.dau, daily.events dan hourly: acara + submission + jawapan Live Quiz
-- digabung sebagai acara aktiviti (90 hari).
CREATE OR REPLACE FUNCTION public.qm_engagement_summary(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_class_id IS NOT NULL THEN
    IF NOT public.qm_boleh_urus_insights(p_class_id) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  WITH kelas_urusan AS (
    SELECT c.id
    FROM public.qm_classes c
    WHERE (p_class_id IS NOT NULL AND c.id = p_class_id)
       OR (p_class_id IS NULL AND c.owner_id = v_uid)
    UNION
    SELECT ce.class_id
    FROM public.qm_class_educators ce
    WHERE p_class_id IS NULL
      AND ce.educator_id = v_uid
      AND ce.accepted_at IS NOT NULL
  ),
  ahli AS (
    SELECT cm.user_id AS uid_ahli, MAX(cm.joined_at) AS sertai
    FROM public.qm_class_members cm
    JOIN kelas_urusan k ON k.id = cm.class_id
    GROUP BY cm.user_id
  ),
  cabaran_kelas AS (
    SELECT ch.id AS cabaran
    FROM public.qm_challenges ch
    JOIN public.qm_hunts h ON h.id = ch.hunt_id
    JOIN kelas_urusan k2 ON k2.id = h.class_id
  ),
  sesi_kelas AS (
    SELECT ls.id AS sesi
    FROM public.qm_live_sessions ls
    JOIN public.qm_live_quizzes lq ON lq.id = ls.quiz_id
    JOIN kelas_urusan k3 ON k3.id = lq.class_id
  ),
  ev AS (
    SELECT e.user_id AS uid, e.event_type AS jenis, e.created_at AS masa
    FROM public.qm_analytics_events e
    JOIN ahli a ON a.uid_ahli = e.user_id
    WHERE e.created_at > now() - interval '90 days'
  ),
  hantar AS (
    SELECT s.user_id AS uid, s.created_at AS masa
    FROM public.qm_submissions s
    JOIN cabaran_kelas cc ON cc.cabaran = s.challenge_id
    JOIN ahli a2 ON a2.uid_ahli = s.user_id
    WHERE s.created_at > now() - interval '90 days'
  ),
  jawab AS (
    SELECT lp.user_id AS uid, la.created_at AS masa
    FROM public.qm_live_answers la
    JOIN public.qm_live_players lp ON lp.id = la.player_id
    JOIN sesi_kelas sk ON sk.sesi = la.session_id
    WHERE lp.user_id IS NOT NULL
      AND la.created_at > now() - interval '90 days'
      AND EXISTS (SELECT 1 FROM ahli a3 WHERE a3.uid_ahli = lp.user_id)
  ),
  aktiviti AS (
    SELECT ev.uid AS uid, ev.masa FROM ev
    UNION ALL
    SELECT hantar.uid, hantar.masa FROM hantar
    UNION ALL
    SELECT jawab.uid, jawab.masa FROM jawab
  ),
  daily AS (
    SELECT date_trunc('day', masa)::date AS day,
           COUNT(DISTINCT uid) AS dau,
           COUNT(*) AS events
    FROM aktiviti
    GROUP BY 1
    ORDER BY 1
  ),
  by_hour AS (
    SELECT EXTRACT(hour FROM masa)::int AS hour,
           COUNT(*) AS events
    FROM aktiviti
    GROUP BY 1
    ORDER BY 1
  ),
  acara_maks AS (
    SELECT e.user_id AS uid, MAX(e.created_at) AS maks
    FROM public.qm_analytics_events e
    JOIN ahli a4 ON a4.uid_ahli = e.user_id
    GROUP BY e.user_id
  ),
  hantar_maks AS (
    SELECT s.user_id AS uid, MAX(s.created_at) AS maks
    FROM public.qm_submissions s
    JOIN cabaran_kelas cc2 ON cc2.cabaran = s.challenge_id
    GROUP BY s.user_id
  ),
  jawab_maks AS (
    SELECT lp.user_id AS uid, MAX(la.created_at) AS maks
    FROM public.qm_live_answers la
    JOIN public.qm_live_players lp ON lp.id = la.player_id
    JOIN sesi_kelas sk2 ON sk2.sesi = la.session_id
    WHERE lp.user_id IS NOT NULL
    GROUP BY lp.user_id
  ),
  last_active AS (
    -- aktiviti_nyata: acara, submission atau jawapan sahaja (GREATEST abaikan NULL).
    -- Sertai kelas BUKAN aktiviti; ia hanya menghalang ahli baharu dikira berisiko.
    SELECT a.uid_ahli AS uid,
           GREATEST(am.maks, hm.maks, jm.maks) AS aktiviti_nyata,
           COALESCE(GREATEST(am.maks, hm.maks, jm.maks), a.sertai) AS last_seen
    FROM ahli a
    LEFT JOIN acara_maks am ON am.uid = a.uid_ahli
    LEFT JOIN hantar_maks hm ON hm.uid = a.uid_ahli
    LEFT JOIN jawab_maks jm ON jm.uid = a.uid_ahli
  ),
  inactivity AS (
    SELECT
      COUNT(*) FILTER (WHERE aktiviti_nyata > now() - interval '1 day')   AS active_1d,
      COUNT(*) FILTER (WHERE aktiviti_nyata > now() - interval '7 days')  AS active_7d,
      COUNT(*) FILTER (WHERE aktiviti_nyata > now() - interval '30 days') AS active_30d,
      COUNT(*) FILTER (WHERE last_seen < now() - interval '7 days')       AS at_risk_inactive_7d
    FROM last_active
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*) FROM ev) AS total_events,
      (SELECT COUNT(*) FROM ahli) AS unique_users,
      (SELECT COUNT(*) FROM ev WHERE jenis = 'page_view') AS page_views,
      (SELECT COUNT(*) FROM ev WHERE jenis = 'login') AS logins,
      (SELECT COUNT(*) FROM ev WHERE jenis = 'quest_open') AS quest_opens,
      (SELECT COUNT(*) FROM ev WHERE jenis = 'quest_submit') AS quest_submits
  )
  SELECT jsonb_build_object(
    'class_id', p_class_id,
    'totals',  (SELECT row_to_json(totals) FROM totals),
    'inactivity', (SELECT row_to_json(inactivity) FROM inactivity),
    'daily',  COALESCE((SELECT jsonb_agg(row_to_json(daily)) FROM daily), '[]'::jsonb),
    'hourly', COALESCE((SELECT jsonb_agg(row_to_json(by_hour)) FROM by_hour), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.qm_engagement_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_engagement_summary(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. qm_at_risk_summary: bentuk JSON sama, tapis ahli dan aktiviti gabungan
-- ---------------------------------------------------------------------
-- ev menapis user_id IN ahli (bukan class_id = p_class_id). last_event_at
-- dan days_since_event guna aktiviti terakhir gabungan (acara, submission,
-- jawapan Live Quiz, joined_at). Kebenaran melalui qm_boleh_urus_insights.
CREATE OR REPLACE FUNCTION public.qm_at_risk_summary(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_class_id IS NULL THEN
    RAISE EXCEPTION 'class_id required';
  END IF;

  IF NOT public.qm_boleh_urus_insights(p_class_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH members AS (
    SELECT cm.user_id AS uid_ahli, p.display_name, p.username,
           cm.joined_at AS sertai
    FROM public.qm_class_members cm
    LEFT JOIN public.qm_profiles p ON p.id = cm.user_id
    WHERE cm.class_id = p_class_id
  ),
  class_hunts AS (
    SELECT id FROM public.qm_hunts WHERE class_id = p_class_id
  ),
  class_challenges AS (
    SELECT ch.id AS cabaran
    FROM public.qm_challenges ch
    JOIN class_hunts h ON h.id = ch.hunt_id
  ),
  sesi_kelas AS (
    SELECT ls.id AS sesi
    FROM public.qm_live_sessions ls
    JOIN public.qm_live_quizzes lq ON lq.id = ls.quiz_id
    WHERE lq.class_id = p_class_id
  ),
  ev AS (
    SELECT e.user_id AS uid, e.event_type AS jenis, e.created_at AS masa
    FROM public.qm_analytics_events e
    WHERE e.created_at > now() - interval '60 days'
      AND EXISTS (SELECT 1 FROM members m0 WHERE m0.uid_ahli = e.user_id)
  ),
  ev_agg AS (
    SELECT
      m.uid_ahli AS uid,
      MAX(ev.masa) AS last_event_at,
      COUNT(*) FILTER (WHERE ev.masa > now() - interval '7 days')  AS events_7d,
      COUNT(*) FILTER (WHERE ev.masa > now() - interval '30 days') AS events_30d,
      COUNT(*) FILTER (WHERE ev.jenis = 'quest_open'   AND ev.masa > now() - interval '30 days') AS quest_opens_30d,
      COUNT(*) FILTER (WHERE ev.jenis = 'quest_submit' AND ev.masa > now() - interval '30 days') AS quest_submits_30d
    FROM members m
    LEFT JOIN ev ON ev.uid = m.uid_ahli
    GROUP BY m.uid_ahli
  ),
  sub AS (
    SELECT s.user_id AS uid, s.status AS status_sub, s.created_at AS masa
    FROM public.qm_submissions s
    JOIN class_challenges cc ON cc.cabaran = s.challenge_id
  ),
  sub_agg AS (
    SELECT
      m.uid_ahli AS uid,
      COUNT(sub.uid) AS total_subs,
      COUNT(*) FILTER (WHERE sub.status_sub = 'approved') AS approved_subs,
      COUNT(*) FILTER (WHERE sub.status_sub = 'rejected') AS rejected_subs,
      COUNT(*) FILTER (WHERE sub.masa > now() - interval '7 days')  AS subs_7d,
      COUNT(*) FILTER (WHERE sub.masa > now() - interval '30 days') AS subs_30d,
      MAX(sub.masa) AS last_sub_at
    FROM members m
    LEFT JOIN sub ON sub.uid = m.uid_ahli
    GROUP BY m.uid_ahli
  ),
  acara_maks AS (
    SELECT e.user_id AS uid, MAX(e.created_at) AS maks
    FROM public.qm_analytics_events e
    JOIN members m1 ON m1.uid_ahli = e.user_id
    GROUP BY e.user_id
  ),
  hantar_maks AS (
    SELECT s.user_id AS uid, MAX(s.created_at) AS maks
    FROM public.qm_submissions s
    JOIN class_challenges cc2 ON cc2.cabaran = s.challenge_id
    GROUP BY s.user_id
  ),
  jawab_maks AS (
    SELECT lp.user_id AS uid, MAX(la.created_at) AS maks
    FROM public.qm_live_answers la
    JOIN public.qm_live_players lp ON lp.id = la.player_id
    JOIN sesi_kelas sk ON sk.sesi = la.session_id
    WHERE lp.user_id IS NOT NULL
    GROUP BY lp.user_id
  ),
  terakhir AS (
    SELECT m2.uid_ahli AS uid,
           GREATEST(
             m2.sertai,
             COALESCE(am.maks, m2.sertai),
             COALESCE(hm.maks, m2.sertai),
             COALESCE(jm.maks, m2.sertai)
           ) AS last_event_at
    FROM members m2
    LEFT JOIN acara_maks am ON am.uid = m2.uid_ahli
    LEFT JOIN hantar_maks hm ON hm.uid = m2.uid_ahli
    LEFT JOIN jawab_maks jm ON jm.uid = m2.uid_ahli
  ),
  scored AS (
    SELECT
      m.uid_ahli AS user_id,
      m.display_name,
      m.username,
      t.last_event_at,
      COALESCE(e.events_7d, 0)        AS events_7d,
      COALESCE(e.events_30d, 0)       AS events_30d,
      COALESCE(e.quest_opens_30d, 0)  AS quest_opens_30d,
      COALESCE(e.quest_submits_30d, 0) AS quest_submits_30d,
      COALESCE(s.total_subs, 0)       AS total_subs,
      COALESCE(s.approved_subs, 0)    AS approved_subs,
      COALESCE(s.rejected_subs, 0)    AS rejected_subs,
      COALESCE(s.subs_7d, 0)          AS subs_7d,
      COALESCE(s.subs_30d, 0)         AS subs_30d,
      s.last_sub_at,
      CASE WHEN t.last_event_at IS NULL THEN 999
           ELSE EXTRACT(DAY FROM (now() - t.last_event_at))::int END AS days_since_event
    FROM members m
    LEFT JOIN ev_agg e ON e.uid = m.uid_ahli
    LEFT JOIN sub_agg s ON s.uid = m.uid_ahli
    LEFT JOIN terakhir t ON t.uid = m.uid_ahli
  ),
  risk AS (
    SELECT *,
      LEAST(100, GREATEST(0, (days_since_event * 7)))                                     AS r_inactivity,
      CASE WHEN events_7d = 0 THEN 60 WHEN events_7d < 3 THEN 30 ELSE 0 END               AS r_low_recent,
      CASE WHEN quest_opens_30d > 0 AND quest_submits_30d = 0 THEN 70
           WHEN quest_opens_30d > 0 AND quest_submits_30d::numeric / quest_opens_30d < 0.2 THEN 40
           ELSE 0 END                                                                    AS r_open_no_submit,
      CASE WHEN subs_30d = 0 THEN 50 WHEN subs_7d = 0 AND subs_30d < 3 THEN 25 ELSE 0 END AS r_sub_drought,
      CASE WHEN (approved_subs + rejected_subs) >= 3
             AND rejected_subs::numeric / GREATEST(approved_subs + rejected_subs, 1) > 0.5 THEN 30
           ELSE 0 END                                                                    AS r_reject_rate
    FROM scored
  ),
  final AS (
    SELECT *,
      LEAST(100, ROUND(
        (r_inactivity     * 0.30) +
        (r_low_recent     * 0.20) +
        (r_open_no_submit * 0.20) +
        (r_sub_drought    * 0.20) +
        (r_reject_rate    * 0.10)
      ))::int AS risk_score
    FROM risk
  )
  SELECT jsonb_build_object(
    'class_id', p_class_id,
    'generated_at', now(),
    'students',
    COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'user_id', f.user_id,
           'display_name', f.display_name,
           'username', f.username,
           'risk_score', f.risk_score,
           'risk_bucket', CASE WHEN f.risk_score >= 70 THEN 'high'
                                WHEN f.risk_score >= 40 THEN 'medium'
                                ELSE 'low' END,
           'days_since_event', f.days_since_event,
           'last_event_at', f.last_event_at,
           'events_7d', f.events_7d,
           'events_30d', f.events_30d,
           'quest_opens_30d', f.quest_opens_30d,
           'quest_submits_30d', f.quest_submits_30d,
           'total_subs', f.total_subs,
           'approved_subs', f.approved_subs,
           'rejected_subs', f.rejected_subs,
           'subs_7d', f.subs_7d,
           'subs_30d', f.subs_30d,
           'last_sub_at', f.last_sub_at,
           'reasons', (
             SELECT to_jsonb(ARRAY_REMOVE(ARRAY[
               CASE WHEN f.days_since_event >= 14 THEN 'Inactive for '||f.days_since_event||' days' WHEN f.days_since_event >= 7 THEN 'No activity in 7+ days' END,
               CASE WHEN f.events_7d = 0 THEN 'No events in the last 7 days' END,
               CASE WHEN f.quest_opens_30d > 0 AND f.quest_submits_30d = 0 THEN 'Opens quests but never submits' END,
               CASE WHEN f.subs_30d = 0 AND f.total_subs > 0 THEN 'No submissions in 30 days (was previously active)' END,
               CASE WHEN f.subs_30d = 0 AND f.total_subs = 0 THEN 'Never submitted anything' END,
               CASE WHEN (f.approved_subs + f.rejected_subs) >= 3 AND f.rejected_subs::numeric / GREATEST(f.approved_subs + f.rejected_subs,1) > 0.5 THEN 'High rejection rate (>50%)' END
             ], NULL))
           )
         )
         ORDER BY f.risk_score DESC, f.days_since_event DESC
       )
       FROM final f),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.qm_at_risk_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_at_risk_summary(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. qm_insights_kelas: data penuh tab Insights
-- ---------------------------------------------------------------------
-- Semua nombor integer atau numerik dibundarkan 1 titik perpuluhan.
-- Markah individu daripada view qm_class_individual_scores supaya konsisten
-- dengan halaman People. Kunci jawapan qm_live_questions.correct_key TIDAK
-- dipulangkan; hanya label pilihan (correct_label) untuk rujukan educator
-- yang memang pemilik kuiz.
CREATE OR REPLACE FUNCTION public.qm_insights_kelas(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.qm_insights_kelas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_insights_kelas(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

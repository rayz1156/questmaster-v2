-- 0043_minat_pelan.sql
-- Tiket V2-006: halaman /naik-taraf merekod minat pelan sebagai satu baris
-- qm_feedback dengan type = 'plan_interest'.
--
-- Keadaan sedia ada (sql/migrations/2026_05_11_help_translate_analytics.sql):
--   * CHECK type hanya ('bug','idea','question','other'), jadi 'plan_interest'
--     akan ditolak oleh constraint.
--   * Polisi INSERT qm_feedback WITH CHECK (true) TO public: sesiapa sahaja
--     boleh memasukkan baris dengan user_id orang lain. Polisi longgar ini
--     dikuatkuasakan semula di sini supaya tidak boleh dipakai untuk menulis
--     bagi pengguna lain atau jenis lain.
--
-- Idempoten: selamat dijalankan semula. Tiada COMMIT dalam fail migrasi.

-- 1. Benarkan type baharu 'plan_interest' pada constraint sedia ada.
ALTER TABLE public.qm_feedback DROP CONSTRAINT IF EXISTS qm_feedback_type_check;
ALTER TABLE public.qm_feedback ADD CONSTRAINT qm_feedback_type_check
  CHECK (type IN ('bug','idea','question','other','plan_interest'));

-- 2. Polisi INSERT dibahagikan mengikut peranan.
--    anon: hanya borang maklum balas tetamu, tanpa user_id, jenis lama sahaja.
--    authenticated: jenis lama untuk diri sendiri (atau tanpa user_id),
--    dan 'plan_interest' hanya untuk baris sendiri (user_id = auth.uid()).
DROP POLICY IF EXISTS qm_feedback_insert ON public.qm_feedback;
DROP POLICY IF EXISTS qm_feedback_insert_anon ON public.qm_feedback;
DROP POLICY IF EXISTS qm_feedback_insert_auth ON public.qm_feedback;

CREATE POLICY qm_feedback_insert_anon ON public.qm_feedback
  FOR INSERT TO anon
  WITH CHECK (
    user_id IS NULL
    AND type IN ('bug','idea','question','other')
  );

CREATE POLICY qm_feedback_insert_auth ON public.qm_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      type IN ('bug','idea','question','other')
      AND (user_id IS NULL OR user_id = auth.uid())
    )
    OR
    (
      type = 'plan_interest'
      AND user_id = auth.uid()
    )
  );

-- 3. Segarkan semula skema untuk PostgREST (constraint table berubah).
notify pgrst, 'reload schema';

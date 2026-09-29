-- 0045_direktori_pengguna_selamat.sql (tiket V2-007)
--
-- qm_user_directory sebelum ini ialah fungsi SECURITY DEFINER yang
-- memulangkan nama dan EMEL sesiapa sahaja kepada mana-mana pemanggil
-- (ACL lama: GRANT kepada anon, authenticated, service_role; lihat
-- skema production baris 12276-12282). Mana-mana pengguna log masuk boleh
-- mengintip emel pengguna lain dengan meneka uuid.
--
-- Fungsi baharu mengekalkan hasil sama TABLE(user_id, display_name, email)
-- tetapi menyekat baris:
--   * pentadbir (qm_is_admin()) nampak semua id yang diminta;
--   * pemanggil lain hanya nampak id yang berkongsi SEKURANG-KURANGNYA
--     satu kelas dengannya: pemanggil pemilik atau educator (jemputan
--     diterima) kelas itu, atau pemanggil ahli kelas itu;
--   * emel hanya diberi kepada pemilik/educator kelas itu atau pentadbir;
--     ahli kelas yang sama nampak nama sahaja (email NULL);
--   * id tiada kelas kongsi tidak dipulangkan langsung.
--
-- ACL baharu: REVOKE ALL daripada PUBLIC dan anon; GRANT EXECUTE kepada
-- authenticated dan service_role sahaja.
--
-- Idempoten: CREATE OR REPLACE. Setelah digunakan, PostgREST nampak fungsi
-- yang sama (tanda tangan tak berubah), jadi tiada reload schema diperlukan,
-- tetapi notify tetap selamat jika dijalankan.

CREATE OR REPLACE FUNCTION public.qm_user_directory(p_ids uuid[])
RETURNS TABLE(user_id uuid, display_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH panggil AS (
    SELECT auth.uid() AS pemanggil
  ),
  kelas_pendidik AS (
    -- Kelas yang pemanggil pemilik, atau educator yang sudah terima jemputan
    SELECT c.id
    FROM public.qm_classes c
    WHERE c.owner_id = (SELECT pemanggil FROM panggil)
    UNION
    SELECT ce.class_id
    FROM public.qm_class_educators ce
    WHERE ce.educator_id = (SELECT pemanggil FROM panggil)
      AND ce.accepted_at IS NOT NULL
  ),
  kelas_ahli AS (
    -- Kelas yang pemanggil ahli biasa
    SELECT cm.class_id
    FROM public.qm_class_members cm
    WHERE cm.user_id = (SELECT pemanggil FROM panggil)
  ),
  sasaran(id) AS (
    SELECT x.id FROM unnest(p_ids) AS x(id)
  )
  SELECT s.id,
         COALESCE(
           NULLIF(p.display_name, ''),
           NULLIF(u.raw_user_meta_data->>'display_name', ''),
           NULLIF(u.raw_user_meta_data->>'name', ''),
           split_part(u.email, '@', 1)
         ),
         CASE
           WHEN (SELECT public.qm_is_admin()) THEN u.email::text
           WHEN EXISTS (
             -- Pemanggil pendidik kelas kongsi: emel diberi
             SELECT 1
             FROM public.qm_class_members tm
             WHERE tm.user_id = s.id
               AND tm.class_id IN (SELECT id FROM kelas_pendidik)
           ) OR EXISTS (
             SELECT 1
             FROM public.qm_class_educators te
             WHERE te.educator_id = s.id
               AND te.accepted_at IS NOT NULL
               AND te.class_id IN (SELECT id FROM kelas_pendidik)
           ) THEN u.email::text
           ELSE NULL
         END
  FROM sasaran s
  JOIN auth.users u ON u.id = s.id
  LEFT JOIN public.qm_profiles p ON p.id = s.id
  WHERE (SELECT public.qm_is_admin())
     OR EXISTS (
       -- Kongsi kelas sebagai pendidik pemanggil: ahli atau educator sasaran
       SELECT 1
       FROM public.qm_class_members tm
       WHERE tm.user_id = s.id
         AND (tm.class_id IN (SELECT id FROM kelas_pendidik)
              OR tm.class_id IN (SELECT id FROM kelas_ahli))
     ) OR EXISTS (
       SELECT 1
       FROM public.qm_class_educators te
       WHERE te.educator_id = s.id
         AND (te.class_id IN (SELECT id FROM kelas_pendidik)
              OR te.class_id IN (SELECT id FROM kelas_ahli))
     );
$$;

REVOKE ALL ON FUNCTION public.qm_user_directory(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qm_user_directory(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.qm_user_directory(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qm_user_directory(uuid[]) TO service_role;

ALTER FUNCTION public.qm_user_directory(uuid[]) OWNER TO postgres;

-- 0062_kiraan_ahli_kumpulan_terhad.sql
--
-- KZ-015: public.qm_team_member_counts(p_class_id) ialah SECURITY DEFINER
-- tanpa semakan pemanggil, dan diberi kepada anon. Sesiapa (tanpa log masuk)
-- boleh membaca bilangan ahli setiap kumpulan bagi mana-mana kelas.
-- Definisi asal hanya wujud dalam pangkalan data production (tiada dalam repo).
--
-- Pembetulan: fungsi yang sama (tandatangan dan bentuk keputusan tidak
-- berubah) tetapi hanya memulangkan baris jika pemanggil log masuk DAN
-- pemilik kelas, pendidik kelas, ahli kelas atau pentadbir. Pemanggil lain
-- mendapat keputusan kosong (UI sedia ada jatuh kepada 0, tiada ralat).
-- Geran: ditarik daripada PUBLIC dan anon.
--
-- Pemanggil sedia ada: /educator/teams, /educator/classes/[id]/people,
-- /participant/teams (ahli kelas), semuanya pengguna log masuk.
--
-- Tiada BEGIN/COMMIT. Jalankan:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -1 -f - < supabase/migrations/0062_kiraan_ahli_kumpulan_terhad.sql

CREATE OR REPLACE FUNCTION public.qm_team_member_counts(p_class_id uuid)
RETURNS TABLE(team_id uuid, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tm.team_id, count(*) AS cnt
    FROM qm_team_members tm
    JOIN qm_teams t ON t.id = tm.team_id
   WHERE t.class_id = p_class_id
     AND auth.uid() IS NOT NULL
     AND (   public.qm_is_class_owner(p_class_id)
          OR public.qm_is_class_educator(p_class_id)
          OR public.qm_is_class_member(p_class_id)
          OR public.qm_is_admin())
   GROUP BY tm.team_id;
$$;

REVOKE ALL ON FUNCTION public.qm_team_member_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qm_team_member_counts(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- 0063_bonus_kumpulan_tanpa_aktiviti.sql
--
-- KZ-016: markah bonus kumpulan tanpa aktiviti.
--
-- Masalah 1: halaman /educator/teams menghantar activeId = '' apabila kelas
-- tiada aktiviti, menghasilkan ralat Postgres `invalid input syntax for type
-- uuid: ""`. Punca: qm_score_adjustments.hunt_id diwajibkan NOT NULL.
-- Masalah 2: bonus dari halaman Teams diikat pada aktiviti pertama, jadi bonus
-- hilang apabila aktiviti itu dipadam (FK ON DELETE CASCADE).
-- Masalah 3 (keselamatan): polisi p_sa_team_read membenarkan mana-mana ahli
-- kumpulan membaca semua pelarasan markah semua kelas.
--
-- Penyelesaian: hunt_id dibolehkan NULL (bonus peringkat kelas), fungsi
-- semakan baharu qm_is_team_class_educator(p_team), polisi p_sa_educator
-- diganti supaya menangani kedua-dua bentuk (hunt sah / hunt null), dan
-- p_sa_team_read ditulis semula supaya hanya ahli kumpulan itu yang boleh
-- membaca pelarasan kumpulannya.
--
-- View qm_class_team_scores menjumlahkan qm_score_adjustments mengikut
-- team_id sahaja, jadi bonus dengan hunt_id NULL dikira dalam markah kelas
-- tanpa sebarang perubahan view.
--
-- Tiada BEGIN/COMMIT (psql -1 membungkus transaksi). Jalankan:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -1 -f - < supabase/migrations/0063_bonus_kumpulan_tanpa_aktiviti.sql

-- 1. hunt_id boleh NULL: bonus peringkat kelas tidak diikat pada aktiviti.
alter table public.qm_score_adjustments alter column hunt_id drop not null;

-- 2. Fungsi semakan: adakah pemanggil pendidik kelas yang memiliki kumpulan
--    ini? Kelas kumpulan ialah class_id sendiri, atau class_id aktivitinya
--    jika kumpulan itu masih diikat pada hunt.
create or replace function public.qm_is_team_class_educator(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $f$
  select exists (
    select 1
      from qm_teams t
     where t.id = p_team
       and coalesce(t.class_id, (select h.class_id from qm_hunts h where h.id = t.hunt_id)) is not null
       and public.qm_is_class_educator(
             coalesce(t.class_id, (select h.class_id from qm_hunts h where h.id = t.hunt_id)))
  );
$f$;

revoke all on function public.qm_is_team_class_educator(uuid) from public, anon;
grant execute on function public.qm_is_team_class_educator(uuid) to authenticated;

-- 3. Polisi pendidik: dua bentuk. hunt_id sah -> semakan lama ikut aktiviti;
--    hunt_id null -> semakan ikut pemilikan kelas kumpulan itu. WITH CHECK
--    turut menahan UPDATE yang menukar team_id kepada kumpulan kelas lain.
drop policy if exists p_sa_educator on public.qm_score_adjustments;
create policy p_sa_educator on public.qm_score_adjustments for all
  using (
    (hunt_id is not null and public.qm_is_hunt_class_educator(hunt_id))
    or
    (hunt_id is null and public.qm_is_team_class_educator(team_id))
  )
  with check (
    (hunt_id is not null and public.qm_is_hunt_class_educator(hunt_id))
    or
    (hunt_id is null and public.qm_is_team_class_educator(team_id))
  );

-- 4. Pembetulan keselamatan: ahli kumpulan hanya boleh membaca pelarasan
--    kumpulannya sendiri (versi asal membandingkan tm.team_id dengan dirinya
--    sendiri, sentiasa benar).
drop policy if exists p_sa_team_read on public.qm_score_adjustments;
create policy p_sa_team_read on public.qm_score_adjustments for select
  using (
    exists (
      select 1 from public.qm_team_members tm
       where tm.team_id = public.qm_score_adjustments.team_id
         and tm.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';

-- 0015_leaderboard_visibility.sql
-- Membenarkan educator menyembunyikan atau menunjukkan leaderboard kepada peserta.
--
-- Default `true` supaya kelas sedia ada kekal seperti sekarang selepas deploy.
-- Tiada polisi RLS baharu diperlukan: p_class_educator_rw dan p_class_owner
-- sudah memberi educator kuasa UPDATE pada kelas mereka, dan p_class_member_read
-- memberi peserta SELECT. Peserta tidak boleh menulis lajur ini.

begin;

alter table public.qm_classes
  add column if not exists leaderboard_visible boolean not null default true;

comment on column public.qm_classes.leaderboard_visible is
  'Apabila false, tab Ranking disembunyikan daripada peserta dan halaman leaderboard menolak akses langsung. Educator dan admin sentiasa boleh melihatnya.';

commit;

-- 0086_susulan_lalai_hidup.sql
-- KZ-UTT Fasa 4 susulan (28 Nov 2026), keputusan Boss Hariz:
--   1. E-mel susulan T2 dan T3 dihidupkan secara lalai.
--   2. Teks persetujuan tidak wajib; semua peserta dianggap bersetuju secara
--      lalai (logik dalam src/lib/kajian-solo-api.ts, bolehEksport). Tarik diri
--      dan berhenti langganan melalui pautan e-mel kekal.
--   3. Setiap kuiz mod ujian yang dikongsi dengan kelas mendapat pelan
--      automatik, supaya e-mel T3 berjalan tanpa pendidik membuka panel.
--      Pelan baharu bagi kuiz yang dihidupkan mod ujian kemudian dicipta oleh
--      laluan POST /api/live/quizzes/[quizId]/solo.
-- Idempoten.

alter table public.qm_solo_measure_plans alter column emails_enabled set default true;

insert into public.qm_solo_measure_plans (quiz_id, class_id, emails_enabled)
select q.id, q.class_id, true
  from public.qm_live_quizzes q
 where q.solo_test_mode = true
   and q.class_id is not null
on conflict (quiz_id) do nothing;

notify pgrst, 'reload schema';

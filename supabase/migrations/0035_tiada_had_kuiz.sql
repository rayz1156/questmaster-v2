-- 0035_tiada_had_kuiz.sql
-- Keputusan Boss Hariz, 27 Sep 2026: tiada had bilangan kuiz untuk pelan
-- percuma dan pro. Had yang kekal hanyalah bilangan peserta dalam sesi
-- langsung (max_live_players) dan had kelas.
--
-- qm_quiz_quota_left (0030) sudah memulangkan 2147483647 apabila
-- max_quizzes_owned bernilai NULL, jadi cukup jadikan lajur itu NULL.
-- Pencetus qm_guard_profile_privileges memin lajur ini pada UPDATE, maka
-- kemas kini dibuat dengan pencetus dilangkau untuk pernyataan ini sahaja.

ALTER TABLE public.qm_profiles ALTER COLUMN max_quizzes_owned DROP NOT NULL;
ALTER TABLE public.qm_profiles ALTER COLUMN max_quizzes_owned SET DEFAULT NULL;

SET session_replication_role = replica;
UPDATE public.qm_profiles SET max_quizzes_owned = NULL WHERE max_quizzes_owned IS NOT NULL;
SET session_replication_role = origin;

NOTIFY pgrst, 'reload schema';

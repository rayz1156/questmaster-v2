-- ============================================================
-- Migrasi 0020: pendidik boleh matikan kira detik bagi setiap soalan
-- Keputusan Dr Hariz, 20 September 2026.
--
-- use_countdown = true  (lalai)  -> time_limit_sec ialah HAD masa. Jawapan
--   selepas had tamat tidak diberi mata. Formula mata sama dengan Kahoot.
-- use_countdown = false          -> time_limit_sec ialah RENTAK rujukan
--   sahaja. Tiada jam berdetik pada skrin pemain dan tiada had, tetapi mata
--   masih menurun dengan masa melalui lengkung susut lembut, supaya pemain
--   yang lebih pantas tetap mendapat lebih.
--
-- Lalai true bermakna setiap soalan sedia ada berkelakuan sama seperti
-- sebelum migrasi ini. Idempoten. Akhiri dengan notify pgrst.
-- ============================================================

alter table public.qm_live_questions
  add column if not exists use_countdown boolean not null default true;

-- WAJIB. Tanpa ini PostgREST tidak nampak lajur baharu.
notify pgrst, 'reload schema';

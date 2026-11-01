-- 0069_bilik_ai_qwen.sql: KZ-034. Bilik AI guna Alibaba Qwen secara terus
-- (Model Studio antarabangsa, Singapura) melalui adapter OpenAI-serasi.
-- OpenRouter kekal dalam senarai tetapi dimatikan (enabled = false), tidak
-- dipadam, supaya baris lama yang menunjuk kepadinya tidak hilang.
--
-- Dijalankan oleh CTO di VPS:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     < supabase/migrations/0069_bilik_ai_qwen.sql
--
-- Ujian berkanun: supabase/tests/KZ-034.sql (BEGIN ... ROLLBACK).

-- ============================================================
-- 1. Benarkan penyedia 'qwen' pada qm_ai_models. CHECK 0068 ialah
--    CHECK sebaris tanpa nama, jadi nama lalai Postgres ialah
--    qm_ai_models_provider_check. Guna drop if exists supaya migrasi
--    boleh dijalankan dua kali tanpa ralat.
-- ============================================================
alter table public.qm_ai_models
  drop constraint if exists qm_ai_models_provider_check;

alter table public.qm_ai_models
  add constraint qm_ai_models_provider_check
  check (provider in ('openrouter', 'qwen'));

-- ============================================================
-- 2. Kosongkan is_default dahulu: indeks unik separa
--    qm_ai_models_satu_lalai_uniq hanya membenarkan satu baris lalai,
--    jadi sisipan lalai baharu di bawah gagal jika lama tidak dilepaskan
--    lebih dahulu. Idempoten: dijalankan semula, keadaan tetap sama.
-- ============================================================
update public.qm_ai_models set is_default = false where is_default;

-- ============================================================
-- 3. Sisip model Qwen lalai. on conflict (model_id) do update supaya
--    migrasi boleh dijalankan semula.
-- ============================================================
insert into public.qm_ai_models (provider, model_id, label, enabled, is_default, sort_order)
values
  ('qwen', 'qwen3.7-flash', 'Qwen3.7 Flash (pantas, jimat)', true, true, 0)
on conflict (model_id) do update set
  provider = excluded.provider,
  label = excluded.label,
  enabled = true,
  is_default = true,
  sort_order = 0;

-- ============================================================
-- 4. Matikan semua model OpenRouter. Barisnya KEKAL, tidak dipadam:
--    sejarah rujukan model_id bilik tidak rosak.
-- ============================================================
update public.qm_ai_models set enabled = false where provider = 'openrouter';

-- Bilik sedia ada yang model_id menunjuk model OpenRouter TIDAK diubah:
-- modelUntukBilik (src/lib/bilikAi.ts) sudah jatuh ke model lalai yang
-- didayakan apabila model bilik dimatikan, jadi bilik lama yang memilih
-- DeepSeek/Claude dijawab oleh Qwen3.7 Flash tanpa sebarang ralat.

-- Pastikan PostgREST melihat perubahan skema.
notify pgrst, 'reload schema';

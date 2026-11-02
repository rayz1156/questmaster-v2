-- 0071_ai_qwen_plus.sql: KZ-036. Tambah Qwen3.7 Plus sebagai pilihan model
-- yang lebih tepat untuk Bilik AI dan cadangan item LNA (DashScope
-- antarabangsa, penyedia 'qwen' yang sudah dibenarkan oleh CHECK 0069).
--
-- Baris lalai sedia ada (qwen3.7-flash, is_default true) TIDAK diubah.
-- Idempoten: sisip hanya jika tiada baris dengan provider + model_id sama.
--
-- Dijalankan oleh CTO di VPS:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     < supabase/migrations/0071_ai_qwen_plus.sql
--
-- Ujian berkanun: supabase/tests/KZ-036.sql (BEGIN ... ROLLBACK).

insert into public.qm_ai_models (provider, model_id, label, enabled, is_default, sort_order)
select 'qwen', 'qwen3.7-plus', 'Qwen3.7 Plus (lebih tepat)', true, false, 1
where not exists (
  select 1 from public.qm_ai_models
  where provider = 'qwen' and model_id = 'qwen3.7-plus'
);

-- Pastikan PostgREST melihat senarai model terkini.
notify pgrst, 'reload schema';

-- KZ-036.sql: ujian berkanun migrasi 0071_ai_qwen_plus.sql.
-- Dijalankan oleh CTO di VPS selepas 0071 dipakai, dalam SATU transaksi
-- yang digulung semula sepenuhnya. Tiada data kekal.
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/KZ-036.sql
-- Output akhir "KZ-036: SEMUA UJIAN LULUS" bermakna lulus.

begin;

-- ============================================================
-- Ujian 1: baris Qwen3.7 Plus wujud selepas migrasi dipakai, dengan
-- nilai yang betul (enabled true, bukan lalai, sort_order 1).
-- ============================================================
do $u$
declare
  v_count int;
  v_label text;
  v_hidup boolean;
  v_lalai boolean;
  v_sort int;
begin
  select count(*), max(label), max(enabled), max(is_default), max(sort_order)
    into v_count, v_label, v_hidup, v_lalai, v_sort
    from public.qm_ai_models
    where provider = 'qwen' and model_id = 'qwen3.7-plus';
  if v_count is distinct from 1 then
    raise exception 'UJIAN 1 GAGAL: baris qwen3.7-plus ada % baris, bukan tepat satu', v_count;
  end if;
  if v_label is distinct from 'Qwen3.7 Plus (lebih tepat)' then
    raise exception 'UJIAN 1 GAGAL: label %, bukan Qwen3.7 Plus (lebih tepat)', v_label;
  end if;
  if v_hidup is distinct from true then
    raise exception 'UJIAN 1 GAGAL: baris plus tidak enabled';
  end if;
  if v_lalai is distinct from false then
    raise exception 'UJIAN 1 GAGAL: baris plus menjadi is_default';
  end if;
  if v_sort is distinct from 1 then
    raise exception 'UJIAN 1 GAGAL: sort_order %, bukan 1', v_sort;
  end if;
  raise notice 'Ujian 1: baris plus wujud, enabled, bukan lalai (betul)';
end $u$;

-- ============================================================
-- Ujian 2: baris lalai kekal qwen3.7-flash, dan masih tepat satu
-- baris is_default (migrasi tidak menyentuhnya).
-- ============================================================
do $u$
declare
  v_count int;
  v_model text;
begin
  select count(*), max(model_id) into v_count, v_model
    from public.qm_ai_models where is_default;
  if v_count is distinct from 1 then
    raise exception 'UJIAN 2 GAGAL: is_default % baris, bukan tepat satu', v_count;
  end if;
  if v_model is distinct from 'qwen3.7-flash' then
    raise exception 'UJIAN 2 GAGAL: is_default ialah %, bukan qwen3.7-flash', v_model;
  end if;
  raise notice 'Ujian 2: tepat satu is_default, iaitu qwen3.7-flash (betul)';
end $u$;

-- ============================================================
-- Ujian 3: idempoten. Jalankan badan migrasi 0071 SEMULA di dalam
-- transaksi ini, kemudian sahakan tiada pendua dan lalai tidak berubah.
-- ============================================================
insert into public.qm_ai_models (provider, model_id, label, enabled, is_default, sort_order)
select 'qwen', 'qwen3.7-plus', 'Qwen3.7 Plus (lebih tepat)', true, false, 1
where not exists (
  select 1 from public.qm_ai_models
  where provider = 'qwen' and model_id = 'qwen3.7-plus'
);

do $u$
declare
  v_plus int;
  v_count int;
  v_model text;
begin
  select count(*) into v_plus
    from public.qm_ai_models
    where provider = 'qwen' and model_id = 'qwen3.7-plus';
  if v_plus is distinct from 1 then
    raise exception 'UJIAN 3 GAGAL: selepas jalanan kedua baris plus ada % baris, bukan satu', v_plus;
  end if;
  select count(*), max(model_id) into v_count, v_model
    from public.qm_ai_models where is_default;
  if v_count is distinct from 1 or v_model is distinct from 'qwen3.7-flash' then
    raise exception 'UJIAN 3 GAGAL: selepas jalanan kedua is_default % baris (%), bukan tepat satu qwen3.7-flash', v_count, v_model;
  end if;
  raise notice 'Ujian 3: migrasi 0071 idempoten, dijalankan dua kali tanpa pendua (betul)';
end $u$;

-- ============================================================
-- Ujian 4: baris qwen3.7-flash tidak diubah (label dan sort_order
-- kekal seperti 0069).
-- ============================================================
do $u$
declare
  v_label text;
  v_sort int;
  v_hidup boolean;
begin
  select max(label), max(sort_order), max(enabled)
    into v_label, v_sort, v_hidup
    from public.qm_ai_models
    where provider = 'qwen' and model_id = 'qwen3.7-flash';
  if v_label is distinct from 'Qwen3.7 Flash (pantas, jimat)'
    or v_sort is distinct from 0 or v_hidup is distinct from true then
    raise exception 'UJIAN 4 GAGAL: baris flash berubah (% , %, hidup %)', v_label, v_sort, v_hidup;
  end if;
  raise notice 'Ujian 4: baris lalai qwen3.7-flash tidak diubah (betul)';
end $u$;

do $$ begin raise notice 'KZ-036: SEMUA UJIAN LULUS'; end $$;

rollback;

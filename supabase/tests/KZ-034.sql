-- KZ-034.sql: ujian berkanun migrasi 0069_bilik_ai_qwen.sql.
-- Dijalankan oleh CTO di VPS selepas 0068 dan 0069 dipakai, dalam SATU
-- transaksi yang digulung semula sepenuhnya. Tiada data kekal.
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/KZ-034.sql
-- Output akhir "KZ-034: SEMUA UJIAN LULUS" bermakna lulus.
--
-- Ikut pengajaran v2 dalam _umum.md: tiada UUID ditulis tangan di sini
-- (id jana sendiri oleh gen_random_uuid()), raise notice hanya dalam
-- blok do.

begin;

-- ============================================================
-- Ujian 1: CHECK provider menerima 'qwen'.
-- ============================================================
insert into public.qm_ai_models (provider, model_id, label)
values ('qwen', 'ujian-kz034-qwen', 'Ujian Qwen KZ-034');

do $u$
begin
  if not exists (
    select 1 from public.qm_ai_models
    where model_id = 'ujian-kz034-qwen' and provider = 'qwen'
  ) then
    raise exception 'UJIAN 1 GAGAL: baris qwen tidak wujud selepas sisip';
  end if;
  raise notice 'Ujian 1: CHECK provider menerima qwen (betul)';
end $u$;

-- ============================================================
-- Ujian 2: CHECK provider menolak nilai lain. Exception block
-- PL/pgSQL membina subtransaksi, jadi sisipan gagal tidak mengotorkan
-- keadaan transaksi luar.
-- ============================================================
do $u$
begin
  insert into public.qm_ai_models (provider, model_id, label)
  values ('lain', 'ujian-kz034-lain', 'Ujian Lain KZ-034');
  raise exception 'UJIAN 2 GAGAL: CHECK sepatutnya menolak provider lain';
exception
  when check_violation then
    raise notice 'Ujian 2: CHECK provider menolak nilai lain (betul)';
end $u$;

-- ============================================================
-- Ujian 3: tepat satu baris is_default, dan ia qwen3.7-flash
-- (provider qwen).
-- ============================================================
do $u$
declare
  v_count int;
  v_model text;
  v_provider text;
begin
  select count(*), max(model_id), max(provider)
    into v_count, v_model, v_provider
    from public.qm_ai_models
    where is_default;
  if v_count is distinct from 1 then
    raise exception 'UJIAN 3 GAGAL: is_default % baris, bukan tepat satu', v_count;
  end if;
  if v_model is distinct from 'qwen3.7-flash' or v_provider is distinct from 'qwen' then
    raise exception 'UJIAN 3 GAGAL: is_default ialah % (%), bukan qwen3.7-flash (qwen)', v_model, v_provider;
  end if;
  raise notice 'Ujian 3: tepat satu is_default iaitu qwen3.7-flash (qwen) (betul)';
end $u$;

-- ============================================================
-- Ujian 4: semua baris openrouter enabled = false (dikekalkan, tidak
-- dipadam).
-- ============================================================
do $u$
declare
  v_hidup int;
  v_jumlah int;
begin
  select count(*) into v_hidup
    from public.qm_ai_models
    where provider = 'openrouter' and enabled;
  select count(*) into v_jumlah
    from public.qm_ai_models
    where provider = 'openrouter';
  if v_hidup is distinct from 0 then
    raise exception 'UJIAN 4 GAGAL: % baris openrouter masih didayakan', v_hidup;
  end if;
  if v_jumlah < 1 then
    raise exception 'UJIAN 4 GAGAL: tiada baris openrouter langsung, barisnya patut dikekalkan';
  end if;
  raise notice 'Ujian 4: % baris openrouter dikekalkan dan semuanya enabled = false (betul)', v_jumlah;
end $u$;

-- ============================================================
-- Ujian 5: idempoten. Jalankan semula badan migrasi 0069 di dalam
-- transaksi ini, kemudian ulang semakan 3 dan 4.
-- ============================================================
alter table public.qm_ai_models
  drop constraint if exists qm_ai_models_provider_check;

alter table public.qm_ai_models
  add constraint qm_ai_models_provider_check
  check (provider in ('openrouter', 'qwen'));

update public.qm_ai_models set is_default = false where is_default;

insert into public.qm_ai_models (provider, model_id, label, enabled, is_default, sort_order)
values
  ('qwen', 'qwen3.7-flash', 'Qwen3.7 Flash (pantas, jimat)', true, true, 0)
on conflict (model_id) do update set
  provider = excluded.provider,
  label = excluded.label,
  enabled = true,
  is_default = true,
  sort_order = 0;

update public.qm_ai_models set enabled = false where provider = 'openrouter';

do $u$
declare
  v_count int;
  v_model text;
  v_hidup int;
begin
  select count(*), max(model_id) into v_count, v_model
    from public.qm_ai_models where is_default;
  if v_count is distinct from 1 or v_model is distinct from 'qwen3.7-flash' then
    raise exception 'UJIAN 5 GAGAL: selepas jalanan kedua is_default % baris (%), bukan tepat satu qwen3.7-flash', v_count, v_model;
  end if;
  select count(*) into v_hidup
    from public.qm_ai_models
    where provider = 'openrouter' and enabled;
  if v_hidup is distinct from 0 then
    raise exception 'UJIAN 5 GAGAL: selepas jalanan kedua % baris openrouter masih didayakan', v_hidup;
  end if;
  raise notice 'Ujian 5: migrasi 0069 idempoten, dijalankan dua kali tanpa ralat (betul)';
end $u$;

do $$ begin raise notice 'KZ-034: SEMUA UJIAN LULUS'; end $$;

rollback;

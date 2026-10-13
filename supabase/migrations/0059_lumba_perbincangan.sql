-- 0059_lumba_perbincangan.sql
-- Mod perbincangan selepas Lumba Laju: pendidik melalui soalan satu demi satu
-- bersama kelas (soalan, taburan cubaan pertama, dedah jawapan).
-- Hanya menambah lajur dengan nilai lalai. Rollback: drop kedua-dua lajur.
begin;
alter table public.qm_live_sessions
  add column if not exists review_index    integer not null default -1,
  add column if not exists review_revealed boolean not null default false;
notify pgrst, 'reload schema';
commit;

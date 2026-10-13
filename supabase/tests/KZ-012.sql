-- Ujian KZ-012: migrasi 0059 dalam transaksi yang dibatalkan.
-- Jalankan: psql -v ON_ERROR_STOP=1 -f KZ-012.sql
begin;

alter table public.qm_live_sessions
  add column if not exists review_index    integer not null default -1,
  add column if not exists review_revealed boolean not null default false;

do $$
declare n int; v_idx int; v_rev boolean;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'qm_live_sessions'
     and column_name in ('review_index', 'review_revealed');
  if n <> 2 then raise exception 'lajur review tidak lengkap: %', n; end if;

  select count(*) into n from public.qm_live_sessions
   where review_index <> -1 or review_revealed <> false;
  if n <> 0 then raise exception 'nilai lalai salah pada % baris', n; end if;

  -- Laluan kawalan menulis lajur ini; pastikan kemas kini biasa berfungsi.
  update public.qm_live_sessions set review_index = 2, review_revealed = true
   where id = (select id from public.qm_live_sessions order by created_at desc limit 1)
  returning review_index, review_revealed into v_idx, v_rev;
  raise notice 'KZ-012 OK: lajur ada, lalai betul, kemas kini % %', v_idx, v_rev;
end $$;

rollback;

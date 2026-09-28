-- 0038_sertai_kelas_pratonton.sql
-- Tiket V2-004: aliran sertai kelas melalui pautan /j/[kod].
-- 1. qm_normalize_class_code: upper, buang jarak/sengkang/garis bawah,
--    O -> 0, I dan L -> 1. NULL masuk, NULL keluar.
-- 2. qm_class_preview_by_code: pratonton selamat untuk kad sertai.
--    Hanya kelas tidak diarkib. Tiada emel, deskripsi, owner_id atau data lain.
-- 3. qm_join_class_by_code: logik sama seperti production tetapi perbandingan
--    kod guna normalisasi, supaya "ab-cd 12o1" menemui kelas ABCD1201.
-- Di jalankan secara manual di VPS. Fail ini tidak menamatkan transaksi sendiri.

-- ---------------------------------------------------------------------------
-- 1. Normalisasi kod kelas
-- IMMUTABLE supaya boleh diguna dalam ungkapan indeks pada masa depan.
-- translate('OIL' -> '011'): O jadi 0, I dan L jadi 1.
-- ---------------------------------------------------------------------------
create or replace function public.qm_normalize_class_code(p text)
returns text
language sql
immutable
as $f$
  select nullif(
    translate(
      regexp_replace(upper(coalesce(p, '')), '[[:space:]\-_]', '', 'g'),
      'OIL',
      '011'
    ),
    ''
  )
$f$;

-- ---------------------------------------------------------------------------
-- 2. Pratonton kelas melalui kod
-- SECURITY DEFINER dengan search_path tetap; hanya pengguna authenticated
-- dibenarkan memanggil (REVOKE daripada public dan anon).
-- Satu baris sahaja: nama kelas, nama educator (display_name pemilik), warna,
-- status tamat dan status keahlian sedia ada.
-- ---------------------------------------------------------------------------
create or replace function public.qm_class_preview_by_code(p_code text)
returns table (
  class_id uuid,
  class_name text,
  educator_name text,
  class_color text,
  is_ended boolean,
  already_member boolean
)
language sql
security definer
set search_path = public
as $f$
  select
    c.id,
    c.name,
    p.display_name,
    c.color,
    c.ended_at is not null,
    exists(
      select 1
        from public.qm_class_members m
       where m.class_id = c.id
         and m.user_id = auth.uid()
    )
  from public.qm_classes c
  join public.qm_profiles p on p.id = c.owner_id
  where public.qm_normalize_class_code(c.join_code) = public.qm_normalize_class_code(p_code)
    and c.is_archived = false
$f$;

revoke all on function public.qm_class_preview_by_code(text) from public;
revoke all on function public.qm_class_preview_by_code(text) from anon;
grant execute on function public.qm_class_preview_by_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC sertai kelas
-- Logik SAMA seperti definisi semasa (sql/migrations/2026_05_20_class_end.sql:30)
-- tetapi perbandingan kod guna qm_normalize_class_code dan SET search_path ditambah.
-- Mesej ralat dikekalkan kerana UI bergantung padanya.
-- ---------------------------------------------------------------------------
create or replace function public.qm_join_class_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_class uuid;
  v_ended timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select id, ended_at
    into v_class, v_ended
    from public.qm_classes
   where public.qm_normalize_class_code(join_code) = public.qm_normalize_class_code(p_code)
     and is_archived = false;

  if v_class is null then
    raise exception 'Invalid class code';
  end if;

  if v_ended is not null then
    raise exception 'This class has ended and is no longer accepting new members';
  end if;

  insert into public.qm_class_members(class_id, user_id)
    values (v_class, auth.uid())
    on conflict do nothing;

  return v_class;
end
$function$;

grant execute on function public.qm_join_class_by_code(text) to authenticated;

-- Beritahu PostgREST supaya RPC baharu dikesan.
notify pgrst, 'reload schema';

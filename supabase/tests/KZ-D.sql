-- KZ-D.sql: ujian penerimaan log Encharge, isi semula dan bendera UI (0081).
-- Jalankan dengan 0081 DI DALAM transaksi fail ini:
--   { echo 'begin;'; cat 0081_encharge_sync_bendera_ui.sql; sed '1,/^begin;$/d' KZ-D.sql; } | psql -v ON_ERROR_STOP=1
-- Berakhir dengan rollback. "KZ-D: SEMUA UJIAN LULUS" bermakna semua lulus.

begin;

set session_replication_role = replica;
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000d00e1', 'kzd-pensyarah@ujian.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000d00e2', 'kzd-luar@ujian.invalid',      'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000d00a1', 'KZD-P1@Ujian.Invalid',        'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000d00a2', 'kzd-p2@ujian.invalid',        'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000d00a3', 'kzd-p3@ujian.invalid',        'authenticated', 'authenticated', now(), now());
set session_replication_role = origin;

insert into public.qm_profiles (id, role, display_name, plan, approved, suspended, created_at) values
  ('00000000-0000-0000-0000-0000000d00e1', 'educator',    'Pensyarah KZ-D', 'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000d00e2', 'educator',    'Luar KZ-D',      'pro',  true, false, now()),
  ('00000000-0000-0000-0000-0000000d00a1', 'participant', 'P1',             'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000d00a2', 'participant', 'P2',             'free', true, false, now()),
  ('00000000-0000-0000-0000-0000000d00a3', 'participant', 'P3',             'free', true, false, now())
on conflict (id) do nothing;

insert into public.qm_classes (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d00e1', 'PAIC M04 Ujian!'),
  ('00000000-0000-0000-0000-0000000d0c02', '00000000-0000-0000-0000-0000000d00e1', 'Kelas Tidak Padan');

-- Kelas 1: dua ahli sebelum eksport, satu ahli selepas eksport.
insert into public.qm_class_members (class_id, user_id, joined_at) values
  ('00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d00a1', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d00a2', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000d0c01', '00000000-0000-0000-0000-0000000d00a3', now()),
  ('00000000-0000-0000-0000-0000000d0c02', '00000000-0000-0000-0000-0000000d00a1', now() - interval '2 days');

insert into public.qm_email_sync_log (owner_id, class_id, provider, total, sent, skipped, failed, consent_confirmed, created_at) values
  ('00000000-0000-0000-0000-0000000d00e1', '00000000-0000-0000-0000-0000000d0c01', 'encharge', 2, 2, 0, 0, true, now() - interval '1 day'),
  -- Tidak padan: sent 3 tetapi hanya 1 calon.
  ('00000000-0000-0000-0000-0000000d00e1', '00000000-0000-0000-0000-0000000d0c02', 'encharge', 3, 3, 0, 0, true, now() - interval '1 day');

-- Ujian 1: isi semula memetakan kelas 1 sahaja (2 baris, e-mel huruf kecil, tag betul).
do $u$
declare n int; t text[]; e text;
begin
  n := public.qm_encharge_backfill_from_ui_logs();
  if n <> 2 then raise exception 'UJIAN 1 GAGAL (bilangan): %', n; end if;
  select tags, email into t, e from public.qm_encharge_sync_log
   where class_id = '00000000-0000-0000-0000-0000000d0c01'
     and participant_id = '00000000-0000-0000-0000-0000000d00a1';
  if t <> array['kuizen', 'kuizen-paic-m04-ujian'] or e <> 'kzd-p1@ujian.invalid' then
    raise exception 'UJIAN 1 GAGAL (tag/e-mel): % %', t, e;
  end if;
  if exists (select 1 from public.qm_encharge_sync_log where class_id = '00000000-0000-0000-0000-0000000d0c02') then
    raise exception 'UJIAN 1 GAGAL: kelas tidak padan diisi';
  end if;
  if exists (select 1 from public.qm_encharge_sync_log where participant_id = '00000000-0000-0000-0000-0000000d00a3') then
    raise exception 'UJIAN 1 GAGAL: ahli selepas eksport diisi';
  end if;
  -- Idempoten: panggilan kedua tidak menambah baris.
  n := public.qm_encharge_backfill_from_ui_logs();
  if n <> 0 then raise exception 'UJIAN 1 GAGAL (idempoten): %', n; end if;
end $u$;

-- Ujian 2: kekangan unik dan e-mel mesti diseragamkan.
do $u$
begin
  begin
    insert into public.qm_encharge_sync_log (owner_id, class_id, email, status)
    values ('00000000-0000-0000-0000-0000000d00e1', '00000000-0000-0000-0000-0000000d0c01', 'kzd-p1@ujian.invalid', 'sent');
    raise exception 'UJIAN 2 GAGAL: pendua diterima';
  exception when unique_violation then null;
  end;
  begin
    insert into public.qm_encharge_sync_log (owner_id, class_id, email, status)
    values ('00000000-0000-0000-0000-0000000d00e1', '00000000-0000-0000-0000-0000000d0c01', ' X@Y.COM', 'sent');
    raise exception 'UJIAN 2 GAGAL: e-mel tidak seragam diterima';
  exception when check_violation then null;
  end;
end $u$;

-- Ujian 3: RLS: pemilik membaca, pendidik luar tidak; tulisan ditolak; laporan.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000d00e1", "role": "authenticated"}', true);
set local role authenticated;
do $u$
declare n int;
begin
  select count(*) into n from public.qm_encharge_sync_log;
  if n <> 2 then raise exception 'UJIAN 3 GAGAL (pemilik): %', n; end if;
  select count(*) into n from public.qm_encharge_backfill_report()
   where class_id = '00000000-0000-0000-0000-0000000d0c02';
  if n <> 1 then raise exception 'UJIAN 3 GAGAL (laporan): %', n; end if;
  begin
    delete from public.qm_encharge_sync_log;
    raise exception 'UJIAN 3 GAGAL: padam dibenarkan';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.qm_encharge_backfill_from_ui_logs();
    raise exception 'UJIAN 3 GAGAL: isi semula dibenarkan untuk authenticated';
  exception when insufficient_privilege then null;
  end;
  -- Bendera UI pada profil sendiri.
  update public.qm_profiles set ui_hide_encharge = true, ui_hide_certificates = true
   where id = '00000000-0000-0000-0000-0000000d00e1';
  if not (select ui_hide_encharge and ui_hide_certificates from public.qm_profiles
           where id = '00000000-0000-0000-0000-0000000d00e1') then
    raise exception 'UJIAN 3 GAGAL: bendera tidak disimpan';
  end if;
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000d00e2", "role": "authenticated"}', true);
  select count(*) into n from public.qm_encharge_sync_log;
  if n <> 0 then raise exception 'UJIAN 3 GAGAL (luar): %', n; end if;
end $u$;

reset role;
select 'KZ-D: SEMUA UJIAN LULUS' as keputusan;

rollback;

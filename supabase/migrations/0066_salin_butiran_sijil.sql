-- 0066_salin_butiran_sijil.sql
--
-- KZ-030: butiran sijil (fields: signer_name, signer_title, location,
-- course, date) dan tandatangan (signature_path) disalin automatik
-- daripada templat sijil yang sudah berbutiran kepada templat yang
-- kosong, supaya menukar templat aktif tidak lagi menghasilkan sijil
-- tanpa tandatangan dan tanpa nama/jawatan penandatangan.
--
-- Peraturan: medan yang SUDAH diisi pada templat sasaran TIDAK ditimpa.
-- Fail storan tandatangan TIDAK dipadam semasa delete templat (KZ-029),
-- jadi templat sasaran boleh merujuk fail storan templat sumber yang
-- sama dalam kelas yang sama.
--
-- Tiada BEGIN/COMMIT di sini (perangkap: fail migrasi tidak boleh
-- mengandungi COMMIT). Idempoten: drop if exists / or replace di mana
-- mungkin. Polisi RLS dan pencetus 0056 sedia ada tidak diubah.

-- ---------------------------------------------------------------------
-- 1. Longgarkan CHECK signature_path (0054): salinan butiran merujuk
--    fail storan templat sumber, jadi segment kedua laluan tidak lagi
--    semestinya id templat sendiri. Pertahanan kzsec S1 KEKAL pada
--    peringkat kelas: segment pertama mesti class_id, jadi templat
--    tidak boleh merujuk aset kelas lain.
-- ---------------------------------------------------------------------
alter table public.qm_certificate_templates
  drop constraint if exists qm_cert_tpl_signature_ruang_nama_chk;

do $chk$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.qm_certificate_templates'::regclass
       and conname = 'qm_cert_tpl_signature_ruang_nama_chk'
  ) then
    alter table public.qm_certificate_templates
      add constraint qm_cert_tpl_signature_ruang_nama_chk
      check (
        signature_path is null
        or (
          signature_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/signature-[0-9a-f]{1,32}[.](png|jpg)$'
          and split_part(signature_path, '/', 1) = class_id::text
        )
      );
  end if;
end $chk$;

-- ---------------------------------------------------------------------
-- 2. Fungsi dalaman salin butiran kosong. Bukan pintu masuk pengguna:
--    dipanggil oleh qm_set_active_certificate_template dan pencetus
--    after insert (kedua-duanya security definer). TIDAK di-grant
--    kepada authenticated.
-- ---------------------------------------------------------------------
create or replace function public.qm_cert_isi_butiran_kosong(
  p_sasaran uuid,
  p_sumber uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_kelas_sasaran uuid;
  v_kelas_sumber  uuid;
  v_fields_sasaran jsonb;
  v_fields_sumber  jsonb;
  v_gabung    jsonb;
  v_kunci     text;
  v_nilai     jsonb;
  v_sig_sumber   text;
  v_sig_sasaran  text;
begin
  -- Tiada apa-apa jika argumen tidak lengkap atau templat yang sama.
  if p_sasaran is null or p_sumber is null or p_sasaran = p_sumber then
    return;
  end if;
  select t.class_id into v_kelas_sasaran
    from public.qm_certificate_templates t
   where t.id = p_sasaran;
  select t.class_id into v_kelas_sumber
    from public.qm_certificate_templates t
   where t.id = p_sumber;
  -- Hanya salin dalam kelas yang sama; kelas berbeza = tidak berbuat apa-apa.
  if v_kelas_sasaran is null or v_kelas_sumber is null
     or v_kelas_sasaran <> v_kelas_sumber then
    return;
  end if;
  select t.fields, t.signature_path
    into v_fields_sasaran, v_sig_sasaran
    from public.qm_certificate_templates t
   where t.id = p_sasaran;
  select t.fields, t.signature_path
    into v_fields_sumber, v_sig_sumber
    from public.qm_certificate_templates t
   where t.id = p_sumber;

  -- Fields: untuk setiap kunci dalam fields sumber (meliputi signer_name,
  -- signer_title, location, course, date dan kunci lain), salin nilai
  -- hanya jika kunci itu tiada/kosong pada sasaran DAN nilai sumber
  -- tidak kosong. jsonb_set (bukan penyambungan rentetan); nilai yang
  -- dihantar sentiasa tidak null kerana jsonb_set ialah STRICT.
  v_gabung := coalesce(v_fields_sasaran, '{}'::jsonb);
  for v_kunci, v_nilai in
    select e.key, e.value
      from jsonb_each(coalesce(v_fields_sumber, '{}'::jsonb)) e
  loop
    if (v_gabung -> v_kunci is null
        or jsonb_typeof(v_gabung -> v_kunci) = 'null'
        or (jsonb_typeof(v_gabung -> v_kunci) = 'string'
            and btrim(v_gabung ->> v_kunci) = ''))
       and v_nilai is not null
       and not (jsonb_typeof(v_nilai) = 'string'
                and btrim(v_nilai #>> '{}') = '') then
      v_gabung := jsonb_set(v_gabung, array[v_kunci], v_nilai);
    end if;
  end loop;

  -- Had CHECK 0054 (octet_length <= 4096): jika gabungan melebihi had,
  -- kekalkan fields sasaran supaya salinan tidak menggagalkan set active.
  if v_gabung is distinct from coalesce(v_fields_sasaran, '{}'::jsonb)
     and octet_length(v_gabung::text) <= 4096 then
    update public.qm_certificate_templates
       set fields = v_gabung
     where id = p_sasaran;
  end if;

  -- Tandatangan: hanya jika sasaran tiada tandatangan; rujuk fail
  -- storan yang sama. Pada kelas pelan percuma, pencetus pelan 0054
  -- akan menukarnya kepada null secara senyap (perilaku sedia ada).
  if v_sig_sasaran is null and v_sig_sumber is not null then
    update public.qm_certificate_templates
       set signature_path = v_sig_sumber
     where id = p_sasaran;
  end if;
end;
$fn$;

revoke all on function public.qm_cert_isi_butiran_kosong(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. RPC qm_set_active_certificate_template: definisi 0056 (penuh,
--    semua semakan dan dua langkah UPDATE dikekalkan) + salinan butiran
--    daripada templat aktif lama kepada templat yang baharu aktif.
-- ---------------------------------------------------------------------
create or replace function public.qm_set_active_certificate_template(p_template uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_class uuid;
  v_lama uuid;
begin
  -- CTO (kzsec S2): pertahanan berlapis; panggilan tanpa sesi ditolak awal.
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  select t.class_id into v_class
    from public.qm_certificate_templates t
   where t.id = p_template;
  if v_class is null then
    raise exception 'Certificate template not found.';
  end if;
  if not public.qm_certificate_is_educator(v_class) then
    raise exception 'Only the class educator can change the active template.';
  end if;
  -- KZ-030: simpan id templat aktif lama SEBELUM nyahaktif, sebagai
  -- sumber butiran untuk salinan di bawah. Dikecualikan p_template
  -- supaya memanggil semula templat yang sudah aktif tidak menyalin.
  select t.id into v_lama
    from public.qm_certificate_templates t
   where t.class_id = v_class
     and t.is_active
     and t.id <> p_template
   limit 1;
  -- Buka pagar is_active untuk kenyataan ini sahaja (transaction-local).
  perform set_config('qm.set_active', 'on', true);
  -- Pembetulan CTO (ujian SQL sebenar): indeks unik separa disemak baris
  -- demi baris, jadi nyahaktif templat lama dahulu, kemudian aktifkan
  -- sasaran. Kedua-dua kenyataan dalam transaksi fungsi yang sama.
  update public.qm_certificate_templates
     set is_active = false
   where class_id = v_class
     and is_active
     and id <> p_template;
  update public.qm_certificate_templates
     set is_active = true
   where id = p_template
     and not is_active;
  -- KZ-030: salin butiran kosong daripada templat lama (jika ada dan
  -- berbeza) kepada templat yang baharu aktif.
  if v_lama is not null and v_lama <> p_template then
    perform public.qm_cert_isi_butiran_kosong(p_template, v_lama);
  end if;
end;
$fn$;

revoke all on function public.qm_set_active_certificate_template(uuid) from public, anon;
grant execute on function public.qm_set_active_certificate_template(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Pencetus after insert: templat baharu dalam kelas yang SUDAH ada
--    templat aktif mewarisi butiran kosong daripada templat aktif itu.
--    Meliputi cipta baharu, guna dari pustaka dan Copy to another class
--    kerana semua laluan itu berakhir dengan INSERT pada jadual ini.
--    Templat pertama kelas (tiada aktif lagi) tidak menyalin apa-apa.
-- ---------------------------------------------------------------------
create or replace function public.qm_certificate_template_salin_butiran()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_aktif uuid;
begin
  -- Templat aktif LAIN dalam kelas yang sama (templat baharu mungkin
  -- telah diaktifkan oleh pencetus auto_active mengikut urutan nama).
  select t.id into v_aktif
    from public.qm_certificate_templates t
   where t.class_id = new.class_id
     and t.is_active
     and t.id <> new.id
   limit 1;
  if v_aktif is null then
    return null;
  end if;
  perform public.qm_cert_isi_butiran_kosong(new.id, v_aktif);
  return null;
end;
$fn$;

drop trigger if exists tr_qm_cert_template_salin_butiran on public.qm_certificate_templates;
create trigger tr_qm_cert_template_salin_butiran
  after insert on public.qm_certificate_templates
  for each row execute function public.qm_certificate_template_salin_butiran();

notify pgrst, 'reload schema';

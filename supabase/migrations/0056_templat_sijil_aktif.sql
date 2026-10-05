-- 0056_templat_sijil_aktif.sql
--
-- KZ-009: templat sijil AKTIF. Satu templat aktif per kelas, dipilih oleh
-- pendidik melalui RPC, dan templat PERTAMA dalam kelas menjadi aktif
-- secara automatik. Halaman Sijil memilih templat aktif secara lalai
-- supaya sijil yang dikeluarkan guna reka bentuk yang Boss mahu.
--
-- Perlindungan tulis terus: klien TIDAK boleh menukar is_active melalui
-- PostgREST. Jadual ini guna geran peringkat JADUAL (0042: grant select,
-- insert, update ... to authenticated), jadi revoke lajur tidak boleh
-- menolak geran jadual; sebaliknya pencetus before update menolak
-- perubahan is_active melainkan current_setting('qm.set_active', true)
-- = 'on', yang hanya ditetapkan oleh fungsi RPC dan pencetus auto-aktif
-- di bawah melalui set_config(..., true).
--
-- Tiada BEGIN/COMMIT di sini (perangkap: fail migrasi tidak boleh
-- mengandungi COMMIT). Idempoten: if not exists / or replace di mana
-- mungkin. Polisi RLS sedia ada TIDAK diubah.

-- ---------------------------------------------------------------------
-- 1. Lajur is_active dan indeks unik separa (satu aktif per kelas)
-- ---------------------------------------------------------------------
alter table public.qm_certificate_templates
  add column if not exists is_active boolean not null default false;

create unique index if not exists qm_cert_templates_satu_aktif
  on public.qm_certificate_templates (class_id) where is_active;

-- ---------------------------------------------------------------------
-- 2. Isi semula: kelas yang belum ada templat aktif menandakan templat
--    dengan created_at TERKINI (pemecah seri: id terbaru). Satu baris
--    per kelas sahaja, jadi indeks unik tidak terlanggar. Bahagian ini
--    berjalan sebelum pencetus pagar dicipta supaya kemas kini ini
--    tidak ditolak.
-- ---------------------------------------------------------------------
with pilihan as (
  select distinct on (t.class_id) t.id
    from public.qm_certificate_templates t
   where t.class_id in (
     select c.class_id
       from public.qm_certificate_templates c
      group by c.class_id
     having count(*) filter (where c.is_active) = 0
   )
   order by t.class_id, t.created_at desc, t.id desc
)
update public.qm_certificate_templates tp
   set is_active = true
  from pilihan
 where tp.id = pilihan.id;

-- ---------------------------------------------------------------------
-- 3. RPC tukar templat aktif: pendidik kelas sahaja. Satu kenyataan
--    UPDATE menukar aktif lama menjadi false dan templat sasaran
--    menjadi true secara atomik (indeks unik kekal dipenuhi).
-- ---------------------------------------------------------------------
create or replace function public.qm_set_active_certificate_template(p_template uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_class uuid;
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
  -- Buka pagar is_active untuk kenyataan ini sahaja (transaction-local).
  perform set_config('qm.set_active', 'on', true);
  -- Pembetulan CTO (ujian SQL sebenar): indeks unik separa disemak baris
  -- demi baris, jadi satu UPDATE yang menukar dua baris boleh melanggar
  -- indeks seketika. Nyahaktif templat lama dahulu, kemudian aktifkan
  -- sasaran. Kedua-dua kenyataan dalam transaksi fungsi yang sama: atomik.
  update public.qm_certificate_templates
     set is_active = false
   where class_id = v_class
     and is_active
     and id <> p_template;
  update public.qm_certificate_templates
     set is_active = true
   where id = p_template
     and not is_active;
end;
$fn$;

revoke all on function public.qm_set_active_certificate_template(uuid) from public, anon;
grant execute on function public.qm_set_active_certificate_template(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Pencetus after insert: templat PERTAMA dalam kelas (atau kelas yang
--    belum ada templat aktif) menjadi aktif secara automatik. Meliputi
--    cipta baharu, guna dari pustaka dan salin ke kelas lain kerana
--    semua laluan itu berakhir dengan INSERT pada jadual ini.
-- ---------------------------------------------------------------------
create or replace function public.qm_certificate_template_auto_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (
    select 1
      from public.qm_certificate_templates t
     where t.class_id = new.class_id
       and t.is_active
  ) then
    -- Buka pagar is_active untuk kenyataan ini sahaja (transaction-local).
    perform set_config('qm.set_active', 'on', true);
    update public.qm_certificate_templates
       set is_active = true
     where id = new.id;
  end if;
  return null;
end;
$fn$;

drop trigger if exists tr_qm_cert_template_auto_active on public.qm_certificate_templates;
create trigger tr_qm_cert_template_auto_active
  after insert on public.qm_certificate_templates
  for each row execute function public.qm_certificate_template_auto_active();

-- ---------------------------------------------------------------------
-- 5. Pagar: klien biasa (PostgREST) tidak boleh menukar is_active secara
--    terus. Geran jadual 0042 meliputi UPDATE semua lajur, jadi pagar
--    ialah pencetus before update yang menolak perubahan is_active
--    melainkan qm.set_active = 'on' (ditetapkan RPC dan pencetus auto
--    aktif sahaja). Perubahan lajur lain tidak terkesan.
--    current_setting(..., true) memberi NULL bila belum ditetapkan,
--    jadi semakan guna IS DISTINCT FROM, bukan <> (NULL <> 'on' ialah
--    NULL dan silap lalu).
-- ---------------------------------------------------------------------
create or replace function public.qm_certificate_template_active_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.is_active is distinct from old.is_active
     and current_setting('qm.set_active', true) is distinct from 'on' then
    raise exception 'The active certificate template can only be changed with the Set as active button.';
  end if;
  return new;
end;
$fn$;

drop trigger if exists tr_qm_cert_template_active_guard on public.qm_certificate_templates;
create trigger tr_qm_cert_template_active_guard
  before update on public.qm_certificate_templates
  for each row execute function public.qm_certificate_template_active_guard();

-- ---------------------------------------------------------------------
-- 6. CTO (kzsec S1): pagar INSERT. Nilai is_active daripada klien
--    diabaikan (dipaksa false); pencetus after insert di atas yang
--    mengaktifkan templat pertama kelas. Bukan ralat, supaya laluan
--    salin/pustaka sedia ada tidak gagal.
-- ---------------------------------------------------------------------
create or replace function public.qm_certificate_template_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.is_active and current_setting('qm.set_active', true) is distinct from 'on' then
    new.is_active := false;
  end if;
  return new;
end;
$fn$;

drop trigger if exists tr_qm_cert_template_insert_guard on public.qm_certificate_templates;
create trigger tr_qm_cert_template_insert_guard
  before insert on public.qm_certificate_templates
  for each row execute function public.qm_certificate_template_insert_guard();

notify pgrst, 'reload schema';

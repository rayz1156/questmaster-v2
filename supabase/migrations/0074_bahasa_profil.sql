-- KZ-043: pilihan bahasa antara muka disimpan dalam profil supaya ia
-- mengikut pengguna merentas peranti dan menentukan bahasa e-mel.
begin;

alter table public.qm_profiles
  add column if not exists bahasa text not null default 'en';

do $$
begin
  alter table public.qm_profiles
    add constraint qm_profiles_bahasa_chk check (bahasa in ('en','ms'));
exception when duplicate_object then null;
end $$;

commit;

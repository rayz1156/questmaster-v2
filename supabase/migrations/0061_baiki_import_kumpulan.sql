-- 0061_baiki_import_kumpulan.sql
--
-- Membetulkan public.qm_import_class_teams (asal: 0033_jemputan_kumpulan.sql).
--
-- PEPIJAT: gelung yang membaca ahli kumpulan sedia ada dalam kelas memakai
-- pemboleh ubah r yang diisytihar jsonb, sedangkan pertanyaannya memulangkan
-- dua lajur (team_name teks, uid). PL/pgSQL menukar lajur pertama ke jsonb
-- melalui fungsi input, lalu import gagal dengan:
--   invalid input syntax for type json (Token "<nama kumpulan>" is invalid)
-- Gelung itu hanya berjalan apabila kelas SUDAH mempunyai ahli kumpulan,
-- jadi import pertama ke kelas kosong berjaya, tetapi setiap import
-- seterusnya (pratonton dan commit) gagal. Ujian asal tidak pernah
-- mengimport dua kali ke kelas yang sama.
--
-- PEMBETULAN:
--   1. Gelung itu guna pemboleh ubah record (rec_ahli).
--   2. max_members bagi kumpulan sedia ada tidak lagi ditetapkan kepada
--      bilangan baris dalam fail (yang mengecilkannya apabila fail hanya
--      mengandungi ahli tambahan). Ia dikira semula selepas sisipan:
--      ahli + jemputan menunggu, minimum 2.
--
-- Selainnya badan fungsi sama seperti 0033: semakan pemanggil, validasi,
-- sekatan pelan, konflik ketua dan satu transaksi tidak berubah.
-- Tandatangan, SECURITY DEFINER, search_path dan geran kekal.

BEGIN;

CREATE OR REPLACE FUNCTION public.qm_import_class_teams(
  p_class_id uuid,
  p_rows jsonb,
  p_replace boolean,
  p_dry_run boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r jsonb;
  -- 0061: gelung ahli sedia ada memulangkan DUA lajur (team_name, uid).
  -- Ia mesti guna pemboleh ubah record, bukan r (jsonb skalar). Dengan r,
  -- PL/pgSQL memasukkan lajur pertama (nama kumpulan, teks) ke dalam jsonb
  -- dan gagal dengan "invalid input syntax for type json" sebaik sahaja
  -- kelas sudah mempunyai ahli kumpulan.
  rec_ahli record;
  v_row int;
  v_group text;
  v_gkey text;
  v_email text;
  v_caller uuid;
  v_owner uuid;
  v_is_admin boolean;
  v_team uuid;
  v_team_name text;
  v_existing uuid;
  v_member_cnt int;
  v_leader_cnt int;
  v_uid uuid;
  v_prev_team_name text;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_teams_out jsonb := '[]'::jsonb;
  v_emails_out jsonb := '[]'::jsonb;
  -- emel -> baris pertama muncul (untuk ralat berganda)
  v_seen jsonb := '{}'::jsonb;
  -- nama kumpulan (normalized) -> nama paparan pertama
  v_group_names jsonb := '{}'::jsonb;
  -- nama kumpulan -> bilangan ahli dalam fail
  v_group_size jsonb := '{}'::jsonb;
  -- nama kumpulan -> bilangan ketua dalam fail
  v_group_leaders jsonb := '{}'::jsonb;
  -- emel -> nama kumpulan sasaran (normalized)
  v_email_team jsonb := '{}'::jsonb;
  -- emel -> id akaun (null jika belum daftar)
  v_email_uid jsonb := '{}'::jsonb;
  -- id akaun -> nama kumpulan sedia ada dalam kelas ini
  v_uid_team jsonb := '{}'::jsonb;
  v_created int := 0;
  v_reused int := 0;
  v_joined int := 0;
  v_pending int := 0;
  v_ok boolean := true;
BEGIN
  -- -----------------------------------------------------------------
  -- 1. Semak pemanggil. TIDAK memanggil qm_caller_is_privileged di
  --    sini: fungsi ini SECURITY DEFINER, jadi ia akan sentiasa benar.
  -- -----------------------------------------------------------------
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'QM_FORBIDDEN: anda mesti log masuk untuk import kumpulan'
      USING ERRCODE = 'P0001';
  END IF;
  SELECT owner_id INTO v_owner FROM public.qm_classes WHERE id = p_class_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'QM_NOT_FOUND: kelas tidak dijumpai' USING ERRCODE = 'P0001';
  END IF;
  v_is_admin := public.qm_is_admin();
  IF v_caller <> v_owner AND NOT public.qm_is_class_educator(p_class_id) AND NOT v_is_admin THEN
    RAISE EXCEPTION 'QM_FORBIDDEN: hanya pemilik atau pendidik kelas boleh mengimport kumpulan'
      USING ERRCODE = 'P0001';
  END IF;

  -- -----------------------------------------------------------------
  -- 2. Validasi kandungan fail. Setiap emel mesti unik, satu kumpulan
  --    satu ketua sahaja, medan wajib tidak boleh kosong.
  -- -----------------------------------------------------------------
  FOR r IN SELECT el.value FROM jsonb_array_elements(p_rows) AS el(value) LOOP
    v_row := COALESCE((r->>'row')::int, 0);
    v_group := btrim(COALESCE(r->>'group',''));
    v_email := lower(btrim(COALESCE(r->>'email','')));

    IF v_group = '' THEN
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', 'the team name is empty.');
      CONTINUE;
    END IF;
    IF v_email = '' THEN
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', 'the email is empty.');
      CONTINUE;
    END IF;
    IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message',
        format('"email" is not a valid email address, but it reads "%s".', v_email));
      CONTINUE;
    END IF;
    IF v_seen ? v_email THEN
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message',
        format('this email appears twice in the file, first on row %s.', v_seen->>v_email));
      CONTINUE;
    END IF;

    v_seen := jsonb_set(v_seen, ARRAY[v_email], to_jsonb(v_row));
    v_gkey := lower(v_group);
    IF NOT (v_group_names ? v_gkey) THEN
      v_group_names := jsonb_set(v_group_names, ARRAY[v_gkey], to_jsonb(v_group));
    END IF;
    v_group_size := jsonb_set(v_group_size, ARRAY[v_gkey],
      to_jsonb(COALESCE((v_group_size->>v_gkey)::int, 0) + 1));
    IF COALESCE((r->>'leader')::boolean, false) THEN
      v_group_leaders := jsonb_set(v_group_leaders, ARRAY[v_gkey],
        to_jsonb(COALESCE((v_group_leaders->>v_gkey)::int, 0) + 1));
    END IF;
  END LOOP;

  -- Satu kumpulan dengan dua ketua ialah ralat.
  IF v_seen != '{}'::jsonb THEN
    FOR v_gkey IN SELECT jsonb_object_keys(v_group_size) LOOP
      v_leader_cnt := COALESCE((v_group_leaders->>v_gkey)::int, 0);
      IF v_leader_cnt > 1 THEN
        v_errors := v_errors || jsonb_build_object('row', 0, 'message',
          format('team "%s" has %s leaders marked in the file. A team can have only one leader.',
                 v_group_names->>v_gkey, v_leader_cnt));
      END IF;
    END LOOP;
  END IF;

  -- Selesaikan emel kepada akaun sedia ada, dan pasangan sedia ada.
  IF v_seen != '{}'::jsonb THEN
    FOR v_email IN SELECT jsonb_object_keys(v_seen) LOOP
      v_uid := public.qm_user_id_by_email(v_email);
      v_email_uid := jsonb_set(v_email_uid, ARRAY[v_email],
                               COALESCE(to_jsonb(v_uid), 'null'::jsonb));
    END LOOP;

    FOR rec_ahli IN
      SELECT t.name AS team_name, tm.user_id AS uid
        FROM public.qm_team_members tm
        JOIN public.qm_teams t ON t.id = tm.team_id
       WHERE t.class_id = p_class_id
    LOOP
      v_uid_team := jsonb_set(v_uid_team, ARRAY[rec_ahli.uid::text], to_jsonb(rec_ahli.team_name));
    END LOOP;
  END IF;

  -- -----------------------------------------------------------------
  -- 3. Kumpul pratonton: kumpulan (cipta atau guna semula) dan emel
  --    (sertai sekarang atau tunggu pendaftaran), termasuk semakan
  --    ahli yang sudah berada dalam kumpulan lain dalam kelas ini.
  -- -----------------------------------------------------------------
  FOR r IN SELECT el.value FROM jsonb_array_elements(p_rows) AS el(value) LOOP
    v_row := COALESCE((r->>'row')::int, 0);
    v_email := lower(btrim(COALESCE(r->>'email','')));
    v_group := btrim(COALESCE(r->>'group',''));
    v_gkey := lower(v_group);
    IF NOT (v_seen ? v_email) OR NOT (v_group_names ? v_gkey) THEN
      CONTINUE; -- baris ini sudah dilaporkan sebagai ralat
    END IF;
    IF NOT (v_email_team ? v_email) THEN
      v_email_team := jsonb_set(v_email_team, ARRAY[v_email], to_jsonb(v_gkey));

      v_uid := COALESCE((v_email_uid->>v_email)::uuid, NULL);
      v_team_name := v_group_names->>v_gkey;
      IF v_uid IS NULL THEN
        v_emails_out := v_emails_out || jsonb_build_object(
          'email', v_email, 'team', v_team_name, 'action', 'pending');
        v_pending := v_pending + 1;
      ELSE
        v_prev_team_name := COALESCE(v_uid_team->>v_uid::text, '');
        IF v_prev_team_name <> '' AND lower(v_prev_team_name) <> lower(v_team_name) THEN
          IF NOT COALESCE(p_replace, false) THEN
            v_errors := v_errors || jsonb_build_object('row', v_row, 'message',
              format('"%s" is already a member of team "%s" in this class. Tick "replace existing groups" to move members between teams.', v_email, v_prev_team_name));
          ELSE
            v_emails_out := v_emails_out || jsonb_build_object(
              'email', v_email, 'team', v_team_name, 'action', 'join');
            v_joined := v_joined + 1;
          END IF;
        ELSE
          v_emails_out := v_emails_out || jsonb_build_object(
            'email', v_email, 'team', v_team_name, 'action', 'join');
          v_joined := v_joined + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  FOR v_gkey IN SELECT jsonb_object_keys(v_group_size) LOOP
    v_team_name := v_group_names->>v_gkey;
    SELECT id INTO v_existing FROM public.qm_teams
     WHERE class_id = p_class_id AND lower(name) = v_gkey LIMIT 1;
    IF v_existing IS NULL THEN v_created := v_created + 1;
    ELSE v_reused := v_reused + 1; END IF;
    v_teams_out := v_teams_out || jsonb_build_object(
      'name', v_team_name,
      'action', CASE WHEN v_existing IS NULL THEN 'create' ELSE 'reuse' END,
      'members', COALESCE((v_group_size->>v_gkey)::int, 0));
    -- Amaran: kumpulan tanpa ketua atau dengan seorang ahli sahaja.
    IF COALESCE((v_group_leaders->>v_gkey)::int, 0) = 0 THEN
      v_warnings := v_warnings || jsonb_build_object('team', v_team_name,
        'message', format('team "%s" has no leader.', v_team_name));
    END IF;
    IF COALESCE((v_group_size->>v_gkey)::int, 0) <= 1 THEN
      v_warnings := v_warnings || jsonb_build_object('team', v_team_name,
        'message', format('team "%s" has only one member.', v_team_name));
    END IF;
  END LOOP;

  -- Ralat bermakna import ditolak sepenuhnya: tulis apa apa sekali pun
  -- tidak akan berlaku (semakan berlaku sebelum tulisan pertama).
  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'dry_run', p_dry_run,
      'errors', v_errors, 'warnings', v_warnings);
  END IF;

  -- -----------------------------------------------------------------
  -- 4. Sekatan pelan, dilaksanakan secara eksplisit kerana konteks
  --    SECURITY DEFINER membutakan penjaga qm_guard_plan_teams.
  -- -----------------------------------------------------------------
  IF NOT v_is_admin AND NOT public.qm_quest_features_allowed(v_owner) THEN
    RAISE EXCEPTION 'QM_PLAN_FREE: Ciri ini tidak termasuk dalam pelan percuma. Pelan percuma meliputi fungsi kuiz sahaja.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object('ok', true, 'dry_run', true,
      'teams_created', v_created, 'teams_reused', v_reused,
      'joined_now', v_joined, 'pending', v_pending,
      'teams', v_teams_out, 'emails', v_emails_out, 'warnings', v_warnings);
  END IF;

  -- -----------------------------------------------------------------
  -- 5. Tulisan. Semua di bawah berlaku dalam satu transaksi; ralat
  --    bila bila menggulung semula segalanya.
  -- -----------------------------------------------------------------
  -- Alih ahli antara kumpulan bila pendidik menanda "replace". Sekali
  -- sahaja untuk semua baris, bukan dalam gelung kumpulan.
  IF COALESCE(p_replace, false) THEN
    FOR r IN SELECT el.value FROM jsonb_array_elements(p_rows) AS el(value) LOOP
      v_email := lower(btrim(COALESCE(r->>'email','')));
      v_uid := (v_email_uid->>v_email)::uuid;
      IF v_uid IS NOT NULL THEN
        DELETE FROM public.qm_team_members tm
         USING public.qm_teams t
         WHERE t.id = tm.team_id
           AND t.class_id = p_class_id
           AND tm.user_id = v_uid;
      END IF;
    END LOOP;
  END IF;

  FOR v_gkey IN SELECT jsonb_object_keys(v_group_size) LOOP
    v_team_name := v_group_names->>v_gkey;
    v_member_cnt := COALESCE((v_group_size->>v_gkey)::int, 0);
    SELECT id INTO v_existing FROM public.qm_teams
     WHERE class_id = p_class_id AND lower(name) = v_gkey LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.qm_teams (class_id, hunt_id, name, max_members)
      VALUES (p_class_id, NULL, v_team_name, GREATEST(2, v_member_cnt))
      RETURNING id INTO v_existing;
    END IF;
    -- 0061: kumpulan sedia ada TIDAK lagi dikemas kini di sini. max_members
    -- dikira semula selepas sisipan ahli (lihat di bawah), kerana fail
    -- kemas kini mungkin hanya mengandungi ahli tambahan.
  END LOOP;

  FOR r IN SELECT el.value FROM jsonb_array_elements(p_rows) AS el(value) LOOP
    v_row := COALESCE((r->>'row')::int, 0);
    v_email := lower(btrim(COALESCE(r->>'email','')));
    v_group := btrim(COALESCE(r->>'group',''));
    v_gkey := lower(v_group);
    IF NOT (v_seen ? v_email) THEN CONTINUE; END IF;
    v_uid := (v_email_uid->>v_email)::uuid;
    v_team_name := v_group_names->>v_gkey;
    SELECT id INTO v_existing FROM public.qm_teams
     WHERE class_id = p_class_id AND lower(name) = v_gkey LIMIT 1;

    IF v_uid IS NOT NULL THEN
      -- Ahli berdaftar: masuk kelas (jika belum) dan kumpulan.
      INSERT INTO public.qm_class_members (class_id, user_id)
      VALUES (p_class_id, v_uid)
      ON CONFLICT DO NOTHING;

      -- Jika kumpulan sudah ada ketua lain, gagalkan import dengan mesej
      -- yang jelas, bukan ralat kunci unik mentah.
      IF COALESCE((r->>'leader')::boolean, false) THEN
        IF EXISTS (
          SELECT 1 FROM public.qm_team_members tm
           WHERE tm.team_id = v_existing AND tm.role = 'leader' AND tm.user_id <> v_uid
        ) THEN
          RAISE EXCEPTION 'QM_LEADER_CONFLICT: baris %: kumpulan "%" sudah mempunyai ketua. Buang salah seorang ketua dan muat naik semula.',
            v_row, v_team_name USING ERRCODE = 'P0001';
        END IF;
      END IF;

      INSERT INTO public.qm_team_members (team_id, user_id, role)
      VALUES (v_existing, v_uid,
              CASE WHEN COALESCE((r->>'leader')::boolean, false)
                   THEN 'leader' ELSE 'member' END)
      ON CONFLICT (team_id, user_id)
      DO UPDATE SET role = EXCLUDED.role;
    ELSE
      -- Belum mendaftar: simpan pada baris tunggu. Pendaftaran baharu
      -- akan menuntut jemputan ini melalui qm_claim_team_invites.
      INSERT INTO public.qm_team_invites
        (class_id, team_id, email, nama, role, invited_by)
      VALUES (
        p_class_id, v_existing, v_email,
        nullif(btrim(COALESCE(r->>'name','')), ''),
        CASE WHEN COALESCE((r->>'leader')::boolean, false)
             THEN 'leader' ELSE 'member' END,
        v_caller)
      ON CONFLICT (team_id, email) WHERE claimed_at IS NULL
      DO UPDATE SET nama = EXCLUDED.nama, role = EXCLUDED.role, invited_by = EXCLUDED.invited_by;
    END IF;
  END LOOP;

  -- 0061: max_members mengikut jumlah sebenar selepas import (ahli dalam
  -- kumpulan + jemputan yang masih menunggu), minimum 2. Untuk import
  -- pertama hasilnya sama seperti dahulu (bilangan baris fail). Untuk
  -- import kemas kini, max_members tidak lagi mengecil di bawah bilangan
  -- ahli yang sudah ada.
  FOR v_gkey IN SELECT jsonb_object_keys(v_group_size) LOOP
    SELECT id INTO v_existing FROM public.qm_teams
     WHERE class_id = p_class_id AND lower(name) = v_gkey LIMIT 1;
    UPDATE public.qm_teams t
       SET max_members = GREATEST(2,
             (SELECT count(*) FROM public.qm_team_members tm WHERE tm.team_id = t.id)
           + (SELECT count(*) FROM public.qm_team_invites ti
               WHERE ti.team_id = t.id AND ti.claimed_at IS NULL))
     WHERE t.id = v_existing;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'dry_run', false,
    'teams_created', v_created, 'teams_reused', v_reused,
    'joined_now', v_joined, 'pending', v_pending,
    'teams', v_teams_out, 'emails', v_emails_out, 'warnings', v_warnings);
END;
$fn$;

revoke all on function public.qm_import_class_teams(uuid, jsonb, boolean, boolean) from PUBLIC, anon;
grant execute on function public.qm_import_class_teams(uuid, jsonb, boolean, boolean) to authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

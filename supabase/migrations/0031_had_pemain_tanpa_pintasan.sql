-- 0031_had_pemain_tanpa_pintasan.sql
--
-- Membuang pintasan peranan istimewa daripada penjaga had peserta sesi
-- langsung. Had bilangan pemain ialah peraturan kapasiti, bukan peraturan
-- kebenaran: tiada sebab sah untuk kod pelayan melebihi had yang ditetapkan
-- oleh hos sesi itu sendiri. Dengan pintasan dibuang, had ini terpakai
-- walaupun pada laluan API yang menggunakan kunci service_role.
--
-- pg_trigger_depth() dikekalkan supaya sisipan daripada pencetus lain
-- tidak tersekat.

BEGIN;

CREATE OR REPLACE FUNCTION public.qm_enforce_live_player_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_left integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  v_left := public.qm_live_slot_left(NEW.session_id);
  IF v_left IS NULL THEN RETURN NEW; END IF;

  IF v_left <= 0 THEN
    RAISE EXCEPTION 'QM_LIMIT_PLAYERS: Sesi ini sudah penuh.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- 0029_fix_block_submissions_when_ended.sql
-- Pencetus BEFORE INSERT pada qm_submissions, diperkenalkan oleh
-- sql/migrations/2026_05_20_class_end.sql, memilih c.class_id daripada
-- qm_classes. Lajur itu tidak wujud; kunci jadual itu ialah c.id, dan
-- class_id yang dimaksudkan ada pada qm_hunts.
--
-- PL/pgSQL menyemak pertanyaan itu semasa ia dilaksanakan, jadi setiap
-- percubaan menghantar jawapan gagal dengan "column c.class_id does not
-- exist", tanpa mengira sama ada kelas itu sudah tamat. Penghantaran
-- terakhir yang berjaya bertarikh 11 Mei 2026; pencetus ini dipasang pada
-- 20 Mei 2026.
--
-- Pembetulannya membuang join yang tidak diperlukan dan mengambil class_id
-- terus daripada qm_hunts. search_path juga ditetapkan, kerana fungsi
-- SECURITY DEFINER tanpa search_path tetap boleh disesatkan.

BEGIN;

CREATE OR REPLACE FUNCTION public.qm_block_submissions_when_ended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_class_id uuid;
  v_ended    boolean;
BEGIN
  SELECT h.class_id
    INTO v_class_id
    FROM public.qm_challenges ch
    JOIN public.qm_hunts h ON h.id = ch.hunt_id
   WHERE ch.id = NEW.challenge_id;

  -- Hunt yang tidak terikat kepada kelas: benarkan.
  IF v_class_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (ended_at IS NOT NULL) INTO v_ended
    FROM public.qm_classes WHERE id = v_class_id;

  IF v_ended IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF public.qm_is_class_educator(v_class_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'This class has ended. Submissions are closed.'
        USING ERRCODE = 'P0001';
END;
$fn$;

COMMIT;

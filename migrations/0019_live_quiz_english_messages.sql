-- ============================================================
-- Migrasi 0019: mesej ralat qm_live_join_player dalam Bahasa Inggeris
-- Keputusan Dr Hariz, 20 September 2026: antara muka Kuizen berbahasa
-- Inggeris dan menggunakan istilah "Quiz". Mesej fungsi ini dipaparkan
-- terus kepada pemain, jadi ia diterjemah di sini.
--
-- Badan fungsi TIDAK berubah selain teks mesej. Tiga perangkap yang sudah
-- memakan satu pusingan ujian dikekalkan seperti dalam 0018:
--   1. errcode MESTI tepat 5 aksara (LV004/LV005/LV009), jika tidak Postgres
--      menukarnya kepada 42704 dan membuang mesej.
--   2. gen_random_bytes TIDAK boleh digunakan: pgcrypto berada dalam skema
--      "extensions" dan tidak dicapai oleh "set search_path = public".
--   3. Lajur dalam RETURNING mesti dilayakkan dengan nama jadual kerana
--      parameter keluar RETURNS TABLE berada dalam skop seluruh badan.
-- Idempoten (create or replace). Akhiri dengan notify pgrst.
-- ============================================================

create or replace function public.qm_live_join_player(
  p_session_id uuid,
  p_nickname text
)
returns table (player_id uuid, player_token text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_id    uuid;
  v_token text;
begin
  select s.max_players into v_limit
  from public.qm_live_sessions s
  where s.id = p_session_id
  for update;

  if v_limit is null then
    raise exception 'Session not found.' using errcode = 'LV004';
  end if;

  begin
    insert into public.qm_live_players (session_id, nickname, player_token)
    select
      p_session_id,
      p_nickname,
      substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 32)
    where (
      select count(*) from public.qm_live_players pl where pl.session_id = p_session_id
    ) < v_limit
    returning qm_live_players.id, qm_live_players.player_token into v_id, v_token;
  exception
    when unique_violation then
      raise exception 'That name is taken. Please choose another.' using errcode = 'LV009';
  end;

  if v_id is null then
    raise exception 'This session is full. The limit is % players.', v_limit
      using errcode = 'LV005';
  end if;

  player_id := v_id;
  player_token := v_token;
  return next;
end;
$$;

-- WAJIB. Tanpa ini PostgREST tidak nampak perubahan fungsi.
notify pgrst, 'reload schema';

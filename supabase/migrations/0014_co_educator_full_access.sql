-- =============================================================
-- Co-educator full access: align RLS with collaborator semantics
-- =============================================================
-- Background: 0009 already gave co-educators read/write on qm_classes
-- and qm_hunts. This migration extends the same parity to teams,
-- score adjustments, and quest completions so a co-educator can
-- fully manage activities, rankings, and the intro board.
--
-- Helper used: public.qm_is_class_educator(uuid)  -- defined in 0009
--              public.qm_is_hunt_owner(uuid)      -- defined in 0005
-- =============================================================

-- ---- qm_teams ------------------------------------------------
-- Replace owner-only "all" policy with educator-aware policy.
drop policy if exists qm_teams_class_owner_all on public.qm_teams;
drop policy if exists qm_teams_class_educator_all on public.qm_teams;
create policy qm_teams_class_educator_all on public.qm_teams for all
  using  (class_id is not null and public.qm_is_class_educator(class_id))
  with check (class_id is not null and public.qm_is_class_educator(class_id));

-- ---- qm_score_adjustments -----------------------------------
-- Allow any educator on the hunt's class to manage adjustments.
-- Helper: a hunt is in a class the user educates.
create or replace function public.qm_is_hunt_class_educator(p_hunt uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $f$
  select exists(
    select 1 from public.qm_hunts h
    where h.id = p_hunt
      and h.class_id is not null
      and public.qm_is_class_educator(h.class_id)
  );
$f$;
grant execute on function public.qm_is_hunt_class_educator(uuid) to authenticated;

drop policy if exists p_sa_owner on public.qm_score_adjustments;
drop policy if exists p_sa_educator on public.qm_score_adjustments;
create policy p_sa_educator on public.qm_score_adjustments for all
  using  (public.qm_is_hunt_class_educator(hunt_id))
  with check (public.qm_is_hunt_class_educator(hunt_id));

-- ---- qm_team_quest_completions ------------------------------
-- 0006 only granted access to admins. Extend to class educators so
-- co-educators can mark/unmark completions.
drop policy if exists p_tqc_educator on public.qm_team_quest_completions;
create policy p_tqc_educator on public.qm_team_quest_completions for all
  using  (public.qm_is_hunt_class_educator(hunt_id))
  with check (public.qm_is_hunt_class_educator(hunt_id));

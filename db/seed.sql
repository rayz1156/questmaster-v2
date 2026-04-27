DO $$
DECLARE
  educator_uid uuid := '373c9c6b-fa76-4d30-bf30-1fc399e61b74';
  participant_uid uuid := '0cd9529d-e22d-4837-84c4-9f778fadd392';
  hunt1 uuid; hunt2 uuid; chal1 uuid; chal2 uuid; chal3 uuid; team_blue uuid; team_red uuid;
BEGIN
  -- hunts
  insert into public.qm_hunts(owner_id, title, description, status, invite_code) values
    (educator_uid, 'Campus Mystery', 'Solve clues across the main quad.', 'active', 'CAMPUS')
    returning id into hunt1;
  insert into public.qm_hunts(owner_id, title, description, status, invite_code) values
    (educator_uid, 'History Hunt', 'Discover historic landmarks.', 'draft', 'HIST01')
    returning id into hunt2;

  -- challenges for Campus Mystery
  insert into public.qm_challenges(hunt_id, title, prompt, answer, points, order_idx) values
    (hunt1, 'Library riddle', 'How many steps lead to the library entrance?', '42', 10, 1) returning id into chal1;
  insert into public.qm_challenges(hunt_id, title, prompt, answer, points, order_idx) values
    (hunt1, 'Fountain photo', 'Take a team photo at the central fountain.', null, 20, 2) returning id into chal2;
  insert into public.qm_challenges(hunt_id, title, prompt, answer, points, order_idx) values
    (hunt1, 'Mascot statue', 'What year is engraved on the mascot statue?', '1923', 15, 3) returning id into chal3;

  -- teams
  insert into public.qm_teams(hunt_id, name, score) values (hunt1, 'Blue Falcons', 30) returning id into team_blue;
  insert into public.qm_teams(hunt_id, name, score) values (hunt1, 'Red Wolves', 20) returning id into team_red;

  -- participant joins hunt1 + team_blue
  insert into public.qm_memberships(hunt_id, user_id) values (hunt1, participant_uid) on conflict do nothing;
  insert into public.qm_team_members(team_id, user_id) values (team_blue, participant_uid) on conflict do nothing;

  -- a sample submission
  insert into public.qm_submissions(challenge_id, team_id, user_id, answer, status) values
    (chal1, team_blue, participant_uid, '42', 'pending');
END $$;
select 'hunts:'::text, count(*) from public.qm_hunts;
select 'challenges:'::text, count(*) from public.qm_challenges;
select 'teams:'::text, count(*) from public.qm_teams;
select 'submissions:'::text, count(*) from public.qm_submissions;

-- Run with `supabase test db` against a local Supabase stack.
-- These tests use transaction-local JWT claims and roll back all fixtures.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

insert into auth.users(id, email) values
  ('10000000-0000-0000-0000-000000000001', 'dm@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'assigned@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'member@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'outsider@example.test');
insert into public.profiles(id, email, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'dm@example.test', 'DM'),
  ('10000000-0000-0000-0000-000000000002', 'assigned@example.test', 'Assigned'),
  ('10000000-0000-0000-0000-000000000003', 'member@example.test', 'Member'),
  ('10000000-0000-0000-0000-000000000004', 'outsider@example.test', 'Outsider')
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.combat_encounters(id, dm_user_id, name)
values ('20000000-0000-0000-0000-000000000001', auth.uid(), 'RLS test');
insert into public.combat_maps(encounter_id, map_type, preset_name)
values ('20000000-0000-0000-0000-000000000001', 'preset', 'blank');
insert into public.combat_members(encounter_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'player'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'player');
insert into public.combat_tokens(id, encounter_id, assigned_user_id, name)
values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'Assigned token'
);

select ok(public.is_combat_dm('20000000-0000-0000-0000-000000000001'), 'DM recognized');
select ok(public.is_combat_member('20000000-0000-0000-0000-000000000001'), 'DM is a member');
select lives_ok(
  $$select public.move_combat_token(
    '30000000-0000-0000-0000-000000000001', 1, 1, null
  )$$,
  'DM can move any token'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select ok(public.is_combat_member('20000000-0000-0000-0000-000000000001'), 'assigned player is member');
select ok(public.controls_combat_token('30000000-0000-0000-0000-000000000001'), 'assigned player controls token');
select lives_ok(
  $$select public.move_combat_token(
    '30000000-0000-0000-0000-000000000001', 2, 2, null
  )$$,
  'assigned player may move token'
);
with updated as (
  update public.combat_tokens
  set state = jsonb_set(state, '{hp,current}', '0')
  where id = '30000000-0000-0000-0000-000000000001'
  returning 1
)
select is(
  (select count(*) from updated),
  0::bigint,
  'player cannot directly modify HP'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select ok(public.is_combat_member('20000000-0000-0000-0000-000000000001'), 'different member recognized');
select ok(not public.controls_combat_token('30000000-0000-0000-0000-000000000001'), 'different member does not control token');
select throws_ok(
  $$select public.move_combat_token(
    '30000000-0000-0000-0000-000000000001', 3, 3, null
  )$$,
  '42501',
  null,
  'different member cannot move assigned token'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select ok(not public.is_combat_member('20000000-0000-0000-0000-000000000001'), 'outsider is not a member');
select is((select count(*) from public.combat_encounters where id = '20000000-0000-0000-0000-000000000001'), 0::bigint, 'outsider cannot read encounter');
select is((select count(*) from public.combat_tokens where encounter_id = '20000000-0000-0000-0000-000000000001'), 0::bigint, 'outsider cannot read tokens');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.apply_direct_combat_resolution(
    '20000000-0000-0000-0000-000000000001',
    '{"targets":[{"token_id":"30000000-0000-0000-0000-000000000001","damage":1}]}'::jsonb,
    '40000000-0000-0000-0000-000000000001'
  )$$,
  'DM direct resolution succeeds'
);

select * from finish(true);
rollback;

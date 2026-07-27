-- Homebrew Vault tactical combat
-- Additive migration: no existing table, column, function, or data is removed.
-- Rollback notes are in supabase/ROLLBACK.md.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.combat_encounters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid null references public.campaigns(id) on delete set null,
  dm_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  status text not null default 'setup' check (status in ('setup', 'active', 'paused', 'ended')),
  turn_mode text not null default 'initiative' check (turn_mode in ('initiative', 'free')),
  round_number integer not null default 1 check (round_number >= 1),
  active_turn_token_id uuid null,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.combat_members (
  encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('dm', 'player')),
  joined_at timestamptz not null default now(),
  primary key (encounter_id, user_id)
);

create table if not exists public.combat_maps (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null unique references public.combat_encounters(id) on delete cascade,
  map_type text not null default 'preset' check (map_type in ('upload', 'preset')),
  storage_path text null,
  preset_name text null check (preset_name is null or preset_name in ('blank', 'grass', 'stone', 'dirt')),
  grid_columns integer not null default 24 check (grid_columns between 5 and 100),
  grid_rows integer not null default 18 check (grid_rows between 5 and 100),
  feet_per_square numeric(8,2) not null default 5 check (feet_per_square > 0 and feet_per_square <= 1000),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (map_type = 'preset' and preset_name is not null)
    or (map_type = 'upload' and storage_path is not null)
  )
);

create table if not exists public.combat_tokens (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
  character_id uuid null references public.characters(id) on delete set null,
  assigned_user_id uuid null references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  team text not null default 'neutral',
  initiative numeric null,
  initiative_order integer not null default 0,
  x integer not null default 0 check (x >= 0),
  y integer not null default 0 check (y >= 0),
  width_squares integer not null default 1 check (width_squares between 1 and 20),
  height_squares integer not null default 1 check (height_squares between 1 and 20),
  rotation numeric not null default 0,
  visible boolean not null default true,
  state jsonb not null default '{"hp":{"current":1,"max":1,"temp":0},"conditions":[],"resourcePools":[]}'::jsonb
    check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.combat_encounters
  drop constraint if exists combat_encounters_active_turn_token_id_fkey;
alter table public.combat_encounters
  add constraint combat_encounters_active_turn_token_id_fkey
  foreign key (active_turn_token_id) references public.combat_tokens(id) on delete set null
  deferrable initially deferred;

create table if not exists public.combat_proposals (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
  actor_token_id uuid not null references public.combat_tokens(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete cascade,
  proposal_type text not null default 'action',
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'reaction_window', 'awaiting_dm', 'resolved', 'rejected', 'cancelled', 'undone')),
  source_action jsonb not null default '{}'::jsonb,
  target_token_ids uuid[] not null default '{}',
  area_template jsonb null,
  roll_data jsonb not null default '{}'::jsonb,
  calculated_payload jsonb not null default '{"targets":[]}'::jsonb,
  player_override_payload jsonb not null default '{"targets":[]}'::jsonb,
  dm_final_payload jsonb not null default '{"targets":[]}'::jsonb,
  description text not null default '',
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.combat_reaction_windows (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
  proposal_id uuid not null references public.combat_proposals(id) on delete cascade,
  trigger_type text not null check (trigger_type in (
    'being_attacked', 'area_effect', 'spell_targeting', 'ally_attacked',
    'movement_nearby', 'about_to_take_damage', 'custom'
  )),
  trigger_text text not null check (char_length(trigger_text) between 1 and 1000),
  eligible_token_ids uuid[] not null default '{}',
  allow_additional boolean not null default false,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz null
);

create table if not exists public.combat_reaction_responses (
  id uuid primary key default gen_random_uuid(),
  reaction_window_id uuid not null references public.combat_reaction_windows(id) on delete cascade,
  responder_user_id uuid not null references public.profiles(id) on delete cascade,
  responder_token_id uuid not null references public.combat_tokens(id) on delete cascade,
  response_type text not null check (response_type in ('reaction', 'custom', 'pass', 'question')),
  selected_reaction jsonb null,
  custom_text text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reaction_window_id, responder_user_id, responder_token_id)
);

create table if not exists public.combat_resolutions (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
  proposal_id uuid null references public.combat_proposals(id) on delete restrict,
  resolution_type text not null check (resolution_type in ('proposal', 'direct')),
  idempotency_key uuid not null,
  before_state jsonb not null,
  applied_changes jsonb not null,
  after_state jsonb not null,
  resolved_by uuid not null references public.profiles(id) on delete restrict,
  resolved_at timestamptz not null default now(),
  undone_at timestamptz null,
  undone_by uuid null references public.profiles(id) on delete restrict,
  unique (encounter_id, idempotency_key)
);

create unique index if not exists combat_resolutions_one_active_proposal
  on public.combat_resolutions(proposal_id)
  where proposal_id is not null and undone_at is null;

create table if not exists public.combat_events (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
  proposal_id uuid null references public.combat_proposals(id) on delete set null,
  resolution_id uuid null references public.combat_resolutions(id) on delete set null,
  event_type text not null check (event_type in ('chat', 'roll', 'proposal', 'reaction', 'resolution', 'system', 'movement')),
  message text not null check (char_length(message) between 1 and 5000),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists combat_members_user_idx on public.combat_members(user_id, encounter_id);
create index if not exists combat_tokens_encounter_order_idx on public.combat_tokens(encounter_id, initiative_order, initiative desc);
create index if not exists combat_tokens_assigned_idx on public.combat_tokens(assigned_user_id) where assigned_user_id is not null;
create index if not exists combat_tokens_character_idx on public.combat_tokens(character_id) where character_id is not null;
create index if not exists combat_proposals_encounter_status_idx on public.combat_proposals(encounter_id, status, created_at desc);
create index if not exists combat_proposals_creator_idx on public.combat_proposals(created_by, status);
create index if not exists combat_reaction_windows_encounter_idx on public.combat_reaction_windows(encounter_id, status, opened_at desc);
create index if not exists combat_reaction_windows_proposal_idx on public.combat_reaction_windows(proposal_id);
create index if not exists combat_reaction_responses_window_idx on public.combat_reaction_responses(reaction_window_id, created_at);
create index if not exists combat_resolutions_encounter_time_idx on public.combat_resolutions(encounter_id, resolved_at desc);
create index if not exists combat_events_encounter_time_idx on public.combat_events(encounter_id, created_at desc);
create index if not exists combat_events_proposal_idx on public.combat_events(proposal_id) where proposal_id is not null;

-- ---------------------------------------------------------------------------
-- Utility and authorization functions
-- ---------------------------------------------------------------------------

create or replace function public.combat_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

drop trigger if exists combat_encounters_set_updated_at on public.combat_encounters;
create trigger combat_encounters_set_updated_at before update on public.combat_encounters
for each row execute function public.combat_set_updated_at();
drop trigger if exists combat_maps_set_updated_at on public.combat_maps;
create trigger combat_maps_set_updated_at before update on public.combat_maps
for each row execute function public.combat_set_updated_at();
drop trigger if exists combat_tokens_set_updated_at on public.combat_tokens;
create trigger combat_tokens_set_updated_at before update on public.combat_tokens
for each row execute function public.combat_set_updated_at();
drop trigger if exists combat_proposals_set_updated_at on public.combat_proposals;
create trigger combat_proposals_set_updated_at before update on public.combat_proposals
for each row execute function public.combat_set_updated_at();
drop trigger if exists combat_reaction_responses_set_updated_at on public.combat_reaction_responses;
create trigger combat_reaction_responses_set_updated_at before update on public.combat_reaction_responses
for each row execute function public.combat_set_updated_at();

create or replace function public.is_combat_member(p_encounter_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1 from public.combat_members m
    where m.encounter_id = p_encounter_id and m.user_id = p_user_id
  );
$$;

create or replace function public.is_combat_dm(p_encounter_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1 from public.combat_encounters e
    where e.id = p_encounter_id and e.dm_user_id = p_user_id
  );
$$;

create or replace function public.controls_combat_token(p_token_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1 from public.combat_tokens t
    join public.combat_encounters e on e.id = t.encounter_id
    where t.id = p_token_id
      and (t.assigned_user_id = p_user_id or e.dm_user_id = p_user_id)
  );
$$;

create or replace function public.combat_storage_encounter_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  return nullif(split_part(p_name, '/', 1), '')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function public.is_combat_member(uuid, uuid) from public, anon;
revoke all on function public.is_combat_dm(uuid, uuid) from public, anon;
revoke all on function public.controls_combat_token(uuid, uuid) from public, anon;
grant execute on function public.is_combat_member(uuid, uuid) to authenticated;
grant execute on function public.is_combat_dm(uuid, uuid) to authenticated;
grant execute on function public.controls_combat_token(uuid, uuid) to authenticated;
revoke all on function public.combat_storage_encounter_id(text) from public, anon;
grant execute on function public.combat_storage_encounter_id(text) to authenticated;

create or replace function public.combat_add_dm_member()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.combat_members(encounter_id, user_id, role)
  values (new.id, new.dm_user_id, 'dm')
  on conflict (encounter_id, user_id) do update set role = 'dm';
  return new;
end;
$$;

drop trigger if exists combat_encounter_add_dm on public.combat_encounters;
create trigger combat_encounter_add_dm after insert on public.combat_encounters
for each row execute function public.combat_add_dm_member();

create or replace function public.combat_sync_reaction_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    update public.combat_proposals
      set status = 'reaction_window', version = version + 1
      where id = new.proposal_id and status in ('submitted', 'awaiting_dm');
  elsif new.status = 'closed' and old.status = 'open' then
    update public.combat_proposals
      set status = 'awaiting_dm', version = version + 1
      where id = new.proposal_id and status = 'reaction_window';
  end if;
  return new;
end;
$$;

drop trigger if exists combat_reaction_sync_proposal on public.combat_reaction_windows;
create trigger combat_reaction_sync_proposal
after insert or update of status on public.combat_reaction_windows
for each row execute function public.combat_sync_reaction_status();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.combat_encounters enable row level security;
alter table public.combat_members enable row level security;
alter table public.combat_maps enable row level security;
alter table public.combat_tokens enable row level security;
alter table public.combat_proposals enable row level security;
alter table public.combat_reaction_windows enable row level security;
alter table public.combat_reaction_responses enable row level security;
alter table public.combat_resolutions enable row level security;
alter table public.combat_events enable row level security;

drop policy if exists "combat members read encounters" on public.combat_encounters;
create policy "combat members read encounters" on public.combat_encounters for select
using (public.is_combat_member(id));
drop policy if exists "users create encounters as dm" on public.combat_encounters;
create policy "users create encounters as dm" on public.combat_encounters for insert
with check (auth.uid() = dm_user_id);
drop policy if exists "combat dm updates encounters" on public.combat_encounters;
create policy "combat dm updates encounters" on public.combat_encounters for update
using (public.is_combat_dm(id)) with check (public.is_combat_dm(id));
drop policy if exists "combat dm deletes encounters" on public.combat_encounters;
create policy "combat dm deletes encounters" on public.combat_encounters for delete
using (public.is_combat_dm(id));

drop policy if exists "combat members read membership" on public.combat_members;
create policy "combat members read membership" on public.combat_members for select
using (public.is_combat_member(encounter_id));
drop policy if exists "combat dm manages membership" on public.combat_members;
create policy "combat dm manages membership" on public.combat_members for all
using (public.is_combat_dm(encounter_id)) with check (public.is_combat_dm(encounter_id));

drop policy if exists "combat members read maps" on public.combat_maps;
create policy "combat members read maps" on public.combat_maps for select
using (public.is_combat_member(encounter_id));
drop policy if exists "combat dm manages maps" on public.combat_maps;
create policy "combat dm manages maps" on public.combat_maps for all
using (public.is_combat_dm(encounter_id)) with check (public.is_combat_dm(encounter_id));

drop policy if exists "combat members read tokens" on public.combat_tokens;
create policy "combat members read tokens" on public.combat_tokens for select
using (public.is_combat_member(encounter_id));
drop policy if exists "combat dm inserts tokens" on public.combat_tokens;
create policy "combat dm inserts tokens" on public.combat_tokens for insert
with check (public.is_combat_dm(encounter_id));
drop policy if exists "combat dm updates token state" on public.combat_tokens;
create policy "combat dm updates token state" on public.combat_tokens for update
using (public.is_combat_dm(encounter_id)) with check (public.is_combat_dm(encounter_id));
drop policy if exists "combat dm deletes tokens" on public.combat_tokens;
create policy "combat dm deletes tokens" on public.combat_tokens for delete
using (public.is_combat_dm(encounter_id));

drop policy if exists "combat members read proposals" on public.combat_proposals;
create policy "combat members read proposals" on public.combat_proposals for select
using (public.is_combat_member(encounter_id));
drop policy if exists "controllers create drafts" on public.combat_proposals;
create policy "controllers create drafts" on public.combat_proposals for insert
with check (
  created_by = auth.uid()
  and status = 'draft'
  and public.is_combat_member(encounter_id)
  and public.controls_combat_token(actor_token_id)
  and jsonb_array_length(coalesce(dm_final_payload->'targets', '[]'::jsonb)) = 0
);
drop policy if exists "creators edit only their drafts" on public.combat_proposals;
create policy "creators edit only their drafts" on public.combat_proposals for update
using (created_by = auth.uid() and status = 'draft')
with check (
  created_by = auth.uid() and status = 'draft'
  and jsonb_array_length(coalesce(dm_final_payload->'targets', '[]'::jsonb)) = 0
);
drop policy if exists "combat dm edits proposals" on public.combat_proposals;
create policy "combat dm edits proposals" on public.combat_proposals for update
using (public.is_combat_dm(encounter_id)) with check (public.is_combat_dm(encounter_id));

drop policy if exists "combat members read reaction windows" on public.combat_reaction_windows;
create policy "combat members read reaction windows" on public.combat_reaction_windows for select
using (public.is_combat_member(encounter_id));
drop policy if exists "combat dm manages reaction windows" on public.combat_reaction_windows;
create policy "combat dm manages reaction windows" on public.combat_reaction_windows for all
using (public.is_combat_dm(encounter_id)) with check (
  public.is_combat_dm(encounter_id)
  and exists (
    select 1 from public.combat_proposals p
    where p.id = proposal_id and p.encounter_id = encounter_id
  )
);

drop policy if exists "combat members read reaction responses" on public.combat_reaction_responses;
create policy "combat members read reaction responses" on public.combat_reaction_responses for select
using (
  exists (
    select 1 from public.combat_reaction_windows w
    where w.id = reaction_window_id and public.is_combat_member(w.encounter_id)
  )
);
drop policy if exists "players manage own eligible reaction response" on public.combat_reaction_responses;
create policy "players manage own eligible reaction response" on public.combat_reaction_responses for all
using (responder_user_id = auth.uid())
with check (
  responder_user_id = auth.uid()
  and public.controls_combat_token(responder_token_id)
  and exists (
    select 1 from public.combat_reaction_windows w
    where w.id = reaction_window_id
      and w.status = 'open'
      and public.is_combat_member(w.encounter_id)
      and (w.allow_additional or responder_token_id = any(w.eligible_token_ids))
  )
);

drop policy if exists "combat members read resolutions" on public.combat_resolutions;
create policy "combat members read resolutions" on public.combat_resolutions for select
using (public.is_combat_member(encounter_id));

drop policy if exists "combat members read events" on public.combat_events;
create policy "combat members read events" on public.combat_events for select
using (public.is_combat_member(encounter_id));
drop policy if exists "combat members create chat only" on public.combat_events;
create policy "combat members create chat only" on public.combat_events for insert
with check (
  public.is_combat_member(encounter_id)
  and created_by = auth.uid()
  and event_type = 'chat'
  and proposal_id is null
  and resolution_id is null
);

revoke all on public.combat_encounters, public.combat_members, public.combat_maps,
  public.combat_tokens, public.combat_proposals, public.combat_reaction_windows,
  public.combat_reaction_responses, public.combat_resolutions, public.combat_events
  from anon;
grant select, insert, update, delete on public.combat_encounters, public.combat_members, public.combat_maps,
  public.combat_tokens, public.combat_proposals, public.combat_reaction_windows,
  public.combat_reaction_responses, public.combat_events to authenticated;
grant select on public.combat_resolutions to authenticated;

-- ---------------------------------------------------------------------------
-- Narrow mutation functions and atomic resolution
-- ---------------------------------------------------------------------------

create or replace function public.move_combat_token(
  p_token_id uuid,
  p_x integer,
  p_y integer,
  p_expected_updated_at timestamptz default null
)
returns public.combat_tokens
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token public.combat_tokens;
  v_map public.combat_maps;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_token from public.combat_tokens where id = p_token_id for update;
  if v_token.id is null then raise exception 'Token not found'; end if;
  if not public.controls_combat_token(p_token_id, auth.uid()) then
    raise exception 'You do not control this token' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and v_token.updated_at <> p_expected_updated_at then
    raise exception 'Token changed on another client; reload and retry' using errcode = '40001';
  end if;
  select * into v_map from public.combat_maps where encounter_id = v_token.encounter_id;
  if p_x < 0 or p_y < 0
     or p_x + v_token.width_squares > v_map.grid_columns
     or p_y + v_token.height_squares > v_map.grid_rows then
    raise exception 'Token position is outside the map';
  end if;
  update public.combat_tokens set x = p_x, y = p_y where id = p_token_id returning * into v_token;
  return v_token;
end;
$$;

create or replace function public.submit_combat_proposal(p_proposal_id uuid, p_expected_version integer)
returns public.combat_proposals
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_proposal public.combat_proposals;
begin
  select * into v_proposal from public.combat_proposals where id = p_proposal_id for update;
  if v_proposal.id is null then raise exception 'Proposal not found'; end if;
  if v_proposal.created_by <> auth.uid() then raise exception 'Only the creator may submit this proposal' using errcode = '42501'; end if;
  if v_proposal.status <> 'draft' then raise exception 'Only a draft may be submitted'; end if;
  if v_proposal.version <> p_expected_version then raise exception 'Proposal version conflict' using errcode = '40001'; end if;
  update public.combat_proposals
    set status = 'awaiting_dm', version = version + 1
    where id = p_proposal_id returning * into v_proposal;
  insert into public.combat_events(encounter_id, proposal_id, event_type, message, payload, created_by)
  values (
    v_proposal.encounter_id, v_proposal.id, 'proposal',
    'Action proposed: ' || coalesce(v_proposal.source_action->>'name', 'Custom action'),
    jsonb_build_object('targets', v_proposal.target_token_ids, 'roll', v_proposal.roll_data),
    auth.uid()
  );
  return v_proposal;
end;
$$;

-- Internal helper. It is intentionally not executable by API roles.
create or replace function public.combat_apply_changes(p_encounter_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_change jsonb;
  v_token public.combat_tokens;
  v_character_data jsonb;
  v_state jsonb;
  v_hp jsonb;
  v_conditions jsonb;
  v_resources jsonb;
  v_resource_change jsonb;
  v_current numeric;
  v_max numeric;
  v_temp numeric;
  v_amount numeric;
  v_absorbed numeric;
  v_before jsonb := '[]'::jsonb;
  v_after jsonb := '[]'::jsonb;
  v_condition text;
begin
  if jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_payload->'targets') <> 'array' then
    raise exception 'Resolution payload requires a targets array';
  end if;
  for v_change in select value from jsonb_array_elements(p_payload->'targets')
  loop
    select * into v_token
      from public.combat_tokens
      where id = (v_change->>'token_id')::uuid and encounter_id = p_encounter_id
      for update;
    if v_token.id is null then raise exception 'Resolution target is not in this encounter'; end if;

    v_character_data := null;
    if v_token.character_id is not null then
      select data into v_character_data from public.characters where id = v_token.character_id for update;
      if v_character_data is null then raise exception 'Linked canonical character no longer exists'; end if;
    end if;
    v_before := v_before || jsonb_build_array(jsonb_build_object(
      'token_id', v_token.id, 'token_state', v_token.state, 'x', v_token.x, 'y', v_token.y,
      'initiative', v_token.initiative, 'character_id', v_token.character_id,
      'character_data', v_character_data
    ));

    v_state := coalesce(v_token.state, '{}'::jsonb);
    v_hp := coalesce(v_state->'hp', '{"current":1,"max":1,"temp":0}'::jsonb);
    v_current := greatest(0, coalesce((v_hp->>'current')::numeric, 0));
    v_max := greatest(1, coalesce((v_hp->>'max')::numeric, 1));
    v_temp := greatest(0, coalesce((v_hp->>'temp')::numeric, 0));

    if v_change ? 'set_max_hp' then
      v_max := greatest(1, (v_change->>'set_max_hp')::numeric);
      v_current := least(v_current, v_max);
    end if;
    if v_change ? 'damage' then
      v_amount := greatest(0, coalesce((v_change->>'damage')::numeric, 0));
      v_absorbed := least(v_temp, v_amount);
      v_temp := v_temp - v_absorbed;
      v_current := greatest(0, v_current - (v_amount - v_absorbed));
    end if;
    if v_change ? 'healing' then
      v_current := least(v_max, v_current + greatest(0, coalesce((v_change->>'healing')::numeric, 0)));
    end if;
    if coalesce((v_change->>'remove_temp_hp')::boolean, false) then v_temp := 0; end if;
    if v_change ? 'temp_hp' then v_temp := greatest(0, (v_change->>'temp_hp')::numeric); end if;
    if v_change ? 'set_hp' then v_current := greatest(0, least(v_max, (v_change->>'set_hp')::numeric)); end if;
    v_hp := jsonb_build_object('current', v_current, 'max', v_max, 'temp', v_temp);

    v_conditions := coalesce(v_state->'conditions', '[]'::jsonb);
    if jsonb_typeof(v_conditions) <> 'array' then v_conditions := '[]'::jsonb; end if;
    if jsonb_typeof(v_change->'conditions_remove') = 'array' then
      select coalesce(jsonb_agg(value), '[]'::jsonb) into v_conditions
      from jsonb_array_elements_text(v_conditions) current_condition(value)
      where value not in (select jsonb_array_elements_text(v_change->'conditions_remove'));
    end if;
    if jsonb_typeof(v_change->'conditions_add') = 'array' then
      for v_condition in select jsonb_array_elements_text(v_change->'conditions_add')
      loop
        if not v_conditions ? v_condition then v_conditions := v_conditions || to_jsonb(v_condition); end if;
      end loop;
    end if;

    v_resources := coalesce(v_state->'resourcePools', '[]'::jsonb);
    if jsonb_typeof(v_resources) <> 'array' then v_resources := '[]'::jsonb; end if;
    if jsonb_typeof(v_change->'resource_changes') = 'array' then
      for v_resource_change in select value from jsonb_array_elements(v_change->'resource_changes')
      loop
        select coalesce(jsonb_agg(
          case when
            (v_resource_change ? 'id' and item->>'id' = v_resource_change->>'id')
            or (v_resource_change ? 'name' and item->>'name' = v_resource_change->>'name')
          then jsonb_set(
            item, '{current}',
            to_jsonb(greatest(0, least(
              coalesce((item->>'max')::numeric, 0),
              case when v_resource_change ? 'set'
                then (v_resource_change->>'set')::numeric
                else coalesce((item->>'current')::numeric, 0) + coalesce((v_resource_change->>'delta')::numeric, 0)
              end
            )))
          ) else item end
        ), '[]'::jsonb) into v_resources
        from jsonb_array_elements(v_resources) resource_item(item);
      end loop;
    end if;

    v_state := jsonb_set(jsonb_set(jsonb_set(v_state, '{hp}', v_hp, true), '{conditions}', v_conditions, true), '{resourcePools}', v_resources, true);
    if v_change ? 'dead' then v_state := jsonb_set(v_state, '{dead}', to_jsonb((v_change->>'dead')::boolean), true); end if;
    if v_change ? 'unconscious' then v_state := jsonb_set(v_state, '{unconscious}', to_jsonb((v_change->>'unconscious')::boolean), true); end if;

    update public.combat_tokens set
      state = v_state,
      x = case when v_change ? 'x' then greatest(0, (v_change->>'x')::integer) else x end,
      y = case when v_change ? 'y' then greatest(0, (v_change->>'y')::integer) else y end,
      initiative = case when v_change ? 'initiative' then (v_change->>'initiative')::numeric else initiative end
    where id = v_token.id returning * into v_token;

    if v_token.character_id is not null then
      v_character_data := jsonb_set(
        jsonb_set(jsonb_set(v_character_data, '{hp}', v_hp, true), '{conditions}', v_conditions, true),
        '{resourcePools}', v_resources, true
      );
      update public.characters set data = v_character_data where id = v_token.character_id;
    end if;

    v_after := v_after || jsonb_build_array(jsonb_build_object(
      'token_id', v_token.id, 'token_state', v_token.state, 'x', v_token.x, 'y', v_token.y,
      'initiative', v_token.initiative, 'character_id', v_token.character_id,
      'character_data', v_character_data
    ));
  end loop;
  return jsonb_build_object('before', v_before, 'after', v_after);
end;
$$;

create or replace function public.resolve_combat_proposal(
  p_proposal_id uuid,
  p_expected_version integer,
  p_dm_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_proposal public.combat_proposals;
  v_existing public.combat_resolutions;
  v_resolution public.combat_resolutions;
  v_payload jsonb;
  v_snapshots jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_proposal from public.combat_proposals where id = p_proposal_id for update;
  if v_proposal.id is null then raise exception 'Proposal not found'; end if;
  if not public.is_combat_dm(v_proposal.encounter_id, auth.uid()) then raise exception 'Only the encounter DM may resolve' using errcode = '42501'; end if;
  select * into v_existing from public.combat_resolutions
    where encounter_id = v_proposal.encounter_id and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then return jsonb_build_object('resolution', to_jsonb(v_existing), 'idempotent', true); end if;
  if v_proposal.status not in ('submitted', 'awaiting_dm', 'reaction_window') then raise exception 'Proposal is not resolvable from status %', v_proposal.status; end if;
  if v_proposal.version <> p_expected_version then raise exception 'Proposal version conflict' using errcode = '40001'; end if;
  v_payload := case
    when jsonb_typeof(p_dm_payload->'targets') = 'array' and jsonb_array_length(p_dm_payload->'targets') > 0 then p_dm_payload
    when jsonb_array_length(coalesce(v_proposal.player_override_payload->'targets', '[]'::jsonb)) > 0 then v_proposal.player_override_payload
    else v_proposal.calculated_payload
  end;
  v_snapshots := public.combat_apply_changes(v_proposal.encounter_id, v_payload);
  insert into public.combat_resolutions(
    encounter_id, proposal_id, resolution_type, idempotency_key, before_state,
    applied_changes, after_state, resolved_by
  ) values (
    v_proposal.encounter_id, v_proposal.id, 'proposal', p_idempotency_key,
    v_snapshots->'before', v_payload, v_snapshots->'after', auth.uid()
  ) returning * into v_resolution;
  update public.combat_proposals set
    dm_final_payload = v_payload, status = 'resolved', version = version + 1
    where id = v_proposal.id;
  update public.combat_reaction_windows set status = 'closed', closed_at = now()
    where proposal_id = v_proposal.id and status = 'open';
  insert into public.combat_events(encounter_id, proposal_id, resolution_id, event_type, message, payload, created_by)
  values (
    v_proposal.encounter_id, v_proposal.id, v_resolution.id, 'resolution',
    'DM resolved: ' || coalesce(v_proposal.source_action->>'name', 'Custom action'),
    jsonb_build_object('changes', v_payload, 'before', v_snapshots->'before', 'after', v_snapshots->'after'),
    auth.uid()
  );
  return jsonb_build_object('resolution', to_jsonb(v_resolution), 'after', v_snapshots->'after', 'idempotent', false);
end;
$$;

create or replace function public.apply_direct_combat_resolution(
  p_encounter_id uuid,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.combat_resolutions;
  v_resolution public.combat_resolutions;
  v_snapshots jsonb;
begin
  if auth.uid() is null or not public.is_combat_dm(p_encounter_id, auth.uid()) then
    raise exception 'Only the encounter DM may apply a direct resolution' using errcode = '42501';
  end if;
  perform 1 from public.combat_encounters where id = p_encounter_id for update;
  if not found then raise exception 'Encounter not found'; end if;
  select * into v_existing from public.combat_resolutions
    where encounter_id = p_encounter_id and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then return jsonb_build_object('resolution', to_jsonb(v_existing), 'idempotent', true); end if;
  v_snapshots := public.combat_apply_changes(p_encounter_id, p_payload);
  insert into public.combat_resolutions(
    encounter_id, resolution_type, idempotency_key, before_state, applied_changes, after_state, resolved_by
  ) values (
    p_encounter_id, 'direct', p_idempotency_key, v_snapshots->'before', p_payload, v_snapshots->'after', auth.uid()
  ) returning * into v_resolution;
  insert into public.combat_events(encounter_id, resolution_id, event_type, message, payload, created_by)
  values (
    p_encounter_id, v_resolution.id, 'resolution',
    coalesce(nullif(p_payload->>'note', ''), 'DM applied a direct resolution'),
    jsonb_build_object('changes', p_payload, 'before', v_snapshots->'before', 'after', v_snapshots->'after'),
    auth.uid()
  );
  return jsonb_build_object('resolution', to_jsonb(v_resolution), 'after', v_snapshots->'after', 'idempotent', false);
end;
$$;

create or replace function public.undo_latest_combat_resolution(p_encounter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_resolution public.combat_resolutions;
  v_snapshot jsonb;
  v_latest_id uuid;
begin
  if auth.uid() is null or not public.is_combat_dm(p_encounter_id, auth.uid()) then
    raise exception 'Only the encounter DM may undo' using errcode = '42501';
  end if;
  select id into v_latest_id from public.combat_resolutions
    where encounter_id = p_encounter_id and undone_at is null
    order by resolved_at desc, id desc limit 1 for update;
  if v_latest_id is null then raise exception 'There is no active resolution to undo'; end if;
  select * into v_resolution from public.combat_resolutions where id = v_latest_id for update;
  for v_snapshot in select value from jsonb_array_elements(v_resolution.before_state)
  loop
    update public.combat_tokens set
      state = v_snapshot->'token_state',
      x = (v_snapshot->>'x')::integer,
      y = (v_snapshot->>'y')::integer,
      initiative = case when v_snapshot->>'initiative' is null then null else (v_snapshot->>'initiative')::numeric end
    where id = (v_snapshot->>'token_id')::uuid and encounter_id = p_encounter_id;
    if v_snapshot->>'character_id' is not null and v_snapshot->'character_data' <> 'null'::jsonb then
      update public.characters set data = v_snapshot->'character_data'
      where id = (v_snapshot->>'character_id')::uuid;
    end if;
  end loop;
  update public.combat_resolutions set undone_at = now(), undone_by = auth.uid() where id = v_resolution.id;
  if v_resolution.proposal_id is not null then
    update public.combat_proposals set status = 'undone', version = version + 1 where id = v_resolution.proposal_id;
  end if;
  insert into public.combat_events(encounter_id, proposal_id, resolution_id, event_type, message, payload, created_by)
  values (
    p_encounter_id, v_resolution.proposal_id, v_resolution.id, 'system',
    'DM undid the latest resolution', jsonb_build_object('restored', v_resolution.before_state), auth.uid()
  );
  return jsonb_build_object('resolution_id', v_resolution.id, 'restored', v_resolution.before_state);
end;
$$;

create or replace function public.advance_combat_round(p_encounter_id uuid, p_direction integer default 1)
returns public.combat_encounters
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_encounter public.combat_encounters;
  v_token public.combat_tokens;
  v_resources jsonb;
  v_state jsonb;
  v_character_data jsonb;
begin
  if auth.uid() is null or not public.is_combat_dm(p_encounter_id, auth.uid()) then
    raise exception 'Only the encounter DM may advance rounds' using errcode = '42501';
  end if;
  select * into v_encounter from public.combat_encounters where id = p_encounter_id for update;
  if v_encounter.id is null then raise exception 'Encounter not found'; end if;
  if p_direction not in (-1, 1) then raise exception 'Round direction must be -1 or 1'; end if;

  if p_direction = 1 then
    for v_token in select * from public.combat_tokens where encounter_id = p_encounter_id for update
    loop
      select coalesce(jsonb_agg(
        case when item->>'rechargeType' = 'round'
          then jsonb_set(item, '{current}', coalesce(item->'max', '0'::jsonb), true)
          else item end
      ), '[]'::jsonb) into v_resources
      from jsonb_array_elements(coalesce(v_token.state->'resourcePools', '[]'::jsonb)) resource_item(item);
      v_state := jsonb_set(
        jsonb_set(v_token.state, '{resourcePools}', v_resources, true),
        '{legendaryActionsUsed}', '0'::jsonb, true
      );
      update public.combat_tokens set state = v_state where id = v_token.id;
      if v_token.character_id is not null then
        select data into v_character_data from public.characters where id = v_token.character_id for update;
        v_character_data := jsonb_set(
          jsonb_set(v_character_data, '{resourcePools}', v_resources, true),
          '{legendaryActionsUsed}', '0'::jsonb, true
        );
        update public.characters set data = v_character_data where id = v_token.character_id;
      end if;
    end loop;
  end if;

  update public.combat_encounters
    set round_number = greatest(1, round_number + p_direction)
    where id = p_encounter_id returning * into v_encounter;
  insert into public.combat_events(encounter_id, event_type, message, payload, created_by)
  values (
    p_encounter_id, 'system', 'Round changed to ' || v_encounter.round_number,
    jsonb_build_object('round', v_encounter.round_number, 'per_round_resources_reset', p_direction = 1),
    auth.uid()
  );
  return v_encounter;
end;
$$;

revoke all on function public.move_combat_token(uuid, integer, integer, timestamptz) from public, anon;
revoke all on function public.submit_combat_proposal(uuid, integer) from public, anon;
revoke all on function public.combat_apply_changes(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_combat_proposal(uuid, integer, jsonb, uuid) from public, anon;
revoke all on function public.apply_direct_combat_resolution(uuid, jsonb, uuid) from public, anon;
revoke all on function public.undo_latest_combat_resolution(uuid) from public, anon;
revoke all on function public.advance_combat_round(uuid, integer) from public, anon;
grant execute on function public.move_combat_token(uuid, integer, integer, timestamptz) to authenticated;
grant execute on function public.submit_combat_proposal(uuid, integer) to authenticated;
grant execute on function public.resolve_combat_proposal(uuid, integer, jsonb, uuid) to authenticated;
grant execute on function public.apply_direct_combat_resolution(uuid, jsonb, uuid) to authenticated;
grant execute on function public.undo_latest_combat_resolution(uuid) to authenticated;
grant execute on function public.advance_combat_round(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Private map storage
-- ---------------------------------------------------------------------------

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'combat-maps', 'combat-maps', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "combat members read map objects" on storage.objects;
create policy "combat members read map objects" on storage.objects for select to authenticated
using (
  bucket_id = 'combat-maps'
  and public.is_combat_member(public.combat_storage_encounter_id(name))
);
drop policy if exists "combat dm inserts map objects" on storage.objects;
create policy "combat dm inserts map objects" on storage.objects for insert to authenticated
with check (
  bucket_id = 'combat-maps'
  and public.is_combat_dm(public.combat_storage_encounter_id(name))
);
drop policy if exists "combat dm updates map objects" on storage.objects;
create policy "combat dm updates map objects" on storage.objects for update to authenticated
using (
  bucket_id = 'combat-maps'
  and public.is_combat_dm(public.combat_storage_encounter_id(name))
) with check (
  bucket_id = 'combat-maps'
  and public.is_combat_dm(public.combat_storage_encounter_id(name))
);
drop policy if exists "combat dm deletes map objects" on storage.objects;
create policy "combat dm deletes map objects" on storage.objects for delete to authenticated
using (
  bucket_id = 'combat-maps'
  and public.is_combat_dm(public.combat_storage_encounter_id(name))
);

-- ---------------------------------------------------------------------------
-- Realtime publication (idempotent)
-- ---------------------------------------------------------------------------

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'combat_encounters', 'combat_members', 'combat_maps', 'combat_tokens',
    'combat_proposals', 'combat_reaction_windows', 'combat_reaction_responses',
    'combat_resolutions', 'combat_events'
  ]
  loop
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

comment on table public.combat_encounters is 'Persistent shared tactical combat encounters.';
comment on function public.resolve_combat_proposal is 'DM-authorized, idempotent, transactional proposal resolution.';
comment on function public.apply_direct_combat_resolution is 'DM-authorized, idempotent, transactional direct resolution.';
comment on function public.undo_latest_combat_resolution is 'Restores the newest active resolution snapshot only.';

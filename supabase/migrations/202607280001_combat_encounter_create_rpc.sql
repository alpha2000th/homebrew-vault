-- Create a combat encounter and its initial map in one authenticated transaction.
-- Ownership is derived from the caller's JWT instead of trusting a client value.

create or replace function public.create_combat_encounter(
  p_name text,
  p_campaign_id uuid default null,
  p_turn_mode text default 'initiative',
  p_preset_name text default 'blank',
  p_grid_columns integer default 24,
  p_grid_rows integer default 18,
  p_feet_per_square numeric default 5
)
returns public.combat_encounters
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_encounter public.combat_encounters;
  v_name text := coalesce(nullif(btrim(p_name), ''), 'New Encounter');
begin
  if v_user_id is null then
    raise exception 'Sign in before creating an encounter' using errcode = '42501';
  end if;

  if char_length(v_name) > 160 then
    raise exception 'Encounter name must be 160 characters or fewer' using errcode = '22001';
  end if;

  if p_campaign_id is not null
     and not public.is_campaign_member(p_campaign_id)
     and not public.is_campaign_dm(p_campaign_id) then
    raise exception 'You are not a member of the selected campaign' using errcode = '42501';
  end if;

  insert into public.combat_encounters(
    campaign_id,
    dm_user_id,
    name,
    turn_mode,
    settings
  ) values (
    p_campaign_id,
    v_user_id,
    v_name,
    p_turn_mode,
    '{"showRoundInFreeMode":true}'::jsonb
  )
  returning * into v_encounter;

  insert into public.combat_maps(
    encounter_id,
    map_type,
    preset_name,
    grid_columns,
    grid_rows,
    feet_per_square
  ) values (
    v_encounter.id,
    'preset',
    p_preset_name,
    p_grid_columns,
    p_grid_rows,
    p_feet_per_square
  );

  return v_encounter;
end;
$$;

revoke all on function public.create_combat_encounter(
  text, uuid, text, text, integer, integer, numeric
) from public, anon;
grant execute on function public.create_combat_encounter(
  text, uuid, text, text, integer, integer, numeric
) to authenticated;

comment on function public.create_combat_encounter(
  text, uuid, text, text, integer, integer, numeric
) is 'Creates an encounter and preset map atomically, deriving DM ownership from auth.uid().';

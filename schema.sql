-- Homebrew Vault: accounts, campaigns, sharing, DM-hidden NPCs
-- Safe to re-run: drops and rebuilds everything (no real data exists yet).
create extension if not exists pgcrypto;

-- ============================================================
-- RESET
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_campaign_created on public.campaigns;
drop trigger if exists characters_set_updated_at on public.characters;

drop function if exists public.handle_new_user();
drop function if exists public.handle_new_campaign();
drop function if exists public.join_campaign(text);
drop function if exists public.set_updated_at();
drop function if exists public.is_campaign_member(uuid);
drop function if exists public.is_campaign_dm(uuid);
drop function if exists public.is_character_owner(uuid);
drop function if exists public.has_character_share(uuid, text);

drop table if exists public.character_shares cascade;
drop table if exists public.characters cascade;
drop table if exists public.campaign_members cascade;
drop table if exists public.campaigns cascade;
drop table if exists public.profiles cascade;

-- ============================================================
-- TABLES
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dm_id uuid not null references public.profiles(id) on delete cascade,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  created_at timestamptz not null default now()
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('dm', 'player')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  data jsonb not null,
  visibility text not null default 'private' check (visibility in ('private', 'campaign', 'public')),
  is_hidden_from_players boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.character_shares (
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check (permission in ('view', 'edit')),
  created_at timestamptz not null default now(),
  primary key (character_id, user_id)
);

-- ============================================================
-- HELPER FUNCTIONS
-- security definer means these run with the table owner's privileges,
-- bypassing RLS internally. Policies call these instead of querying the
-- other table directly, which is what breaks the recursion: a `campaigns`
-- policy that queries `campaign_members` directly, whose own policy queries
-- `campaigns` right back, is a cycle Postgres can't resolve. Going through
-- a security-definer function sidesteps RLS on that inner query entirely.
-- ============================================================

create function public.is_campaign_dm(p_campaign_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.dm_id = auth.uid());
$$;

create function public.is_campaign_member(p_campaign_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.campaign_members m where m.campaign_id = p_campaign_id and m.user_id = auth.uid());
$$;

create function public.is_character_owner(p_character_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.characters c where c.id = p_character_id and c.owner_id = auth.uid());
$$;

create function public.has_character_share(p_character_id uuid, p_min_permission text default 'view')
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.character_shares s
    where s.character_id = p_character_id
      and s.user_id = auth.uid()
      and (p_min_permission = 'view' or s.permission = 'edit')
  );
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters enable row level security;
alter table public.character_shares enable row level security;

-- PROFILES
create policy "profiles are readable by any signed-in user"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- CAMPAIGNS
create policy "members and the DM can see a campaign"
  on public.campaigns for select
  using (dm_id = auth.uid() or public.is_campaign_member(id));

create policy "a signed-in user can create a campaign as its DM"
  on public.campaigns for insert
  with check (dm_id = auth.uid());

create policy "the DM can update their campaign"
  on public.campaigns for update using (dm_id = auth.uid());

create policy "the DM can delete their campaign"
  on public.campaigns for delete using (dm_id = auth.uid());

-- CAMPAIGN MEMBERS
create policy "members can see their own membership rows; the DM sees all"
  on public.campaign_members for select
  using (user_id = auth.uid() or public.is_campaign_dm(campaign_id));

create policy "a player can leave, or the DM can remove a player"
  on public.campaign_members for delete
  using (user_id = auth.uid() or public.is_campaign_dm(campaign_id));

-- CHARACTERS
create policy "owners, people it's shared with, and campaign members can view"
  on public.characters for select
  using (
    owner_id = auth.uid()
    or public.has_character_share(id, 'view')
    or (
      visibility = 'campaign'
      and campaign_id is not null
      and public.is_campaign_member(campaign_id)
      and (is_hidden_from_players = false or owner_id = auth.uid())
    )
    or visibility = 'public'
  );

create policy "a signed-in user can create characters they own"
  on public.characters for insert
  with check (owner_id = auth.uid());

create policy "owners and edit-shared users can update"
  on public.characters for update
  using (owner_id = auth.uid() or public.has_character_share(id, 'edit'));

create policy "only the owner can delete"
  on public.characters for delete
  using (owner_id = auth.uid());

-- CHARACTER SHARES
create policy "the recipient or the character's owner can see a share"
  on public.character_shares for select
  using (user_id = auth.uid() or public.is_character_owner(character_id));

create policy "only the character's owner can grant, change, or revoke shares"
  on public.character_shares for all
  using (public.is_character_owner(character_id))
  with check (public.is_character_owner(character_id));

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create a profile row whenever someone signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-enroll the DM as a member of their own campaign
create function public.handle_new_campaign()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role)
  values (new.id, new.dm_id, 'dm');
  return new;
end;
$$;

create trigger on_campaign_created
  after insert on public.campaigns
  for each row execute procedure public.handle_new_campaign();

-- Joining a campaign goes through this function (not a direct insert),
-- so a valid invite code is required and the DM is auto-enrolled as 'dm'.
create function public.join_campaign(p_invite_code text)
returns public.campaigns
language plpgsql
security definer set search_path = public
as $$
declare
  v_campaign public.campaigns;
begin
  select * into v_campaign from public.campaigns where invite_code = p_invite_code;
  if v_campaign.id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_campaign.id, auth.uid(), 'player')
  on conflict (campaign_id, user_id) do nothing;

  return v_campaign;
end;
$$;

create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger characters_set_updated_at
  before update on public.characters
  for each row execute procedure public.set_updated_at();

-- Backfill: the trigger above only fires for future signups, so anyone who
-- already signed up before this reset (e.g. your test account) needs their
-- profile row created here once, manually.
insert into public.profiles (id, email, display_name)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

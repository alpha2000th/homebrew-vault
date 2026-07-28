# Supabase deployment and verification

## Prerequisites

- Supabase CLI authenticated to the intended project
- A database backup
- The project reference and database password
- Two test users plus the DM user

Never use a service-role key in the frontend or in a `VITE_` variable.

## Inspect before applying

The repository snapshot contains the existing schema in `schema.sql`. On the
connected project, capture current remote state before changing it:

```sh
supabase login
supabase link --project-ref psmzewaofkvwujccmlrv
supabase db dump --linked --schema public,storage --file before-combat.sql
supabase migration list
```

Review tables, routines, policies, triggers, the `supabase_realtime`
publication, and `storage.buckets` in the dump. Do not run `schema.sql` against
an existing project: it intentionally contains destructive reset statements
from the original bootstrap.

## Apply

```sh
supabase db push --linked
```

The push applies:

`supabase/migrations/202607270001_combat_core.sql`

Then regenerate a remote schema dump and confirm that only additive combat
objects and storage policies changed.

## Verify

Because this repository predates Supabase migrations, bootstrap the legacy
schema only in an empty local database, then apply the additive combat file:

```sh
supabase start
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f schema.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/migrations/202607270001_combat_core.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/combat_rls.sql
```

`schema.sql` drops legacy tables and is therefore local-bootstrap-only. Never
run it against the linked or production project.

On the linked project:

1. Confirm all nine combat tables have RLS enabled.
2. Confirm all nine are in `supabase_realtime`.
3. Confirm `combat-maps` is private, limited to 10 MB, and permits only JPEG,
   PNG, and WebP.
4. Confirm `PUBLIC` and `anon` cannot execute resolution RPCs.
5. Confirm only `authenticated` can execute the public RPCs.
6. Exercise the four roles in `combat_rls.sql`: DM, assigned player, different
   encounter member, and authenticated outsider.
7. Resolve the same request twice with one idempotency key and confirm one
   resolution row.
8. Create two direct resolutions; verify the older one cannot be selected for
   undo before the newer one.
9. Resolve damage against a linked token and confirm both
   `combat_tokens.state.hp` and `characters.data.hp` change in the same commit.

## Manual application smoke test

1. Sign in as a campaign owner and open Combat.
2. Create a 24×18 stone map encounter and reopen it after a refresh.
3. Load a Vault character, assign it to a player, and add a temporary NPC.
4. Open another browser as the assigned player; confirm Presence and live token
   movement.
5. Attempt to move the NPC as the player; confirm it is denied.
6. Shift-click a target, roll `2d8 + 5`, edit the total, and submit.
7. Open a broad reaction window. Respond with a recorded reaction, custom text,
   pass, and question in separate checks.
8. As DM, edit final damage and resolve. Confirm token and canonical HP.
9. Directly deal 60 damage, verify temporary HP absorbs first, then undo.
10. Refresh both clients and confirm chat and combat history remain.

## Current remote status

This repository does not contain a Supabase access token or database password.
The migration therefore must not be reported as remotely applied until the
commands above complete successfully against the linked project.

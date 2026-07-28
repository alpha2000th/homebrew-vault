# Homebrew Vault

Homebrew Vault is a Supabase-backed character vault and campaign tool with a
shared tactical combat workspace. The existing character sheet remains
compatible with its original JSON files; schema version 2 only adds optional
structured combat metadata.

## Local development

Requirements: Node.js 22 and pnpm 11.

```sh
pnpm install
pnpm dev
```

Create `.env.local` from `.env.example` when targeting another Supabase
project. The production project's public anon key remains a client-side key;
authorization is enforced by RLS and authenticated RPCs. Never put a service
role key in a Vite environment variable.

Useful commands:

```sh
pnpm test
pnpm build
pnpm preview
```

Vite uses the `/homebrew-vault/` base path. The GitHub Actions workflow tests
and builds pull requests and deploys `main` to GitHub Pages.

## Combat

After sign-in, use the **Combat** button to create or reopen encounters.

- Desktop uses a map/sidebar split; mobile has separate Map and Combat Panel
  views.
- DMs create encounters, load Vault characters or temporary NPCs, assign token
  controllers, configure maps, change turn mode, resolve actions, apply direct
  changes, and undo the latest resolution.
- Players move assigned tokens, roll dice, edit proposals, submit custom
  actions, respond to broad reaction windows, and chat.
- Calculations are advisory. Player and DM overrides stay explicit, and no
  reaction is represented as rules-valid.
- Supabase Realtime synchronizes encounter state and Presence reports online
  members.

See [Combat architecture](docs/COMBAT_ARCHITECTURE.md) and
[Supabase deployment](docs/SUPABASE_DEPLOYMENT.md).

## Character JSON version 2

Legacy actions still work:

```json
{
  "category": "action",
  "name": "Claw",
  "cost": "",
  "description": "+5 to hit, 1d6+3 slashing damage."
}
```

Actions may optionally add `attackFormula`, `damageFormulas`,
`healingFormula`, `saveAbility`, `saveDc`, `resourceCosts`, `range`, `area`,
`targetType`, and `effects`. Import normalization upgrades old files without
requiring these fields.

## Database

The original `schema.sql` documents the current legacy schema and is not used
as a forward migration because it resets tables. Combat is delivered through
the additive migration:

`supabase/migrations/202607270001_combat_core.sql`

Apply and verify it before deploying the combat frontend. Rollback guidance is
in `supabase/ROLLBACK.md`.

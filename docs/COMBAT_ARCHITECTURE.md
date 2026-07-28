# Combat architecture

## Trust boundary

The browser is a collaborative editor and preview surface, not the final
authority. RLS protects reads and draft writes. Players move tokens through
`move_combat_token`, which can change only position. The three final mutation
paths are authenticated `SECURITY DEFINER` RPCs:

- `resolve_combat_proposal`
- `apply_direct_combat_resolution`
- `undo_latest_combat_resolution`

Every RPC checks `auth.uid()`, verifies DM ownership, uses an explicit safe
`search_path`, locks affected rows, snapshots state, updates linked canonical
characters and encounter tokens, and writes durable history in the same
transaction. API roles cannot execute the internal change helper.

Idempotency keys make retried resolution requests return the first resolution.
Undo selects only the newest active resolution, so an older snapshot cannot
overwrite later state.

## Frontend modules

- `src/features/combat/CombatApp.tsx` — launcher, encounter list, responsive
  workspace, encounter setup.
- `src/features/combat/MapBoard.tsx` — grid, presets/upload background, pan,
  zoom, snapping, selection, distance warning, and permissive movement.
- `src/features/combat/CombatPanel.tsx` — turn order, actions, proposals,
  reactions, DM direct tools, and persistent feed.
- `src/features/combat/useCombatEncounter.ts` — initial hydration, Realtime
  subscriptions, Presence, deduplication, reconnect state, and optimistic
  movement rollback.
- `src/features/combat/api.ts` — typed Supabase operations and RPC calls.
- `src/lib/dice/` — tokenizer/parser/roller with no `eval`.
- `src/lib/combat/` — HP math, override precedence, character migration,
  permissions, state transitions, and event reducer.

The compiled combat application mounts beside the existing Vault root. This
keeps current character-sheet behavior stable while preventing the combat
feature from expanding the legacy inline application.

## Realtime behavior

The client first hydrates a coherent snapshot, then subscribes to filtered
Postgres changes for encounters, tokens, proposals, reaction windows, and
events. Event keys suppress duplicate delivery. Subscriptions are removed on
unmount. Reconnect status is visible.

Token moves are optimistic. A successful RPC replaces the optimistic row with
the server row; a version conflict, permission error, or network failure
restores the prior token position and surfaces an error.

Final HP is never optimistic. It changes only after a resolution RPC returns or
Realtime delivers the committed row.

## Canonical character synchronization

Vault-backed tokens store an encounter snapshot for fast map rendering. Final
resolution locks and updates both `combat_tokens.state` and the linked
`characters.data` fields:

- `hp`
- `conditions`
- `resourcePools`

Temporary NPCs have no `character_id` and remain encounter-only. Portraits and
action lists are copied into a token when it is loaded; a future phase should
add a controlled refresh command for non-combat sheet edits instead of a
bidirectional trigger.

## Deliberately deferred

Dynamic lighting, wall collision, enforced opportunity attacks, occupancy
blocking, automated reaction recommendations, and advanced fog of war are not
implemented. Map and token state use JSON settings so these can be introduced
without replacing the core schema.

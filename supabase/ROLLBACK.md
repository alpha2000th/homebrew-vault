# Combat migration rollback notes

The combat migration is additive. Before rollback, export all combat tables and
the private `combat-maps` bucket. Rolling back removes combat history and map
uploads but does not change `profiles`, `campaigns`, `campaign_members`,
`characters`, or `character_shares`.

Recommended rollback order:

1. Remove the combat tables from the `supabase_realtime` publication.
2. Drop the six public RPCs, internal apply helper, and four authorization or
   storage-path helpers.
3. Remove the four `storage.objects` policies and the `combat-maps` bucket.
4. Drop combat tables in foreign-key order: events, resolutions, reaction
   responses, reaction windows, proposals, then clear the encounter active-turn
   foreign key, followed by tokens, maps, members, and encounters.

Do not run a rollback on production without a verified export. Resolved combat
transactions may already have updated canonical `characters.data`; those
character changes are intentionally not reversed by dropping the combat schema.

# Combat Proposal Payload

Guided proposals use the existing `combat_proposals` table and transactional RPCs. No database column change is required because `roll_data` is versioned JSONB.

## Version 2 structure

```text
roll_data
├── schemaVersion: 2
├── guidedDraft
│   ├── actor, category, source action, step, and history
│   ├── targets and per-target outcomes
│   ├── area template
│   ├── primary AttackEntry
│   ├── Multiattack AttackEntry[]
│   ├── DamageComponent[]
│   ├── healing and temporary-HP components
│   ├── utility effects
│   └── deferred resource costs
├── attack compatibility summary
├── damage compatibility summary
├── multiattack compatibility summary
└── target outcomes
```

`calculated_payload` stores calculation-only values. `player_override_payload` stores player-final values and deferred actor resources. `dm_final_payload` contains the DM-approved atomic result.

Legacy proposals without `guidedDraft` continue to render through runtime normalization.

Final HP is never applied through chained client writes. DM-approved values go to `resolve_combat_proposal`, preserving authorization, idempotency, the resolution ledger, canonical synchronization, and undo.

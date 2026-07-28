# Character Action Schema

Combat actions are normalized by `src/lib/combat/characterSchema.ts` and consumed by the guided router.

| Field | Guided behavior |
| --- | --- |
| `category` | Filters Action, Bonus, Reaction, Legendary, Lair, and Power commands |
| `attackFormula` | Adds the attack-roll step |
| `damageFormulas[]` | Creates separately identifiable damage components |
| `healingFormula` | Adds the healing step |
| `saveAbility`, `saveDc` | Adds per-target save suggestions |
| `resourceCosts[]` | Defers costs until atomic DM resolution |
| `range`, `targetType` | Supplies advisory target information |
| `area` | Adds area placement |
| `effects[]` | Adds temp HP, conditions, resources, notes, or utility effects |

All rules information remains editable. Missing structured fields do not make an action unusable; the legacy route chooser asks the player what the action does.

Every damage formula becomes a `DamageComponent` that also records source, dice, calculated subtotal, override, final subtotal, critical treatment, and inclusion state.

Temporary HP uses `kind: "temp_hp"` and never routes through healing.

Multiattack is represented as ordered `AttackEntry` records. The current compatibility layer expands the Tarrasque’s known five-entry sequence from its description.

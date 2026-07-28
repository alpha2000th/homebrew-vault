# Guided Combat Flow

## Purpose

Combat actions use a progressive RPG command interface. The map remains dominant while the right panel presents one decision at a time. The app organizes rolls and proposals but does not enforce D&D legality.

## Player workflow

1. Choose Action, Bonus Action, Movement, Legendary Action, Lair Action, Power, Custom Action, or End Turn.
2. Choose an ability from concise cards filtered to that category.
3. Review its full description.
4. Select targets from the map or synchronized target list.
5. Place an area template when applicable.
6. Complete only the applicable attack, save, damage, healing, temporary-HP, or utility steps.
7. Review the structured proposal and submit it to the DM.

Back navigation preserves entries. Cancel requires confirmation when meaningful work exists. In-progress drafts are stored locally per encounter and actor, so changing Combat tabs does not discard them.

## State transitions

`choose_category → choose_ability → ability_detail`

The schema then creates an advisory route:

- `attackFormula`: `choose_targets → attack_roll`
- `saveAbility`: `choose_targets → saving_throw`
- `area`: `choose_targets → place_area`
- `damageFormulas`: `damage`
- `healingFormula`: `healing`
- `temp_hp` effect: `temporary_hp`
- conditions, notes, resources, or unstructured effects: `utility_effects`
- Multiattack: `multiattack`

Every route ends at `review → submitting → submitted`.

## Structured and legacy actions

Schema-v2 actions create a likely route from recorded fields. All formulas and outcomes remain editable and advisory.

Legacy actions open an explicit chooser for Attack, Damage, Saving Throw, Healing, Temporary HP, Utility, Multiattack, or Custom. No formula detected from prose is authoritative.

## Targets and areas

Map clicks and panel checkboxes share one target list. Targets have numbered badges and accessible target numbers. The actor and targets use distinct visual treatments.

The target list includes team, HP, temporary HP, conditions, distance, and focus controls. Range is advisory.

Area actions support circle, square, rectangle, cone, and line. Position, size, and rotation are editable. Intersecting tokens are suggestions; the player retains final control.

## Rolls and effects

Attack rolls preserve expression, dice, modifier, calculated total, override, final total, mode, critical toggle, note, and suggested outcome. Attack and damage are separate steps. Suggested outcomes default to `awaiting_dm`.

Save actions preserve a separate optional roll, outcome, and full/half/none/custom damage treatment for each target.

Each damage component preserves formula, damage type, source, dice, calculated subtotal, player override, final subtotal, critical preference, and inclusion state. Players can add dice, flat bonuses, and custom components. Manual overrides change only through explicit player actions.

Healing and temporary HP are separate effects. Utility effects support conditions, removed conditions, movement, resources, summons, map objects, ongoing effects, durations, save-ends reminders, and custom text.

## Multiattack

Multiattack is one proposal containing an ordered `AttackEntry[]`. Every entry has independent targets, attack roll, outcome, damage components, effects, and skipped state.

The Tarrasque fixture expands to Bite, Claw, Claw, Horns, and Tail. Entries can use different targets, be skipped, reordered, removed, or supplemented with a custom attack. The DM sees each entry and can edit its outcome and damage before applying grouped totals.

## Proposal and resource timing

Guided proposals use `roll_data.schemaVersion = 2` and include the complete `guidedDraft`. Existing proposal columns and RPCs remain compatible.

Resource costs are negative actor `resource_changes` in the proposed resolution payload. Creating, submitting, rejecting, returning, cancelling, or abandoning a proposal does not spend them. The existing transactional resolution RPC applies them only on DM resolution. Undo restores target state and actor resources.

## DM workflow

The DM sees the primary attack, every damage component, every Multiattack entry, calculated values, player overrides, deferred resources, and target before/after state. The DM can edit components and outcomes, apply grouped totals, edit damage/healing/temp HP/conditions/resources, set final HP, change targets, reject, return, cancel, open reactions, or resolve atomically.

DM Direct Resolution remains available for fast changes.

## Accessibility and responsive behavior

- Large command buttons and mobile touch targets
- Visible step heading and progress indicator
- Text/check indicators in addition to color
- Accessible actor and target map labels
- Visible keyboard focus
- Independent Combat-panel scrolling
- Sticky headings and footer controls
- Existing mobile Map/Combat panel switch preserves the current step
- Combat overscroll containment prevents a competing page scroll surface

Tested viewports: 1920×1080, 1440×900, 1366×768, 1280×720, and 390×844.

## Known limitations

- Area templates currently use numeric position, size, and rotation controls rather than direct drag handles.
- Generic prose Multiattacks require the explicit legacy route unless a known structured sequence is available.
- DM component edits are transformed into the current RPC’s per-target totals; the complete source audit remains in the proposal payload.

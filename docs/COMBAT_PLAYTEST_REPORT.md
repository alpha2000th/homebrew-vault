# Combat Playtest Report

## Scope and safety

- Branch: `fix/combat-playtest-usability`
- Production: `https://alpha2000th.github.io/homebrew-vault/`
- Repository: `https://github.com/alpha2000th/homebrew-vault`
- Production policy for this playtest: read-only. No test users, characters, encounters, proposals, reactions, chat, or resolutions will be created in production.
- Baseline date: 2026-07-28
- Baseline environment: signed-in Chrome production session, existing encounter `New Encounter`, desktop viewport supplied by the active browser window.
- Baseline account: existing DM account `alpha000126@gmail.com`.
- Existing production combatants observed: `Alphy` and `Goblin`.
- Isolated DM/player environment: pending. Docker, WSL, and a local PostgreSQL service were not available during initial discovery, so local Supabase could not be started without installing system-level virtualization/container software.
- Required test fixtures: Tarrasque and Combat QA Titan — pending.

This report was created before product-code changes. Its initial findings below include observations from the live browser playtest, not only source inspection. It will be updated after implementation with the isolated multi-user scenario, all required viewports, artifacts, and final pass/fail status.

## Baseline browser sequence

1. Opened the production Homebrew Vault while signed in as the existing DM.
2. Opened Combat and selected the existing `New Encounter`.
3. Confirmed both map tokens rendered with HP (`Alphy` 310/310 and `Goblin` 7/7).
4. Opened Turns, Actions, Proposals, Reactions, DM, Chat, and Setup.
5. Inspected actor selection, targeting instructions, roll inputs, direct-resolution controls, empty states, history, token list, and map state.
6. Advanced a round during an earlier runtime regression verification, observed both HP values remain present, and restored the encounter to Round 2.
7. Reopened the encounter and confirmed the encounter remained persisted.

## Baseline findings

### CP-001 — Targeting depends on a hidden keyboard gesture

- Severity: High
- Browser steps: Open encounter → Actions.
- Expected: An obvious targeting mode and a target list inside the panel.
- Actual: The only visible guidance was `Targets: Shift-click tokens on the map`. No Select Targets button, target checkboxes, target badges, or panel-based target selection were present.
- Impact: A player or DM can reach Submit/Resolve without understanding how to choose a target.
- Root cause: Target state is shared with the map, but the only panel control is instructional text and map selection is coupled to `Shift`.
- Fix: Pending.
- Retest: Pending.

### CP-002 — Selected actor is not visibly connected to its map token

- Severity: High
- Browser steps: Open encounter → Actions → inspect acting-token selector and map.
- Expected: The actor should be visually unmistakable on the map and its combat state should be visible in the panel.
- Actual: The actor appeared only in a select control. The corresponding map token did not gain an actor-specific visual state, and the panel did not show an actor summary containing HP, temporary HP, conditions, speed, or resources.
- Impact: It is easy to perform an action for the wrong token.
- Root cause: Actor selection is local to the Actions panel and is not surfaced to the map or encounter-level selection state.
- Fix: Pending.
- Retest: Pending.

### CP-003 — Action categories are flattened into one list

- Severity: High
- Browser steps: Open encounter → Actions.
- Expected: Separate Actions, Bonus Actions, Reactions, Legendary Actions, Lair Actions, Homebrew Powers, and Custom Action categories with useful empty states.
- Actual: Recorded actions and powers appeared in one flat action list. There were no category counts or category-level explanations.
- Impact: High-complexity creatures are difficult to operate and reaction/bonus/legendary actions are not discoverable as distinct workflows.
- Root cause: The panel derives one combined array and renders it without category navigation.
- Fix: Pending.
- Retest: Pending.

### CP-004 — Attack and damage calculations are not separate workflows

- Severity: Critical
- Browser steps: Open encounter → Actions.
- Expected: Independent attack, saving throw, multi-component damage, healing, and temporary-HP calculators.
- Actual: The panel showed one `Dice expression`, one Roll button, and plain numeric Damage/Healing/Temporary HP fields. The calculated roll could feed calculated damage, so a to-hit result could be treated as damage. There was no per-component dice display, component override, reroll-one, reroll-all, half/double, or explicit recalculate workflow.
- Impact: Combat math is ambiguous and cannot faithfully represent multi-component CR 30 actions.
- Root cause: A single roll state is reused as the calculated resolution payload.
- Fix: Pending.
- Retest: Pending.

### CP-005 — Action details are incomplete

- Severity: High
- Browser steps: Open encounter → Actions → select a recorded action.
- Expected: Name, category, cost, description, range, target type, save, resource costs, attack formula, every damage component, healing, and effects.
- Actual: The browser showed the action list, one description block, and a single formula input. Structured action fields were not presented as a coherent detail card.
- Impact: Players cannot understand or verify complex and legacy actions before submitting.
- Root cause: The current action renderer uses only a small subset of the action schema.
- Fix: Pending.
- Retest: Pending.

### CP-006 — DM Direct Resolution has no internal target selector

- Severity: Critical
- Browser steps: Open encounter → DM.
- Expected: Searchable targets with checkboxes, HP/temp HP/conditions, ally/enemy helpers, focus controls, and per-target previews.
- Actual: The DM tab displayed `Targets: Shift-click tokens on the map` and disabled Resolve when no hidden map target had been selected. It offered no target rows.
- Impact: The fastest DM workflow depends on leaving the panel and knowing an undocumented shortcut.
- Root cause: DM Direct Resolution receives target IDs from map state but has no target-selection UI of its own.
- Fix: Pending.
- Retest: Pending.

### CP-007 — Proposal review is not ready for a multi-target fight

- Severity: Critical
- Browser steps: Open encounter → Proposals.
- Expected: A meaningful empty state and, when populated, one independently editable review card per target.
- Actual: The empty state read `No submitted proposals.` During source-assisted follow-up, the review implementation was found to preview and edit only the first effective target.
- Impact: AOE and multi-target actions cannot be reviewed safely.
- Root cause: Proposal rendering selects `effective.payload.targets[0]` and exposes a single damage override.
- Fix: Pending.
- Retest: A populated multi-target proposal must be exercised in the isolated browser environment.

### CP-008 — Empty tabs provide too little workflow guidance

- Severity: Medium
- Browser steps: Open encounter → Proposals; open Reactions.
- Expected: Purposeful empty states explaining when and how content appears.
- Actual: The tabs displayed `No submitted proposals.` and `No reaction windows.` with no next-step guidance.
- Impact: Users cannot tell whether the feature is empty, unavailable, or waiting for another role.
- Root cause: Minimal one-line empty states.
- Fix: Pending.
- Retest: Pending.

### CP-009 — Reaction response coverage is incomplete

- Severity: High
- Browser steps: Open encounter → Reactions.
- Expected: Broad trigger, recorded reaction, custom reaction, Pass, Ask DM, DM eligibility controls, and close/continue controls.
- Actual: No reaction window existed in the production read-only encounter, so the populated workflow could not be exercised safely. The empty tab provided no way to understand the supported response flow.
- Impact: The required two-role reaction scenario is unverified.
- Root cause: Requires an isolated DM/player stateful playtest.
- Fix: Pending.
- Retest: Pending in isolated environment.

### CP-010 — Selection states are not coordinated

- Severity: High
- Browser steps: Inspect map and Turns/Actions panels.
- Expected: Map token, initiative row, actor row, and target row should reflect the same selection state.
- Actual: Map selection, action actor selection, and initiative list selection were not exposed as one coordinated interaction. Initiative rows were not clickable selection controls.
- Impact: The active actor, selected token, current turn, and target are easy to confuse.
- Root cause: Selection is maintained locally and initiative rows do not call encounter selection handlers.
- Fix: Pending.
- Retest: Pending.

### CP-011 — Right-panel scroll behavior needs viewport-specific correction

- Severity: High
- Browser steps: Open Actions and DM tabs containing controls below the fold.
- Expected: Sticky navigation with independently scrollable content and reachable final actions at every required viewport.
- Actual: The long controls required panel scrolling, but the baseline production pass could not establish a reliable viewport contract or prove the bottom-most control at all requested sizes. The layout has multiple nested height/overflow regions and no automated reachability test.
- Impact: Submit/Resolve can become practically inaccessible on short screens.
- Root cause: Pending viewport instrumentation and CSS retest.
- Fix: Pending.
- Retest: Required at 1920×1080, 1440×900, 1366×768, 1280×720, and 390×844.

### CP-012 — Existing working paths observed

- Severity: Informational
- Browser steps: Open encounter and visit all tabs/Setup.
- Actual:
  - Encounter and both tokens loaded.
  - Turns displayed mode, round, status, initiatives, and HP.
  - Setup displayed encounter/map controls, character/NPC loading, assignments, and participant removal.
  - Chat displayed persisted system events and a composer.
  - DM-only tab was visible for the DM.
  - Reopening the encounter preserved the observed state.
- Fix: Preserve these behaviors while redesigning the workflows.
- Retest: Pending after implementation.

## Required isolated scenario status

| Scenario | Baseline status | Final status |
|---|---|---|
| DM + player independent contexts | Blocked from production; local environment pending | Pending |
| Tarrasque + Combat QA Titan import | Fixtures pending | Pending |
| Multi-round initiative/free-mode fight | Not run | Pending |
| Normal/bonus/reaction/legendary actions | Not run completely | Pending |
| Separate attack and damage | Missing | Pending |
| Saving throw and AOE | Missing/incomplete | Pending |
| Multi-target proposal review | Missing/incomplete | Pending |
| Exactly 60 direct damage | Not run | Pending |
| Resolve and undo | Not run in this baseline | Pending |
| Healing/temp HP/condition/resource | Not run | Pending |
| Realtime two-client sync | Not run | Pending |
| Required desktop/mobile viewports | Not run completely | Pending |

## Artifacts

- Baseline browser observations: live production session in the Codex task, 2026-07-28.
- Screenshots: pending isolated pre-fix and post-fix playtest.
- Playwright HTML report: pending.


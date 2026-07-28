# Combat Playtest Report

## Guided action baseline and retest

### Baseline failures

The previous Actions panel exposed category selection, ability detail, attack,
save, all damage components, healing, temporary HP, area controls, targets,
conditions, and Submit in one continuous technical form. Observed failures:

- No clear first command or current decision
- Attack and damage visually adjacent and easy to confuse
- Healing and temporary-HP inputs shown for unrelated attacks
- Dense category and ability controls
- Long scrolling through unrelated fields
- No clean review gate before submission
- Legacy actions sharing an ambiguous generic form
- No five-entry Multiattack proposal
- Resource costs displayed but absent from atomic proposed resolution
- DM review emphasizing flat totals before source components

### Guided retest

Playwright used isolated DM and player contexts with the Tarrasque, Combat QA
Titan, and a third target. It verified the large command menu, category
filtering, ability detail, synchronized numbered targeting, separate
attack/save/area/damage/healing/temp-HP/utility/review stages, `Awaiting DM`
outcomes, extra dice and flat bonuses, cancellation confirmation, versioned
source breakdown, DM component edits, deferred resource deduction, undo,
five separate Tarrasque Multiattack entries with different targets and a miss,
DM Direct Resolution, and mobile panel switching at 390×844.

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

## Final retest — 2026-07-28

The baseline sections above remain the immutable pre-change record. This section is the authoritative post-change result.

### Final environment

- Branch: `fix/combat-playtest-usability`
- Application: actual React UI running through Vite in `e2e` mode
- Browser automation: Playwright 1.62, Chromium
- Isolated accounts:
  - DM: `dm@combat.test` (`QA Dungeon Master`)
  - Player: `player@combat.test` (`QA Player`)
  - Third context: `spectator@combat.test` (`QA Spectator`)
- Encounter: `Tarrasque Full Fight QA`
- Combatants:
  - `Tarrasque`, CR 30, DM-controlled
  - `Combat QA Titan`, CR 30, player-controlled
  - `QA Observer`, third-context participant used for multi-target and permission coverage
- Viewports exercised: 1920×1080, 1440×900, 1366×768, 1280×720, 768×1024, and 390×844
- Production remained read-only throughout.
- Because Docker, WSL, and local PostgreSQL were unavailable, the safe environment uses a test-only in-memory Supabase-compatible service on `127.0.0.1:4184`. The actual application runs on `127.0.0.1:4183`.

### Issue disposition

| Issue | Final status | Fix and browser retest |
|---|---|---|
| CP-001 Hidden Shift-click targeting | **Fixed** | Added explicit map targeting mode, target cursor/state, outlines/order badges, Clear Targets, help, and synchronized panel checkboxes. Retested from the map and panel. |
| CP-002 Actor/map disconnect | **Fixed** | Lifted actor state to the encounter, added actor state/resources and focus control, and gave the map actor an unmistakable non-color treatment. |
| CP-003 Flat action list | **Fixed** | Added counted Actions, Bonus, Reactions, Legendary, Lair, Powers, and Custom categories with useful empty explanations. Every category was opened in Chromium. |
| CP-004 Attack/damage conflation | **Fixed** | Added independent attack, save, multi-component damage, healing, and temp-HP calculators. Attack override 37 and damage override 60 stayed separate through submission and history. |
| CP-005 Incomplete action details | **Fixed** | Detail card exposes category, cost, description, range, targets, save, resources, attack, damage, healing, and effects. Legacy Overload detected editable formulas without mutating source data. |
| CP-006 DM tab lacks target selector | **Fixed** | Added searchable DM targets, ally/enemy helpers, focus, current state, distance, and per-target before/final previews. Exact 60 direct damage was applied and undone. |
| CP-007 First-target-only proposal review | **Fixed** | Added an editable card for every target, bulk/half tools, add/remove, independent final values, previews, summary, Resolve all, Reject, and Return for edits. Gravity Wave used two edited targets. |
| CP-008 Weak empty tabs | **Fixed** | Added useful empty states and counters; the DM tab is absent for player and spectator contexts. Empty Proposals, Reactions, and Chat were verified before history existed. |
| CP-009 Reaction workflow unverified | **Fixed** | Broad trigger, recorded reaction, custom response, Pass, Ask DM, trigger editing, eligibility controls, close, and continue were exercised across DM/player contexts. |
| CP-010 Uncoordinated selection states | **Fixed** | Initiative and target rows select/focus map tokens; actor, selected, targeted, current-turn, ally/enemy, dead/unconscious states have distinct non-color cues. |
| CP-011 Scroll reachability | **Fixed** | Locked the portal to `100dvh`, kept tabs and submit/resolve footers sticky, made tab content independently scrollable, constrained textareas, and blocked body scrolling. Bottom controls were reached at all required sizes and Submit/Resolve were clicked at 1366×768. |
| CP-012 Preserve existing paths | **Fixed** | Encounter creation/setup, initiatives, map, chat, persistence, and reopening remained operational. |
| CP-013 Refresh reset active context | **Fixed** | The playtest found that every save set the encounter back to loading, unmounting the workspace and resetting tab, scroll, actor, and targets. Refresh now keeps the workspace mounted after initial load. |
| CP-014 Roll details absent from visible history | **Fixed** | Proposal history now presents final attack and player damage from the authenticated submit event. Chromium verified `Attack 37 · Damage 60` beside resolution history. |
| CP-015 Reaction trigger write race | **Fixed** | The expanded test found the editable trigger wrote to the backend on every keystroke, allowing overlapping refreshes to race with eligibility edits. Trigger text now has a local draft and explicit Save action; trigger and eligible-token edits were retested together. |

No issue remains partially fixed or deferred within the requested Combat scope.

### Full UI scenario executed

1. Reset only the isolated test service and opened independent DM, player, and spectator contexts.
2. Created an encounter through the DM UI, loaded both reusable CR 30 fixtures, assigned the Titan to the player, left the Tarrasque with the DM, and added `QA Observer` for the third context.
3. Selected both main tokens from initiative rows, verified map highlights, moved both through pointer interactions, targeted both from the map, verified panel synchronization, and cleared them.
4. Set initiative, advanced turns, advanced to round 4, switched to Free Mode, and switched back.
5. Opened all ability categories, counts, meaningful empties, legacy action detection, and structured action details.
6. Used Prismatic Cleaver: edited individual components, added/removed a component, rolled attack and damage separately, overrode attack to 37 and damage to 60, and submitted.
7. DM changed final damage to 65, resolved, observed Tarrasque HP 676→611 on both clients, undid, and observed 611→676.
8. DM used Bite against the Titan, opened a damage reaction window, and the player submitted a recorded reaction, custom reaction, Pass, and Ask DM. DM edited the trigger and continued.
9. Resolved Bite and confirmed 40 temporary HP absorbed the first 40 of 60 damage.
10. Used Repair Pulse and resolved 15 healing.
11. Used Gravity Wave, resized its area to 8×8, reviewed suggestions, manually added/removed targets, assigned independent save outcomes, submitted two targets, edited both DM cards, removed/re-added a target, and resolved.
12. Used Aegis Buffer as a clearly labeled bonus action and applied 55 temporary HP.
13. Used DM Direct Resolution for exactly 60 damage without a proposal, verified temp-HP absorption and final HP, then undid and verified restoration.
14. Added and removed `Prone`, spent two QA Charges, restored one, and verified per-round recharge to 5/5.
15. Applied one atomic direct resolution to Tarrasque and QA Observer and verified two previews and both client updates.
16. Sent player and DM chat messages and verified synchronized proposal-roll and resolution history.
17. Refreshed both browsers, reopened Combat, left/reopened the encounter, and verified persisted positions, HP/temp HP, resources, round/mode, and history.
18. Verified a spectator cannot drag the DM-controlled Tarrasque and cannot see the DM tab.
19. Repeated bottom-control reachability at every required desktop size; clicked sticky Submit and Resolve at 1366×768.
20. Switched Map/Panel on 390×844 and reached the long Powers submit footer; reached direct Resolve on 768×1024.

### Automated results

- TypeScript: pass (`tsc --noEmit`)
- Vitest: pass, 11 files / 35 tests
- Playwright expanded full fight: pass, three contexts, 33.1 seconds in the final run
- Playwright smoke/setup: pass
- Full Playwright suite and production build: recorded in the final verification section below

### Artifacts

Generated by the successful Playwright run under:

- `test-results/combat-full-fight-complete-3594f-multi-round-combat-playtest-chromium/`
- `playwright-report/index.html`

Successful-run screenshots include:

- `dm-proposal-resolved-*.png`
- `dm-1366-scroll-and-resolve-*.png`
- `player-mobile-action-scroll-*.png`
- `dm-tablet-direct-resolution-*.png`

These directories are intentionally gitignored; `pnpm test:e2e` regenerates them.

### Database and safety result

- No production write was performed.
- No RLS policy was weakened.
- No database migration was required.
- Production continues to use authenticated combat RPCs and existing RLS.
- The fake client/server loads only when `VITE_COMBAT_E2E=true`.
- The isolated service models membership, DM permissions, chat policy, and authenticated RPC behavior; it is not part of the production code path.

### Final verification results

- `tsc --noEmit`: **pass**
- Vitest: **pass**, 11 test files / 35 tests
- Playwright Chromium: **pass**, 2 scenarios / 2 tests
  - Complete three-user, multi-round fight: pass
  - DM encounter/setup smoke path: pass
- Final Playwright suite duration: 41.0 seconds
- Required viewports: **pass**
- Production Vite build: **pass**, 1,639 modules transformed
- Draft PR: added after push; intentionally not merged

import { describe, expect, it } from 'vitest';
import type { CombatAction } from '../../types/combat';
import {
  applyDeferredResourceCosts,
  buildMultiattackEntries,
  createGuidedDraft,
  isLegacyAction,
  nextGuidedStep,
  routeForAction,
} from './guidedAction';

const action = (patch: Partial<CombatAction>): CombatAction => ({
  category: 'action',
  name: 'Test',
  cost: '1 action',
  description: '',
  ...patch,
});

describe('guided combat workflow', () => {
  it('routes structured attack and damage as separate steps', () => {
    const source = action({ attackFormula: '1d20 + 9', damageFormulas: [{ formula: '2d8 + 4' }] });
    expect(routeForAction(source, null)).toEqual(['choose_targets', 'attack_roll', 'damage', 'review']);
    expect(nextGuidedStep('attack_roll', source, null)).toBe('damage');
  });

  it('routes save, healing, temporary HP, and utility actions independently', () => {
    expect(routeForAction(action({ saveAbility: 'Dexterity', saveDc: 17 }), null)).toContain('saving_throw');
    expect(routeForAction(action({ healingFormula: '2d8 + 3' }), null)).toContain('healing');
    expect(routeForAction(action({ effects: [{ kind: 'temp_hp', formula: '1d10' }] }), null)).toContain('temporary_hp');
    expect(routeForAction(action({ effects: [{ kind: 'condition', condition: 'Prone' }] }), null)).toContain('utility_effects');
  });

  it('requires an explicit route for unstructured legacy actions', () => {
    const legacy = action({ description: 'Old freeform text.' });
    expect(isLegacyAction(legacy)).toBe(true);
    expect(nextGuidedStep('ability_detail', legacy, null)).toBe('legacy_route');
    expect(routeForAction(legacy, 'healing')).toContain('healing');
  });

  it('preserves back history in the draft model', () => {
    const draft = createGuidedDraft('encounter', 'actor');
    draft.history.push(draft.step);
    draft.step = 'choose_ability';
    expect(draft.history.pop()).toBe('choose_category');
  });

  it('builds the five separate Tarrasque multiattack entries', () => {
    const multi = action({ name: 'Multiattack', description: 'The tarrasque makes five attacks: one bite, two claws, one horns, one tail.' });
    const actions = ['Bite', 'Claw', 'Horns', 'Tail'].map((name) => action({ id: name, name, attackFormula: '1d20 + 19', damageFormulas: [{ formula: '1d8', type: 'physical' }] }));
    expect(buildMultiattackEntries(multi, actions).map((entry) => entry.name)).toEqual(['Bite', 'Claw', 'Claw', 'Horns', 'Tail']);
  });

  it('defers resource costs into the atomic resolution payload', () => {
    const payload = applyDeferredResourceCosts(
      { targets: [{ token_id: 'target', damage: 12 }] },
      'actor',
      [{ resourceId: 'charges', name: 'Charges', amount: 2, timing: 'on_resolution' }],
    );
    expect(payload.targets).toEqual([
      { token_id: 'target', damage: 12 },
      { token_id: 'actor', resource_changes: [{ id: 'charges', name: 'Charges', delta: -2 }] },
    ]);
  });
});

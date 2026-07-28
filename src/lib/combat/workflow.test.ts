import { describe, expect, it } from 'vitest';
import type { CombatAction, CombatToken } from '../../types/combat';
import {
  actionCategories,
  actionsForToken,
  isSingleTargetAction,
  suggestedAreaTargetIds,
  tokenDistanceFeet,
  withDetectedLegacyFields,
} from './workflow';

const token = (id: string, x: number, y: number, state: Partial<CombatToken['state']> = {}): CombatToken => ({
  id,
  encounter_id: 'encounter',
  character_id: null,
  assigned_user_id: null,
  name: id,
  team: 'heroes',
  initiative: null,
  initiative_order: 0,
  x,
  y,
  width_squares: 1,
  height_squares: 1,
  rotation: 0,
  visible: true,
  state: {
    hp: { current: 10, max: 10, temp: 0 },
    conditions: [],
    resourcePools: [],
    ...state,
  },
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

describe('combat workflow helpers', () => {
  it('keeps every required action category available', () => {
    expect(actionCategories.map(({ id }) => id)).toEqual([
      'action', 'bonus', 'reaction', 'legendary', 'lair', 'power', 'custom',
    ]);
  });

  it('detects advisory formulas in legacy description-only actions', () => {
    const detected = withDetectedLegacyFields({
      id: 'legacy',
      category: 'action',
      name: 'Legacy Strike',
      cost: '1 action',
      description: 'Make a +18 attack and deal 5d12 + 9 thunder damage.',
    });
    expect(detected.detectedAttackFormula).toBe('1d20 + 18');
    expect(detected.detectedDamageFormula).toBe('5d12 + 9');
  });

  it('normalizes homebrew powers into the Powers category', () => {
    const actor = token('actor', 0, 0, {
      homebrewPowers: [{
        id: 'field',
        name: 'Null Field',
        activationCost: '2 charges',
        formula: '3d10',
        damageType: 'necrotic',
      }],
    });
    expect(actionsForToken(actor)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'field', category: 'power', name: 'Null Field' }),
    ]));
  });

  it('measures diagonal grid distance and suggests only tokens inside an area', () => {
    const actor = token('actor', 1, 1);
    const near = token('near', 3, 2);
    const far = token('far', 9, 9);
    expect(tokenDistanceFeet(actor, near, 5)).toBe(10);
    expect(suggestedAreaTargetIds(
      { shape: 'square', x: 2, y: 1, width: 3, height: 3, rotation: 0 },
      [actor, near, far],
      actor.id,
    )).toEqual(['near']);
  });

  it('limits only explicitly single-target actions', () => {
    const single = { targetType: 'One creature' } as CombatAction;
    const multiple = { targetType: 'Multiple creatures' } as CombatAction;
    expect(isSingleTargetAction(single)).toBe(true);
    expect(isSingleTargetAction(multiple)).toBe(false);
  });
});

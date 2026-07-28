import { describe, expect, it } from 'vitest';
import { CHARACTER_SCHEMA_VERSION, migrateCharacterData, normalizeCombatAction } from './characterSchema';

describe('character schema v2 migration', () => {
  it('keeps old description-only actions compatible', () => {
    const action = normalizeCombatAction({
      category: 'action', name: 'Claw', cost: '', description: '+5 to hit, 1d6+3 slashing.',
    });
    expect(action).toMatchObject({ category: 'action', name: 'Claw', description: '+5 to hit, 1d6+3 slashing.' });
    expect(action.attackFormula).toBeUndefined();
  });

  it('preserves optional structured combat fields', () => {
    const action = normalizeCombatAction({
      category: 'bonus',
      name: 'Flare',
      attackFormula: '1d20 + 7',
      damageFormulas: [{ formula: '2d6 + 4', type: 'Fire' }],
      saveAbility: 'dex',
      saveDc: 15,
    });
    expect(action.attackFormula).toBe('1d20 + 7');
    expect(action.damageFormulas).toEqual([{ formula: '2d6 + 4', type: 'Fire' }]);
    expect(action.saveDc).toBe(15);
  });

  it('normalizes a version-one import without losing core data', () => {
    const migrated = migrateCharacterData({
      schemaVersion: 1,
      name: 'Legacy Hero',
      hp: { current: 12, max: 20, temp: 2 },
      actions: [{ name: 'Strike', description: 'A hit.' }],
      customTabs: [{ name: 'Lore', entries: [] }],
    });
    expect(migrated.schemaVersion).toBe(CHARACTER_SCHEMA_VERSION);
    expect(migrated.hp).toEqual({ current: 12, max: 20, temp: 2 });
    expect(migrated.actions[0].name).toBe('Strike');
    expect(migrated.customTabs).toEqual([{ name: 'Lore', entries: [] }]);
  });
});

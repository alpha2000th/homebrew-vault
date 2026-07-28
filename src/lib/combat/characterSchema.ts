import type { CharacterData, CombatAction } from '../../types/combat';

export const CHARACTER_SCHEMA_VERSION = 2;

const text = (value: unknown) => typeof value === 'string' ? value : '';

export function normalizeCombatAction(value: unknown): CombatAction {
  const action = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const damageFormulas = Array.isArray(action.damageFormulas)
    ? action.damageFormulas
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({ formula: text(item.formula), type: text(item.type) || undefined }))
        .filter((item) => item.formula)
    : undefined;
  return {
    id: text(action.id) || undefined,
    category: ['action', 'bonus', 'reaction', 'legendary', 'lair', 'power'].includes(text(action.category))
      ? text(action.category) as CombatAction['category']
      : 'action',
    name: text(action.name) || 'Action',
    cost: text(action.cost),
    description: text(action.description),
    attackFormula: text(action.attackFormula) || undefined,
    damageFormulas,
    healingFormula: text(action.healingFormula) || undefined,
    saveAbility: text(action.saveAbility) || undefined,
    saveDc: typeof action.saveDc === 'number' ? action.saveDc : undefined,
    resourceCosts: Array.isArray(action.resourceCosts)
      ? action.resourceCosts as CombatAction['resourceCosts']
      : undefined,
    range: text(action.range) || undefined,
    area: action.area && typeof action.area === 'object' ? action.area as CombatAction['area'] : undefined,
    targetType: text(action.targetType) || undefined,
    effects: Array.isArray(action.effects) ? action.effects as CombatAction['effects'] : undefined,
  };
}

export function migrateCharacterData(value: unknown): CharacterData {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const hpRaw = raw.hp && typeof raw.hp === 'object' ? raw.hp as Record<string, unknown> : {};
  const max = Math.max(1, typeof hpRaw.max === 'number' ? hpRaw.max : 10);
  return {
    ...raw,
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    name: text(raw.name) || 'New Character',
    hp: {
      current: Math.max(0, Math.min(max, typeof hpRaw.current === 'number' ? hpRaw.current : max)),
      max,
      temp: Math.max(0, typeof hpRaw.temp === 'number' ? hpRaw.temp : 0),
    },
    conditions: Array.isArray(raw.conditions) ? raw.conditions.filter((item): item is string => typeof item === 'string') : [],
    resourcePools: Array.isArray(raw.resourcePools) ? raw.resourcePools as CharacterData['resourcePools'] : [],
    actions: Array.isArray(raw.actions) ? raw.actions.map(normalizeCombatAction) : [],
    homebrewPowers: Array.isArray(raw.homebrewPowers) ? raw.homebrewPowers as CharacterData['homebrewPowers'] : [],
  };
}

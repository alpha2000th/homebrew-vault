import type { AreaTemplate, CombatAction, CombatToken } from '../../types/combat';
import { normalizeCombatAction } from './characterSchema';

export type ActionCategory = CombatAction['category'] | 'custom';

export const actionCategories: Array<{
  id: ActionCategory;
  label: string;
  empty: string;
}> = [
  { id: 'action', label: 'Actions', empty: 'This character has no recorded actions.' },
  { id: 'bonus', label: 'Bonus Actions', empty: 'This character has no recorded bonus actions.' },
  { id: 'reaction', label: 'Reactions', empty: 'Reactions are normally used from an open reaction window, but you may still inspect them here.' },
  { id: 'legendary', label: 'Legendary', empty: 'No legendary actions are recorded.' },
  { id: 'lair', label: 'Lair', empty: 'No lair actions are recorded.' },
  { id: 'power', label: 'Powers', empty: 'No homebrew powers are recorded.' },
  { id: 'custom', label: 'Custom', empty: 'Create an editable custom action.' },
];

const formulaMatch = (description: string, pattern: RegExp) =>
  description.match(pattern)?.[1]?.replace(/\s+/g, ' ').trim();

export function withDetectedLegacyFields(action: CombatAction): CombatAction & {
  detectedAttackFormula?: string;
  detectedDamageFormula?: string;
} {
  if (action.attackFormula || action.damageFormulas?.length) return action;
  const description = action.description ?? '';
  const detectedAttackFormula =
    formulaMatch(description, /(?:make\s+(?:a|an)\s+)?([+-]?\d+)\s+(?:melee\s+|ranged\s+)?attack/i);
  const detectedDamageFormula =
    formulaMatch(description, /(?:deal|takes?)\s+(\d+d\d+(?:\s*[+-]\s*\d+)?)/i);
  return {
    ...action,
    detectedAttackFormula: detectedAttackFormula
      ? `1d20 ${detectedAttackFormula.startsWith('-') ? '-' : '+'} ${Math.abs(Number(detectedAttackFormula))}`
      : undefined,
    detectedDamageFormula,
  };
}

export function actionsForToken(token: CombatToken): CombatAction[] {
  const regular = token.state.actions ?? [];
  const powers = (token.state.homebrewPowers ?? []).map((power, index) => normalizeCombatAction({
    id: String(power.id ?? `power-${index}`),
    category: 'power',
    name: String(power.name ?? 'Power'),
    cost: String(power.activationCost ?? ''),
    description: String(power.description ?? ''),
    damageFormulas: power.formula ? [{ formula: String(power.formula), type: String(power.damageType ?? '') || undefined }] : undefined,
    range: String(power.range ?? ''),
    targetType: String(power.targetType ?? ''),
  }));
  return [...regular, ...powers].map(withDetectedLegacyFields);
}

export function tokenDistanceFeet(actor: CombatToken | undefined, target: CombatToken, feetPerSquare = 5) {
  if (!actor) return null;
  return Math.max(Math.abs(actor.x - target.x), Math.abs(actor.y - target.y)) * feetPerSquare;
}

export function suggestedAreaTargetIds(
  area: AreaTemplate | null,
  tokens: CombatToken[],
  actorId?: string | null,
): string[] {
  if (!area) return [];
  return tokens
    .filter((token) => token.id !== actorId)
    .filter((token) => {
      const centerX = token.x + token.width_squares / 2;
      const centerY = token.y + token.height_squares / 2;
      if (area.shape === 'circle') {
        const radiusX = area.width / 2;
        const radiusY = area.height / 2;
        if (radiusX <= 0 || radiusY <= 0) return false;
        const dx = (centerX - (area.x + radiusX)) / radiusX;
        const dy = (centerY - (area.y + radiusY)) / radiusY;
        return dx * dx + dy * dy <= 1;
      }
      return centerX >= area.x && centerX <= area.x + area.width &&
        centerY >= area.y && centerY <= area.y + area.height;
    })
    .map((token) => token.id);
}

export const isSingleTargetAction = (action: CombatAction | undefined) =>
  /one (?:creature|target)|single/i.test(action?.targetType ?? '');

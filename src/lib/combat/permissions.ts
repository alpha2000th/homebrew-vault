import type { CombatToken } from '../../types/combat';

export function canMoveCombatToken(token: Pick<CombatToken, 'assigned_user_id'>, userId: string, isDm: boolean) {
  return isDm || token.assigned_user_id === userId;
}

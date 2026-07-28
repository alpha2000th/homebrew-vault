import { describe, expect, it } from 'vitest';
import { canMoveCombatToken } from './permissions';

describe('token movement permissions', () => {
  it('allows the DM to move every token', () => {
    expect(canMoveCombatToken({ assigned_user_id: 'player' }, 'dm', true)).toBe(true);
  });

  it('allows only the assigned player', () => {
    expect(canMoveCombatToken({ assigned_user_id: 'player-a' }, 'player-a', false)).toBe(true);
    expect(canMoveCombatToken({ assigned_user_id: 'player-a' }, 'player-b', false)).toBe(false);
    expect(canMoveCombatToken({ assigned_user_id: null }, 'player-a', false)).toBe(false);
  });
});

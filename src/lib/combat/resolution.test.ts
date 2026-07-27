import { describe, expect, it } from 'vitest';
import {
  applyDamage,
  applyHealing,
  applyHpChanges,
  applyResourceChanges,
  effectivePayload,
  previewTarget,
} from './resolution';

describe('combat resolution math', () => {
  it('absorbs damage with temporary HP before current HP', () => {
    expect(applyDamage({ current: 310, max: 310, temp: 20 }, 60))
      .toEqual({ current: 270, max: 310, temp: 0 });
  });

  it('caps healing at maximum HP without changing temp HP', () => {
    expect(applyHealing({ current: 90, max: 100, temp: 7 }, 25))
      .toEqual({ current: 100, max: 100, temp: 7 });
  });

  it('supports direct DM changes and explicit HP override', () => {
    const result = applyHpChanges(
      { current: 50, max: 100, temp: 10 },
      { token_id: 'target', damage: 60, set_hp: 45, temp_hp: 3, conditions_add: ['Prone'] },
    );
    expect(result).toEqual({ current: 45, max: 100, temp: 3 });
    expect(previewTarget({ current: 50, max: 100, temp: 10 }, { token_id: 'target', damage: 60 }).after.current).toBe(0);
  });

  it('uses player overrides and then DM final overrides without silent recalculation', () => {
    const calculated = { targets: [{ token_id: 'a', damage: 81 }] };
    const player = { targets: [{ token_id: 'a', damage: 90 }] };
    const dm = { targets: [{ token_id: 'a', damage: 84 }] };
    expect(effectivePayload(calculated, player, null)).toMatchObject({ source: 'player', payload: player });
    expect(effectivePayload(calculated, player, dm)).toMatchObject({ source: 'dm', payload: dm });
  });

  it('spends and restores resource pools within bounds', () => {
    const pools = [{ id: 'ki', name: 'Ki', current: 2, max: 5 }];
    expect(applyResourceChanges(pools, [{ id: 'ki', delta: -3 }])[0].current).toBe(0);
    expect(applyResourceChanges(pools, [{ name: 'Ki', set: 9 }])[0].current).toBe(5);
  });
});

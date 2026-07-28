import { describe, expect, it } from 'vitest';
import {
  normalizeCombatProposal,
  normalizeCombatToken,
  normalizeReactionWindow,
  normalizeResolutionPayload,
} from './runtimeSchema';

describe('combat runtime schema', () => {
  it('repairs a token with no state before the UI reads HP', () => {
    const token = normalizeCombatToken({
      id: 'token-1',
      encounter_id: 'encounter-1',
      name: 'Goblin',
    });

    expect(token.state.hp).toEqual({ current: 1, max: 1, temp: 0 });
    expect(token.state.conditions).toEqual([]);
    expect(token.state.resourcePools).toEqual([]);
    expect(token.state.actions).toEqual([]);
  });

  it('merges partial realtime state without discarding HP or actions', () => {
    const previous = normalizeCombatToken({
      id: 'token-1',
      encounter_id: 'encounter-1',
      name: 'Alphy',
      x: 1,
      state: {
        hp: { current: 30, max: 40, temp: 5 },
        actions: [{ category: 'action', name: 'Strike', cost: '', description: '' }],
      },
    });

    const updated = normalizeCombatToken({
      id: 'token-1',
      x: 4,
      state: { unconscious: true },
    }, previous);

    expect(updated.x).toBe(4);
    expect(updated.name).toBe('Alphy');
    expect(updated.state.hp).toEqual({ current: 30, max: 40, temp: 5 });
    expect(updated.state.actions?.[0]?.name).toBe('Strike');
    expect(updated.state.unconscious).toBe(true);
  });

  it('normalizes malformed proposal and reaction collections', () => {
    const proposal = normalizeCombatProposal({
      id: 'proposal-1',
      calculated_payload: {},
      target_token_ids: null,
    });
    const reaction = normalizeReactionWindow({
      id: 'reaction-1',
      eligible_token_ids: null,
      combat_reaction_responses: null,
    });

    expect(proposal.calculated_payload.targets).toEqual([]);
    expect(proposal.player_override_payload.targets).toEqual([]);
    expect(proposal.target_token_ids).toEqual([]);
    expect(reaction.eligible_token_ids).toEqual([]);
    expect(reaction.combat_reaction_responses).toEqual([]);
  });

  it('drops resolution targets that cannot identify a combat token', () => {
    expect(normalizeResolutionPayload({
      targets: [{ damage: 5 }, { token_id: 'token-1', damage: 7 }],
    })).toEqual({
      targets: [{
        token_id: 'token-1',
        damage: 7,
        conditions_add: [],
        conditions_remove: [],
        resource_changes: [],
      }],
      note: undefined,
    });
  });
});

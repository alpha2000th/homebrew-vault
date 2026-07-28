import type { CombatEncounter, CombatEvent, CombatProposal, CombatToken, ReactionWindow } from '../../types/combat';
import {
  normalizeCombatEncounter,
  normalizeCombatEvent,
  normalizeCombatProposal,
  normalizeCombatToken,
  normalizeReactionWindow,
} from './runtimeSchema';

export interface CombatRealtimeState {
  encounter: CombatEncounter | null;
  tokens: CombatToken[];
  proposals: CombatProposal[];
  reactions: ReactionWindow[];
  events: CombatEvent[];
  seen: Set<string>;
}

export type RealtimeEntity = 'encounter' | 'token' | 'proposal' | 'reaction' | 'event';
export type RealtimeAction =
  | { type: 'upsert'; entity: RealtimeEntity; row: Record<string, unknown>; eventKey: string }
  | { type: 'delete'; entity: RealtimeEntity; id: string; eventKey: string }
  | { type: 'replace'; state: Omit<CombatRealtimeState, 'seen'> };

export const initialRealtimeState: CombatRealtimeState = {
  encounter: null,
  tokens: [],
  proposals: [],
  reactions: [],
  events: [],
  seen: new Set(),
};

const upsert = <T extends { id: string }>(
  rows: T[],
  row: Record<string, unknown>,
  normalize: (value: unknown, previous?: T) => T,
) => {
  const id = typeof row.id === 'string' ? row.id : '';
  const previous = rows.find((item) => item.id === id);
  const normalized = normalize(row, previous);
  return previous
    ? rows.map((item) => item.id === id ? normalized : item)
    : [normalized, ...rows];
};

export function combatRealtimeReducer(
  state: CombatRealtimeState,
  action: RealtimeAction,
): CombatRealtimeState {
  if (action.type === 'replace') return {
    encounter: action.state.encounter ? normalizeCombatEncounter(action.state.encounter) : null,
    tokens: action.state.tokens.map((token) => normalizeCombatToken(token)),
    proposals: action.state.proposals.map((proposal) => normalizeCombatProposal(proposal)),
    reactions: action.state.reactions.map((reaction) => normalizeReactionWindow(reaction)),
    events: action.state.events.map((event) => normalizeCombatEvent(event)),
    seen: new Set(),
  };
  if (state.seen.has(action.eventKey)) return state;
  const seen = new Set(state.seen).add(action.eventKey);
  if (seen.size > 500) seen.delete(seen.values().next().value!);
  if (action.type === 'delete') {
    const key = `${action.entity}s` as 'tokens' | 'proposals' | 'reactions' | 'events';
    if (action.entity === 'encounter') return { ...state, encounter: null, seen };
    return { ...state, [key]: state[key].filter((row) => row.id !== action.id), seen };
  }
  switch (action.entity) {
    case 'encounter': return {
      ...state,
      encounter: normalizeCombatEncounter(action.row, state.encounter ?? undefined),
      seen,
    };
    case 'token': return {
      ...state,
      tokens: upsert<CombatToken>(state.tokens, action.row, normalizeCombatToken),
      seen,
    };
    case 'proposal': return {
      ...state,
      proposals: upsert<CombatProposal>(state.proposals, action.row, normalizeCombatProposal),
      seen,
    };
    case 'reaction': return {
      ...state,
      reactions: upsert<ReactionWindow>(state.reactions, action.row, normalizeReactionWindow),
      seen,
    };
    case 'event': {
      const events = upsert<CombatEvent>(state.events, action.row, normalizeCombatEvent)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 300);
      return { ...state, events, seen };
    }
  }
}

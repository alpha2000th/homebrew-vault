import type { CombatEncounter, CombatEvent, CombatProposal, CombatToken, ReactionWindow } from '../../types/combat';

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

const upsert = <T extends { id: string }>(rows: T[], row: T) => {
  const found = rows.some((item) => item.id === row.id);
  return found ? rows.map((item) => item.id === row.id ? row : item) : [row, ...rows];
};

export function combatRealtimeReducer(
  state: CombatRealtimeState,
  action: RealtimeAction,
): CombatRealtimeState {
  if (action.type === 'replace') return { ...action.state, seen: new Set() };
  if (state.seen.has(action.eventKey)) return state;
  const seen = new Set(state.seen).add(action.eventKey);
  if (seen.size > 500) seen.delete(seen.values().next().value!);
  if (action.type === 'delete') {
    const key = `${action.entity}s` as 'tokens' | 'proposals' | 'reactions' | 'events';
    if (action.entity === 'encounter') return { ...state, encounter: null, seen };
    return { ...state, [key]: state[key].filter((row) => row.id !== action.id), seen };
  }
  switch (action.entity) {
    case 'encounter': return { ...state, encounter: action.row as unknown as CombatEncounter, seen };
    case 'token': return { ...state, tokens: upsert(state.tokens, action.row as unknown as CombatToken), seen };
    case 'proposal': return { ...state, proposals: upsert(state.proposals, action.row as unknown as CombatProposal), seen };
    case 'reaction': return { ...state, reactions: upsert(state.reactions, action.row as unknown as ReactionWindow), seen };
    case 'event': {
      const events = upsert(state.events, action.row as unknown as CombatEvent)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 300);
      return { ...state, events, seen };
    }
  }
}

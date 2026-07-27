import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { CombatMap, CombatToken } from '../../types/combat';
import { supabase } from '../../lib/supabase/client';
import {
  combatRealtimeReducer,
  initialRealtimeState,
  type RealtimeEntity,
} from '../../lib/combat/realtimeReducer';
import { loadEncounterBundle, moveToken } from './api';

const tableEntities: Record<string, RealtimeEntity> = {
  combat_encounters: 'encounter',
  combat_tokens: 'token',
  combat_proposals: 'proposal',
  combat_reaction_windows: 'reaction',
  combat_events: 'event',
};

export function useCombatEncounter(encounterId: string, userId: string) {
  const [state, dispatch] = useReducer(combatRealtimeReducer, initialRealtimeState);
  const [map, setMap] = useState<CombatMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const bundle = await loadEncounterBundle(encounterId);
      setMap(bundle.map);
      dispatch({ type: 'replace', state: {
        encounter: bundle.encounter,
        tokens: bundle.tokens,
        proposals: bundle.proposals,
        reactions: bundle.reactions,
        events: bundle.events,
      } });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load encounter.');
    } finally {
      setLoading(false);
    }
  }, [encounterId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const channel = supabase.channel(`combat:${encounterId}`, {
      config: { presence: { key: userId } },
    });
    Object.entries(tableEntities).forEach(([table, entity]) => {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter: table === 'combat_encounters' ? `id=eq.${encounterId}` : `encounter_id=eq.${encounterId}`,
      }, (payload) => {
        const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, unknown>;
        const eventKey = `${table}:${payload.eventType}:${String(row.id)}:${String(row.updated_at ?? row.created_at ?? '')}`;
        if (payload.eventType === 'DELETE') {
          dispatch({ type: 'delete', entity, id: String(row.id), eventKey });
        } else {
          dispatch({ type: 'upsert', entity, row, eventKey });
        }
      });
    });
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'combat_reaction_responses',
    }, (payload) => {
      const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, unknown>;
      if (stateRef.current.reactions.some((window) => window.id === row.reaction_window_id)) {
        void reload();
      }
    });
    channel
      .on('presence', { event: 'sync' }, () => setOnlineUsers(Object.keys(channel.presenceState())))
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('live');
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('offline');
        }
      });
    return () => { void supabase.removeChannel(channel); };
  }, [encounterId, userId, reload]);

  const moveOptimistically = useCallback(async (token: CombatToken, x: number, y: number) => {
    const optimistic = { ...token, x, y, updated_at: `optimistic-${Date.now()}` };
    dispatch({ type: 'upsert', entity: 'token', row: optimistic as unknown as Record<string, unknown>, eventKey: `optimistic:${token.id}:${Date.now()}` });
    try {
      const saved = await moveToken(token.id, x, y, token.updated_at);
      dispatch({ type: 'upsert', entity: 'token', row: saved as unknown as Record<string, unknown>, eventKey: `saved:${token.id}:${saved.updated_at}` });
      return true;
    } catch (caught) {
      dispatch({ type: 'upsert', entity: 'token', row: token as unknown as Record<string, unknown>, eventKey: `rollback:${token.id}:${Date.now()}` });
      setError(`Move was rolled back: ${caught instanceof Error ? caught.message : 'save failed'}`);
      return false;
    }
  }, []);

  return {
    ...state,
    map,
    setMap,
    loading,
    error,
    setError,
    connection,
    onlineUsers,
    reload,
    moveOptimistically,
  };
}

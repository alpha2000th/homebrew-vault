import { describe, expect, it } from 'vitest';
import { combatRealtimeReducer, initialRealtimeState } from './realtimeReducer';

describe('realtime event reducer', () => {
  it('normalizes upserts and ignores duplicate delivery', () => {
    const row = { id: 'token-1', name: 'Hero', x: 1, y: 1 };
    const once = combatRealtimeReducer(initialRealtimeState, { type: 'upsert', entity: 'token', row, eventKey: 'event-1' });
    const twice = combatRealtimeReducer(once, { type: 'upsert', entity: 'token', row: { ...row, x: 9 }, eventKey: 'event-1' });
    expect(once.tokens).toHaveLength(1);
    expect(once.tokens[0].state.hp).toEqual({ current: 1, max: 1, temp: 0 });
    expect(twice).toBe(once);
  });

  it('merges partial token updates instead of replacing complete rows', () => {
    const inserted = combatRealtimeReducer(initialRealtimeState, {
      type: 'upsert',
      entity: 'token',
      row: {
        id: 'token-1',
        encounter_id: 'encounter-1',
        name: 'Alphy',
        x: 1,
        state: { hp: { current: 25, max: 30, temp: 2 }, conditions: ['Prone'] },
      },
      eventKey: 'insert',
    });
    const updated = combatRealtimeReducer(inserted, {
      type: 'upsert',
      entity: 'token',
      row: { id: 'token-1', x: 9, updated_at: '2026-01-02' },
      eventKey: 'update',
    });

    expect(updated.tokens[0].x).toBe(9);
    expect(updated.tokens[0].name).toBe('Alphy');
    expect(updated.tokens[0].state.hp).toEqual({ current: 25, max: 30, temp: 2 });
    expect(updated.tokens[0].state.conditions).toEqual(['Prone']);
  });

  it('applies confirmed updates and deletes', () => {
    const inserted = combatRealtimeReducer(initialRealtimeState, {
      type: 'upsert', entity: 'event',
      row: { id: 'e1', created_at: '2026-01-01', event_type: 'chat', message: 'hi' },
      eventKey: 'insert',
    });
    const removed = combatRealtimeReducer(inserted, { type: 'delete', entity: 'event', id: 'e1', eventKey: 'delete' });
    expect(removed.events).toEqual([]);
  });
});

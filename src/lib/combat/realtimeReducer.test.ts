import { describe, expect, it } from 'vitest';
import { combatRealtimeReducer, initialRealtimeState } from './realtimeReducer';

describe('realtime event reducer', () => {
  it('upserts state and ignores duplicate delivery', () => {
    const row = { id: 'token-1', name: 'Hero', x: 1, y: 1 };
    const once = combatRealtimeReducer(initialRealtimeState, { type: 'upsert', entity: 'token', row, eventKey: 'event-1' });
    const twice = combatRealtimeReducer(once, { type: 'upsert', entity: 'token', row: { ...row, x: 9 }, eventKey: 'event-1' });
    expect(once.tokens).toHaveLength(1);
    expect(twice).toBe(once);
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

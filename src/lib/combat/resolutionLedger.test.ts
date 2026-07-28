import { describe, expect, it } from 'vitest';
import { ResolutionLedger } from './resolutionLedger';

describe('resolution transaction invariants', () => {
  it('prevents duplicate resolution with an idempotency key', () => {
    const ledger = new ResolutionLedger<number>();
    const first = ledger.resolve({ id: 'one', idempotencyKey: 'stable', before: 10, after: 5 });
    const duplicate = ledger.resolve({ id: 'two', idempotencyKey: 'stable', before: 5, after: 0 });
    expect(duplicate).toBe(first);
    expect(ledger.all()).toHaveLength(1);
  });

  it('only permits reverse chronological undo', () => {
    const ledger = new ResolutionLedger<number>();
    ledger.resolve({ id: 'one', idempotencyKey: 'a', before: 10, after: 8 });
    ledger.resolve({ id: 'two', idempotencyKey: 'b', before: 8, after: 5 });
    expect(() => ledger.undo('one')).toThrow('reverse chronological');
    expect(ledger.undo('two').before).toBe(8);
    expect(ledger.undo('one').before).toBe(10);
  });
});

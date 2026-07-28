export interface LedgerResolution<T> {
  id: string;
  idempotencyKey: string;
  before: T;
  after: T;
  undone: boolean;
}

/** Mirrors the database's idempotency and reverse-order undo invariants. */
export class ResolutionLedger<T> {
  private readonly entries: LedgerResolution<T>[] = [];

  resolve(entry: Omit<LedgerResolution<T>, 'undone'>): LedgerResolution<T> {
    const existing = this.entries.find((item) => item.idempotencyKey === entry.idempotencyKey);
    if (existing) return existing;
    const created = { ...entry, undone: false };
    this.entries.push(created);
    return created;
  }

  undo(id?: string): LedgerResolution<T> {
    const latest = [...this.entries].reverse().find((item) => !item.undone);
    if (!latest) throw new Error('There is no active resolution to undo');
    if (id && latest.id !== id) throw new Error('Resolutions must be undone in reverse chronological order');
    latest.undone = true;
    return latest;
  }

  all() {
    return this.entries.map((item) => ({ ...item }));
  }
}

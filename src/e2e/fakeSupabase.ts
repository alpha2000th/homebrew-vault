import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

type Role = 'dm' | 'player' | 'spectator';
type QueryAction = 'select' | 'insert' | 'update' | 'delete' | 'upsert';
type QueryResult<T = unknown> = { data: T; error: { message: string; code?: string } | null };
type Row = Record<string, unknown>;

const apiBase = import.meta.env.VITE_COMBAT_E2E_API || 'http://127.0.0.1:4184';

const roleUsers: Record<Role, { id: string; email: string }> = {
  dm: { id: 'user-dm', email: 'dm@combat.test' },
  player: { id: 'user-player', email: 'player@combat.test' },
  spectator: { id: 'user-spectator', email: 'spectator@combat.test' },
};

const currentRole = (): Role => {
  const role = new URLSearchParams(window.location.search).get('role');
  return role === 'player' || role === 'spectator' ? role : 'dm';
};

const request = async <T>(path: string, body?: unknown): Promise<QueryResult<T>> => {
  const response = await fetch(`${apiBase}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      'x-combat-role': currentRole(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.json() as Promise<QueryResult<T>>;
};

class FakeQueryBuilder<T = Row[]> implements PromiseLike<QueryResult<T>> {
  private action: QueryAction = 'select';
  private payload: unknown = null;
  private filters: Array<{ type: 'eq'; column: string; value: unknown }> = [];
  private orders: Array<{ column: string; ascending?: boolean }> = [];
  private rowLimit?: number;
  private wantsSingle = false;
  private wantsMaybeSingle = false;
  private onConflict?: string;

  constructor(private readonly name: string) {}

  select(_columns = '*') {
    if (!this.payload) this.action = 'select';
    return this;
  }

  insert(payload: unknown) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  upsert(payload: unknown, options?: { onConflict?: string }) {
    this.action = 'upsert';
    this.payload = payload;
    this.onConflict = options?.onConflict;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending });
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  single() {
    this.wantsSingle = true;
    return this as unknown as FakeQueryBuilder<Row>;
  }

  maybeSingle() {
    this.wantsMaybeSingle = true;
    return this as unknown as FakeQueryBuilder<Row | null>;
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return request<T>('/query', {
      name: this.name,
      action: this.action,
      payload: this.payload,
      filters: this.filters,
      orders: this.orders,
      limit: this.rowLimit,
      single: this.wantsSingle,
      maybeSingle: this.wantsMaybeSingle,
      onConflict: this.onConflict,
    }).then(onfulfilled, onrejected);
  }
}

type PostgresHandler = {
  table: string;
  filter?: string;
  callback: (payload: { eventType: string; new: Row; old: Row }) => void;
};

class FakeChannel {
  private handlers: PostgresHandler[] = [];
  private presenceHandlers: Array<() => void> = [];
  private sequence = 0;
  private timer: number | null = null;

  on(
    type: string,
    filter: { table?: string; filter?: string; event?: string },
    callback: (payload: { eventType: string; new: Row; old: Row }) => void,
  ) {
    if (type === 'postgres_changes' && filter.table) {
      this.handlers.push({ table: filter.table, filter: filter.filter, callback });
    }
    if (type === 'presence') this.presenceHandlers.push(callback as unknown as () => void);
    return this;
  }

  subscribe(callback: (status: string) => void) {
    callback('SUBSCRIBED');
    this.timer = window.setInterval(() => void this.poll(), 150);
    queueMicrotask(() => this.presenceHandlers.forEach((handler) => handler()));
    return this;
  }

  async poll() {
    const result = await request<{ sequence: number; changes: Array<{
      sequence: number;
      table: string;
      eventType: string;
      new: Row;
      old: Row;
    }> }>(`/events?since=${this.sequence}`);
    if (result.error || !result.data) return;
    this.sequence = result.data.sequence;
    for (const change of result.data.changes) {
      for (const handler of this.handlers) {
        if (handler.table !== change.table) continue;
        const [column, expected] = String(handler.filter ?? '').split('=eq.');
        const row = Object.keys(change.new).length ? change.new : change.old;
        if (column && expected && String(row[column]) !== expected) continue;
        handler.callback({ eventType: change.eventType, new: change.new, old: change.old });
      }
    }
  }

  track(_payload: unknown) {
    return Promise.resolve('ok');
  }

  presenceState() {
    return {
      'user-dm': [{ user_id: 'user-dm' }],
      'user-player': [{ user_id: 'user-player' }],
    };
  }

  close() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
}

export function createCombatE2EClient(): SupabaseClient {
  const userRecord = roleUsers[currentRole()];
  const user = {
    id: userRecord.id,
    email: userRecord.email,
    role: 'authenticated',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: { display_name: userRecord.email.split('@')[0] },
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
  } as unknown as User;
  const session = {
    access_token: `e2e-${currentRole()}`,
    refresh_token: `e2e-refresh-${currentRole()}`,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  } as Session;
  const channels = new Set<FakeChannel>();

  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      onAuthStateChange: (callback: (event: string, next: Session | null) => void) => {
        queueMicrotask(() => callback('SIGNED_IN', session));
        return { data: { subscription: { id: 'e2e-auth', callback, unsubscribe: () => undefined } } };
      },
    },
    from: (name: string) => new FakeQueryBuilder(name),
    rpc: async (name: string, args: Row) => request('/rpc', { name, args }),
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: 'e2e-map.png' }, error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: '' }, error: null }),
      }),
    },
    channel: () => {
      const channel = new FakeChannel();
      channels.add(channel);
      return channel;
    },
    removeChannel: async (channel: FakeChannel) => {
      channel.close();
      channels.delete(channel);
      return 'ok';
    },
  } as unknown as SupabaseClient;
}

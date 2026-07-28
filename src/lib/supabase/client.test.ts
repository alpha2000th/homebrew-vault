import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { initializeSupabaseClient, supabase } from './client';

describe('initializeSupabaseClient', () => {
  it('reuses the Homebrew Vault client so Combat receives the same auth session', () => {
    const sharedClient = { auth: {} } as SupabaseClient;

    expect(initializeSupabaseClient(sharedClient)).toBe(sharedClient);
    expect(supabase).toBe(sharedClient);
  });
});

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const fallbackUrl = 'https://psmzewaofkvwujccmlrv.supabase.co';
const fallbackKey = 'sb_publishable_KUoetV_StYUXdpd-rxMzZA_Zi84ycQ7';

declare global {
  interface Window {
    homebrewVaultSupabase?: SupabaseClient;
  }
}

export let supabase: SupabaseClient;

export function initializeSupabaseClient(sharedClient?: SupabaseClient): SupabaseClient {
  supabase = sharedClient ?? createClient(
    import.meta.env.VITE_SUPABASE_URL || fallbackUrl,
    import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackKey,
    {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 20 } },
    },
  );
  return supabase;
}

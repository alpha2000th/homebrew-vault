import { createClient } from '@supabase/supabase-js';

const fallbackUrl = 'https://psmzewaofkvwujccmlrv.supabase.co';
const fallbackKey = 'sb_publishable_KUoetV_StYUXdpd-rxMzZA_Zi84ycQ7';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || fallbackUrl,
  import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackKey,
  {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 20 } },
  },
);

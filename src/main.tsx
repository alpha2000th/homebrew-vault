import React from 'react';
import ReactDOM from 'react-dom/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CombatLauncher } from './features/combat/CombatApp';
import { initializeSupabaseClient } from './lib/supabase/client';

let mount = document.getElementById('combat-root');
if (!mount) {
  mount = document.createElement('div');
  mount.id = 'combat-root';
  document.body.appendChild(mount);
}

let mounted = false;
const mountCombat = (sharedClient: SupabaseClient) => {
  if (mounted) return;
  mounted = true;
  initializeSupabaseClient(sharedClient);
  ReactDOM.createRoot(mount).render(
    <React.StrictMode>
      <CombatLauncher />
    </React.StrictMode>,
  );
};

if (window.homebrewVaultSupabase) {
  mountCombat(window.homebrewVaultSupabase);
} else {
  window.addEventListener('homebrew-supabase-ready', (event) => {
    mountCombat((event as CustomEvent<SupabaseClient>).detail);
  }, { once: true });
}

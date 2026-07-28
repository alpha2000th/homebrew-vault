import React from 'react';
import ReactDOM from 'react-dom/client';
import { CombatLauncher } from './features/combat/CombatApp';

let mount = document.getElementById('combat-root');
if (!mount) {
  mount = document.createElement('div');
  mount.id = 'combat-root';
  document.body.appendChild(mount);
}

ReactDOM.createRoot(mount).render(
  <React.StrictMode>
    <CombatLauncher />
  </React.StrictMode>,
);

import { Crosshair, Search, Target, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CombatToken } from '../../types/combat';
import { tokenDistanceFeet } from '../../lib/combat/workflow';

interface Props {
  title?: string;
  tokens: CombatToken[];
  actor?: CombatToken;
  selectedIds: string[];
  selectedTokenIds?: string[];
  feetPerSquare?: number;
  onChange: (ids: string[]) => void;
  onFocus: (id: string) => void;
  testId: string;
}

export function TargetSelector({
  title = 'Choose targets',
  tokens,
  actor,
  selectedIds,
  selectedTokenIds = [],
  feetPerSquare = 5,
  onChange,
  onFocus,
  testId,
}: Props) {
  const [search, setSearch] = useState('');
  const visible = useMemo(() => tokens.filter((token) =>
    token.name.toLowerCase().includes(search.trim().toLowerCase())), [tokens, search]);
  const allies = tokens.filter((token) => actor && token.team === actor.team && token.id !== actor.id);
  const enemies = tokens.filter((token) => actor && token.team !== actor.team && token.id !== actor.id);
  const toggle = (id: string) => onChange(
    selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id],
  );

  return (
    <section className="target-selector" data-testid={testId}>
      <header>
        <div><Target /><span><strong>{title}</strong><small>{selectedIds.length} selected</small></span></div>
        <button type="button" onClick={() => onChange([])} disabled={!selectedIds.length} title="Clear all targets"><X /> Clear</button>
      </header>
      <div className="target-tools">
        <label><Search /><input aria-label={`${title} search`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search combatants…" /></label>
        <button type="button" onClick={() => onChange(enemies.map((token) => token.id))} disabled={!actor || !enemies.length}><Crosshair /> Enemies</button>
        <button type="button" onClick={() => onChange(allies.map((token) => token.id))} disabled={!actor || !allies.length}><Users /> Allies</button>
      </div>
      <div className="target-list">
        {visible.map((token) => {
          const hp = token.state.hp;
          const checked = selectedIds.includes(token.id);
          const order = selectedIds.indexOf(token.id) + 1;
          const distance = tokenDistanceFeet(actor, token, feetPerSquare);
          return (
            <div
              key={token.id}
              className={[
                'target-row',
                checked ? 'targeted' : '',
                token.id === actor?.id ? 'actor' : '',
                selectedTokenIds.includes(token.id) ? 'selected' : '',
              ].join(' ')}
              data-testid={`target-row-${token.id}`}
              data-token-name={token.name}
            >
              <label>
                <input type="checkbox" checked={checked} onChange={() => toggle(token.id)} />
                <span className="target-avatar">{token.state.icon || token.name.slice(0, 2).toUpperCase()}</span>
                <span className="target-identity">
                  <strong>{token.name}</strong>
                  <small>{token.team} · {hp.current}/{hp.max} HP{hp.temp ? ` · +${hp.temp} temp` : ''}</small>
                  <small>{token.state.conditions.length ? token.state.conditions.join(', ') : 'No conditions'}{distance !== null ? ` · ${distance} ft` : ''}</small>
                </span>
                {checked && <i aria-label={`Target ${order}`}>{order}</i>}
              </label>
              <button type="button" onClick={() => onFocus(token.id)} title={`Focus ${token.name} on map`}><Crosshair /></button>
            </div>
          );
        })}
        {!visible.length && <div className="target-empty">No combatants match this search.</div>}
      </div>
    </section>
  );
}

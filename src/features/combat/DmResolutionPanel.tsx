import { Gavel, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { CombatEncounter, CombatToken, ResolutionPayload } from '../../types/combat';
import { previewTarget } from '../../lib/combat/resolution';
import { applyDirectResolution, undoLatestResolution } from './api';
import { TargetSelector } from './TargetSelector';

interface Props {
  encounter: CombatEncounter;
  tokens: CombatToken[];
  targetIds: string[];
  selectedIds: string[];
  feetPerSquare: number;
  onTargetIds: (ids: string[]) => void;
  onFocusToken: (id: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';

export function DmResolutionPanel({
  encounter,
  tokens,
  targetIds,
  selectedIds,
  feetPerSquare,
  onTargetIds,
  onFocusToken,
  onRefresh,
  onError,
}: Props) {
  const [kind, setKind] = useState('damage');
  const [amount, setAmount] = useState('60');
  const [condition, setCondition] = useState('');
  const [resourceName, setResourceName] = useState('');
  const [moveX, setMoveX] = useState('0');
  const [moveY, setMoveY] = useState('0');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const targets = targetIds.map((id) => tokens.find((token) => token.id === id)).filter(Boolean) as CombatToken[];
  const payload = (): ResolutionPayload => ({
    targets: targets.map((token) => {
      const target = { token_id: token.id, note };
      if (kind === 'damage') return { ...target, damage: Number(amount) };
      if (kind === 'healing') return { ...target, healing: Number(amount) };
      if (kind === 'temp_hp') return { ...target, temp_hp: Number(amount) };
      if (kind === 'set_hp') return { ...target, set_hp: Number(amount) };
      if (kind === 'remove_temp') return { ...target, remove_temp_hp: true };
      if (kind === 'add_condition') return { ...target, conditions_add: [condition] };
      if (kind === 'remove_condition') return { ...target, conditions_remove: [condition] };
      if (kind === 'resource') return { ...target, resource_changes: [{ name: resourceName, delta: Number(amount) }] };
      if (kind === 'move') return { ...target, x: Number(moveX), y: Number(moveY) };
      if (kind === 'dead') return { ...target, dead: true };
      if (kind === 'unconscious') return { ...target, unconscious: true };
      return target;
    }),
    note,
  });

  return (
    <div className="panel-section dm-resolution-panel" data-testid="dm-panel">
      <div className="panel-heading"><div><h3>DM Direct Resolution</h3><p>Apply an atomic change without creating a proposal.</p></div></div>
      <TargetSelector
        title="DM resolution targets"
        tokens={tokens}
        selectedIds={targetIds}
        selectedTokenIds={selectedIds}
        feetPerSquare={feetPerSquare}
        onChange={onTargetIds}
        onFocus={onFocusToken}
        testId="dm-target-selector"
      />
      <section className="direct-resolution-editor">
        <label>Change<select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="damage">Deal damage</option><option value="healing">Heal HP</option>
          <option value="temp_hp">Set temporary HP</option><option value="set_hp">Set HP</option>
          <option value="remove_temp">Remove temporary HP</option><option value="add_condition">Add condition</option>
          <option value="remove_condition">Remove condition</option><option value="resource">Spend / restore resource</option>
          <option value="move">Move to grid position</option><option value="unconscious">Mark unconscious</option>
          <option value="dead">Mark dead</option><option value="note">Custom note</option>
        </select></label>
        {!['remove_temp', 'dead', 'unconscious', 'add_condition', 'remove_condition', 'move', 'note'].includes(kind) &&
          <label>{kind === 'resource' ? 'Change (negative spends, positive restores)' : 'Amount'}<input data-testid="dm-amount" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>}
        {['add_condition', 'remove_condition'].includes(kind) &&
          <label>Condition<input value={condition} onChange={(event) => setCondition(event.target.value)} /></label>}
        {kind === 'resource' && <label>Resource name<input value={resourceName} onChange={(event) => setResourceName(event.target.value)} placeholder="QA Charges" /></label>}
        {kind === 'move' && <div className="field-grid">
          <label>Grid X<input type="number" min="0" value={moveX} onChange={(event) => setMoveX(event.target.value)} /></label>
          <label>Grid Y<input type="number" min="0" value={moveY} onChange={(event) => setMoveY(event.target.value)} /></label>
        </div>}
        <label>Note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
      </section>
      <section className="direct-preview-list">
        <h3>Per-target preview</h3>
        {!targets.length && <div className="category-empty">Select one or more combatants above. Every selected target receives its own preview.</div>}
        {targets.map((target) => {
          const change = payload().targets.find((item) => item.token_id === target.id)!;
          const preview = previewTarget(target.state.hp, change);
          return (
            <article className="resolution-preview" key={target.id} data-testid={`dm-preview-${target.id}`}>
              <strong>{target.name}</strong>
              <span>Before: {preview.before.current} HP, {preview.before.temp} temp · {target.state.conditions.join(', ') || 'no conditions'}</span>
              <span>Final: {preview.after.current} HP, {preview.after.temp} temp</span>
            </article>
          );
        })}
      </section>
      <footer className="sticky-submit">
        <button type="button" className="panel-button danger" onClick={async () => {
          try { await undoLatestResolution(encounter.id); await onRefresh(); }
          catch (error) { onError(errorMessage(error)); }
        }} data-testid="undo-latest"><Undo2 /> Undo latest</button>
        <button type="button" className="panel-button primary" disabled={busy || !targets.length} onClick={async () => {
          setBusy(true);
          try {
            await applyDirectResolution(encounter.id, payload(), crypto.randomUUID());
            await onRefresh();
          } catch (error) { onError(errorMessage(error)); }
          finally { setBusy(false); }
        }} data-testid="resolve-direct"><Gavel /> Resolve directly</button>
      </footer>
      {!targets.length && <p className="disabled-explanation">Choose at least one target above before resolving.</p>}
    </div>
  );
}

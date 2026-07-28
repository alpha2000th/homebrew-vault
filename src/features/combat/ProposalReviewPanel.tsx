import { CornerUpLeft, Gavel, RotateCcw, ShieldAlert, Target, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AttackEntry, CombatProposal, CombatToken, DamageComponent, GuidedActionDraft, ResolutionPayload, ResolutionTarget } from '../../types/combat';
import { effectivePayload, previewTarget } from '../../lib/combat/resolution';
import { createReactionWindow, resolveProposal, updateProposalStatus } from './api';
import { TargetSelector } from './TargetSelector';

interface Props {
  proposals: CombatProposal[];
  tokens: CombatToken[];
  isDm: boolean;
  selectedIds: string[];
  onFocusToken: (id: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

type EditableTarget = {
  token_id: string;
  damage: string;
  healing: string;
  temp_hp: string;
  conditions_add: string;
  conditions_remove: string;
  resource_name: string;
  resource_delta: string;
  resource_changes: ResolutionTarget['resource_changes'];
  set_hp: string;
  included: boolean;
};

const triggers = [
  ['attack', 'You are being attacked'],
  ['area_effect', 'An area effect is targeting you'],
  ['spell', 'A spell is targeting you'],
  ['ally_attack', 'An ally is being attacked'],
  ['movement', 'A creature is moving nearby'],
  ['damage', 'You are about to take damage'],
  ['custom', 'Custom trigger'],
] as const;

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';
const stringNumber = (value: number | undefined) => value === undefined ? '' : String(value);

const editableFrom = (target: ResolutionTarget): EditableTarget => ({
  token_id: target.token_id,
  damage: stringNumber(target.damage),
  healing: stringNumber(target.healing),
  temp_hp: stringNumber(target.temp_hp),
  conditions_add: (target.conditions_add ?? []).join(', '),
  conditions_remove: (target.conditions_remove ?? []).join(', '),
  resource_name: target.resource_changes?.[0]?.name ?? '',
  resource_delta: stringNumber(target.resource_changes?.[0]?.delta),
  resource_changes: target.resource_changes ?? [],
  set_hp: stringNumber(target.set_hp),
  included: true,
});

const resolutionFrom = (target: EditableTarget): ResolutionTarget => ({
  token_id: target.token_id,
  damage: target.damage === '' ? undefined : Math.max(0, Number(target.damage) || 0),
  healing: target.healing === '' ? undefined : Math.max(0, Number(target.healing) || 0),
  temp_hp: target.temp_hp === '' ? undefined : Math.max(0, Number(target.temp_hp) || 0),
  set_hp: target.set_hp === '' ? undefined : Math.max(0, Number(target.set_hp) || 0),
  conditions_add: target.conditions_add.split(',').map((value) => value.trim()).filter(Boolean),
  conditions_remove: target.conditions_remove.split(',').map((value) => value.trim()).filter(Boolean),
  resource_changes: target.resource_name
    ? [
      {
        ...target.resource_changes?.[0],
        name: target.resource_name,
        delta: Number(target.resource_delta) || 0,
      },
      ...(target.resource_changes?.slice(1) ?? []),
    ]
    : target.resource_changes ?? [],
});

export function ProposalReviewPanel({ proposals, tokens, isDm, selectedIds, onFocusToken, onRefresh, onError }: Props) {
  const active = proposals.filter((proposal) => !['draft', 'cancelled'].includes(proposal.status));
  const [edits, setEdits] = useState<Record<string, Record<string, EditableTarget>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [halfSelected, setHalfSelected] = useState<Record<string, string[]>>({});
  const [triggerByProposal, setTriggerByProposal] = useState<Record<string, string>>({});
  const [customTrigger, setCustomTrigger] = useState<Record<string, string>>({});
  const [componentEdits, setComponentEdits] = useState<Record<string, Record<string, string>>>({});
  const [outcomeEdits, setOutcomeEdits] = useState<Record<string, Record<string, string>>>({});

  const proposalTargets = (proposal: CombatProposal) => {
    const effective = effectivePayload(proposal.calculated_payload, proposal.player_override_payload, proposal.dm_final_payload);
    const stored = edits[proposal.id];
    if (stored) return stored;
    return Object.fromEntries(effective.payload.targets.map((target) => [target.token_id, editableFrom(target)]));
  };

  const changeTarget = (proposal: CombatProposal, tokenId: string, patch: Partial<EditableTarget>) => {
    const current = proposalTargets(proposal);
    setEdits({
      ...edits,
      [proposal.id]: {
        ...current,
        [tokenId]: { ...(current[tokenId] ?? editableFrom({ token_id: tokenId })), ...patch },
      },
    });
  };

  const changeTargetIds = (proposal: CombatProposal, ids: string[]) => {
    const current = proposalTargets(proposal);
    const next: Record<string, EditableTarget> = {};
    for (const id of ids) next[id] = current[id] ?? editableFrom({ token_id: id });
    setEdits({ ...edits, [proposal.id]: next });
  };

  const counts = useMemo(() => ({
    awaiting: active.filter((proposal) => ['submitted', 'awaiting_dm', 'reaction_window'].includes(proposal.status)).length,
    resolved: active.filter((proposal) => proposal.status === 'resolved').length,
  }), [active]);

  if (!active.length) {
    return (
      <div className="empty-panel useful-empty" data-testid="proposals-empty">
        <Gavel /><strong>No proposals are awaiting review</strong>
        <p>Player actions will appear here with one editable card per target. The DM can change every final value before resolving.</p>
      </div>
    );
  }

  return (
    <div className="panel-section proposal-list" data-testid="proposals-panel">
      <div className="panel-heading"><div><h3>Proposal review</h3><p>{counts.awaiting} awaiting · {counts.resolved} resolved</p></div></div>
      {active.map((proposal) => {
        const targetMap = proposalTargets(proposal);
        const targetIds = Object.keys(targetMap);
        const source = proposal.source_action as Record<string, unknown>;
        const rollData = proposal.roll_data as Record<string, unknown>;
        const attack = rollData.attack as Record<string, unknown> | undefined;
        const damage = rollData.damage as Record<string, unknown> | undefined;
        const guided = rollData.guidedDraft as GuidedActionDraft | undefined;
        const guidedComponents = guided?.damageComponents ?? [];
        const guidedMultiattack = guided?.multiattackEntries ?? [];
        const triggerType = triggerByProposal[proposal.id] ?? (proposal.area_template ? 'area_effect' : 'attack');
        const triggerText = triggerType === 'custom'
          ? customTrigger[proposal.id] || 'A combat event may allow a reaction.'
          : triggers.find(([value]) => value === triggerType)?.[1] ?? 'A combat event may allow a reaction.';
        const editable = !['resolved', 'undone', 'rejected'].includes(proposal.status);

        return (
          <article key={proposal.id} className={`proposal-card proposal-review status-${proposal.status}`} data-testid={`proposal-${proposal.id}`}>
            <header>
              <div><strong>{String(source.name ?? 'Custom action')}</strong><small>{String(source.category ?? 'action')} · version {proposal.version}</small></div>
              <span>{proposal.status.replace('_', ' ')}</span>
            </header>
            <p>{proposal.description || 'No description supplied.'}</p>
            <div className="proposal-roll-summary">
              <span>Attack final <strong>{String(attack?.final ?? 'not rolled')}</strong></span>
              <span>Player damage <strong>{String(damage?.playerCombined ?? 'custom')}</strong></span>
              <span>Targets <strong>{targetIds.length}</strong></span>
            </div>

            {guided?.schemaVersion === 2 && (
              <section className="dm-source-breakdown" data-testid="dm-source-breakdown">
                <header><div><strong>Structured source breakdown</strong><small>Guided proposal v2 · every source remains identifiable</small></div></header>
                {guided.attackEntry?.attackRoll && (
                  <div className="dm-attack-source">
                    <span>Primary attack</span>
                    <strong>{guided.attackEntry.attackOverride ?? guided.attackEntry.attackRoll.total}</strong>
                    <small>{guided.attackEntry.suggestedOutcome.replace('_', ' ')}</small>
                  </div>
                )}
                {!!guidedComponents.length && (
                  <div className="dm-component-list">
                    {guidedComponents.map((component: DamageComponent, index: number) => {
                      const key = `primary:${component.id}`;
                      const value = componentEdits[proposal.id]?.[key] ?? String(component.finalSubtotal);
                      return (
                        <label key={component.id}>
                          <span>{index + 1}. {component.source || 'Damage component'} · {component.formula} {component.damageType}</span>
                          <small>Calculated {component.calculatedSubtotal} · Player {component.finalSubtotal}</small>
                          <input type="number" disabled={!editable} aria-label={`DM final ${component.source || `component ${index + 1}`}`} value={value} onChange={(event) => setComponentEdits({
                            ...componentEdits,
                            [proposal.id]: { ...(componentEdits[proposal.id] ?? {}), [key]: event.target.value },
                          })} />
                        </label>
                      );
                    })}
                  </div>
                )}
                {!!guidedMultiattack.length && (
                  <div className="dm-multiattack-review">
                    <h3>Individual attacks</h3>
                    {guidedMultiattack.map((entry: AttackEntry, attackIndex: number) => (
                      <article key={entry.id}>
                        <header>
                          <strong>{attackIndex + 1}. {entry.name}</strong>
                          <span>→ {entry.targetIds.map((id) => tokens.find((token) => token.id === id)?.name ?? id).join(', ') || 'No target'}</span>
                        </header>
                        <div className="field-grid">
                          <label>DM outcome<select disabled={!editable} value={outcomeEdits[proposal.id]?.[entry.id] ?? entry.suggestedOutcome} onChange={(event) => setOutcomeEdits({
                            ...outcomeEdits,
                            [proposal.id]: { ...(outcomeEdits[proposal.id] ?? {}), [entry.id]: event.target.value },
                          })}>
                            <option value="awaiting_dm">Awaiting DM</option><option value="hit">Hit</option>
                            <option value="miss">Miss</option><option value="success">Save success</option>
                            <option value="failure">Save failure</option><option value="custom">Custom</option>
                          </select></label>
                          <label>Attack total<input type="number" disabled={!editable} defaultValue={entry.attackOverride ?? entry.attackRoll?.total ?? ''} /></label>
                        </div>
                        {entry.damageComponents.map((component, componentIndex) => {
                          const key = `${entry.id}:${component.id}`;
                          const value = componentEdits[proposal.id]?.[key] ?? String(component.finalSubtotal);
                          return (
                            <label key={component.id}>
                              <span>{componentIndex + 1}. {component.source} · {component.formula} {component.damageType}</span>
                              <small>Calculated {component.calculatedSubtotal} · Player {component.finalSubtotal}</small>
                              <input type="number" disabled={!editable} value={value} onChange={(event) => setComponentEdits({
                                ...componentEdits,
                                [proposal.id]: { ...(componentEdits[proposal.id] ?? {}), [key]: event.target.value },
                              })} />
                            </label>
                          );
                        })}
                      </article>
                    ))}
                  </div>
                )}
                {isDm && editable && (guidedComponents.length > 0 || guidedMultiattack.length > 0) && (
                  <button type="button" className="panel-button" onClick={() => {
                    const next = { ...targetMap };
                    if (guidedMultiattack.length) {
                      for (const targetId of targetIds) {
                        const total = guidedMultiattack
                          .filter((entry) => entry.targetIds.includes(targetId))
                          .filter((entry) => (outcomeEdits[proposal.id]?.[entry.id] ?? entry.suggestedOutcome) !== 'miss')
                          .reduce((sum, entry) => sum + entry.damageComponents
                            .filter((component) => component.included)
                            .reduce((componentSum, component) => componentSum + Math.max(0, Number(componentEdits[proposal.id]?.[`${entry.id}:${component.id}`] ?? component.finalSubtotal) || 0), 0), 0);
                        if (next[targetId]) next[targetId] = { ...next[targetId], damage: String(total) };
                      }
                    } else {
                      const total = guidedComponents
                        .filter((component) => component.included)
                        .reduce((sum, component) => sum + Math.max(0, Number(componentEdits[proposal.id]?.[`primary:${component.id}`] ?? component.finalSubtotal) || 0), 0);
                      for (const targetId of targetIds) if (next[targetId]) next[targetId] = { ...next[targetId], damage: String(total) };
                    }
                    setEdits({ ...edits, [proposal.id]: next });
                  }}>Apply edited component totals to targets</button>
                )}
              </section>
            )}

            {isDm && editable && (
              <div className="proposal-bulk-tools">
                <label>Same damage for all<input aria-label="Same damage for all targets" type="number" onChange={(event) => {
                  const next = Object.fromEntries(Object.entries(targetMap).map(([id, target]) => [id, { ...target, damage: event.target.value }]));
                  setEdits({ ...edits, [proposal.id]: next });
                }} /></label>
                <button type="button" onClick={() => {
                  const selected = halfSelected[proposal.id] ?? [];
                  const next = Object.fromEntries(Object.entries(targetMap).map(([id, target]) => [
                    id,
                    selected.includes(id) ? { ...target, damage: String(Math.floor((Number(target.damage) || 0) / 2)) } : target,
                  ]));
                  setEdits({ ...edits, [proposal.id]: next });
                }}>Apply half to selected</button>
              </div>
            )}

            <div className="proposal-target-cards">
              {targetIds.map((tokenId, index) => {
                const target = tokens.find((token) => token.id === tokenId);
                const edit = targetMap[tokenId];
                if (!target || !edit) return null;
                const change = resolutionFrom(edit);
                const preview = previewTarget(target.state.hp, change);
                const halfIds = halfSelected[proposal.id] ?? [];
                return (
                  <section key={tokenId} className={`proposal-target-card ${selectedIds.includes(tokenId) ? 'selected' : ''}`} data-testid={`proposal-target-${tokenId}`}>
                    <header>
                      <label><input type="checkbox" checked={halfIds.includes(tokenId)} onChange={(event) => setHalfSelected({
                        ...halfSelected,
                        [proposal.id]: event.target.checked ? [...halfIds, tokenId] : halfIds.filter((id) => id !== tokenId),
                      })} /> Half group</label>
                      <button type="button" onClick={() => onFocusToken(tokenId)}><Target /> {index + 1}. {target.name}</button>
                      {editable && <button type="button" title={`Remove ${target.name}`} onClick={() => changeTargetIds(proposal, targetIds.filter((id) => id !== tokenId))}><X /></button>}
                    </header>
                    <div className="proposal-state-line">
                      <span>Current {target.state.hp.current}/{target.state.hp.max} HP</span>
                      <span>Temp {target.state.hp.temp}</span>
                      <span>{target.state.conditions.join(', ') || 'No conditions'}</span>
                    </div>
                     <div className="field-grid three">
                      <label>Damage<input type="number" disabled={!editable} value={edit.damage} onChange={(event) => changeTarget(proposal, tokenId, { damage: event.target.value })} /></label>
                      <label>Healing<input type="number" disabled={!editable} value={edit.healing} onChange={(event) => changeTarget(proposal, tokenId, { healing: event.target.value })} /></label>
                      <label>Temporary HP<input type="number" disabled={!editable} value={edit.temp_hp} onChange={(event) => changeTarget(proposal, tokenId, { temp_hp: event.target.value })} /></label>
                     </div>
                    <div className="dm-outcome-buttons">
                      <button type="button" disabled={!editable} onClick={() => changeTarget(proposal, tokenId, { damage: String(edit.damage || 0) })}>Full damage</button>
                      <button type="button" disabled={!editable} onClick={() => changeTarget(proposal, tokenId, { damage: String(Math.floor((Number(edit.damage) || 0) / 2)) })}>Half damage</button>
                      <button type="button" disabled={!editable} onClick={() => changeTarget(proposal, tokenId, { damage: '0' })}>No damage / Miss</button>
                    </div>
                    <label>Set final HP directly<input type="number" disabled={!editable} value={edit.set_hp} onChange={(event) => changeTarget(proposal, tokenId, { set_hp: event.target.value })} /></label>
                    <div className="field-grid">
                      <label>Conditions to add<input disabled={!editable} value={edit.conditions_add} onChange={(event) => changeTarget(proposal, tokenId, { conditions_add: event.target.value })} /></label>
                      <label>Conditions to remove<input disabled={!editable} value={edit.conditions_remove} onChange={(event) => changeTarget(proposal, tokenId, { conditions_remove: event.target.value })} /></label>
                    </div>
                    {(edit.resource_changes?.length ?? 0) > 1 && (
                      <div className="proposal-resource-list">
                        <small>Additional deferred resource changes</small>
                        {edit.resource_changes?.slice(1).map((change, resourceIndex) => (
                          <span key={`${change.id ?? change.name}-${resourceIndex}`}>{change.name ?? change.id}: {change.delta ?? change.set ?? 0}</span>
                        ))}
                      </div>
                    )}
                    <div className="field-grid">
                      <label>Resource name<input disabled={!editable} value={edit.resource_name} onChange={(event) => changeTarget(proposal, tokenId, { resource_name: event.target.value })} /></label>
                      <label>Resource change<input type="number" disabled={!editable} value={edit.resource_delta} onChange={(event) => changeTarget(proposal, tokenId, { resource_delta: event.target.value })} /></label>
                    </div>
                    <div className="resolution-preview">
                      <span>Calculated after-state: {preview.after.current} HP, {preview.after.temp} temp</span>
                      <strong>DM final after-state: {preview.after.current} HP, {preview.after.temp} temp · {(change.conditions_add ?? []).join(', ') || 'no added conditions'}</strong>
                    </div>
                  </section>
                );
              })}
            </div>

            {isDm && editable && (
              <>
                <TargetSelector
                  title="Add or remove proposal targets"
                  tokens={tokens}
                  selectedIds={targetIds}
                  selectedTokenIds={selectedIds}
                  onChange={(ids) => changeTargetIds(proposal, ids)}
                  onFocus={onFocusToken}
                  testId={`proposal-target-selector-${proposal.id}`}
                />
                <section className="reaction-opener">
                  <label>Broad reaction trigger<select value={triggerType} onChange={(event) => setTriggerByProposal({ ...triggerByProposal, [proposal.id]: event.target.value })}>
                    {triggers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select></label>
                  {triggerType === 'custom' && <label>Custom trigger<input value={customTrigger[proposal.id] ?? ''} onChange={(event) => setCustomTrigger({ ...customTrigger, [proposal.id]: event.target.value })} /></label>}
                  <button type="button" className="panel-button" onClick={async () => {
                    try {
                      await createReactionWindow({
                        encounterId: proposal.encounter_id,
                        proposalId: proposal.id,
                        triggerType,
                        triggerText,
                        eligibleTokenIds: targetIds,
                        allowAdditional: true,
                      });
                      await onRefresh();
                    } catch (error) { onError(errorMessage(error)); }
                  }}><ShieldAlert /> Open reaction window</button>
                </section>
                <div className="resolution-summary">
                  <strong>Final resolution summary</strong>
                  {Object.values(targetMap).filter((target) => target.included).map((target) => {
                    const token = tokens.find((item) => item.id === target.token_id);
                    return <span key={target.token_id}>{token?.name}: {target.damage || 0} damage, {target.healing || 0} healing, {target.temp_hp || 0} temp HP</span>;
                  })}
                </div>
                <footer className="proposal-actions sticky-submit">
                  <div className="panel-row">
                    <button type="button" className="panel-button danger" onClick={async () => {
                      try { await updateProposalStatus(proposal.id, 'rejected'); await onRefresh(); }
                      catch (error) { onError(errorMessage(error)); }
                    }}>Reject</button>
                    <button type="button" className="panel-button" onClick={async () => {
                      try { await updateProposalStatus(proposal.id, 'draft'); await onRefresh(); }
                      catch (error) { onError(errorMessage(error)); }
                    }}><CornerUpLeft /> Return for edits</button>
                    <button type="button" className="panel-button" onClick={async () => {
                      try { await updateProposalStatus(proposal.id, 'cancelled'); await onRefresh(); }
                      catch (error) { onError(errorMessage(error)); }
                    }}>Cancel</button>
                  </div>
                  <button type="button" className="panel-button primary" disabled={busy === proposal.id || !targetIds.length} data-testid="resolve-all" onClick={async () => {
                    setBusy(proposal.id);
                    try {
                      const payload: ResolutionPayload = {
                        targets: Object.values(targetMap).filter((target) => target.included).map(resolutionFrom),
                      };
                      await resolveProposal(proposal, payload, crypto.randomUUID());
                      await onRefresh();
                    } catch (error) { onError(errorMessage(error)); }
                    finally { setBusy(null); }
                  }}><Gavel /> Resolve all</button>
                </footer>
              </>
            )}
            {!editable && <div className="proposal-closed-note"><RotateCcw /> This proposal is {proposal.status}. History remains available for audit.</div>}
          </article>
        );
      })}
    </div>
  );
}

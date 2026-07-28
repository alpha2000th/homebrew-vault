import { useMemo, useState } from 'react';
import {
  Activity, ChevronLeft, ChevronRight, Dice5, FastForward, Gavel, MessageSquare,
  RotateCcw, ShieldAlert, Sparkles, Swords, Undo2,
} from 'lucide-react';
import type {
  CombatEncounter,
  CombatEvent,
  CombatAction,
  CombatProposal,
  CombatToken,
  AreaTemplate,
  ReactionWindow,
  ResolutionPayload,
} from '../../types/combat';
import { effectivePayload, previewTarget } from '../../lib/combat/resolution';
import { formatRoll, rollExpression } from '../../lib/dice/parser';
import {
  advanceCombatRound,
  applyDirectResolution,
  closeReactionWindow,
  createReactionWindow,
  resolveProposal,
  respondToReaction,
  saveDraft,
  sendChat,
  submitProposal,
  undoLatestResolution,
  updateEncounter,
  updateTokenAsDm,
} from './api';

type Tab = 'turns' | 'actions' | 'proposals' | 'reactions' | 'dm' | 'chat';

interface Props {
  encounter: CombatEncounter;
  tokens: CombatToken[];
  proposals: CombatProposal[];
  reactions: ReactionWindow[];
  events: CombatEvent[];
  userId: string;
  isDm: boolean;
  targetIds: string[];
  areaTemplate: AreaTemplate | null;
  onTargetIds: (ids: string[]) => void;
  onAreaTemplate: (template: AreaTemplate | null) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

const tabs: Array<{ id: Tab; label: string; icon: typeof Swords }> = [
  { id: 'turns', label: 'Turns', icon: Activity },
  { id: 'actions', label: 'Actions', icon: Swords },
  { id: 'proposals', label: 'Proposals', icon: Gavel },
  { id: 'reactions', label: 'Reactions', icon: ShieldAlert },
  { id: 'dm', label: 'DM', icon: Sparkles },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
];

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';

function PanelButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'danger' }) {
  return <button {...props} className={`panel-button ${props.tone ?? ''} ${props.className ?? ''}`} />;
}

function TurnPanel({ encounter, tokens, isDm, onRefresh, onError }: Pick<Props, 'encounter' | 'tokens' | 'isDm' | 'onRefresh' | 'onError'>) {
  const ordered = [...tokens].sort((a, b) =>
    a.initiative_order - b.initiative_order || (b.initiative ?? 0) - (a.initiative ?? 0));
  const activeIndex = ordered.findIndex((token) => token.id === encounter.active_turn_token_id);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const changeTurn = async (delta: number) => {
    if (!ordered.length) return;
    let nextIndex = activeIndex < 0 ? 0 : activeIndex + delta;
    let round = encounter.round_number;
    if (nextIndex >= ordered.length) { nextIndex = 0; round += 1; }
    if (nextIndex < 0) { nextIndex = ordered.length - 1; round = Math.max(1, round - 1); }
    try {
      await updateEncounter(encounter.id, { active_turn_token_id: ordered[nextIndex].id, round_number: round });
      await onRefresh();
    } catch (error) { onError(errorMessage(error)); }
  };

  const setInitiative = async (token: CombatToken, value: number) => {
    try {
      await updateTokenAsDm(token.id, { initiative: value });
      await onRefresh();
    } catch (error) { onError(errorMessage(error)); }
  };

  const reorder = async (targetIndex: number) => {
    if (!draggedId) return;
    const from = ordered.findIndex((token) => token.id === draggedId);
    if (from < 0 || from === targetIndex) return setDraggedId(null);
    const next = [...ordered];
    const [dragged] = next.splice(from, 1);
    next.splice(targetIndex, 0, dragged);
    setDraggedId(null);
    try {
      await Promise.all(next.map((token, index) => updateTokenAsDm(token.id, { initiative_order: index })));
      await onRefresh();
    } catch (error) { onError(errorMessage(error)); }
  };

  return (
    <div className="panel-section">
      <div className="turn-summary">
        <div><small>Mode</small><strong>{encounter.turn_mode === 'initiative' ? 'Initiative' : 'Free'}</strong></div>
        <div><small>Round</small><strong>{encounter.round_number}</strong></div>
        <div><small>Status</small><strong>{encounter.status}</strong></div>
      </div>
      {isDm && (
        <div className="panel-row">
          <PanelButton onClick={() => changeTurn(-1)}><ChevronLeft /> Previous</PanelButton>
          <PanelButton tone="primary" onClick={() => changeTurn(1)}>Next <ChevronRight /></PanelButton>
          <PanelButton onClick={async () => {
            try { await advanceCombatRound(encounter.id); await onRefresh(); }
            catch (error) { onError(errorMessage(error)); }
          }}><FastForward /> Round</PanelButton>
        </div>
      )}
      {encounter.turn_mode === 'free' && <p className="panel-note">Free Mode: proposals may be resolved in any order. Initiative is advisory only.</p>}
      <div className="initiative-list">
        {ordered.map((token, index) => (
          <div key={token.id}
            draggable={isDm}
            onDragStart={() => setDraggedId(token.id)}
            onDragOver={(event) => { if (isDm) event.preventDefault(); }}
            onDrop={() => void reorder(index)}
            className={`${token.id === encounter.active_turn_token_id ? 'initiative-row active' : 'initiative-row'} ${draggedId === token.id ? 'dragging' : ''}`}>
            <span className="initiative-rank">{index + 1}</span>
            <span className="initiative-avatar">{token.name.slice(0, 2).toUpperCase()}</span>
            <span className="initiative-name">{token.name}<small>{token.state.hp.current}/{token.state.hp.max} HP</small></span>
            {isDm ? (
              <input type="number" value={token.initiative ?? 0} onChange={(event) => setInitiative(token, Number(event.target.value))} />
            ) : <strong>{token.initiative ?? '—'}</strong>}
          </div>
        ))}
      </div>
      {isDm && (
        <div className="panel-row">
          <PanelButton onClick={async () => {
            await updateEncounter(encounter.id, { turn_mode: encounter.turn_mode === 'initiative' ? 'free' : 'initiative' });
            await onRefresh();
          }}>Switch to {encounter.turn_mode === 'initiative' ? 'Free' : 'Initiative'} Mode</PanelButton>
        </div>
      )}
    </div>
  );
}

function ActionsPanel({ encounter, tokens, userId, isDm, targetIds, areaTemplate, onTargetIds, onAreaTemplate, onRefresh, onError }: Pick<Props,
  'encounter' | 'tokens' | 'userId' | 'isDm' | 'targetIds' | 'areaTemplate' | 'onTargetIds' | 'onAreaTemplate' | 'onRefresh' | 'onError'>) {
  const actors = tokens.filter((token) => isDm || token.assigned_user_id === userId);
  const [actorId, setActorId] = useState(actors[0]?.id ?? '');
  const actor = actors.find((token) => token.id === actorId) ?? actors[0];
  const actions = useMemo<CombatAction[]>(() => {
    const regular = actor?.state.actions ?? [];
    const powers = (actor?.state.homebrewPowers ?? []).map((power, index) => ({
      id: String(power.id ?? `power-${index}`),
      category: 'power' as const,
      name: String(power.name ?? 'Power'),
      cost: String(power.activationCost ?? ''),
      description: String(power.description ?? ''),
      damageFormulas: power.formula ? [{ formula: String(power.formula).match(/[\ddD+\- ()]+/)?.[0]?.trim() || '' }] : undefined,
      range: String(power.range ?? ''),
      attackFormula: undefined,
    }));
    return [...regular, ...powers];
  }, [actor]);
  const [actionIndex, setActionIndex] = useState(0);
  const selectedAction = actions[actionIndex];
  const [formula, setFormula] = useState('1d20');
  const [mode, setMode] = useState<'normal' | 'advantage' | 'disadvantage'>('normal');
  const [critical, setCritical] = useState(false);
  const [roll, setRoll] = useState<ReturnType<typeof rollExpression> | null>(null);
  const [playerTotal, setPlayerTotal] = useState('');
  const [damage, setDamage] = useState('');
  const [healing, setHealing] = useState('');
  const [tempHp, setTempHp] = useState('');
  const [conditions, setConditions] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  if (!actor) return <div className="empty-panel">No token is assigned to you. The DM can assign one in encounter setup.</div>;

  const chooseAction = (index: number) => {
    const action = actions[index];
    setActionIndex(index);
    setDescription(action?.description ?? '');
    setFormula(action?.attackFormula || action?.damageFormulas?.[0]?.formula || '1d20');
    setRoll(null);
    setPlayerTotal('');
  };

  const submit = async () => {
    if (!targetIds.length) return onError('Select at least one map token as a target (Shift-click to target).');
    setSaving(true);
    try {
      const targets = targetIds.map((tokenId) => ({
        token_id: tokenId,
        damage: Number(damage) || undefined,
        healing: Number(healing) || undefined,
        temp_hp: tempHp === '' ? undefined : Number(tempHp),
        conditions_add: conditions.split(',').map((value) => value.trim()).filter(Boolean),
      }));
      const payload: ResolutionPayload = { targets };
      const calculated: ResolutionPayload = {
        targets: targetIds.map((tokenId) => ({ token_id: tokenId, damage: roll?.total ?? undefined })),
      };
      const draft = await saveDraft({
        encounterId: encounter.id,
        actorTokenId: actor.id,
        sourceAction: selectedAction ?? { category: 'action', name: 'Custom Action', description },
        targets: targetIds,
        areaTemplate,
        rollData: roll ? {
          ...roll,
          calculatedTotal: roll.total,
          playerTotal: playerTotal === '' ? null : Number(playerTotal),
        } : {},
        calculated,
        playerOverride: payload,
        description,
      });
      await submitProposal(draft.id, draft.version);
      onTargetIds([]);
      onAreaTemplate(null);
      await onRefresh();
    } catch (error) { onError(errorMessage(error)); }
    finally { setSaving(false); }
  };

  return (
    <div className="panel-section proposal-builder">
      <label>Acting token<select value={actor.id} onChange={(event) => setActorId(event.target.value)}>
        {actors.map((token) => <option key={token.id} value={token.id}>{token.name}</option>)}
      </select></label>
      <div className="action-list">
        {actions.map((action, index) => (
          <button key={action.id ?? index} className={index === actionIndex ? 'active' : ''} onClick={() => chooseAction(index)}>
            <span>{action.name}</span><small>{action.category}{action.cost ? ` · ${action.cost}` : ''}</small>
          </button>
        ))}
        <button className={!selectedAction ? 'active' : ''} onClick={() => setActionIndex(-1)}>
          <span>Custom action</span><small>Fully editable</small>
        </button>
      </div>
      <p className="action-description">{selectedAction?.description || 'Describe any action, roll, or effect. The application does not judge rules legality.'}</p>
      <div className="field-grid">
        <label>Dice expression<input value={formula} onChange={(event) => setFormula(event.target.value)} /></label>
        <label>Roll mode<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="normal">Normal</option><option value="advantage">Advantage</option><option value="disadvantage">Disadvantage</option>
        </select></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} /> Critical damage (double dice)</label>
      <PanelButton tone="primary" onClick={() => {
        try { setRoll(rollExpression(formula, { mode, critical })); setPlayerTotal(''); }
        catch (error) { onError(errorMessage(error)); }
      }}><Dice5 /> Roll</PanelButton>
      {roll && (
        <div className="roll-result">
          <strong>Calculated: {roll.total}</strong><span>{formatRoll(roll)}</span>
          <label>Player changed to (optional)<input type="number" value={playerTotal} onChange={(event) => setPlayerTotal(event.target.value)} /></label>
          <button onClick={() => { setRoll(rollExpression(formula, { mode, critical })); setPlayerTotal(''); }}><RotateCcw /> Recalculate</button>
        </div>
      )}
      <div className="target-summary">Targets: {targetIds.length ? targetIds.map((id) => tokens.find((token) => token.id === id)?.name).join(', ') : 'Shift-click tokens on the map'}</div>
      <div className="field-grid three">
        <label>Area template<select value={areaTemplate?.shape ?? ''} onChange={(event) => {
          const shape = event.target.value as AreaTemplate['shape'] | '';
          onAreaTemplate(shape ? { shape, x: actor.x, y: actor.y, width: 3, height: 3, rotation: 0 } : null);
        }}>
          <option value="">None</option><option value="circle">Circle</option><option value="square">Square</option>
          <option value="rectangle">Rectangle</option><option value="cone">Cone</option><option value="line">Line</option>
        </select></label>
        {areaTemplate && <label>Width (squares)<input type="number" min="1" value={areaTemplate.width} onChange={(event) => onAreaTemplate({ ...areaTemplate, width: Number(event.target.value) })} /></label>}
        {areaTemplate && <label>Height (squares)<input type="number" min="1" value={areaTemplate.height} onChange={(event) => onAreaTemplate({ ...areaTemplate, height: Number(event.target.value) })} /></label>}
      </div>
      <div className="field-grid three">
        <label>Damage<input type="number" value={damage} onChange={(event) => setDamage(event.target.value)} /></label>
        <label>Healing<input type="number" value={healing} onChange={(event) => setHealing(event.target.value)} /></label>
        <label>Set temp HP<input type="number" value={tempHp} onChange={(event) => setTempHp(event.target.value)} /></label>
      </div>
      <label>Conditions to add (comma separated)<input value={conditions} onChange={(event) => setConditions(event.target.value)} /></label>
      <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <PanelButton tone="primary" disabled={saving} onClick={submit}>{saving ? 'Submitting…' : 'Submit proposal'}</PanelButton>
      <p className="panel-note">Every calculated value is advisory and editable. The DM makes the final resolution.</p>
    </div>
  );
}

function ProposalsPanel({ proposals, tokens, isDm, onRefresh, onError }: Pick<Props, 'proposals' | 'tokens' | 'isDm' | 'onRefresh' | 'onError'>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const active = proposals.filter((proposal) => !['draft', 'cancelled'].includes(proposal.status));
  return (
    <div className="panel-section proposal-list">
      {!active.length && <div className="empty-panel">No submitted proposals.</div>}
      {active.map((proposal) => {
        const effective = effectivePayload(proposal.calculated_payload, proposal.player_override_payload, proposal.dm_final_payload);
        const first = effective.payload.targets?.[0];
        const target = tokens.find((token) => token.id === first?.token_id);
        const damage = overrides[proposal.id] ?? String(first?.damage ?? '');
        return (
          <article key={proposal.id} className={`proposal-card status-${proposal.status}`}>
            <header><strong>{String(proposal.source_action?.name ?? 'Custom action')}</strong><span>{proposal.status.replace('_', ' ')}</span></header>
            <p>{proposal.description || 'No description.'}</p>
            <small>Player payload · {proposal.target_token_ids.length} target(s) · version {proposal.version}</small>
            {target && first && (
              <div className="resolution-preview">
                <strong>{target.name}</strong>
                <span>Before: {target.state.hp.current} HP, {target.state.hp.temp} temp</span>
                <span>Proposed: {first.damage ? `${first.damage} damage` : ''} {first.healing ? `${first.healing} healing` : ''}</span>
                <span>Calculated final: {previewTarget(target.state.hp, first).after.current} HP</span>
              </div>
            )}
            {isDm && !['resolved', 'undone', 'rejected'].includes(proposal.status) && (
              <>
                <label>DM final damage (editable)<input type="number" value={damage} onChange={(event) => setOverrides({ ...overrides, [proposal.id]: event.target.value })} /></label>
                <div className="panel-row">
                  <PanelButton onClick={async () => {
                    try {
                      await createReactionWindow({
                        encounterId: proposal.encounter_id,
                        proposalId: proposal.id,
                        triggerType: proposal.area_template ? 'area_effect' : 'custom',
                        triggerText: proposal.area_template
                          ? 'An area effect is targeting you.'
                          : 'A combat event may allow a reaction.',
                        eligibleTokenIds: proposal.target_token_ids,
                        allowAdditional: true,
                      });
                      await onRefresh();
                    } catch (error) { onError(errorMessage(error)); }
                  }}><ShieldAlert /> Open reactions</PanelButton>
                  <PanelButton tone="primary" disabled={busy === proposal.id} onClick={async () => {
                    setBusy(proposal.id);
                    try {
                      const payload = structuredClone(effective.payload);
                      if (payload.targets[0] && damage !== '') payload.targets[0].damage = Number(damage);
                      await resolveProposal(proposal, payload, crypto.randomUUID());
                      await onRefresh();
                    } catch (error) { onError(errorMessage(error)); }
                    finally { setBusy(null); }
                  }}><Gavel /> Resolve</PanelButton>
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ReactionsPanel({ reactions, proposals, tokens, userId, isDm, onRefresh, onError }: Pick<Props,
  'reactions' | 'proposals' | 'tokens' | 'userId' | 'isDm' | 'onRefresh' | 'onError'>) {
  const [text, setText] = useState('');
  const eligible = (window: ReactionWindow) => tokens.filter((token) =>
    token.assigned_user_id === userId &&
    (window.allow_additional || window.eligible_token_ids.includes(token.id)));
  return (
    <div className="panel-section">
      {!reactions.length && <div className="empty-panel">No reaction windows.</div>}
      {reactions.map((window) => {
        const owned = eligible(window);
        const proposal = proposals.find((item) => item.id === window.proposal_id);
        return (
          <article key={window.id} className="reaction-card">
            <header><ShieldAlert /><strong>{window.trigger_text}</strong><span>{window.status}</span></header>
            <p>For: {String(proposal?.source_action?.name ?? 'combat proposal')}</p>
            <p className="panel-note">Choose any recorded reaction, respond freely, pass, or ask the DM. No option is represented as legally valid.</p>
            {!!window.combat_reaction_responses?.length && (
              <div className="reaction-history">
                {window.combat_reaction_responses.map((response) => (
                  <div key={response.id}>
                    <strong>{tokens.find((token) => token.id === response.responder_token_id)?.name ?? 'Participant'}</strong>
                    <span>{response.response_type}: {response.selected_reaction?.name ?? (response.custom_text || 'No text')}</span>
                  </div>
                ))}
              </div>
            )}
            {window.status === 'open' && owned.map((token) => {
              const reactionActions = (token.state.actions ?? []).filter((action) => action.category === 'reaction');
              return (
                <div key={token.id} className="reaction-response">
                  <strong>{token.name}</strong>
                  <select onChange={async (event) => {
                    const action = reactionActions.find((item) => item.id === event.target.value);
                    if (!action) return;
                    await respondToReaction({ windowId: window.id, tokenId: token.id, type: 'reaction', selectedReaction: action });
                    await onRefresh();
                  }} defaultValue="">
                    <option value="" disabled>Select any recorded reaction…</option>
                    {reactionActions.map((action) => <option key={action.id} value={action.id}>{action.name}</option>)}
                  </select>
                  <textarea placeholder="Custom reaction or question…" value={text} onChange={(event) => setText(event.target.value)} />
                  <div className="panel-row">
                    {(['custom', 'pass', 'question'] as const).map((type) => (
                      <PanelButton key={type} onClick={async () => {
                        try {
                          await respondToReaction({ windowId: window.id, tokenId: token.id, type, text });
                          setText('');
                          await onRefresh();
                        } catch (error) { onError(errorMessage(error)); }
                      }}>{type}</PanelButton>
                    ))}
                  </div>
                </div>
              );
            })}
            {isDm && window.status === 'open' && <PanelButton onClick={async () => {
              await closeReactionWindow(window.id);
              await onRefresh();
            }}>Close window</PanelButton>}
          </article>
        );
      })}
    </div>
  );
}

function DmPanel({ encounter, tokens, targetIds, onRefresh, onError }: Pick<Props, 'encounter' | 'tokens' | 'targetIds' | 'onRefresh' | 'onError'>) {
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
    <div className="panel-section">
      <h3>Direct resolution</h3>
      <p className="panel-note">Fast DM-only adjustments still create an atomic resolution, history entry, and undo snapshot.</p>
      <label>Change<select value={kind} onChange={(event) => setKind(event.target.value)}>
        <option value="damage">Deal damage</option><option value="healing">Heal HP</option>
        <option value="temp_hp">Set temporary HP</option><option value="set_hp">Set HP</option>
        <option value="remove_temp">Remove temporary HP</option><option value="add_condition">Add condition</option>
        <option value="remove_condition">Remove condition</option><option value="resource">Spend / restore resource</option>
        <option value="move">Move to grid position</option><option value="unconscious">Mark unconscious</option>
        <option value="dead">Mark dead</option><option value="note">Custom note</option>
      </select></label>
      {!['remove_temp', 'dead', 'unconscious', 'add_condition', 'remove_condition', 'move', 'note'].includes(kind) &&
        <label>{kind === 'resource' ? 'Change (negative spends, positive restores)' : 'Amount'}<input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>}
      {['add_condition', 'remove_condition'].includes(kind) &&
        <label>Condition<input value={condition} onChange={(event) => setCondition(event.target.value)} /></label>}
      {kind === 'resource' && <label>Resource name<input value={resourceName} onChange={(event) => setResourceName(event.target.value)} placeholder="Legend Points" /></label>}
      {kind === 'move' && <div className="field-grid">
        <label>Grid X<input type="number" min="0" value={moveX} onChange={(event) => setMoveX(event.target.value)} /></label>
        <label>Grid Y<input type="number" min="0" value={moveY} onChange={(event) => setMoveY(event.target.value)} /></label>
      </div>}
      <label>Note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <div className="target-summary">Targets: {targets.length ? targets.map((target) => target.name).join(', ') : 'Shift-click tokens on the map'}</div>
      {targets.map((target) => {
        const change = payload().targets.find((item) => item.token_id === target.id)!;
        const preview = previewTarget(target.state.hp, change);
        return <div className="resolution-preview" key={target.id}>
          <strong>{target.name}</strong>
          <span>Before: {preview.before.current} HP, {preview.before.temp} temp</span>
          <span>Final: {preview.after.current} HP, {preview.after.temp} temp</span>
        </div>;
      })}
      <PanelButton tone="primary" disabled={busy || !targets.length} onClick={async () => {
        setBusy(true);
        try {
          await applyDirectResolution(encounter.id, payload(), crypto.randomUUID());
          await onRefresh();
        } catch (error) { onError(errorMessage(error)); }
        finally { setBusy(false); }
      }}><Gavel /> Previewed — Resolve</PanelButton>
      <PanelButton tone="danger" onClick={async () => {
        try { await undoLatestResolution(encounter.id); await onRefresh(); }
        catch (error) { onError(errorMessage(error)); }
      }}><Undo2 /> Undo latest resolution</PanelButton>
    </div>
  );
}

function ChatPanel({ encounter, events, onRefresh, onError }: Pick<Props, 'encounter' | 'events' | 'onRefresh' | 'onError'>) {
  const [message, setMessage] = useState('');
  const submit = async () => {
    if (!message.trim()) return;
    try { await sendChat(encounter.id, message); setMessage(''); await onRefresh(); }
    catch (error) { onError(errorMessage(error)); }
  };
  return (
    <div className="chat-panel">
      <div className="event-feed">
        {events.map((event) => (
          <article key={event.id} className={`event event-${event.event_type}`}>
            <span>{event.event_type}</span><p>{event.message}</p>
            <time>{new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </article>
        ))}
        {!events.length && <div className="empty-panel">Combat history will appear here.</div>}
      </div>
      <div className="chat-compose">
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message everyone…" onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); }
        }} />
        <PanelButton tone="primary" onClick={submit}>Send</PanelButton>
      </div>
    </div>
  );
}

export function CombatPanel(props: Props) {
  const [tab, setTab] = useState<Tab>('turns');
  const visibleTabs = tabs.filter((item) => item.id !== 'dm' || props.isDm);
  return (
    <aside className="combat-panel">
      <nav className="combat-tabs">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} title={label}>
            <Icon /><span>{label}</span>
            {id === 'proposals' && props.proposals.some((proposal) => ['submitted', 'awaiting_dm'].includes(proposal.status)) && <i />}
          </button>
        ))}
      </nav>
      <div className="combat-panel-content">
        {tab === 'turns' && <TurnPanel {...props} />}
        {tab === 'actions' && <ActionsPanel {...props} />}
        {tab === 'proposals' && <ProposalsPanel {...props} />}
        {tab === 'reactions' && <ReactionsPanel {...props} />}
        {tab === 'dm' && <DmPanel {...props} />}
        {tab === 'chat' && <ChatPanel {...props} />}
      </div>
    </aside>
  );
}

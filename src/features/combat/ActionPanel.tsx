import { Crosshair, Dice5, HeartPulse, Plus, RotateCcw, Shield, Sparkles, Target, Trash2, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  AreaTemplate,
  CombatAction,
  CombatEncounter,
  CombatToken,
  ResolutionPayload,
  RollResult,
} from '../../types/combat';
import { formatRoll, rollExpression } from '../../lib/dice/parser';
import {
  actionCategories,
  actionsForToken,
  isSingleTargetAction,
  suggestedAreaTargetIds,
  type ActionCategory,
} from '../../lib/combat/workflow';
import { saveDraft, submitProposal } from './api';
import { TargetSelector } from './TargetSelector';

interface Props {
  encounter: CombatEncounter;
  tokens: CombatToken[];
  userId: string;
  isDm: boolean;
  actorId: string;
  targetIds: string[];
  selectedIds: string[];
  areaTemplate: AreaTemplate | null;
  targetMode: boolean;
  feetPerSquare: number;
  onActorId: (id: string) => void;
  onTargetIds: (ids: string[]) => void;
  onAreaTemplate: (template: AreaTemplate | null) => void;
  onTargetMode: (enabled: boolean) => void;
  onSelectToken: (id: string) => void;
  onFocusToken: (id: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

interface DamageComponentState {
  id: string;
  formula: string;
  type: string;
  include: boolean;
  critical: boolean;
  roll: RollResult | null;
  override: string;
}

type SaveOutcome = 'full' | 'half' | 'none' | 'custom';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';
const finalRollValue = (roll: RollResult | null, override: string) =>
  override === '' ? roll?.total ?? 0 : Number(override) || 0;

const defaultComponent = (index = 0): DamageComponentState => ({
  id: crypto.randomUUID(),
  formula: index ? '1d6' : '1d8',
  type: '',
  include: true,
  critical: false,
  roll: null,
  override: '',
});

function RollBreakdown({ roll }: { roll: RollResult | null }) {
  if (!roll) return <span className="roll-muted">Not rolled yet.</span>;
  return (
    <div className="dice-breakdown">
      <span>{formatRoll(roll)}</span>
      <small>Dice: {roll.dice.map((die) => `${die.kept ? '' : 'discarded '}${die.value}`).join(', ') || 'flat'} · Modifier {roll.modifier >= 0 ? '+' : ''}{roll.modifier}</small>
    </div>
  );
}

export function ActionPanel({
  encounter,
  tokens,
  userId,
  isDm,
  actorId,
  targetIds,
  selectedIds,
  areaTemplate,
  targetMode,
  feetPerSquare,
  onActorId,
  onTargetIds,
  onAreaTemplate,
  onTargetMode,
  onSelectToken,
  onFocusToken,
  onRefresh,
  onError,
}: Props) {
  const actors = tokens.filter((token) => isDm || token.assigned_user_id === userId);
  const actor = actors.find((token) => token.id === actorId) ?? actors[0];
  const allActions = useMemo(() => actor ? actionsForToken(actor) : [], [actor]);
  const firstCategory = actionCategories.find((category) =>
    category.id === 'custom' || allActions.some((action) => action.category === category.id))?.id ?? 'custom';
  const [category, setCategory] = useState<ActionCategory>(firstCategory);
  const categoryActions = allActions.filter((action) => action.category === category);
  const [actionId, setActionId] = useState('');
  const selectedAction = category === 'custom'
    ? undefined
    : categoryActions.find((action) => action.id === actionId) ?? categoryActions[0];

  const [attackFormula, setAttackFormula] = useState('1d20');
  const [attackMode, setAttackMode] = useState<'normal' | 'advantage' | 'disadvantage'>('normal');
  const [attackRoll, setAttackRoll] = useState<RollResult | null>(null);
  const [attackOverride, setAttackOverride] = useState('');
  const [attackNote, setAttackNote] = useState('');
  const [critical, setCritical] = useState(false);
  const [damageComponents, setDamageComponents] = useState<DamageComponentState[]>([defaultComponent()]);
  const [combinedOverride, setCombinedOverride] = useState('');
  const [healingFormula, setHealingFormula] = useState('');
  const [healingRoll, setHealingRoll] = useState<RollResult | null>(null);
  const [healingOverride, setHealingOverride] = useState('');
  const [tempFormula, setTempFormula] = useState('');
  const [tempRoll, setTempRoll] = useState<RollResult | null>(null);
  const [tempOverride, setTempOverride] = useState('');
  const [conditions, setConditions] = useState('');
  const [description, setDescription] = useState('');
  const [saveOutcomes, setSaveOutcomes] = useState<Record<string, SaveOutcome>>({});
  const [saveRolls, setSaveRolls] = useState<Record<string, string>>({});
  const [targetDamageOverrides, setTargetDamageOverrides] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!actor && actors[0]) onActorId(actors[0].id);
  }, [actor, actors, onActorId]);

  useEffect(() => {
    const action = selectedAction;
    const detected = action as (CombatAction & { detectedAttackFormula?: string; detectedDamageFormula?: string }) | undefined;
    setAttackFormula(action?.attackFormula || detected?.detectedAttackFormula || '1d20');
    const formulas = action?.damageFormulas?.length
      ? action.damageFormulas
      : detected?.detectedDamageFormula ? [{ formula: detected.detectedDamageFormula, type: '' }] : [];
    setDamageComponents(formulas.length
      ? formulas.map((item) => ({ ...defaultComponent(), formula: item.formula, type: item.type ?? '' }))
      : [defaultComponent()]);
    const tempEffect = action?.effects?.find((effect) => effect.kind === 'temp_hp');
    setHealingFormula(action?.healingFormula && !tempEffect ? action.healingFormula : '');
    setTempFormula(tempEffect?.formula ?? '');
    setConditions(action?.effects?.filter((effect) => effect.kind === 'condition').map((effect) => effect.condition).filter(Boolean).join(', ') ?? '');
    setDescription(action?.description ?? '');
    setAttackRoll(null);
    setAttackOverride('');
    setCombinedOverride('');
    setHealingRoll(null);
    setHealingOverride('');
    setTempRoll(null);
    setTempOverride('');
    setSaveOutcomes({});
    setSaveRolls({});
    setTargetDamageOverrides({});
    if (action?.area) onAreaTemplate({ ...action.area, x: actor?.x ?? 0, y: actor?.y ?? 0 });
    setActionId(action?.id ?? '');
  }, [selectedAction?.id, category, actor?.id]);

  if (!actor) {
    return (
      <div className="empty-panel useful-empty">
        <Zap /><strong>No controlled combatant</strong>
        <p>The DM must assign a token to you in Setup before you can propose an action.</p>
      </div>
    );
  }

  const calculatedDamage = damageComponents
    .filter((component) => component.include)
    .reduce((total, component) => total + finalRollValue(component.roll, component.override), 0);
  const submittedCombinedDamage = combinedOverride === '' ? calculatedDamage : Math.max(0, Number(combinedOverride) || 0);
  const suggestedIds = suggestedAreaTargetIds(areaTemplate, tokens, actor.id);
  const actionLabel = selectedAction?.name ?? 'Custom Action';
  const attackFinal = finalRollValue(attackRoll, attackOverride);
  const healingFinal = finalRollValue(healingRoll, healingOverride);
  const tempFinal = finalRollValue(tempRoll, tempOverride);

  const rollAttack = () => {
    try { setAttackRoll(rollExpression(attackFormula, { mode: attackMode })); }
    catch (error) { onError(errorMessage(error)); }
  };
  const rollComponent = (componentId: string) => {
    try {
      setDamageComponents((current) => current.map((component) =>
        component.id === componentId
          ? { ...component, roll: rollExpression(component.formula, { critical: critical && component.critical }) }
          : component));
    } catch (error) { onError(errorMessage(error)); }
  };
  const rerollAll = () => {
    try {
      setDamageComponents((current) => current.map((component) => ({
        ...component,
        roll: component.include ? rollExpression(component.formula, { critical: critical && component.critical }) : component.roll,
      })));
    } catch (error) { onError(errorMessage(error)); }
  };

  const submit = async () => {
    if (!targetIds.length) return onError('Select at least one target from the map or target list.');
    setSaving(true);
    try {
      const conditionsAdd = conditions.split(',').map((value) => value.trim()).filter(Boolean);
      const calculatedTargets = targetIds.map((tokenId) => ({
        token_id: tokenId,
        damage: calculatedDamage || undefined,
        healing: healingRoll ? healingRoll.total : undefined,
        temp_hp: tempRoll ? tempRoll.total : undefined,
        conditions_add: conditionsAdd,
      }));
      const playerTargets = targetIds.map((tokenId) => {
        const outcome = saveOutcomes[tokenId] ?? 'full';
        const baseDamage = targetDamageOverrides[tokenId] === ''
          || targetDamageOverrides[tokenId] === undefined
          ? submittedCombinedDamage
          : Math.max(0, Number(targetDamageOverrides[tokenId]) || 0);
        const damage = outcome === 'half'
          ? Math.floor(baseDamage / 2)
          : outcome === 'none' ? 0 : baseDamage;
        return {
          token_id: tokenId,
          damage: damage || undefined,
          healing: healingFinal || undefined,
          temp_hp: tempFinal || undefined,
          conditions_add: conditionsAdd,
        };
      });
      const calculated: ResolutionPayload = { targets: calculatedTargets };
      const playerOverride: ResolutionPayload = { targets: playerTargets };
      const draft = await saveDraft({
        encounterId: encounter.id,
        actorTokenId: actor.id,
        sourceAction: selectedAction ?? {
          category: 'action',
          name: actionLabel,
          cost: '',
          description,
          attackFormula,
          damageFormulas: damageComponents.map(({ formula, type }) => ({ formula, type })),
        },
        targets: targetIds,
        areaTemplate,
        rollData: {
          attack: {
            formula: attackFormula,
            mode: attackMode,
            critical,
            calculated: attackRoll,
            playerOverride: attackOverride === '' ? null : Number(attackOverride),
            final: attackFinal,
            note: attackNote,
          },
          damage: {
            components: damageComponents.map((component) => ({
              formula: component.formula,
              type: component.type,
              include: component.include,
              criticalDoubling: component.critical,
              calculated: component.roll,
              override: component.override === '' ? null : Number(component.override),
              final: finalRollValue(component.roll, component.override),
            })),
            calculatedCombined: calculatedDamage,
            playerCombined: submittedCombinedDamage,
          },
          save: selectedAction?.saveAbility ? {
            ability: selectedAction.saveAbility,
            dc: selectedAction.saveDc,
            outcomes: saveOutcomes,
            rolls: saveRolls,
          } : null,
          healing: { formula: healingFormula, calculated: healingRoll, override: healingOverride, final: healingFinal },
          temporaryHp: { formula: tempFormula, calculated: tempRoll, override: tempOverride, final: tempFinal },
        },
        calculated,
        playerOverride,
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
    <div className="panel-section action-workflow" data-testid="actions-panel">
      <section className="actor-card" data-testid="actor-summary">
        <span className="actor-avatar">{actor.state.icon || actor.name.slice(0, 2).toUpperCase()}</span>
        <div>
          <small>Acting combatant</small>
          <select aria-label="Acting combatant" value={actor.id} onChange={(event) => {
            onActorId(event.target.value);
            onSelectToken(event.target.value);
          }}>
            {actors.map((token) => <option key={token.id} value={token.id}>{token.name}</option>)}
          </select>
          <p>{actor.state.hp.current}/{actor.state.hp.max} HP · +{actor.state.hp.temp} temp · {actor.state.speed || 'Speed not recorded'}</p>
          <p>{actor.state.conditions.length ? actor.state.conditions.join(', ') : 'No conditions'} · {actor.state.resourcePools.map((pool) => `${pool.name} ${pool.current}/${pool.max}`).join(' · ') || 'No limited resources'}</p>
        </div>
        <button type="button" onClick={() => onFocusToken(actor.id)} title="Center actor on map"><Crosshair /></button>
      </section>

      <section>
        <h3>Ability category</h3>
        <div className="action-categories" role="tablist" aria-label="Action categories">
          {actionCategories.map((item) => {
            const count = item.id === 'custom' ? 1 : allActions.filter((action) => action.category === item.id).length;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={category === item.id}
                className={category === item.id ? 'active' : ''}
                key={item.id}
                onClick={() => setCategory(item.id)}
                data-testid={`action-category-${item.id}`}
              >
                {item.label}<i>{count}</i>
              </button>
            );
          })}
        </div>
        {category !== 'custom' && !categoryActions.length ? (
          <div className="category-empty">{actionCategories.find((item) => item.id === category)?.empty}</div>
        ) : (
          <div className="action-choice-grid">
            {categoryActions.map((action) => (
              <button type="button" key={action.id} className={selectedAction?.id === action.id ? 'active' : ''} onClick={() => setActionId(action.id ?? '')}>
                <strong>{action.name}</strong><small>{action.cost || action.category}</small>
              </button>
            ))}
            {category === 'custom' && <button type="button" className="active"><strong>Custom Action</strong><small>Fully editable</small></button>}
          </div>
        )}
      </section>

      <section className="action-detail" data-testid="action-detail">
        <header><Sparkles /><div><small>{selectedAction?.category ?? 'custom'} · {selectedAction?.cost || 'No recorded cost'}</small><h3>{actionLabel}</h3></div></header>
        <p>{description || 'Describe any action, roll, or effect. Legacy actions remain fully editable and advisory.'}</p>
        <dl>
          <div><dt>Range</dt><dd>{selectedAction?.range || 'Not recorded'}</dd></div>
          <div><dt>Targets</dt><dd>{selectedAction?.targetType || 'Player choice'}</dd></div>
          <div><dt>Save</dt><dd>{selectedAction?.saveAbility ? `${selectedAction.saveAbility} DC ${selectedAction.saveDc ?? 'editable'}` : 'None recorded'}</dd></div>
          <div><dt>Resources</dt><dd>{selectedAction?.resourceCosts?.map((cost) => `${cost.name ?? cost.resourceId}: ${cost.amount}`).join(', ') || 'None'}</dd></div>
        </dl>
        <label>Editable description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      </section>

      <section className="calculator-section" data-testid="attack-calculator">
        <header><Dice5 /><div><h3>Attack roll</h3><p>Attack totals never become damage automatically.</p></div></header>
        <div className="field-grid">
          <label>Attack formula<input value={attackFormula} onChange={(event) => setAttackFormula(event.target.value)} /></label>
          <label>Roll mode<select value={attackMode} onChange={(event) => setAttackMode(event.target.value as typeof attackMode)}>
            <option value="normal">Normal</option><option value="advantage">Advantage</option><option value="disadvantage">Disadvantage</option>
          </select></label>
        </div>
        <div className="panel-row">
          <button type="button" className="panel-button primary" onClick={rollAttack} data-testid="roll-attack">Roll attack</button>
          <label className="check-row"><input type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} /> Critical hit</label>
        </div>
        <RollBreakdown roll={attackRoll} />
        <div className="field-grid">
          <label>Player attack override<input type="number" value={attackOverride} onChange={(event) => setAttackOverride(event.target.value)} placeholder={String(attackRoll?.total ?? '')} /></label>
          <label>Final submitted attack<input readOnly value={attackRoll ? attackFinal : ''} /></label>
        </div>
        <label>Attack note<input value={attackNote} onChange={(event) => setAttackNote(event.target.value)} placeholder="Optional context for the DM" /></label>
      </section>

      {selectedAction?.saveAbility && (
        <section className="calculator-section" data-testid="saving-throw-calculator">
          <header><Shield /><div><h3>Saving throw outcomes</h3><p>{selectedAction.saveAbility} · DC {selectedAction.saveDc ?? 'editable'} · the application does not force a rules interpretation.</p></div></header>
          {targetIds.map((targetId) => {
            const target = tokens.find((token) => token.id === targetId);
            if (!target) return null;
            return (
              <div className="save-target-row" key={targetId} data-testid={`save-target-${targetId}`}>
                <strong>{target.name}</strong>
                <label>Optional roll<input type="number" value={saveRolls[targetId] ?? ''} onChange={(event) => setSaveRolls({ ...saveRolls, [targetId]: event.target.value })} /></label>
                <label>Outcome<select value={saveOutcomes[targetId] ?? 'full'} onChange={(event) => setSaveOutcomes({ ...saveOutcomes, [targetId]: event.target.value as SaveOutcome })}>
                  <option value="full">Full damage</option><option value="half">Half damage</option>
                  <option value="none">No damage</option><option value="custom">Custom amount</option>
                </select></label>
                {(saveOutcomes[targetId] ?? 'full') === 'custom' && <label>Custom damage<input type="number" value={targetDamageOverrides[targetId] ?? ''} onChange={(event) => setTargetDamageOverrides({ ...targetDamageOverrides, [targetId]: event.target.value })} /></label>}
              </div>
            );
          })}
          {!targetIds.length && <p className="panel-note">Choose targets to enter independent save outcomes.</p>}
        </section>
      )}

      <section className="calculator-section" data-testid="damage-calculator">
        <header><Zap /><div><h3>Damage calculator</h3><p>Each component is independent, editable, and optional.</p></div></header>
        <div className="damage-components">
          {damageComponents.map((component, index) => (
            <article key={component.id} data-testid={`damage-component-${index}`}>
              <header><strong>Component {index + 1}</strong><button type="button" onClick={() => setDamageComponents((current) => current.filter((item) => item.id !== component.id))} disabled={damageComponents.length === 1} title="Remove component"><Trash2 /></button></header>
              <div className="field-grid">
                <label>Formula<input value={component.formula} onChange={(event) => setDamageComponents((current) => current.map((item) => item.id === component.id ? { ...item, formula: event.target.value } : item))} /></label>
                <label>Damage type<input value={component.type} onChange={(event) => setDamageComponents((current) => current.map((item) => item.id === component.id ? { ...item, type: event.target.value } : item))} /></label>
              </div>
              <div className="component-options">
                <label><input type="checkbox" checked={component.include} onChange={(event) => setDamageComponents((current) => current.map((item) => item.id === component.id ? { ...item, include: event.target.checked } : item))} /> Include</label>
                <label><input type="checkbox" checked={component.critical} onChange={(event) => setDamageComponents((current) => current.map((item) => item.id === component.id ? { ...item, critical: event.target.checked } : item))} /> Double dice on critical</label>
                <button type="button" onClick={() => rollComponent(component.id)}><RotateCcw /> Roll component</button>
              </div>
              <RollBreakdown roll={component.roll} />
              <label>Manual subtotal override<input type="number" value={component.override} onChange={(event) => setDamageComponents((current) => current.map((item) => item.id === component.id ? { ...item, override: event.target.value } : item))} placeholder={String(component.roll?.total ?? '')} /></label>
            </article>
          ))}
        </div>
        <div className="panel-row">
          <button type="button" className="panel-button" onClick={() => setDamageComponents((current) => [...current, defaultComponent(current.length)])}><Plus /> Add component</button>
          <button type="button" className="panel-button primary" onClick={rerollAll} data-testid="roll-all-damage"><Dice5 /> Roll all damage</button>
        </div>
        <div className="damage-total">
          <div><small>Calculated combined</small><strong>{calculatedDamage}</strong></div>
          <label>Player-edited combined<input type="number" value={combinedOverride} onChange={(event) => setCombinedOverride(event.target.value)} placeholder={String(calculatedDamage)} /></label>
          <div><small>Submitted damage</small><strong data-testid="submitted-damage">{submittedCombinedDamage}</strong></div>
        </div>
        <div className="panel-row">
          <button type="button" className="panel-button" onClick={() => setCombinedOverride(String(Math.floor(submittedCombinedDamage / 2)))}>Apply half</button>
          <button type="button" className="panel-button" onClick={() => setCombinedOverride(String(submittedCombinedDamage * 2))}>Apply double</button>
          <button type="button" className="panel-button" onClick={() => setCombinedOverride('')}>Use calculated</button>
        </div>
      </section>

      <section className="calculator-section support-calculators">
        <header><HeartPulse /><div><h3>Healing and temporary HP</h3><p>These calculations are separate from attack and damage.</p></div></header>
        <div className="support-calculator" data-testid="healing-calculator">
          <label>Healing formula<input value={healingFormula} onChange={(event) => setHealingFormula(event.target.value)} placeholder="6d12 + 20" /></label>
          <button type="button" className="panel-button" disabled={!healingFormula} onClick={() => {
            try { setHealingRoll(rollExpression(healingFormula)); } catch (error) { onError(errorMessage(error)); }
          }}>Roll healing</button>
          <RollBreakdown roll={healingRoll} />
          <label>Healing override<input type="number" value={healingOverride} onChange={(event) => setHealingOverride(event.target.value)} /></label>
        </div>
        <div className="support-calculator" data-testid="temp-hp-calculator">
          <label>Temporary HP formula<input value={tempFormula} onChange={(event) => setTempFormula(event.target.value)} placeholder="4d10 + 12" /></label>
          <button type="button" className="panel-button" disabled={!tempFormula} onClick={() => {
            try { setTempRoll(rollExpression(tempFormula)); } catch (error) { onError(errorMessage(error)); }
          }}>Roll temporary HP</button>
          <RollBreakdown roll={tempRoll} />
          <label>Temporary HP override<input type="number" value={tempOverride} onChange={(event) => setTempOverride(event.target.value)} /></label>
        </div>
      </section>

      <section className="calculator-section area-controls">
        <header><Target /><div><h3>Area and targets</h3><p>Use map targeting mode or the synchronized list below.</p></div></header>
        <div className="panel-row">
          <button type="button" className={`panel-button ${targetMode ? 'primary' : ''}`} onClick={() => onTargetMode(!targetMode)} data-testid="select-targets-mode"><Target /> {targetMode ? 'Targeting active' : 'Select Targets'}</button>
          <button type="button" className="panel-button" onClick={() => onTargetIds([])}>Clear Targets</button>
        </div>
        <div className="field-grid three">
          <label>Area template<select value={areaTemplate?.shape ?? ''} onChange={(event) => {
            const shape = event.target.value as AreaTemplate['shape'] | '';
            onAreaTemplate(shape ? { shape, x: actor.x, y: actor.y, width: 3, height: 3, rotation: 0 } : null);
          }}>
            <option value="">None</option><option value="circle">Circle</option><option value="square">Square</option>
            <option value="rectangle">Rectangle</option><option value="cone">Cone</option><option value="line">Line</option>
          </select></label>
          {areaTemplate && <label>Width<input type="number" min="1" value={areaTemplate.width} onChange={(event) => onAreaTemplate({ ...areaTemplate, width: Number(event.target.value) })} /></label>}
          {areaTemplate && <label>Height<input type="number" min="1" value={areaTemplate.height} onChange={(event) => onAreaTemplate({ ...areaTemplate, height: Number(event.target.value) })} /></label>}
        </div>
        {areaTemplate && (
          <div className="suggested-targets">
            <span>Suggested by area: {suggestedIds.map((id) => tokens.find((token) => token.id === id)?.name).filter(Boolean).join(', ') || 'none'}</span>
            <button type="button" onClick={() => onTargetIds([...new Set([...targetIds, ...suggestedIds])])}>Add suggested</button>
          </div>
        )}
        <TargetSelector
          title="Action targets"
          tokens={tokens}
          actor={actor}
          selectedIds={targetIds}
          selectedTokenIds={selectedIds}
          feetPerSquare={feetPerSquare}
          onChange={onTargetIds}
          onFocus={onFocusToken}
          testId="action-target-selector"
        />
        {isSingleTargetAction(selectedAction) && (
          <p className="panel-note">Recorded as a single-target ability. One target is typical, but you may override that advisory selection.</p>
        )}
      </section>

      <label>Conditions to add<input value={conditions} onChange={(event) => setConditions(event.target.value)} placeholder="Prone, Frightened" /></label>
      <footer className="sticky-submit">
        <div><strong>{actionLabel}</strong><small>{targetIds.length} target(s) · attack {attackRoll ? attackFinal : 'not rolled'} · damage {submittedCombinedDamage}</small></div>
        <button type="button" className="panel-button primary" disabled={saving || !targetIds.length} onClick={submit} data-testid="submit-proposal">{saving ? 'Submitting…' : 'Submit proposal'}</button>
      </footer>
      {!targetIds.length && <p className="disabled-explanation">Choose at least one target to submit. Map targeting and the panel checklist stay synchronized.</p>}
    </div>
  );
}

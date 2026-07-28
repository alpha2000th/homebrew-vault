import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Crosshair,
  Dice5,
  Footprints,
  HeartPulse,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trash2,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AreaTemplate,
  AttackEntry,
  CombatAction,
  CombatEncounter,
  CombatToken,
  DamageComponent,
  GuidedActionStep,
  GuidedEffectRoute,
  ResolutionPayload,
  RollResult,
  SuggestedOutcome,
  TargetOutcome,
  UtilityEffect,
} from '../../types/combat';
import { formatRoll, rollExpression } from '../../lib/dice/parser';
import {
  applyDeferredResourceCosts,
  availableCommandCategories,
  buildMultiattackEntries,
  damageComponentsFor,
  isLegacyAction,
  isMultiattack,
  nextGuidedStep,
  resolutionTargetsFromDraft,
  resourceCostsFor,
  routeForAction,
  utilityEffectsFor,
} from '../../lib/combat/guidedAction';
import { actionsForToken, isSingleTargetAction, suggestedAreaTargetIds, type ActionCategory } from '../../lib/combat/workflow';
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

interface HealingState {
  formula: string;
  roll: RollResult | null;
  override: string;
  flatBonus: string;
}

const legacyRoutes: Array<{ id: GuidedEffectRoute; label: string; detail: string }> = [
  { id: 'attack', label: 'Attack', detail: 'Attack roll, then damage' },
  { id: 'damage', label: 'Damage', detail: 'Damage without an attack roll' },
  { id: 'saving_throw', label: 'Saving Throw', detail: 'Per-target suggested outcomes' },
  { id: 'healing', label: 'Healing', detail: 'Restore hit points' },
  { id: 'temporary_hp', label: 'Temporary HP', detail: 'Grant temporary hit points' },
  { id: 'utility', label: 'Utility', detail: 'Conditions, movement, or another effect' },
  { id: 'multiattack', label: 'Multiattack', detail: 'Several editable attacks in one proposal' },
  { id: 'custom', label: 'Custom', detail: 'Build a permissive custom effect' },
];

const stepLabels: Partial<Record<GuidedActionStep, string>> = {
  choose_category: 'Command',
  choose_ability: 'Ability',
  ability_detail: 'Ability',
  legacy_route: 'Route',
  choose_targets: 'Targets',
  place_area: 'Area',
  attack_roll: 'Attack',
  saving_throw: 'Save',
  damage: 'Damage',
  healing: 'Healing',
  temporary_hp: 'Temp HP',
  utility_effects: 'Effects',
  multiattack: 'Multiattack',
  review: 'Review',
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';
const finalRollValue = (roll: RollResult | null, override: string) =>
  override === '' ? roll?.total ?? 0 : Math.max(0, Number(override) || 0);
const makeId = () => crypto.randomUUID();

const blankDamageComponent = (source = 'Extra damage', formula = '1d6'): DamageComponent => ({
  id: makeId(),
  formula,
  damageType: '',
  source,
  roll: null,
  calculatedSubtotal: 0,
  playerOverride: null,
  finalSubtotal: 0,
  criticalDoubling: true,
  included: true,
});

const blankUtilityEffect = (): UtilityEffect => ({
  id: makeId(),
  kind: 'note',
  text: '',
  duration: '',
  saveEnds: false,
});

function RollBreakdown({ roll }: { roll: RollResult | null }) {
  if (!roll) return <span className="roll-muted">Not rolled yet.</span>;
  return (
    <div className="dice-breakdown">
      <span>{formatRoll(roll)}</span>
      <small>
        Dice: {roll.dice.map((die) => `${die.kept ? '' : 'discarded '}${die.value}`).join(', ') || 'flat'}
        {' · '}Modifier {roll.modifier >= 0 ? '+' : ''}{roll.modifier}
      </small>
    </div>
  );
}

function StepProgress({ steps, current }: { steps: GuidedActionStep[]; current: GuidedActionStep }) {
  const currentIndex = steps.indexOf(current);
  return (
    <ol className="guided-progress" aria-label="Action progress">
      {steps.map((step, index) => (
        <li key={step} className={index === currentIndex ? 'current' : index < currentIndex ? 'complete' : ''}>
          <span>{index < currentIndex ? <Check /> : index + 1}</span>
          <small>{stepLabels[step] ?? step}</small>
        </li>
      ))}
    </ol>
  );
}

function StepHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="guided-step-heading">
      <small>{eyebrow}</small>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </header>
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
  const [step, setStep] = useState<GuidedActionStep>('choose_category');
  const [history, setHistory] = useState<GuidedActionStep[]>([]);
  const [category, setCategory] = useState<ActionCategory>('action');
  const [selectedAction, setSelectedAction] = useState<CombatAction | null>(null);
  const [legacyRoute, setLegacyRoute] = useState<GuidedEffectRoute | null>(null);
  const [description, setDescription] = useState('');
  const [attackFormula, setAttackFormula] = useState('1d20');
  const [attackMode, setAttackMode] = useState<'normal' | 'advantage' | 'disadvantage'>('normal');
  const [attackRoll, setAttackRoll] = useState<RollResult | null>(null);
  const [attackOverride, setAttackOverride] = useState('');
  const [attackOutcome, setAttackOutcome] = useState<SuggestedOutcome>('awaiting_dm');
  const [attackNote, setAttackNote] = useState('');
  const [critical, setCritical] = useState(false);
  const [damageComponents, setDamageComponents] = useState<DamageComponent[]>([]);
  const [combinedOverride, setCombinedOverride] = useState('');
  const [targetOutcomes, setTargetOutcomes] = useState<Record<string, TargetOutcome>>({});
  const [healing, setHealing] = useState<HealingState>({ formula: '', roll: null, override: '', flatBonus: '0' });
  const [temporaryHp, setTemporaryHp] = useState<HealingState>({ formula: '', roll: null, override: '', flatBonus: '0' });
  const [utilityEffects, setUtilityEffects] = useState<UtilityEffect[]>([]);
  const [multiattackEntries, setMultiattackEntries] = useState<AttackEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const hydratedKey = useRef('');
  const storageKey = actor ? `combat-guided-draft:${encounter.id}:${actor.id}` : '';

  const go = (next: GuidedActionStep) => {
    setHistory((current) => [...current, step]);
    setStep(next);
    setCancelArmed(false);
  };
  const back = () => {
    setHistory((current) => {
      const previous = current[current.length - 1] ?? 'choose_category';
      setStep(previous);
      return current.slice(0, -1);
    });
    setCancelArmed(false);
  };

  const reset = () => {
    if (storageKey) localStorage.removeItem(storageKey);
    setStep('choose_category');
    setHistory([]);
    setCategory('action');
    setSelectedAction(null);
    setLegacyRoute(null);
    setDescription('');
    setAttackFormula('1d20');
    setAttackRoll(null);
    setAttackOverride('');
    setAttackOutcome('awaiting_dm');
    setAttackNote('');
    setCritical(false);
    setDamageComponents([]);
    setCombinedOverride('');
    setTargetOutcomes({});
    setHealing({ formula: '', roll: null, override: '', flatBonus: '0' });
    setTemporaryHp({ formula: '', roll: null, override: '', flatBonus: '0' });
    setUtilityEffects([]);
    setMultiattackEntries([]);
    onTargetIds([]);
    onAreaTemplate(null);
    onTargetMode(false);
    setCancelArmed(false);
  };

  useEffect(() => {
    if (!actor && actors[0]) onActorId(actors[0].id);
  }, [actor, actors, onActorId]);

  useEffect(() => {
    if (!storageKey || hydratedKey.current === storageKey) return;
    hydratedKey.current = storageKey;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft.schemaVersion !== 2 || draft.encounterId !== encounter.id || draft.actorTokenId !== actor?.id) return;
      setStep(draft.step ?? 'choose_category');
      setHistory(Array.isArray(draft.history) ? draft.history : []);
      setCategory(draft.category ?? 'action');
      setSelectedAction(draft.selectedAction ?? null);
      setLegacyRoute(draft.legacyRoute ?? null);
      setDescription(draft.description ?? '');
      setAttackFormula(draft.attackFormula ?? '1d20');
      setAttackMode(draft.attackMode ?? 'normal');
      setAttackRoll(draft.attackRoll ?? null);
      setAttackOverride(draft.attackOverride ?? '');
      setAttackOutcome(draft.attackOutcome ?? 'awaiting_dm');
      setAttackNote(draft.attackNote ?? '');
      setCritical(Boolean(draft.critical));
      setDamageComponents(draft.damageComponents ?? []);
      setCombinedOverride(draft.combinedOverride ?? '');
      setTargetOutcomes(draft.targetOutcomes ?? {});
      setHealing(draft.healing ?? { formula: '', roll: null, override: '', flatBonus: '0' });
      setTemporaryHp(draft.temporaryHp ?? { formula: '', roll: null, override: '', flatBonus: '0' });
      setUtilityEffects(draft.utilityEffects ?? []);
      setMultiattackEntries(draft.multiattackEntries ?? []);
      onTargetIds(draft.targetIds ?? []);
      onAreaTemplate(draft.areaTemplate ?? null);
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, actor?.id, encounter.id, onAreaTemplate, onTargetIds]);

  useEffect(() => {
    if (!storageKey || hydratedKey.current !== storageKey || step === 'choose_category') return;
    localStorage.setItem(storageKey, JSON.stringify({
      schemaVersion: 2,
      encounterId: encounter.id,
      actorTokenId: actor?.id,
      step,
      history,
      category,
      selectedAction,
      legacyRoute,
      description,
      attackFormula,
      attackMode,
      attackRoll,
      attackOverride,
      attackOutcome,
      attackNote,
      critical,
      damageComponents,
      combinedOverride,
      targetOutcomes,
      healing,
      temporaryHp,
      utilityEffects,
      multiattackEntries,
      targetIds,
      areaTemplate,
      updatedAt: new Date().toISOString(),
    }));
  }, [
    storageKey, encounter.id, actor?.id, step, history, category, selectedAction, legacyRoute, description,
    attackFormula, attackMode, attackRoll, attackOverride, attackOutcome, attackNote, critical,
    damageComponents, combinedOverride, targetOutcomes, healing, temporaryHp, utilityEffects,
    multiattackEntries, targetIds, areaTemplate,
  ]);

  if (!actor) {
    return (
      <div className="empty-panel useful-empty">
        <Zap /><strong>No controlled combatant</strong>
        <p>The DM must assign a token to you in Setup before you can propose an action.</p>
      </div>
    );
  }

  const commands = availableCommandCategories(allActions, actor);
  const categoryActions = allActions.filter((action) => action.category === category);
  const route = selectedAction ? routeForAction(selectedAction, legacyRoute) : [];
  const visibleProgress = ['choose_category', 'choose_ability', 'ability_detail', 'legacy_route'].includes(step)
    ? ['choose_category', 'choose_ability', 'ability_detail'] as GuidedActionStep[]
    : route;
  const calculatedDamage = damageComponents
    .filter((component) => component.included)
    .reduce((sum, component) => sum + component.calculatedSubtotal, 0);
  const playerDamage = combinedOverride === ''
    ? damageComponents.filter((component) => component.included).reduce((sum, component) => sum + component.finalSubtotal, 0)
    : Math.max(0, Number(combinedOverride) || 0);
  const attackFinal = finalRollValue(attackRoll, attackOverride);
  const suggestedIds = suggestedAreaTargetIds(areaTemplate, tokens, actor.id);
  const meaningful = step !== 'choose_category' || Boolean(selectedAction) || targetIds.length > 0 || attackRoll || damageComponents.some((item) => item.roll);

  const selectAbility = (action: CombatAction) => {
    setSelectedAction(action);
    setLegacyRoute(null);
    setDescription(action.description ?? '');
    setAttackFormula(action.attackFormula ?? '1d20');
    setAttackRoll(null);
    setAttackOverride('');
    setAttackOutcome('awaiting_dm');
    setDamageComponents(damageComponentsFor(action));
    const tempEffect = action.effects?.find((effect) => effect.kind === 'temp_hp');
    setHealing({ formula: tempEffect ? '' : action.healingFormula ?? '', roll: null, override: '', flatBonus: '0' });
    setTemporaryHp({ formula: tempEffect?.formula ?? '', roll: null, override: '', flatBonus: '0' });
    setUtilityEffects(utilityEffectsFor(action));
    setMultiattackEntries(isMultiattack(action) ? buildMultiattackEntries(action, allActions) : []);
    onAreaTemplate(action.area ? { ...action.area, x: actor.x, y: actor.y } : null);
    if (/self/i.test(action.targetType ?? '')) onTargetIds([actor.id]);
    go('ability_detail');
  };

  const continueFromDetail = () => go(nextGuidedStep('ability_detail', selectedAction, legacyRoute));
  const continueStep = () => go(nextGuidedStep(step, selectedAction, legacyRoute));

  const rollAttack = () => {
    try { setAttackRoll(rollExpression(attackFormula, { mode: attackMode })); }
    catch (error) { onError(errorMessage(error)); }
  };

  const rollDamage = (componentId: string) => {
    try {
      setDamageComponents((current) => current.map((component) => {
        if (component.id !== componentId) return component;
        const roll = rollExpression(component.formula, { critical: critical && component.criticalDoubling });
        return {
          ...component,
          roll,
          calculatedSubtotal: roll.total,
          finalSubtotal: component.playerOverride ?? roll.total,
        };
      }));
    } catch (error) { onError(errorMessage(error)); }
  };

  const rollAllDamage = () => {
    try {
      setDamageComponents((current) => current.map((component) => {
        if (!component.included) return component;
        const roll = rollExpression(component.formula, { critical: critical && component.criticalDoubling });
        return {
          ...component,
          roll,
          calculatedSubtotal: roll.total,
          finalSubtotal: component.playerOverride ?? roll.total,
        };
      }));
    } catch (error) { onError(errorMessage(error)); }
  };

  const submit = async () => {
    if (!targetIds.length) return onError('Select at least one target from the map or target list.');
    setSaving(true);
    setStep('submitting');
    try {
      const guidedDraft = {
        schemaVersion: 2 as const,
        encounterId: encounter.id,
        actorTokenId: actor.id,
        category: category === 'custom' ? 'custom' as const : category,
        step: 'review' as const,
        history,
        sourceAction: selectedAction,
        legacyRoute,
        targetIds,
        targetOutcomes,
        areaTemplate,
        attackEntry: {
          id: 'primary',
          name: selectedAction?.name ?? 'Custom Action',
          sourceActionId: selectedAction?.id,
          targetIds,
          attackFormula,
          attackRoll,
          attackOverride: attackOverride === '' ? null : Number(attackOverride),
          suggestedOutcome: attackOutcome,
          damageComponents,
          effects: utilityEffects,
          skipped: false,
        },
        multiattackEntries,
        damageComponents,
        healing: healing.formula ? {
          formula: healing.formula,
          roll: healing.roll,
          calculated: (healing.roll?.total ?? 0) + (Number(healing.flatBonus) || 0),
          playerOverride: healing.override === '' ? null : Number(healing.override),
          flatBonus: Number(healing.flatBonus) || 0,
        } : null,
        temporaryHp: temporaryHp.formula ? {
          effectType: 'temporary_hp' as const,
          formula: temporaryHp.formula,
          roll: temporaryHp.roll,
          calculated: (temporaryHp.roll?.total ?? 0) + (Number(temporaryHp.flatBonus) || 0),
          playerOverride: temporaryHp.override === '' ? null : Number(temporaryHp.override),
          flatBonus: Number(temporaryHp.flatBonus) || 0,
        } : null,
        utilityEffects,
        resourceCosts: resourceCostsFor(selectedAction),
        note: attackNote,
        updatedAt: new Date().toISOString(),
      };
      const playerPayload = applyDeferredResourceCosts(
        { targets: resolutionTargetsFromDraft(guidedDraft) },
        actor.id,
        guidedDraft.resourceCosts,
      );
      const calculatedTargets = guidedDraft.targetIds.map((tokenId) => ({
        token_id: tokenId,
        damage: calculatedDamage || undefined,
        healing: healing.roll?.total || undefined,
        temp_hp: temporaryHp.roll?.total || undefined,
        conditions_add: utilityEffects.filter((effect) => effect.kind === 'condition').map((effect) => effect.text).filter(Boolean),
      }));
      const calculatedPayload = applyDeferredResourceCosts(
        { targets: calculatedTargets },
        actor.id,
        guidedDraft.resourceCosts,
      );
      const draft = await saveDraft({
        encounterId: encounter.id,
        actorTokenId: actor.id,
        sourceAction: selectedAction ?? {
          category: 'action',
          name: 'Custom Action',
          cost: '',
          description,
        },
        targets: targetIds,
        areaTemplate,
        rollData: {
          schemaVersion: 2,
          guidedDraft,
          attack: {
            formula: attackFormula,
            mode: attackMode,
            calculated: attackRoll,
            playerOverride: attackOverride === '' ? null : Number(attackOverride),
            final: attackFinal,
            outcome: attackOutcome,
            critical,
            note: attackNote,
          },
          damage: {
            components: damageComponents,
            calculatedCombined: calculatedDamage,
            playerCombined: playerDamage,
          },
          multiattack: multiattackEntries,
          targetOutcomes,
        },
        calculated: calculatedPayload,
        playerOverride: playerPayload,
        description,
      });
      await submitProposal(draft.id, draft.version);
      localStorage.removeItem(storageKey);
      setStep('submitted');
      await onRefresh();
    } catch (error) {
      setStep('review');
      onError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const footer = (options?: { next?: boolean; nextLabel?: string; disabled?: boolean; submit?: boolean }) => (
    <footer className="guided-footer">
      <div className="guided-footer-left">
        {history.length > 0 && <button type="button" className="panel-button" onClick={back} data-testid="guided-back"><ArrowLeft /> Back</button>}
        <button type="button" className={`panel-button ${cancelArmed ? 'danger' : ''}`} onClick={() => {
          if (!meaningful || cancelArmed) reset();
          else setCancelArmed(true);
        }} data-testid="guided-cancel">{cancelArmed ? 'Confirm discard' : 'Cancel'}</button>
      </div>
      {options?.submit ? (
        <button type="button" className="panel-button primary guided-next" disabled={saving || options.disabled} onClick={() => void submit()} data-testid="submit-proposal">
          {saving ? 'Submitting…' : 'Submit to DM'} <ArrowRight />
        </button>
      ) : options?.next ? (
        <button type="button" className="panel-button primary guided-next" disabled={options.disabled} onClick={continueStep} data-testid="guided-next">
          {options.nextLabel ?? 'Next'} <ArrowRight />
        </button>
      ) : null}
    </footer>
  );

  const runningSummary = selectedAction && !['choose_category', 'choose_ability', 'ability_detail', 'legacy_route'].includes(step) && (
    <details className="guided-running-summary" open>
      <summary><strong>{selectedAction.name}</strong><span>{targetIds.length} target{targetIds.length === 1 ? '' : 's'} · {playerDamage} damage</span></summary>
      <div>
        <span>Actor <b>{actor.name}</b></span>
        <span>Targets <b>{targetIds.map((id) => tokens.find((token) => token.id === id)?.name).filter(Boolean).join(', ') || 'None'}</b></span>
        {attackRoll && <span>Attack <b>{attackFinal} · {attackOutcome.replace('_', ' ')}</b></span>}
        {damageComponents.length > 0 && <span>Damage <b>{playerDamage}</b></span>}
      </div>
    </details>
  );

  return (
    <div className="panel-section action-workflow guided-action-workflow" data-testid="actions-panel">
      <section className="actor-card" data-testid="actor-summary">
        <span className="actor-avatar">{actor.state.icon || actor.name.slice(0, 2).toUpperCase()}</span>
        <div>
          <small>Acting combatant</small>
          <select aria-label="Acting combatant" value={actor.id} onChange={(event) => {
            onActorId(event.target.value);
            onSelectToken(event.target.value);
            reset();
          }}>
            {actors.map((token) => <option key={token.id} value={token.id}>{token.name}</option>)}
          </select>
          <p>{actor.state.hp.current}/{actor.state.hp.max} HP · +{actor.state.hp.temp} temp · {actor.state.speed || 'Speed not recorded'}</p>
          <p>{actor.state.conditions.length ? actor.state.conditions.join(', ') : 'No conditions'} · {actor.state.resourcePools.map((pool) => `${pool.name} ${pool.current}/${pool.max}`).join(' · ') || 'No limited resources'}</p>
        </div>
        <button type="button" onClick={() => onFocusToken(actor.id)} title="Center actor on map"><Crosshair /></button>
      </section>

      {visibleProgress.length > 0 && <StepProgress steps={visibleProgress} current={step} />}
      {runningSummary}

      <div className="guided-step" key={step}>
        {step === 'choose_category' && (
          <>
            <StepHeading eyebrow="Choose a command" title={`What will ${actor.name} do?`}>
              Pick one command. Only options recorded for this combatant are enabled.
            </StepHeading>
            <div className="command-grid" data-testid="guided-command-menu">
              {commands.filter((command) => command.available || ['action', 'bonus', 'legendary'].includes(command.id)).map((command) => {
                const Icon = command.id === 'movement' ? Footprints : command.id === 'end_turn' ? Check : command.id === 'custom' ? WandSparkles : Swords;
                return (
                  <button
                    key={command.id}
                    type="button"
                    disabled={!command.available}
                    data-testid={`action-category-${command.id}`}
                    onClick={() => {
                      if (command.id === 'end_turn') {
                        const endTurn: CombatAction = { category: 'action', name: 'End Turn', cost: '', description: 'The acting combatant ends its turn.', targetType: 'Self', effects: [{ kind: 'note' }] };
                        setCategory('custom');
                        setSelectedAction(endTurn);
                        setDescription(endTurn.description);
                        setUtilityEffects([{ ...blankUtilityEffect(), text: endTurn.description }]);
                        onTargetIds([actor.id]);
                        go('review');
                        return;
                      }
                      if (command.id === 'movement') {
                        const movement: CombatAction = { category: 'action', name: 'Movement', cost: '', description: 'Propose movement or another positional change.', targetType: 'Self' };
                        setCategory('custom');
                        setSelectedAction(movement);
                        setDescription(movement.description);
                        setUtilityEffects([{ ...blankUtilityEffect(), kind: 'movement', text: '' }]);
                        onTargetIds([actor.id]);
                        go('utility_effects');
                        return;
                      }
                      if (command.id === 'custom') {
                        const custom: CombatAction = { category: 'action', name: 'Custom Action', cost: '', description: 'Describe any permissive custom action.' };
                        setCategory('custom');
                        setSelectedAction(custom);
                        setDescription(custom.description);
                        setLegacyRoute('custom');
                        setUtilityEffects([blankUtilityEffect()]);
                        go('ability_detail');
                        return;
                      }
                      setCategory(command.id as ActionCategory);
                      go('choose_ability');
                    }}
                  >
                    <Icon /><span><strong>{command.label}</strong><small>{command.detail}</small></span><ArrowRight />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 'choose_ability' && (
          <>
            <StepHeading eyebrow={`${category} command`} title="Choose an ability">
              Each card shows only the information needed to choose.
            </StepHeading>
            <div className="guided-ability-grid">
              {categoryActions.map((action) => (
                <button type="button" key={action.id ?? action.name} onClick={() => selectAbility(action)} data-testid={`ability-${action.id ?? action.name}`}>
                  <strong>{action.name}</strong>
                  <span>{action.cost || action.category}</span>
                  <dl>
                    <div><dt>{action.attackFormula ? 'Attack' : action.saveAbility ? 'Save' : 'Effect'}</dt><dd>{action.attackFormula || (action.saveAbility ? `DC ${action.saveDc ?? '—'} ${action.saveAbility}` : action.effects?.[0]?.kind ?? 'Custom')}</dd></div>
                    <div><dt>Range</dt><dd>{action.range || 'Player choice'}</dd></div>
                    <div><dt>Primary</dt><dd>{action.damageFormulas?.map((item) => `${item.formula} ${item.type ?? ''}`).join(' + ') || action.healingFormula || 'See description'}</dd></div>
                  </dl>
                  {!!action.resourceCosts?.length && <small>{action.resourceCosts.map((cost) => `${cost.amount} ${cost.name ?? cost.resourceId}`).join(', ')} · spent on resolution</small>}
                </button>
              ))}
              {!categoryActions.length && (
                <div className="category-empty">
                  This character has no recorded {category === 'bonus' ? 'bonus actions' : category === 'legendary' ? 'legendary actions' : `${category} abilities`}.
                </div>
              )}
            </div>
            {footer()}
          </>
        )}

        {step === 'ability_detail' && selectedAction && (
          <>
            <StepHeading eyebrow={selectedAction.cost || category} title={selectedAction.name}>
              Review the ability before building the proposal.
            </StepHeading>
            <section className="guided-ability-detail" data-testid="action-detail">
              <dl>
                <div><dt>Range</dt><dd>{selectedAction.range || 'Not recorded'}</dd></div>
                <div><dt>Targets</dt><dd>{selectedAction.targetType || 'Player choice'}</dd></div>
                <div><dt>Attack / save</dt><dd>{selectedAction.attackFormula || (selectedAction.saveAbility ? `DC ${selectedAction.saveDc ?? 'editable'} ${selectedAction.saveAbility}` : 'None recorded')}</dd></div>
                <div><dt>Resources</dt><dd>{selectedAction.resourceCosts?.map((cost) => `${cost.amount} ${cost.name ?? cost.resourceId}`).join(', ') || 'None'}</dd></div>
              </dl>
              <details open>
                <summary>Full description</summary>
                <p>{description || 'No description recorded.'}</p>
              </details>
              <label>Editable description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
              {isLegacyAction(selectedAction) && <p className="detected-advisory">Legacy action: choose what this action does on the next screen. Any detected formula is advisory and editable.</p>}
            </section>
            <footer className="guided-footer">
              <div className="guided-footer-left">
                <button type="button" className="panel-button" onClick={back}><ArrowLeft /> Back</button>
                <button type="button" className={`panel-button ${cancelArmed ? 'danger' : ''}`} onClick={() => cancelArmed ? reset() : setCancelArmed(true)}>{cancelArmed ? 'Confirm discard' : 'Cancel'}</button>
              </div>
              <button type="button" className="panel-button primary guided-next" onClick={continueFromDetail} data-testid="guided-continue">Continue <ArrowRight /></button>
            </footer>
          </>
        )}

        {step === 'legacy_route' && (
          <>
            <StepHeading eyebrow="Legacy action" title="What does this action do?">
              Choose the path that fits. The app will not treat detected text as authoritative.
            </StepHeading>
            <div className="legacy-route-grid">
              {legacyRoutes.map((routeChoice) => (
                <button type="button" key={routeChoice.id} className={legacyRoute === routeChoice.id ? 'active' : ''} onClick={() => setLegacyRoute(routeChoice.id)}>
                  <strong>{routeChoice.label}</strong><small>{routeChoice.detail}</small>
                </button>
              ))}
            </div>
            {footer({ next: true, disabled: !legacyRoute })}
          </>
        )}

        {step === 'choose_targets' && (
          <>
            <StepHeading eyebrow="Step: Targets" title="Who is affected?">
              Select on the map or in this list. Distance is advisory and never blocks selection.
            </StepHeading>
            <div className="guided-target-tools">
              <button type="button" className={`panel-button ${targetMode ? 'primary' : ''}`} onClick={() => onTargetMode(!targetMode)} data-testid="select-targets-mode"><Target /> {targetMode ? 'Map targeting active' : 'Select on map'}</button>
              <button type="button" className="panel-button" onClick={() => onFocusToken(actor.id)}><Crosshair /> Focus actor</button>
            </div>
            <TargetSelector
              title="Action targets"
              tokens={tokens}
              actor={actor}
              selectedIds={targetIds}
              selectedTokenIds={selectedIds}
              feetPerSquare={feetPerSquare}
              onChange={(ids) => {
                onTargetIds(ids);
                setTargetOutcomes((current) => Object.fromEntries(ids.map((id) => [id, current[id] ?? {
                  tokenId: id,
                  roll: null,
                  suggestedOutcome: 'awaiting_dm',
                  damageMode: 'full',
                  customMultiplier: null,
                  customResult: '',
                  playerDamage: null,
                }])));
              }}
              onFocus={onFocusToken}
              testId="action-target-selector"
            />
            {isSingleTargetAction(selectedAction ?? undefined) && <p className="panel-note">One target is typical, but this advisory does not prevent you from selecting more.</p>}
            {footer({ next: true, nextLabel: selectedAction?.area ? 'Place area' : 'Continue', disabled: !targetIds.length })}
          </>
        )}

        {step === 'place_area' && (
          <>
            <StepHeading eyebrow="Step: Area" title="Place the area template">
              Positioning and intersection are suggestions only. You keep final control of the target list.
            </StepHeading>
            <section className="area-placement-card">
              <label>Shape<select value={areaTemplate?.shape ?? 'circle'} onChange={(event) => onAreaTemplate({
                shape: event.target.value as AreaTemplate['shape'],
                x: areaTemplate?.x ?? actor.x,
                y: areaTemplate?.y ?? actor.y,
                width: areaTemplate?.width ?? 3,
                height: areaTemplate?.height ?? 3,
                rotation: areaTemplate?.rotation ?? 0,
              })}>
                <option value="circle">Circle</option><option value="square">Square</option><option value="rectangle">Rectangle</option>
                <option value="cone">Cone</option><option value="line">Line</option>
              </select></label>
              <div className="field-grid three">
                <label>Width<input type="number" min="1" value={areaTemplate?.width ?? 3} onChange={(event) => onAreaTemplate({ ...(areaTemplate ?? { shape: 'circle', x: actor.x, y: actor.y, height: 3 }), width: Number(event.target.value) })} /></label>
                <label>Height<input type="number" min="1" value={areaTemplate?.height ?? 3} onChange={(event) => onAreaTemplate({ ...(areaTemplate ?? { shape: 'circle', x: actor.x, y: actor.y, width: 3 }), height: Number(event.target.value) })} /></label>
                <label>Rotation<input type="number" value={areaTemplate?.rotation ?? 0} onChange={(event) => onAreaTemplate({ ...(areaTemplate ?? { shape: 'circle', x: actor.x, y: actor.y, width: 3, height: 3 }), rotation: Number(event.target.value) })} /></label>
              </div>
              <div className="field-grid">
                <label>Grid X<input type="number" min="0" value={areaTemplate?.x ?? actor.x} onChange={(event) => onAreaTemplate({ ...(areaTemplate ?? { shape: 'circle', y: actor.y, width: 3, height: 3 }), x: Number(event.target.value) })} /></label>
                <label>Grid Y<input type="number" min="0" value={areaTemplate?.y ?? actor.y} onChange={(event) => onAreaTemplate({ ...(areaTemplate ?? { shape: 'circle', x: actor.x, width: 3, height: 3 }), y: Number(event.target.value) })} /></label>
              </div>
              <div className="suggested-targets">
                <span>Suggested: {suggestedIds.map((id) => tokens.find((token) => token.id === id)?.name).filter(Boolean).join(', ') || 'none'}</span>
                <button type="button" onClick={() => onTargetIds([...new Set([...targetIds, ...suggestedIds])])}>Use suggested targets</button>
              </div>
            </section>
            {footer({ next: true })}
          </>
        )}

        {step === 'attack_roll' && (
          <>
            <StepHeading eyebrow="Step: Attack" title="Roll the attack">
              The attack result stays separate from damage. Continue even if the DM has not confirmed a hit.
            </StepHeading>
            <section className="guided-calculator" data-testid="attack-calculator">
              <div className="field-grid">
                <label>Attack formula<input value={attackFormula} onChange={(event) => setAttackFormula(event.target.value)} /></label>
                <label>Roll mode<select value={attackMode} onChange={(event) => setAttackMode(event.target.value as typeof attackMode)}>
                  <option value="normal">Normal</option><option value="advantage">Advantage</option><option value="disadvantage">Disadvantage</option>
                </select></label>
              </div>
              <button type="button" className="panel-button primary roll-command" onClick={rollAttack} data-testid="roll-attack"><Dice5 /> {attackRoll ? 'Re-roll attack' : 'Roll attack'}</button>
              <RollBreakdown roll={attackRoll} />
              <div className="field-grid">
                <label>Player override<input type="number" value={attackOverride} onChange={(event) => setAttackOverride(event.target.value)} placeholder={String(attackRoll?.total ?? '')} /></label>
                <label>Final attack total<input readOnly value={attackRoll ? attackFinal : ''} /></label>
              </div>
              <label>Suggested outcome<select value={attackOutcome} onChange={(event) => setAttackOutcome(event.target.value as SuggestedOutcome)}>
                <option value="awaiting_dm">Awaiting DM</option><option value="hit">Hit</option><option value="miss">Miss</option><option value="custom">Custom</option>
              </select></label>
              <label className="check-row"><input type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} /> Critical hit</label>
              <label>Optional note<input value={attackNote} onChange={(event) => setAttackNote(event.target.value)} placeholder="Context for the DM" /></label>
            </section>
            {footer({ next: true, nextLabel: route.includes('damage') ? 'Continue to Damage' : 'Continue' })}
          </>
        )}

        {step === 'saving_throw' && (
          <>
            <StepHeading eyebrow="Step: Saving throws" title={`${selectedAction?.saveAbility ?? 'Custom'} save · DC ${selectedAction?.saveDc ?? 'editable'}`}>
              Record a suggestion for each target. The DM can change every result.
            </StepHeading>
            <div className="save-card-list" data-testid="saving-throw-calculator">
              {targetIds.map((targetId) => {
                const token = tokens.find((item) => item.id === targetId);
                const value = targetOutcomes[targetId] ?? {
                  tokenId: targetId, roll: null, suggestedOutcome: 'awaiting_dm', damageMode: 'full', customMultiplier: null, customResult: '', playerDamage: null,
                };
                return (
                  <article key={targetId} data-testid={`save-target-${targetId}`}>
                    <strong>{token?.name ?? targetId}</strong>
                    <div className="field-grid">
                      <label>Optional target roll<input type="number" value={value.roll ?? ''} onChange={(event) => setTargetOutcomes({ ...targetOutcomes, [targetId]: { ...value, roll: event.target.value === '' ? null : Number(event.target.value) } })} /></label>
                      <label>Suggested result<select value={value.suggestedOutcome} onChange={(event) => setTargetOutcomes({ ...targetOutcomes, [targetId]: { ...value, suggestedOutcome: event.target.value as SuggestedOutcome } })}>
                        <option value="awaiting_dm">Awaiting DM</option><option value="success">Success</option><option value="failure">Failure</option><option value="custom">Custom</option>
                      </select></label>
                    </div>
                    <label>Damage result<select value={value.damageMode} onChange={(event) => setTargetOutcomes({ ...targetOutcomes, [targetId]: { ...value, damageMode: event.target.value as TargetOutcome['damageMode'] } })}>
                      <option value="full">Full damage</option><option value="half">Half damage</option><option value="none">No damage</option><option value="custom">Custom amount</option>
                    </select></label>
                    {value.damageMode === 'custom' && <label>Custom damage<input type="number" value={value.playerDamage ?? ''} onChange={(event) => setTargetOutcomes({ ...targetOutcomes, [targetId]: { ...value, playerDamage: event.target.value === '' ? null : Number(event.target.value) } })} /></label>}
                  </article>
                );
              })}
            </div>
            {footer({ next: true })}
          </>
        )}

        {step === 'damage' && (
          <>
            <StepHeading eyebrow="Step: Damage" title="Build the damage">
              Every source remains separate. Manual overrides remain unchanged until you explicitly reroll or recalculate.
            </StepHeading>
            <div className="damage-components guided-damage-components" data-testid="damage-calculator">
              {damageComponents.map((component, index) => (
                <article key={component.id} data-testid={`damage-component-${index}`}>
                  <header><strong>Component {index + 1}</strong><button type="button" onClick={() => setDamageComponents((current) => current.filter((item) => item.id !== component.id))} title="Remove component"><Trash2 /></button></header>
                  <label>Source or reason<input value={component.source} onChange={(event) => setDamageComponents((current) => current.map((item) => item.id === component.id ? { ...item, source: event.target.value } : item))} /></label>
                  <div className="field-grid">
                    <label>Formula<input value={component.formula} onChange={(event) => setDamageComponents((current) => current.map((item) => item.id === component.id ? { ...item, formula: event.target.value } : item))} /></label>
                    <label>Damage type<input value={component.damageType} onChange={(event) => setDamageComponents((current) => current.map((item) => item.id === component.id ? { ...item, damageType: event.target.value } : item))} /></label>
                  </div>
                  <div className="component-options">
                    <label><input type="checkbox" checked={component.included} onChange={(event) => setDamageComponents((current) => current.map((item) => item.id === component.id ? { ...item, included: event.target.checked } : item))} /> Include</label>
                    <label><input type="checkbox" checked={component.criticalDoubling} onChange={(event) => setDamageComponents((current) => current.map((item) => item.id === component.id ? { ...item, criticalDoubling: event.target.checked } : item))} /> Double dice on critical</label>
                  </div>
                  <button type="button" className="panel-button" onClick={() => rollDamage(component.id)}><RotateCcw /> {component.roll ? 'Re-roll component' : 'Roll component'}</button>
                  <RollBreakdown roll={component.roll} />
                  <div className="component-totals">
                    <span>Calculated <b>{component.calculatedSubtotal}</b></span>
                    <label>Manual subtotal override<input type="number" value={component.playerOverride ?? ''} onChange={(event) => {
                      const value = event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0);
                      setDamageComponents((current) => current.map((item) => item.id === component.id ? { ...item, playerOverride: value, finalSubtotal: value ?? item.calculatedSubtotal } : item));
                    }} /></label>
                    <span>Player final <b>{component.finalSubtotal}</b></span>
                  </div>
                </article>
              ))}
            </div>
            <div className="extra-damage-menu">
              <button type="button" className="panel-button" onClick={() => setDamageComponents((current) => [...current, blankDamageComponent('Additional dice')])}><Plus /> Add Dice</button>
              <button type="button" className="panel-button" onClick={() => setDamageComponents((current) => [...current, { ...blankDamageComponent('Flat bonus', '0'), criticalDoubling: false }])}><Plus /> Add Flat Bonus</button>
              <button type="button" className="panel-button" onClick={() => setDamageComponents((current) => [...current, blankDamageComponent('Custom damage component')])}><Plus /> Add Damage Component</button>
              <button type="button" className="panel-button primary" onClick={rollAllDamage} data-testid="roll-all-damage"><Dice5 /> Re-roll All</button>
            </div>
            <section className="guided-total-card">
              <div><small>Calculated total</small><strong>{calculatedDamage}</strong></div>
              <label>Custom total<input type="number" value={combinedOverride} onChange={(event) => setCombinedOverride(event.target.value)} placeholder={String(playerDamage)} /></label>
              <div><small>Player total</small><strong data-testid="submitted-damage">{playerDamage}</strong></div>
              <div className="panel-row">
                <button type="button" onClick={() => setCombinedOverride(String(Math.floor(playerDamage / 2)))}>Half Damage</button>
                <button type="button" onClick={() => setCombinedOverride(String(playerDamage * 2))}>Double Damage</button>
                <button type="button" onClick={() => setCombinedOverride('')}>Reset to Components</button>
              </div>
            </section>
            {footer({ next: true })}
          </>
        )}

        {step === 'healing' && (
          <>
            <StepHeading eyebrow="Step: Healing" title="Calculate healing">
              Healing remains separate from damage and temporary HP.
            </StepHeading>
            <section className="guided-calculator" data-testid="healing-calculator">
              <label>Healing formula<input value={healing.formula} onChange={(event) => setHealing({ ...healing, formula: event.target.value })} /></label>
              <button type="button" className="panel-button primary roll-command" onClick={() => {
                try { setHealing({ ...healing, roll: rollExpression(healing.formula) }); } catch (error) { onError(errorMessage(error)); }
              }} disabled={!healing.formula}><HeartPulse /> {healing.roll ? 'Re-roll healing' : 'Roll healing'}</button>
              <RollBreakdown roll={healing.roll} />
              <div className="field-grid">
                <label>Additional flat healing<input type="number" value={healing.flatBonus} onChange={(event) => setHealing({ ...healing, flatBonus: event.target.value })} /></label>
                <label>Player override<input type="number" value={healing.override} onChange={(event) => setHealing({ ...healing, override: event.target.value })} /></label>
              </div>
              <div className="support-total">Final healing <strong>{healing.override === '' ? (healing.roll?.total ?? 0) + (Number(healing.flatBonus) || 0) : Number(healing.override) || 0}</strong> per target</div>
            </section>
            {footer({ next: true })}
          </>
        )}

        {step === 'temporary_hp' && (
          <>
            <StepHeading eyebrow="Step: Temporary HP" title="Calculate temporary HP">
              Temporary HP is preserved as its own effect and is never treated as healing.
            </StepHeading>
            <section className="guided-calculator" data-testid="temp-hp-calculator">
              <label>Temporary HP formula<input value={temporaryHp.formula} onChange={(event) => setTemporaryHp({ ...temporaryHp, formula: event.target.value })} /></label>
              <button type="button" className="panel-button primary roll-command" onClick={() => {
                try { setTemporaryHp({ ...temporaryHp, roll: rollExpression(temporaryHp.formula) }); } catch (error) { onError(errorMessage(error)); }
              }} disabled={!temporaryHp.formula}><Shield /> {temporaryHp.roll ? 'Re-roll temporary HP' : 'Roll temporary HP'}</button>
              <RollBreakdown roll={temporaryHp.roll} />
              <div className="field-grid">
                <label>Additional flat bonus<input type="number" value={temporaryHp.flatBonus} onChange={(event) => setTemporaryHp({ ...temporaryHp, flatBonus: event.target.value })} /></label>
                <label>Player override<input type="number" value={temporaryHp.override} onChange={(event) => setTemporaryHp({ ...temporaryHp, override: event.target.value })} /></label>
              </div>
              <div className="support-total">Final temporary HP <strong>{temporaryHp.override === '' ? (temporaryHp.roll?.total ?? 0) + (Number(temporaryHp.flatBonus) || 0) : Number(temporaryHp.override) || 0}</strong> per target</div>
            </section>
            {footer({ next: true })}
          </>
        )}

        {step === 'utility_effects' && (
          <>
            <StepHeading eyebrow="Step: Effects" title="Add optional effects">
              Effects remain proposals. Add anything useful without enforcing game legality.
            </StepHeading>
            <div className="utility-effect-list">
              {utilityEffects.map((effect, index) => (
                <article key={effect.id}>
                  <header><strong>Effect {index + 1}</strong><button type="button" onClick={() => setUtilityEffects((current) => current.filter((item) => item.id !== effect.id))}><Trash2 /></button></header>
                  <label>Effect type<select value={effect.kind} onChange={(event) => setUtilityEffects((current) => current.map((item) => item.id === effect.id ? { ...item, kind: event.target.value as UtilityEffect['kind'] } : item))}>
                    <option value="condition">Add condition</option><option value="remove_condition">Remove condition</option><option value="movement">Movement</option>
                    <option value="resource">Resource change</option><option value="summon">Summon</option><option value="map_object">Map object</option>
                    <option value="ongoing">Ongoing effect</option><option value="note">Custom text effect</option>
                  </select></label>
                  <label>Description<input value={effect.text} onChange={(event) => setUtilityEffects((current) => current.map((item) => item.id === effect.id ? { ...item, text: event.target.value } : item))} /></label>
                  <div className="field-grid">
                    <label>Duration<input value={effect.duration ?? ''} onChange={(event) => setUtilityEffects((current) => current.map((item) => item.id === effect.id ? { ...item, duration: event.target.value } : item))} /></label>
                    <label className="check-row"><input type="checkbox" checked={Boolean(effect.saveEnds)} onChange={(event) => setUtilityEffects((current) => current.map((item) => item.id === effect.id ? { ...item, saveEnds: event.target.checked } : item))} /> Save ends reminder</label>
                  </div>
                </article>
              ))}
              <button type="button" className="panel-button" onClick={() => setUtilityEffects((current) => [...current, blankUtilityEffect()])}><Plus /> Add Effect</button>
            </div>
            {footer({ next: true })}
          </>
        )}

        {step === 'multiattack' && (
          <>
            <StepHeading eyebrow="Step: Multiattack" title={selectedAction?.name ?? 'Multiattack'}>
              Every attack remains independent inside one combined proposal.
            </StepHeading>
            <div className="multiattack-toolbar">
              <button type="button" className="panel-button" disabled={!multiattackEntries[0]?.targetIds.length} onClick={() => {
                const targets = multiattackEntries[0]?.targetIds ?? [];
                setMultiattackEntries((current) => current.map((entry) => ({ ...entry, targetIds: targets })));
                onTargetIds([...new Set(targets)]);
              }}>Same target for all remaining</button>
              <button type="button" className="panel-button" onClick={() => setMultiattackEntries((current) => [...current, {
                id: makeId(), name: 'Custom Attack', targetIds: [], attackFormula: '1d20', attackRoll: null,
                attackOverride: null, suggestedOutcome: 'awaiting_dm', damageComponents: [blankDamageComponent()], effects: [], skipped: false,
              }])}><Plus /> Add custom attack</button>
            </div>
            <div className="multiattack-list" data-testid="multiattack-builder">
              {multiattackEntries.map((entry, index) => (
                <article key={entry.id} data-testid={`multiattack-entry-${index}`}>
                  <header>
                    <span>{index + 1}</span><input aria-label={`Attack ${index + 1} name`} value={entry.name} onChange={(event) => setMultiattackEntries((current) => current.map((item) => item.id === entry.id ? { ...item, name: event.target.value } : item))} />
                    <button type="button" disabled={index === 0} title="Move attack up" onClick={() => setMultiattackEntries((current) => {
                      const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next;
                    })}><ArrowUp /></button>
                    <button type="button" disabled={index === multiattackEntries.length - 1} title="Move attack down" onClick={() => setMultiattackEntries((current) => {
                      const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next;
                    })}><ArrowDown /></button>
                  </header>
                  <label>Target<select value={entry.targetIds[0] ?? ''} onChange={(event) => {
                    const selected = event.target.value ? [event.target.value] : [];
                    setMultiattackEntries((current) => current.map((item) => item.id === entry.id ? { ...item, targetIds: selected } : item));
                    onTargetIds([...new Set([...targetIds, ...selected])]);
                  }}>
                    <option value="">Choose target</option>
                    {tokens.filter((token) => token.id !== actor.id).map((token) => <option key={token.id} value={token.id}>{token.name}</option>)}
                  </select></label>
                  <div className="field-grid">
                    <label>Attack formula<input value={entry.attackFormula} onChange={(event) => setMultiattackEntries((current) => current.map((item) => item.id === entry.id ? { ...item, attackFormula: event.target.value } : item))} /></label>
                    <label>Suggested outcome<select value={entry.suggestedOutcome} onChange={(event) => setMultiattackEntries((current) => current.map((item) => item.id === entry.id ? { ...item, suggestedOutcome: event.target.value as SuggestedOutcome } : item))}>
                      <option value="awaiting_dm">Awaiting DM</option><option value="hit">Hit</option><option value="miss">Miss</option><option value="custom">Custom</option>
                    </select></label>
                  </div>
                  <button type="button" className="panel-button" onClick={() => {
                    try {
                      const roll = rollExpression(entry.attackFormula);
                      setMultiattackEntries((current) => current.map((item) => item.id === entry.id ? { ...item, attackRoll: roll } : item));
                    } catch (error) { onError(errorMessage(error)); }
                  }}><Dice5 /> {entry.attackRoll ? 'Re-roll attack' : 'Roll attack'}</button>
                  <RollBreakdown roll={entry.attackRoll} />
                  {entry.damageComponents.map((component) => (
                    <div className="multiattack-damage" key={component.id}>
                      <input aria-label={`${entry.name} damage formula`} value={component.formula} onChange={(event) => setMultiattackEntries((current) => current.map((item) => item.id === entry.id ? { ...item, damageComponents: item.damageComponents.map((part) => part.id === component.id ? { ...part, formula: event.target.value } : part) } : item))} />
                      <input aria-label={`${entry.name} damage type`} value={component.damageType} onChange={(event) => setMultiattackEntries((current) => current.map((item) => item.id === entry.id ? { ...item, damageComponents: item.damageComponents.map((part) => part.id === component.id ? { ...part, damageType: event.target.value } : part) } : item))} />
                      <button type="button" onClick={() => {
                        try {
                          const roll = rollExpression(component.formula);
                          setMultiattackEntries((current) => current.map((item) => item.id === entry.id ? {
                            ...item,
                            damageComponents: item.damageComponents.map((part) => part.id === component.id ? { ...part, roll, calculatedSubtotal: roll.total, finalSubtotal: part.playerOverride ?? roll.total } : part),
                          } : item));
                        } catch (error) { onError(errorMessage(error)); }
                      }}><Dice5 /> {component.finalSubtotal || 'Roll'}</button>
                    </div>
                  ))}
                  <div className="panel-row">
                    <button type="button" className="panel-button" onClick={() => setMultiattackEntries((current) => current.map((item) => item.id === entry.id ? { ...item, damageComponents: [...item.damageComponents, blankDamageComponent('Extra damage')] } : item))}><Plus /> Extra damage</button>
                    <button type="button" className="panel-button" onClick={() => setMultiattackEntries((current) => current.map((item) => item.id === entry.id ? { ...item, skipped: !item.skipped } : item))}>{entry.skipped ? 'Restore attack' : 'Skip attack'}</button>
                    <button type="button" className="panel-button danger" onClick={() => setMultiattackEntries((current) => current.filter((item) => item.id !== entry.id))}><Trash2 /> Remove</button>
                  </div>
                </article>
              ))}
            </div>
            {footer({ next: true, disabled: multiattackEntries.some((entry) => !entry.skipped && !entry.targetIds.length) })}
          </>
        )}

        {step === 'review' && selectedAction && (
          <>
            <StepHeading eyebrow="Final step" title="Review the complete proposal">
              Nothing is sent or spent until you submit. The DM can edit every result before resolution.
            </StepHeading>
            <section className="guided-review" data-testid="guided-review">
              <header><span className="actor-avatar">{actor.state.icon || actor.name.slice(0, 2).toUpperCase()}</span><div><strong>{selectedAction.name}</strong><small>{category} · {selectedAction.cost || 'custom cost'}</small></div></header>
              <dl>
                <div><dt>Actor</dt><dd>{actor.name}</dd></div>
                <div><dt>Targets</dt><dd>{targetIds.map((id) => tokens.find((token) => token.id === id)?.name).filter(Boolean).join(', ') || 'None'}</dd></div>
                {attackRoll && <div><dt>Attack</dt><dd>{attackFinal} · {attackOutcome.replace('_', ' ')}</dd></div>}
                {damageComponents.length > 0 && <div><dt>Damage</dt><dd>{damageComponents.filter((item) => item.included).map((item) => `${item.finalSubtotal} ${item.damageType || 'untyped'} (${item.source})`).join(' + ')} = {playerDamage}</dd></div>}
                {healing.formula && <div><dt>Healing</dt><dd>{healing.override === '' ? (healing.roll?.total ?? 0) + Number(healing.flatBonus || 0) : healing.override} per target</dd></div>}
                {temporaryHp.formula && <div><dt>Temporary HP</dt><dd>{temporaryHp.override === '' ? (temporaryHp.roll?.total ?? 0) + Number(temporaryHp.flatBonus || 0) : temporaryHp.override} per target</dd></div>}
                {resourceCostsFor(selectedAction).length > 0 && <div><dt>Resources</dt><dd>{resourceCostsFor(selectedAction).map((cost) => `${cost.amount} ${cost.name}`).join(', ')} · deducted only if DM resolves</dd></div>}
              </dl>
              {multiattackEntries.length > 0 && (
                <div className="review-multiattack">
                  <h3>Individual attacks</h3>
                  {multiattackEntries.map((entry, index) => (
                    <article key={entry.id}>
                      <strong>{index + 1}. {entry.name} → {entry.targetIds.map((id) => tokens.find((token) => token.id === id)?.name).join(', ') || 'No target'}</strong>
                      <span>Attack {entry.attackOverride ?? entry.attackRoll?.total ?? 'not rolled'} · {entry.suggestedOutcome.replace('_', ' ')}</span>
                      <span>{entry.damageComponents.map((item) => `${item.finalSubtotal} ${item.damageType || 'untyped'}`).join(' + ') || 'No damage'}</span>
                    </article>
                  ))}
                </div>
              )}
              {utilityEffects.length > 0 && <div className="review-effects"><h3>Effects</h3>{utilityEffects.map((effect) => <span key={effect.id}>{effect.kind.replace('_', ' ')}: {effect.text || 'Editable by DM'}</span>)}</div>}
              <details><summary>Full description and notes</summary><p>{description}</p><p>{attackNote}</p></details>
              <div className="review-edit-links">
                <button type="button" onClick={() => go('choose_targets')}>Edit Targets</button>
                {route.includes('attack_roll') && <button type="button" onClick={() => go('attack_roll')}>Edit Rolls</button>}
                {route.includes('utility_effects') && <button type="button" onClick={() => go('utility_effects')}>Edit Effects</button>}
              </div>
            </section>
            {footer({ submit: true, disabled: !targetIds.length })}
          </>
        )}

        {step === 'submitting' && <div className="guided-status"><RotateCcw className="spin" /><strong>Submitting proposal…</strong><p>The draft is being sent to the DM.</p></div>}
        {step === 'submitted' && (
          <div className="guided-status submitted" data-testid="guided-submitted">
            <Check /><strong>Proposal sent to the DM</strong><p>No resource has been spent yet. The DM may edit, resolve, reject, or return it.</p>
            <button type="button" className="panel-button primary" onClick={reset}>Choose another command</button>
          </div>
        )}
      </div>
    </div>
  );
}

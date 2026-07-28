import type {
  AttackEntry,
  CombatAction,
  CombatToken,
  DamageComponent,
  GuidedActionDraft,
  GuidedActionStep,
  GuidedEffectRoute,
  ProposedResourceCost,
  ResolutionPayload,
  ResolutionTarget,
  UtilityEffect,
} from '../../types/combat';

export const GUIDED_DRAFT_VERSION = 2 as const;

const makeId = () => crypto.randomUUID();

export function damageComponentsFor(action: CombatAction | null): DamageComponent[] {
  return (action?.damageFormulas ?? []).map((item, index) => ({
    id: makeId(),
    formula: item.formula,
    damageType: item.type ?? '',
    source: index === 0 ? action?.name ?? 'Ability' : `${action?.name ?? 'Ability'} component ${index + 1}`,
    roll: null,
    calculatedSubtotal: 0,
    playerOverride: null,
    finalSubtotal: 0,
    criticalDoubling: true,
    included: true,
  }));
}

export function utilityEffectsFor(action: CombatAction | null): UtilityEffect[] {
  return (action?.effects ?? [])
    .filter((effect) => ['condition', 'resource', 'note'].includes(effect.kind))
    .map((effect) => ({
      id: makeId(),
      kind: effect.kind === 'condition' ? 'condition' : effect.kind === 'resource' ? 'resource' : 'note',
      text: effect.condition ?? effect.resourceId ?? action?.description ?? '',
    }));
}

export function resourceCostsFor(action: CombatAction | null): ProposedResourceCost[] {
  return (action?.resourceCosts ?? []).map((cost) => ({
    resourceId: cost.resourceId,
    name: cost.name ?? cost.resourceId ?? 'Resource',
    amount: Math.max(0, cost.amount),
    timing: 'on_resolution',
  }));
}

export function isLegacyAction(action: CombatAction | null) {
  if (!action) return false;
  return !action.attackFormula &&
    !action.saveAbility &&
    !action.damageFormulas?.length &&
    !action.healingFormula &&
    !action.area &&
    !action.resourceCosts?.length &&
    !action.effects?.some((effect) => effect.kind !== 'note');
}

export function isMultiattack(action: CombatAction | null) {
  return Boolean(action && /multi[\s-]?attack/i.test(`${action.name} ${action.description}`));
}

export function routeForAction(action: CombatAction | null, legacyRoute: GuidedEffectRoute | null): GuidedActionStep[] {
  if (!action) return ['choose_targets', 'utility_effects', 'review'];
  if (isMultiattack(action) || legacyRoute === 'multiattack') return ['multiattack', 'review'];
  const steps: GuidedActionStep[] = ['choose_targets'];
  if (action.area) steps.push('place_area');
  if (action.attackFormula || legacyRoute === 'attack') steps.push('attack_roll');
  if (action.saveAbility || legacyRoute === 'saving_throw') steps.push('saving_throw');
  if (action.damageFormulas?.length || legacyRoute === 'damage' || legacyRoute === 'attack') steps.push('damage');
  const tempHp = action.effects?.some((effect) => effect.kind === 'temp_hp');
  if ((action.healingFormula && !tempHp) || legacyRoute === 'healing') steps.push('healing');
  if (tempHp || legacyRoute === 'temporary_hp') steps.push('temporary_hp');
  if (
    legacyRoute === 'utility' ||
    legacyRoute === 'custom' ||
    action.effects?.some((effect) => ['condition', 'resource', 'note'].includes(effect.kind)) ||
    steps.length === 1
  ) steps.push('utility_effects');
  steps.push('review');
  return [...new Set(steps)];
}

export function nextGuidedStep(
  current: GuidedActionStep,
  action: CombatAction | null,
  legacyRoute: GuidedEffectRoute | null,
): GuidedActionStep {
  if (current === 'choose_category') return 'choose_ability';
  if (current === 'choose_ability') return 'ability_detail';
  if (current === 'ability_detail' && isMultiattack(action)) return 'multiattack';
  if (current === 'ability_detail' && isLegacyAction(action) && !legacyRoute) return 'legacy_route';
  if (current === 'legacy_route') return routeForAction(action, legacyRoute)[0];
  const route = routeForAction(action, legacyRoute);
  const index = route.indexOf(current);
  return index < 0 ? route[0] : route[Math.min(route.length - 1, index + 1)];
}

export function createGuidedDraft(encounterId: string, actorTokenId: string): GuidedActionDraft {
  return {
    schemaVersion: GUIDED_DRAFT_VERSION,
    encounterId,
    actorTokenId,
    category: 'action',
    step: 'choose_category',
    history: [],
    sourceAction: null,
    legacyRoute: null,
    targetIds: [],
    targetOutcomes: {},
    areaTemplate: null,
    attackEntry: null,
    multiattackEntries: [],
    damageComponents: [],
    healing: null,
    temporaryHp: null,
    utilityEffects: [],
    resourceCosts: [],
    note: '',
    updatedAt: new Date().toISOString(),
  };
}

export function buildMultiattackEntries(action: CombatAction, actions: CombatAction[]): AttackEntry[] {
  const find = (name: string) => actions.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  let sequence: CombatAction[] = [];
  if (/tarrasque/i.test(action.description) && /five attacks/i.test(action.description)) {
    sequence = ['Bite', 'Claw', 'Claw', 'Horns', 'Tail'].map(find).filter(Boolean) as CombatAction[];
  }
  if (!sequence.length) sequence = [action];
  return sequence.map((entry, index) => ({
    id: makeId(),
    name: entry.name || `Attack ${index + 1}`,
    sourceActionId: entry.id,
    targetIds: [],
    attackFormula: entry.attackFormula ?? '1d20',
    attackRoll: null,
    attackOverride: null,
    suggestedOutcome: 'awaiting_dm',
    damageComponents: damageComponentsFor(entry),
    effects: utilityEffectsFor(entry),
    skipped: false,
  }));
}

export function applyDeferredResourceCosts(
  payload: ResolutionPayload,
  actorTokenId: string,
  costs: ProposedResourceCost[],
): ResolutionPayload {
  if (!costs.length) return payload;
  const targets = payload.targets.map((target) => ({ ...target }));
  let actor = targets.find((target) => target.token_id === actorTokenId);
  if (!actor) {
    actor = { token_id: actorTokenId };
    targets.push(actor);
  }
  actor.resource_changes = [
    ...(actor.resource_changes ?? []),
    ...costs.map((cost) => ({ id: cost.resourceId, name: cost.name, delta: -Math.abs(cost.amount) })),
  ];
  return { ...payload, targets };
}

export function groupMultiattackDamage(entries: AttackEntry[]): Record<string, number> {
  const grouped: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.skipped || entry.suggestedOutcome === 'miss') continue;
    const amount = entry.damageComponents
      .filter((component) => component.included)
      .reduce((sum, component) => sum + component.finalSubtotal, 0);
    for (const targetId of entry.targetIds) grouped[targetId] = (grouped[targetId] ?? 0) + amount;
  }
  return grouped;
}

export function resolutionTargetsFromDraft(draft: GuidedActionDraft): ResolutionTarget[] {
  const multi = groupMultiattackDamage(draft.multiattackEntries);
  return draft.targetIds.map((tokenId) => {
    const outcome = draft.targetOutcomes[tokenId];
    const base = multi[tokenId] ?? draft.damageComponents
      .filter((component) => component.included)
      .reduce((sum, component) => sum + component.finalSubtotal, 0);
    const damage = outcome?.damageMode === 'half'
      ? Math.floor(base / 2)
      : outcome?.damageMode === 'none' || outcome?.suggestedOutcome === 'miss' ? 0
        : outcome?.playerDamage ?? base;
    const conditions = draft.utilityEffects
      .filter((effect) => effect.kind === 'condition')
      .map((effect) => effect.text)
      .filter(Boolean);
    return {
      token_id: tokenId,
      damage: damage || undefined,
      healing: draft.healing ? Math.max(0, draft.healing.playerOverride ?? draft.healing.calculated) || undefined : undefined,
      temp_hp: draft.temporaryHp ? Math.max(0, draft.temporaryHp.playerOverride ?? draft.temporaryHp.calculated) || undefined : undefined,
      conditions_add: conditions,
    };
  });
}

export function availableCommandCategories(actions: CombatAction[], actor: CombatToken) {
  const pool = (name: string) => actor.state.resourcePools.find((item) => item.name.toLowerCase().includes(name));
  return [
    { id: 'action', label: 'Action', available: actions.some((item) => item.category === 'action'), detail: 'Available' },
    { id: 'bonus', label: 'Bonus Action', available: actions.some((item) => item.category === 'bonus'), detail: 'Available' },
    { id: 'movement', label: 'Movement', available: true, detail: actor.state.speed || 'Player choice' },
    {
      id: 'legendary',
      label: 'Legendary Action',
      available: actions.some((item) => item.category === 'legendary') && (pool('legendary action')?.current ?? 1) > 0,
      detail: pool('legendary action') ? `${pool('legendary action')!.current} of ${pool('legendary action')!.max} remaining` : 'Recorded',
    },
    { id: 'lair', label: 'Lair Action', available: actions.some((item) => item.category === 'lair'), detail: 'Available' },
    { id: 'power', label: 'Power', available: actions.some((item) => item.category === 'power'), detail: 'Available' },
    { id: 'custom', label: 'Custom Action', available: true, detail: 'Fully editable' },
    { id: 'end_turn', label: 'End Turn', available: true, detail: 'Finish this combatant’s turn' },
  ] as const;
}

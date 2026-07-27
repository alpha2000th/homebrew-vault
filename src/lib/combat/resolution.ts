import type { HpState, ResolutionPayload, ResolutionTarget, ResourcePool } from '../../types/combat';

export function applyDamage(hp: HpState, damage: number): HpState {
  const amount = Math.max(0, Number(damage) || 0);
  const absorbed = Math.min(hp.temp, amount);
  return {
    ...hp,
    temp: hp.temp - absorbed,
    current: Math.max(0, hp.current - (amount - absorbed)),
  };
}

export function applyHealing(hp: HpState, healing: number): HpState {
  return { ...hp, current: Math.min(hp.max, hp.current + Math.max(0, Number(healing) || 0)) };
}

export function applyHpChanges(hp: HpState, change: ResolutionTarget): HpState {
  let next = { ...hp };
  if (change.set_max_hp !== undefined) {
    next.max = Math.max(1, change.set_max_hp);
    next.current = Math.min(next.current, next.max);
  }
  if (change.damage) next = applyDamage(next, change.damage);
  if (change.healing) next = applyHealing(next, change.healing);
  if (change.temp_hp !== undefined) next.temp = Math.max(0, change.temp_hp);
  if (change.remove_temp_hp) next.temp = 0;
  if (change.set_hp !== undefined) next.current = Math.max(0, Math.min(next.max, change.set_hp));
  return next;
}

export function applyResourceChanges(
  pools: ResourcePool[],
  changes: ResolutionTarget['resource_changes'] = [],
): ResourcePool[] {
  return pools.map((pool) => {
    const change = changes.find((candidate) =>
      (candidate.id && candidate.id === pool.id) || (candidate.name && candidate.name === pool.name));
    if (!change) return pool;
    const value = change.set ?? pool.current + (change.delta ?? 0);
    return { ...pool, current: Math.max(0, Math.min(pool.max, value)) };
  });
}

export function effectivePayload(
  calculated: ResolutionPayload,
  playerOverride?: ResolutionPayload | null,
  dmFinal?: ResolutionPayload | null,
): { payload: ResolutionPayload; source: 'calculated' | 'player' | 'dm' } {
  if (dmFinal?.targets?.length) return { payload: dmFinal, source: 'dm' };
  if (playerOverride?.targets?.length) return { payload: playerOverride, source: 'player' };
  return { payload: calculated, source: 'calculated' };
}

export function previewTarget(
  hp: HpState,
  change: ResolutionTarget,
): { before: HpState; after: HpState } {
  return { before: { ...hp }, after: applyHpChanges(hp, change) };
}

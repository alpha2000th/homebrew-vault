import type { HpState, ResolutionPayload, ResolutionTarget, ResourcePool } from '../../types/combat';
import { normalizeHpState, normalizeResolutionPayload } from './runtimeSchema';

export function applyDamage(hp: HpState, damage: number): HpState {
  const safeHp = normalizeHpState(hp);
  const amount = Math.max(0, Number(damage) || 0);
  const absorbed = Math.min(safeHp.temp, amount);
  return {
    ...safeHp,
    temp: safeHp.temp - absorbed,
    current: Math.max(0, safeHp.current - (amount - absorbed)),
  };
}

export function applyHealing(hp: HpState, healing: number): HpState {
  const safeHp = normalizeHpState(hp);
  return { ...safeHp, current: Math.min(safeHp.max, safeHp.current + Math.max(0, Number(healing) || 0)) };
}

export function applyHpChanges(hp: HpState, change: ResolutionTarget): HpState {
  let next = normalizeHpState(hp);
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
  const safeCalculated = normalizeResolutionPayload(calculated);
  const safePlayer = normalizeResolutionPayload(playerOverride);
  const safeDm = normalizeResolutionPayload(dmFinal);
  if (safeDm.targets.length) return { payload: safeDm, source: 'dm' };
  if (safePlayer.targets.length) return { payload: safePlayer, source: 'player' };
  return { payload: safeCalculated, source: 'calculated' };
}

export function previewTarget(
  hp: HpState,
  change: ResolutionTarget,
): { before: HpState; after: HpState } {
  const safeHp = normalizeHpState(hp);
  return { before: safeHp, after: applyHpChanges(safeHp, change) };
}

import type {
  CombatAction,
  CombatEncounter,
  CombatEvent,
  CombatMap,
  CombatProposal,
  CombatToken,
  HpState,
  ReactionResponse,
  ReactionWindow,
  ResolutionPayload,
  ResolutionTarget,
  ResourcePool,
} from '../../types/combat';
import { normalizeCombatAction } from './characterSchema';

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value : fallback;

const number = (value: unknown, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const boolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

const textArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const objectArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is UnknownRecord => item !== null && typeof item === 'object' && !Array.isArray(item))
    : [];

export function normalizeHpState(value: unknown, fallback?: HpState): HpState {
  const raw = record(value);
  const safeFallback = fallback ?? { current: 1, max: 1, temp: 0 };
  const max = Math.max(1, number(raw.max, safeFallback.max));
  return {
    current: Math.max(0, Math.min(max, number(raw.current, safeFallback.current))),
    max,
    temp: Math.max(0, number(raw.temp, safeFallback.temp)),
  };
}

function normalizeResourcePool(value: unknown): ResourcePool {
  const raw = record(value);
  const max = Math.max(0, number(raw.max));
  return {
    ...raw,
    id: text(raw.id) || undefined,
    name: text(raw.name, 'Resource'),
    current: Math.max(0, Math.min(max, number(raw.current))),
    max,
    rechargeType: text(raw.rechargeType) || undefined,
  } as ResourcePool;
}

export function normalizeCombatToken(value: unknown, previous?: CombatToken): CombatToken {
  const incoming = record(value);
  const raw = { ...record(previous), ...incoming };
  const previousState = record(previous?.state);
  const incomingState = record(incoming.state);
  const state = { ...previousState, ...incomingState };
  const fallbackHp = previous?.state?.hp ?? { current: 1, max: 1, temp: 0 };
  const hpSource = Object.prototype.hasOwnProperty.call(incomingState, 'hp')
    ? incomingState.hp
    : state.hp;

  return {
    ...raw,
    id: text(raw.id),
    encounter_id: text(raw.encounter_id),
    character_id: text(raw.character_id) || null,
    assigned_user_id: text(raw.assigned_user_id) || null,
    name: text(raw.name, 'Combatant'),
    team: text(raw.team, 'neutral'),
    initiative: raw.initiative === null || raw.initiative === undefined
      ? null
      : number(raw.initiative),
    initiative_order: Math.max(0, Math.trunc(number(raw.initiative_order))),
    x: Math.max(0, Math.trunc(number(raw.x))),
    y: Math.max(0, Math.trunc(number(raw.y))),
    width_squares: Math.max(1, Math.trunc(number(raw.width_squares, 1))),
    height_squares: Math.max(1, Math.trunc(number(raw.height_squares, 1))),
    rotation: number(raw.rotation),
    visible: boolean(raw.visible, true),
    state: {
      ...state,
      hp: normalizeHpState(hpSource, fallbackHp),
      conditions: textArray(state.conditions),
      resourcePools: objectArray(state.resourcePools).map(normalizeResourcePool),
      actions: Array.isArray(state.actions) ? state.actions.map(normalizeCombatAction) : [],
      homebrewPowers: objectArray(state.homebrewPowers),
      temporaryNpc: boolean(state.temporaryNpc, false),
      dead: boolean(state.dead, false),
      unconscious: boolean(state.unconscious, false),
    },
    created_at: text(raw.created_at),
    updated_at: text(raw.updated_at),
  } as CombatToken;
}

function normalizeResolutionTarget(value: unknown): ResolutionTarget | null {
  const raw = record(value);
  const tokenId = text(raw.token_id);
  if (!tokenId) return null;
  return {
    ...raw,
    token_id: tokenId,
    conditions_add: textArray(raw.conditions_add),
    conditions_remove: textArray(raw.conditions_remove),
    resource_changes: objectArray(raw.resource_changes) as ResolutionTarget['resource_changes'],
  } as ResolutionTarget;
}

export function normalizeResolutionPayload(value: unknown): ResolutionPayload {
  const raw = record(value);
  return {
    ...raw,
    targets: Array.isArray(raw.targets)
      ? raw.targets.map(normalizeResolutionTarget).filter((item): item is ResolutionTarget => item !== null)
      : [],
    note: text(raw.note) || undefined,
  } as ResolutionPayload;
}

export function normalizeCombatProposal(value: unknown, previous?: CombatProposal): CombatProposal {
  const incoming = record(value);
  const raw = { ...record(previous), ...incoming };
  const validStatuses = [
    'draft', 'submitted', 'reaction_window', 'awaiting_dm',
    'resolved', 'rejected', 'cancelled', 'undone',
  ];
  return {
    ...raw,
    id: text(raw.id),
    encounter_id: text(raw.encounter_id),
    actor_token_id: text(raw.actor_token_id),
    created_by: text(raw.created_by),
    proposal_type: text(raw.proposal_type, 'action'),
    status: validStatuses.includes(text(raw.status)) ? raw.status : 'draft',
    source_action: record(raw.source_action) as CombatAction | Record<string, unknown>,
    target_token_ids: textArray(raw.target_token_ids),
    area_template: Object.keys(record(raw.area_template)).length ? record(raw.area_template) : null,
    roll_data: record(raw.roll_data),
    calculated_payload: normalizeResolutionPayload(raw.calculated_payload),
    player_override_payload: normalizeResolutionPayload(raw.player_override_payload),
    dm_final_payload: normalizeResolutionPayload(raw.dm_final_payload),
    description: typeof raw.description === 'string' ? raw.description : '',
    version: Math.max(0, Math.trunc(number(raw.version))),
    created_at: text(raw.created_at),
    updated_at: text(raw.updated_at),
  } as CombatProposal;
}

function normalizeReactionResponse(value: unknown): ReactionResponse {
  const raw = record(value);
  const validTypes = ['reaction', 'custom', 'pass', 'question'];
  return {
    ...raw,
    id: text(raw.id),
    reaction_window_id: text(raw.reaction_window_id),
    responder_user_id: text(raw.responder_user_id),
    responder_token_id: text(raw.responder_token_id),
    response_type: validTypes.includes(text(raw.response_type)) ? raw.response_type : 'custom',
    selected_reaction: Object.keys(record(raw.selected_reaction)).length
      ? normalizeCombatAction(raw.selected_reaction)
      : null,
    custom_text: typeof raw.custom_text === 'string' ? raw.custom_text : '',
    payload: record(raw.payload),
    created_at: text(raw.created_at),
    updated_at: text(raw.updated_at),
  } as ReactionResponse;
}

export function normalizeReactionWindow(value: unknown, previous?: ReactionWindow): ReactionWindow {
  const incoming = record(value);
  const raw = { ...record(previous), ...incoming };
  return {
    ...raw,
    id: text(raw.id),
    proposal_id: text(raw.proposal_id),
    trigger_type: text(raw.trigger_type, 'custom'),
    trigger_text: text(raw.trigger_text, 'A reaction may be available.'),
    eligible_token_ids: textArray(raw.eligible_token_ids),
    allow_additional: boolean(raw.allow_additional, false),
    status: raw.status === 'closed' ? 'closed' : 'open',
    created_by: text(raw.created_by),
    opened_at: text(raw.opened_at),
    closed_at: text(raw.closed_at) || null,
    combat_reaction_responses: Array.isArray(raw.combat_reaction_responses)
      ? raw.combat_reaction_responses.map(normalizeReactionResponse)
      : [],
  } as ReactionWindow;
}

export function normalizeCombatEvent(value: unknown, previous?: CombatEvent): CombatEvent {
  const incoming = record(value);
  const raw = { ...record(previous), ...incoming };
  const validTypes = ['chat', 'roll', 'proposal', 'reaction', 'resolution', 'system', 'movement'];
  return {
    ...raw,
    id: text(raw.id),
    encounter_id: text(raw.encounter_id),
    proposal_id: text(raw.proposal_id) || null,
    resolution_id: text(raw.resolution_id) || null,
    event_type: validTypes.includes(text(raw.event_type)) ? raw.event_type : 'system',
    message: typeof raw.message === 'string' ? raw.message : '',
    payload: record(raw.payload),
    created_by: text(raw.created_by) || null,
    created_at: text(raw.created_at),
  } as CombatEvent;
}

export function normalizeCombatEncounter(value: unknown, previous?: CombatEncounter): CombatEncounter {
  const incoming = record(value);
  const raw = { ...record(previous), ...incoming };
  const validStatuses = ['setup', 'active', 'paused', 'ended'];
  return {
    ...raw,
    id: text(raw.id),
    campaign_id: text(raw.campaign_id) || null,
    dm_user_id: text(raw.dm_user_id),
    name: text(raw.name, 'Untitled encounter'),
    status: validStatuses.includes(text(raw.status)) ? raw.status : 'setup',
    turn_mode: raw.turn_mode === 'free' ? 'free' : 'initiative',
    round_number: Math.max(1, Math.trunc(number(raw.round_number, 1))),
    active_turn_token_id: text(raw.active_turn_token_id) || null,
    settings: record(raw.settings),
    created_at: text(raw.created_at),
    updated_at: text(raw.updated_at),
  } as CombatEncounter;
}

export function normalizeCombatMap(value: unknown): CombatMap | null {
  if (value === null || value === undefined) return null;
  const raw = record(value);
  if (!text(raw.id)) return null;
  const presets = ['blank', 'grass', 'stone', 'dirt'];
  return {
    ...raw,
    id: text(raw.id),
    encounter_id: text(raw.encounter_id),
    map_type: raw.map_type === 'upload' ? 'upload' : 'preset',
    storage_path: text(raw.storage_path) || null,
    preset_name: presets.includes(text(raw.preset_name))
      ? raw.preset_name
      : raw.map_type === 'upload' ? null : 'blank',
    grid_columns: Math.max(5, Math.trunc(number(raw.grid_columns, 24))),
    grid_rows: Math.max(5, Math.trunc(number(raw.grid_rows, 18))),
    feet_per_square: Math.max(1, number(raw.feet_per_square, 5)),
    settings: record(raw.settings),
    signedUrl: text(raw.signedUrl) || undefined,
  } as CombatMap;
}

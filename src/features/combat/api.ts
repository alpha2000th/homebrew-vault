import type {
  AreaTemplate,
  CombatEncounter,
  CombatEvent,
  CombatMap,
  CombatProposal,
  CombatToken,
  EncounterStatus,
  ReactionWindow,
  ResolutionPayload,
  TurnMode,
  CombatAction,
} from '../../types/combat';
import { migrateCharacterData } from '../../lib/combat/characterSchema';
import { supabase } from '../../lib/supabase/client';

const throwIf = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export async function listEncounters(): Promise<CombatEncounter[]> {
  const { data, error } = await supabase
    .from('combat_encounters')
    .select('*')
    .order('updated_at', { ascending: false });
  throwIf(error);
  return (data ?? []) as CombatEncounter[];
}

export async function createEncounter(input: {
  name: string;
  campaignId?: string | null;
  turnMode: TurnMode;
  preset: CombatMap['preset_name'];
  columns: number;
  rows: number;
  feetPerSquare: number;
}): Promise<CombatEncounter> {
  const { data, error } = await supabase.rpc('create_combat_encounter', {
    p_name: input.name,
    p_campaign_id: input.campaignId || null,
    p_turn_mode: input.turnMode,
    p_preset_name: input.preset ?? 'blank',
    p_grid_columns: input.columns,
    p_grid_rows: input.rows,
    p_feet_per_square: input.feetPerSquare,
  });
  throwIf(error);
  if (!data) throw new Error('Supabase did not return the new encounter.');
  return data as unknown as CombatEncounter;
}

export async function loadEncounterBundle(encounterId: string) {
  const [encounter, map, tokens, proposals, reactions, events] = await Promise.all([
    supabase.from('combat_encounters').select('*').eq('id', encounterId).single(),
    supabase.from('combat_maps').select('*').eq('encounter_id', encounterId).maybeSingle(),
    supabase.from('combat_tokens').select('*').eq('encounter_id', encounterId).order('initiative_order'),
    supabase.from('combat_proposals').select('*').eq('encounter_id', encounterId).order('created_at', { ascending: false }),
    supabase.from('combat_reaction_windows').select('*, combat_reaction_responses(*)')
      .eq('encounter_id', encounterId).order('opened_at', { ascending: false }),
    supabase.from('combat_events').select('*').eq('encounter_id', encounterId)
      .order('created_at', { ascending: false }).limit(300),
  ]);
  [encounter.error, map.error, tokens.error, proposals.error, reactions.error, events.error].forEach(throwIf);
  let combatMap = map.data as CombatMap | null;
  if (combatMap?.storage_path) {
    const signed = await supabase.storage.from('combat-maps').createSignedUrl(combatMap.storage_path, 3600);
    if (!signed.error) combatMap = { ...combatMap, signedUrl: signed.data.signedUrl };
  }
  return {
    encounter: encounter.data as CombatEncounter,
    map: combatMap,
    tokens: (tokens.data ?? []) as CombatToken[],
    proposals: (proposals.data ?? []) as CombatProposal[],
    reactions: (reactions.data ?? []) as unknown as ReactionWindow[],
    events: (events.data ?? []) as CombatEvent[],
  };
}

export async function listAvailableCharacters() {
  const { data, error } = await supabase
    .from('characters')
    .select('id, owner_id, campaign_id, data, updated_at')
    .order('updated_at', { ascending: false });
  throwIf(error);
  return (data ?? []).map((row) => ({ ...row, data: migrateCharacterData(row.data) }));
}

export async function listProfiles() {
  const { data, error } = await supabase.from('profiles').select('id, display_name, email').order('display_name');
  throwIf(error);
  return data ?? [];
}

export async function addVaultToken(
  encounterId: string,
  character: { id: string; data: ReturnType<typeof migrateCharacterData> },
  assignedUserId: string | null,
  position: { x: number; y: number },
) {
  if (assignedUserId) {
    const { error: memberError } = await supabase.from('combat_members').upsert({
      encounter_id: encounterId,
      user_id: assignedUserId,
      role: 'player',
    }, { onConflict: 'encounter_id,user_id' });
    throwIf(memberError);
  }
  const state = {
    hp: character.data.hp,
    conditions: character.data.conditions,
    resourcePools: character.data.resourcePools,
    portraitUrl: character.data.portraitUrl,
    icon: character.data.icon,
    speed: character.data.speed,
    actions: character.data.actions,
    homebrewPowers: character.data.homebrewPowers,
    legendaryActionsPerRound: character.data.legendaryActionsPerRound ?? 0,
    legendaryActionsUsed: character.data.legendaryActionsUsed ?? 0,
    temporaryNpc: false,
  };
  const { data, error } = await supabase.from('combat_tokens').insert({
    encounter_id: encounterId,
    character_id: character.id,
    assigned_user_id: assignedUserId,
    name: character.data.name,
    x: position.x,
    y: position.y,
    state,
  }).select().single();
  throwIf(error);
  return data as CombatToken;
}

export async function addTemporaryToken(
  encounterId: string,
  input: { name: string; hp: number; assignedUserId?: string | null; x?: number; y?: number },
) {
  if (input.assignedUserId) {
    const { error: memberError } = await supabase.from('combat_members').upsert({
      encounter_id: encounterId,
      user_id: input.assignedUserId,
      role: 'player',
    }, { onConflict: 'encounter_id,user_id' });
    throwIf(memberError);
  }
  const { data, error } = await supabase.from('combat_tokens').insert({
    encounter_id: encounterId,
    name: input.name.trim() || 'Temporary NPC',
    assigned_user_id: input.assignedUserId || null,
    x: input.x ?? 0,
    y: input.y ?? 0,
    state: {
      hp: { current: input.hp, max: input.hp, temp: 0 },
      conditions: [],
      resourcePools: [],
      actions: [],
      temporaryNpc: true,
    },
  }).select().single();
  throwIf(error);
  return data as CombatToken;
}

export async function deleteToken(tokenId: string) {
  const { error } = await supabase.from('combat_tokens').delete().eq('id', tokenId);
  throwIf(error);
}

export async function moveToken(tokenId: string, x: number, y: number, expectedUpdatedAt: string) {
  const { data, error } = await supabase.rpc('move_combat_token', {
    p_token_id: tokenId,
    p_x: x,
    p_y: y,
    p_expected_updated_at: expectedUpdatedAt,
  });
  throwIf(error);
  return data as CombatToken;
}

export async function updateEncounter(
  encounterId: string,
  patch: Partial<Pick<CombatEncounter, 'name' | 'status' | 'turn_mode' | 'round_number' | 'active_turn_token_id' | 'settings'>>,
) {
  const { data, error } = await supabase.from('combat_encounters').update(patch).eq('id', encounterId).select().single();
  throwIf(error);
  return data as CombatEncounter;
}

export async function advanceCombatRound(encounterId: string, direction = 1) {
  const { data, error } = await supabase.rpc('advance_combat_round', {
    p_encounter_id: encounterId,
    p_direction: direction,
  });
  throwIf(error);
  return data as CombatEncounter;
}

export async function updateTokenAsDm(tokenId: string, patch: Partial<CombatToken>) {
  const { data, error } = await supabase.from('combat_tokens').update(patch).eq('id', tokenId).select().single();
  throwIf(error);
  return data as CombatToken;
}

export async function uploadCombatMap(encounterId: string, file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
    throw new Error('Map must be a JPG, PNG, or WebP image.');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('Map must be 10 MB or smaller.');
  const path = `${encounterId}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await supabase.storage.from('combat-maps').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  throwIf(uploaded.error);
  const { data, error } = await supabase.from('combat_maps').update({
    map_type: 'upload',
    storage_path: path,
    preset_name: null,
  }).eq('encounter_id', encounterId).select().single();
  throwIf(error);
  const signed = await supabase.storage.from('combat-maps').createSignedUrl(path, 3600);
  throwIf(signed.error);
  if (!signed.data) throw new Error('Could not create a signed map URL.');
  return { ...(data as CombatMap), signedUrl: signed.data.signedUrl };
}

export async function updateMap(encounterId: string, patch: Partial<CombatMap>) {
  const { data, error } = await supabase.from('combat_maps').update(patch).eq('encounter_id', encounterId).select().single();
  throwIf(error);
  return data as CombatMap;
}

export async function saveDraft(input: {
  encounterId: string;
  actorTokenId: string;
  sourceAction: Record<string, unknown> | CombatAction;
  targets: string[];
  areaTemplate?: AreaTemplate | null;
  rollData: Record<string, unknown>;
  calculated: ResolutionPayload;
  playerOverride: ResolutionPayload;
  description: string;
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in before proposing an action.');
  const { data, error } = await supabase.from('combat_proposals').insert({
    encounter_id: input.encounterId,
    actor_token_id: input.actorTokenId,
    created_by: auth.user.id,
    proposal_type: 'action',
    status: 'draft',
    source_action: input.sourceAction,
    target_token_ids: input.targets,
    area_template: input.areaTemplate ?? null,
    roll_data: input.rollData,
    calculated_payload: input.calculated,
    player_override_payload: input.playerOverride,
    description: input.description,
  }).select().single();
  throwIf(error);
  return data as CombatProposal;
}

export async function submitProposal(proposalId: string, expectedVersion: number) {
  const { data, error } = await supabase.rpc('submit_combat_proposal', {
    p_proposal_id: proposalId,
    p_expected_version: expectedVersion,
  });
  throwIf(error);
  return data as CombatProposal;
}

export async function resolveProposal(
  proposal: CombatProposal,
  payload: ResolutionPayload,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('resolve_combat_proposal', {
    p_proposal_id: proposal.id,
    p_expected_version: proposal.version,
    p_dm_payload: payload,
    p_idempotency_key: idempotencyKey,
  });
  throwIf(error);
  return data;
}

export async function applyDirectResolution(
  encounterId: string,
  payload: ResolutionPayload,
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc('apply_direct_combat_resolution', {
    p_encounter_id: encounterId,
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  });
  throwIf(error);
  return data;
}

export async function undoLatestResolution(encounterId: string) {
  const { data, error } = await supabase.rpc('undo_latest_combat_resolution', {
    p_encounter_id: encounterId,
  });
  throwIf(error);
  return data;
}

export async function createReactionWindow(input: {
  encounterId: string;
  proposalId: string;
  triggerType: string;
  triggerText: string;
  eligibleTokenIds: string[];
  allowAdditional: boolean;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('combat_reaction_windows').insert({
    encounter_id: input.encounterId,
    proposal_id: input.proposalId,
    trigger_type: input.triggerType,
    trigger_text: input.triggerText,
    eligible_token_ids: input.eligibleTokenIds,
    allow_additional: input.allowAdditional,
    created_by: auth.user?.id,
  }).select().single();
  throwIf(error);
  return data as ReactionWindow;
}

export async function respondToReaction(input: {
  windowId: string;
  tokenId: string;
  type: 'reaction' | 'custom' | 'pass' | 'question';
  selectedReaction?: Record<string, unknown> | CombatAction | null;
  text?: string;
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in before responding.');
  const { data, error } = await supabase.from('combat_reaction_responses').upsert({
    reaction_window_id: input.windowId,
    responder_user_id: auth.user.id,
    responder_token_id: input.tokenId,
    response_type: input.type,
    selected_reaction: input.selectedReaction ?? null,
    custom_text: input.text ?? '',
  }, { onConflict: 'reaction_window_id,responder_user_id,responder_token_id' }).select().single();
  throwIf(error);
  return data;
}

export async function closeReactionWindow(windowId: string) {
  const { data, error } = await supabase.from('combat_reaction_windows')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', windowId).select().single();
  throwIf(error);
  return data;
}

export async function sendChat(encounterId: string, message: string) {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('combat_events').insert({
    encounter_id: encounterId,
    event_type: 'chat',
    message: message.trim(),
    payload: {},
    created_by: auth.user?.id,
  }).select().single();
  throwIf(error);
  return data as CombatEvent;
}

export async function setEncounterStatus(encounterId: string, status: EncounterStatus) {
  return updateEncounter(encounterId, { status });
}

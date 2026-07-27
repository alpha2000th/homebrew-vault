export type EncounterStatus = 'setup' | 'active' | 'paused' | 'ended';
export type TurnMode = 'initiative' | 'free';
export type ProposalStatus =
  | 'draft' | 'submitted' | 'reaction_window' | 'awaiting_dm'
  | 'resolved' | 'rejected' | 'cancelled' | 'undone';

export interface HpState {
  current: number;
  max: number;
  temp: number;
}

export interface ResourcePool {
  id?: string;
  name: string;
  current: number;
  max: number;
  rechargeType?: string;
}

export interface StructuredEffect {
  kind: 'damage' | 'healing' | 'temp_hp' | 'condition' | 'resource' | 'note';
  formula?: string;
  damageType?: string;
  condition?: string;
  resourceId?: string;
  amount?: number;
}

export interface CombatAction {
  id?: string;
  category: 'action' | 'bonus' | 'reaction' | 'legendary' | 'lair' | 'power';
  name: string;
  cost: string;
  description: string;
  attackFormula?: string;
  damageFormulas?: Array<{ formula: string; type?: string }>;
  healingFormula?: string;
  saveAbility?: string;
  saveDc?: number;
  resourceCosts?: Array<{ resourceId?: string; name?: string; amount: number }>;
  range?: string;
  area?: AreaTemplate;
  targetType?: string;
  effects?: StructuredEffect[];
}

export interface CharacterData {
  schemaVersion?: number;
  name: string;
  icon?: string;
  portraitUrl?: string;
  speed?: string;
  hp: HpState;
  conditions: string[];
  resourcePools: ResourcePool[];
  actions: CombatAction[];
  homebrewPowers?: Array<Record<string, unknown>>;
  legendaryActionsPerRound?: number;
  legendaryActionsUsed?: number;
  [key: string]: unknown;
}

export interface CombatEncounter {
  id: string;
  campaign_id: string | null;
  dm_user_id: string;
  name: string;
  status: EncounterStatus;
  turn_mode: TurnMode;
  round_number: number;
  active_turn_token_id: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CombatMap {
  id: string;
  encounter_id: string;
  map_type: 'upload' | 'preset';
  storage_path: string | null;
  preset_name: 'blank' | 'grass' | 'stone' | 'dirt' | null;
  grid_columns: number;
  grid_rows: number;
  feet_per_square: number;
  settings: Record<string, unknown>;
  signedUrl?: string;
}

export interface CombatToken {
  id: string;
  encounter_id: string;
  character_id: string | null;
  assigned_user_id: string | null;
  name: string;
  team: string;
  initiative: number | null;
  initiative_order: number;
  x: number;
  y: number;
  width_squares: number;
  height_squares: number;
  rotation: number;
  visible: boolean;
  state: {
    hp: HpState;
    conditions: string[];
    resourcePools: ResourcePool[];
    portraitUrl?: string;
    icon?: string;
    speed?: string;
    actions?: CombatAction[];
    homebrewPowers?: Array<Record<string, unknown>>;
    legendaryActionsPerRound?: number;
    legendaryActionsUsed?: number;
    temporaryNpc?: boolean;
    dead?: boolean;
    unconscious?: boolean;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export interface AreaTemplate {
  shape: 'circle' | 'square' | 'rectangle' | 'cone' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface RollDie {
  sides: number;
  value: number;
  kept: boolean;
  group: number;
}

export interface RollResult {
  expression: string;
  normalizedExpression: string;
  dice: RollDie[];
  modifier: number;
  total: number;
  mode: 'normal' | 'advantage' | 'disadvantage';
  critical: boolean;
}

export interface ResolutionTarget {
  token_id: string;
  damage?: number;
  healing?: number;
  temp_hp?: number;
  set_hp?: number;
  set_max_hp?: number;
  remove_temp_hp?: boolean;
  conditions_add?: string[];
  conditions_remove?: string[];
  resource_changes?: Array<{ id?: string; name?: string; delta?: number; set?: number }>;
  x?: number;
  y?: number;
  dead?: boolean;
  unconscious?: boolean;
  note?: string;
}

export interface ResolutionPayload {
  targets: ResolutionTarget[];
  note?: string;
}

export interface CombatProposal {
  id: string;
  encounter_id: string;
  actor_token_id: string;
  created_by: string;
  proposal_type: string;
  status: ProposalStatus;
  source_action: CombatAction | Record<string, unknown>;
  target_token_ids: string[];
  area_template: AreaTemplate | null;
  roll_data: Record<string, unknown>;
  calculated_payload: ResolutionPayload;
  player_override_payload: ResolutionPayload;
  dm_final_payload: ResolutionPayload;
  description: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CombatEvent {
  id: string;
  encounter_id: string;
  proposal_id: string | null;
  resolution_id: string | null;
  event_type: 'chat' | 'roll' | 'proposal' | 'reaction' | 'resolution' | 'system' | 'movement';
  message: string;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface ReactionWindow {
  id: string;
  proposal_id: string;
  trigger_type: string;
  trigger_text: string;
  eligible_token_ids: string[];
  allow_additional: boolean;
  status: 'open' | 'closed';
  created_by: string;
  opened_at: string;
  closed_at: string | null;
  combat_reaction_responses?: ReactionResponse[];
}

export interface ReactionResponse {
  id: string;
  reaction_window_id: string;
  responder_user_id: string;
  responder_token_id: string;
  response_type: 'reaction' | 'custom' | 'pass' | 'question';
  selected_reaction: CombatAction | null;
  custom_text: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

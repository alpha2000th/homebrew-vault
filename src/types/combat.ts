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

export type GuidedActionStep =
  | 'choose_category'
  | 'choose_ability'
  | 'ability_detail'
  | 'legacy_route'
  | 'choose_targets'
  | 'place_area'
  | 'attack_roll'
  | 'saving_throw'
  | 'damage'
  | 'healing'
  | 'temporary_hp'
  | 'utility_effects'
  | 'multiattack'
  | 'review'
  | 'submitting'
  | 'submitted';

export type GuidedEffectRoute =
  | 'attack'
  | 'damage'
  | 'saving_throw'
  | 'healing'
  | 'temporary_hp'
  | 'utility'
  | 'multiattack'
  | 'custom';

export type SuggestedOutcome = 'awaiting_dm' | 'hit' | 'miss' | 'success' | 'failure' | 'custom';

export interface DamageComponent {
  id: string;
  formula: string;
  damageType: string;
  source: string;
  roll: RollResult | null;
  calculatedSubtotal: number;
  playerOverride: number | null;
  finalSubtotal: number;
  criticalDoubling: boolean;
  included: boolean;
}

export interface TargetOutcome {
  tokenId: string;
  roll: number | null;
  suggestedOutcome: SuggestedOutcome;
  damageMode: 'full' | 'half' | 'none' | 'custom';
  customMultiplier: number | null;
  customResult: string;
  playerDamage: number | null;
  dmFinalDamage?: number | null;
}

export interface HealingComponent {
  formula: string;
  roll: RollResult | null;
  calculated: number;
  playerOverride: number | null;
  flatBonus: number;
}

export interface TemporaryHpComponent extends HealingComponent {
  effectType: 'temporary_hp';
}

export interface UtilityEffect {
  id: string;
  kind: 'condition' | 'remove_condition' | 'movement' | 'resource' | 'summon' | 'map_object' | 'ongoing' | 'note';
  text: string;
  duration?: string;
  saveEnds?: boolean;
}

export interface ProposedResourceCost {
  resourceId?: string;
  name: string;
  amount: number;
  timing: 'on_resolution';
}

export interface AttackEntry {
  id: string;
  name: string;
  sourceActionId?: string;
  targetIds: string[];
  attackFormula: string;
  attackRoll: RollResult | null;
  attackOverride: number | null;
  suggestedOutcome: SuggestedOutcome;
  damageComponents: DamageComponent[];
  effects: UtilityEffect[];
  skipped: boolean;
}

export interface GuidedActionDraft {
  schemaVersion: 2;
  encounterId: string;
  actorTokenId: string;
  category: ActionCategoryName | 'movement' | 'custom';
  step: GuidedActionStep;
  history: GuidedActionStep[];
  sourceAction: CombatAction | null;
  legacyRoute: GuidedEffectRoute | null;
  targetIds: string[];
  targetOutcomes: Record<string, TargetOutcome>;
  areaTemplate: AreaTemplate | null;
  attackEntry: AttackEntry | null;
  multiattackEntries: AttackEntry[];
  damageComponents: DamageComponent[];
  healing: HealingComponent | null;
  temporaryHp: TemporaryHpComponent | null;
  utilityEffects: UtilityEffect[];
  resourceCosts: ProposedResourceCost[];
  note: string;
  updatedAt: string;
}

export type ActionCategoryName = CombatAction['category'];

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

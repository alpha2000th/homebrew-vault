import { Activity, ChevronLeft, ChevronRight, FastForward, Gavel, MessageSquare, ShieldAlert, Sparkles, Swords } from 'lucide-react';
import { useState } from 'react';
import type {
  AreaTemplate,
  CombatEncounter,
  CombatEvent,
  CombatMap,
  CombatProposal,
  CombatToken,
  ReactionWindow,
} from '../../types/combat';
import { advanceCombatRound, sendChat, updateEncounter, updateTokenAsDm } from './api';
import { ActionPanel } from './ActionPanel';
import { DmResolutionPanel } from './DmResolutionPanel';
import { ProposalReviewPanel } from './ProposalReviewPanel';
import { ReactionPanel } from './ReactionPanel';

type Tab = 'turns' | 'actions' | 'proposals' | 'reactions' | 'dm' | 'chat';

export interface CombatPanelProps {
  encounter: CombatEncounter;
  map: CombatMap | null;
  tokens: CombatToken[];
  proposals: CombatProposal[];
  reactions: ReactionWindow[];
  events: CombatEvent[];
  userId: string;
  isDm: boolean;
  actorId: string;
  selectedIds: string[];
  targetIds: string[];
  areaTemplate: AreaTemplate | null;
  targetMode: boolean;
  onActorId: (id: string) => void;
  onSelectedIds: (ids: string[]) => void;
  onTargetIds: (ids: string[]) => void;
  onAreaTemplate: (template: AreaTemplate | null) => void;
  onTargetMode: (enabled: boolean) => void;
  onFocusToken: (id: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';

function TurnPanel({
  encounter,
  tokens,
  isDm,
  selectedIds,
  onSelectedIds,
  onFocusToken,
  onRefresh,
  onError,
}: Pick<CombatPanelProps,
  'encounter' | 'tokens' | 'isDm' | 'selectedIds' | 'onSelectedIds' | 'onFocusToken' | 'onRefresh' | 'onError'>) {
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
    try { await updateTokenAsDm(token.id, { initiative: value }); await onRefresh(); }
    catch (error) { onError(errorMessage(error)); }
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
    <div className="panel-section turns-panel" data-testid="turns-panel">
      <div className="turn-summary">
        <div><small>Mode</small><strong>{encounter.turn_mode === 'initiative' ? 'Initiative' : 'Free'}</strong></div>
        <div><small>Round</small><strong>{encounter.round_number}</strong></div>
        <div><small>Status</small><strong>{encounter.status}</strong></div>
      </div>
      {isDm && (
        <div className="panel-row">
          <button type="button" className="panel-button" onClick={() => void changeTurn(-1)}><ChevronLeft /> Previous</button>
          <button type="button" className="panel-button primary" onClick={() => void changeTurn(1)}>Next <ChevronRight /></button>
          <button type="button" className="panel-button" onClick={async () => {
            try { await advanceCombatRound(encounter.id); await onRefresh(); }
            catch (error) { onError(errorMessage(error)); }
          }}><FastForward /> Advance round</button>
        </div>
      )}
      {encounter.turn_mode === 'free' && <p className="panel-note">Free Mode: proposals may be resolved in any order. Initiative remains visible but advisory.</p>}
      <div className="initiative-list">
        {ordered.map((token, index) => (
          <div
            key={token.id}
            role="button"
            tabIndex={0}
            draggable={isDm}
            onClick={() => { onSelectedIds([token.id]); onFocusToken(token.id); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectedIds([token.id]); onFocusToken(token.id); }
            }}
            onDragStart={() => setDraggedId(token.id)}
            onDragOver={(event) => { if (isDm) event.preventDefault(); }}
            onDrop={() => void reorder(index)}
            className={[
              token.id === encounter.active_turn_token_id ? 'initiative-row active' : 'initiative-row',
              selectedIds.includes(token.id) ? 'selected' : '',
              draggedId === token.id ? 'dragging' : '',
            ].join(' ')}
            data-testid={`initiative-row-${token.id}`}
          >
            <span className="initiative-rank">{index + 1}</span>
            <span className="initiative-avatar">{token.state.icon || token.name.slice(0, 2).toUpperCase()}</span>
            <span className="initiative-name">{token.name}<small>{token.state.hp.current}/{token.state.hp.max} HP · +{token.state.hp.temp} temp</small></span>
            {isDm ? (
              <input aria-label={`${token.name} initiative`} type="number" value={token.initiative ?? 0} onClick={(event) => event.stopPropagation()} onChange={(event) => void setInitiative(token, Number(event.target.value))} />
            ) : <strong>{token.initiative ?? '—'}</strong>}
          </div>
        ))}
        {!ordered.length && <div className="empty-panel useful-empty"><Activity /><strong>No combatants yet</strong><p>The DM can add vault characters or temporary NPCs from Setup.</p></div>}
      </div>
      {isDm && (
        <footer className="sticky-submit">
          <span className="panel-note">Switching mode does not erase initiative or turn state.</span>
          <button type="button" className="panel-button" onClick={async () => {
            try {
              await updateEncounter(encounter.id, { turn_mode: encounter.turn_mode === 'initiative' ? 'free' : 'initiative' });
              await onRefresh();
            } catch (error) { onError(errorMessage(error)); }
          }} data-testid="switch-turn-mode">Switch to {encounter.turn_mode === 'initiative' ? 'Free' : 'Initiative'} Mode</button>
        </footer>
      )}
    </div>
  );
}

function ChatPanel({ encounter, events, onRefresh, onError }: Pick<CombatPanelProps, 'encounter' | 'events' | 'onRefresh' | 'onError'>) {
  const [message, setMessage] = useState('');
  const submit = async () => {
    if (!message.trim()) return;
    try { await sendChat(encounter.id, message); setMessage(''); await onRefresh(); }
    catch (error) { onError(errorMessage(error)); }
  };
  return (
    <div className="chat-panel" data-testid="chat-panel">
      <div className="event-feed">
        {events.map((event) => (
          <article key={event.id} className={`event event-${event.event_type}`} data-testid={`history-event-${event.id}`}>
            <span>{event.event_type}</span><p>{event.message}</p>
            {event.event_type === 'proposal' && (() => {
              const roll = event.payload.roll as Record<string, unknown> | undefined;
              const attack = roll?.attack as Record<string, unknown> | undefined;
              const damage = roll?.damage as Record<string, unknown> | undefined;
              return (
                <small className="event-roll-summary">
                  Attack {String(attack?.final ?? 'not rolled')} · Damage {String(damage?.playerCombined ?? 'custom')}
                </small>
              );
            })()}
            <time>{new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </article>
        ))}
        {!events.length && <div className="empty-panel useful-empty"><MessageSquare /><strong>No combat history yet</strong><p>Chat, proposals, rolls, movement, resolutions, and undo events will appear here.</p></div>}
      </div>
      <div className="chat-compose">
        <textarea aria-label="Combat chat message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message everyone…" onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); }
        }} />
        <button type="button" className="panel-button primary" onClick={() => void submit()} data-testid="send-chat">Send</button>
      </div>
    </div>
  );
}

const tabs: Array<{ id: Tab; label: string; icon: typeof Swords }> = [
  { id: 'turns', label: 'Turns', icon: Activity },
  { id: 'actions', label: 'Actions', icon: Swords },
  { id: 'proposals', label: 'Proposals', icon: Gavel },
  { id: 'reactions', label: 'Reactions', icon: ShieldAlert },
  { id: 'dm', label: 'DM', icon: Sparkles },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
];

export function CombatPanel(props: CombatPanelProps) {
  const [tab, setTab] = useState<Tab>('turns');
  const visibleTabs = tabs.filter((item) => item.id !== 'dm' || props.isDm);
  const counts: Record<Tab, number> = {
    turns: props.tokens.length,
    actions: props.tokens.filter((token) => props.isDm || token.assigned_user_id === props.userId).length,
    proposals: props.proposals.filter((proposal) => ['submitted', 'awaiting_dm', 'reaction_window'].includes(proposal.status)).length,
    reactions: props.reactions.filter((window) => window.status === 'open').length,
    dm: props.targetIds.length,
    chat: props.events.length,
  };
  const feetPerSquare = props.map?.feet_per_square ?? 5;

  return (
    <aside className="combat-panel" data-testid="combat-panel">
      <nav className="combat-tabs" aria-label="Combat panels">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} title={label} data-testid={`combat-tab-${id}`}>
            <Icon /><span>{label}</span><b>{counts[id]}</b>
          </button>
        ))}
      </nav>
      <div className="combat-panel-content" data-testid="combat-panel-content">
        {tab === 'turns' && <TurnPanel {...props} />}
        {tab === 'actions' && (
          <ActionPanel
            {...props}
            feetPerSquare={feetPerSquare}
            onSelectToken={(id) => props.onSelectedIds([id])}
          />
        )}
        {tab === 'proposals' && (
          <ProposalReviewPanel
            proposals={props.proposals}
            tokens={props.tokens}
            isDm={props.isDm}
            selectedIds={props.selectedIds}
            onFocusToken={props.onFocusToken}
            onRefresh={props.onRefresh}
            onError={props.onError}
          />
        )}
        {tab === 'reactions' && (
          <ReactionPanel
            reactions={props.reactions}
            proposals={props.proposals}
            tokens={props.tokens}
            userId={props.userId}
            isDm={props.isDm}
            selectedIds={props.selectedIds}
            onFocusToken={props.onFocusToken}
            onRefresh={props.onRefresh}
            onError={props.onError}
          />
        )}
        {tab === 'dm' && props.isDm && (
          <DmResolutionPanel
            encounter={props.encounter}
            tokens={props.tokens}
            targetIds={props.targetIds}
            selectedIds={props.selectedIds}
            feetPerSquare={feetPerSquare}
            onTargetIds={props.onTargetIds}
            onFocusToken={props.onFocusToken}
            onRefresh={props.onRefresh}
            onError={props.onError}
          />
        )}
        {tab === 'chat' && <ChatPanel {...props} />}
      </div>
    </aside>
  );
}

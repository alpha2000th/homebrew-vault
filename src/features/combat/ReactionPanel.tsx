import { HelpCircle, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import type { CombatProposal, CombatToken, ReactionWindow } from '../../types/combat';
import { actionsForToken } from '../../lib/combat/workflow';
import { closeReactionWindow, respondToReaction, updateReactionWindow } from './api';
import { TargetSelector } from './TargetSelector';

interface Props {
  reactions: ReactionWindow[];
  proposals: CombatProposal[];
  tokens: CombatToken[];
  userId: string;
  isDm: boolean;
  selectedIds: string[];
  onFocusToken: (id: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

const broadTriggers = [
  'You are being attacked',
  'An area effect is targeting you',
  'A spell is targeting you',
  'An ally is being attacked',
  'A creature is moving nearby',
  'You are about to take damage',
  'Custom trigger',
];

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';

export function ReactionPanel({ reactions, proposals, tokens, userId, isDm, selectedIds, onFocusToken, onRefresh, onError }: Props) {
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [triggerDrafts, setTriggerDrafts] = useState<Record<string, string>>({});
  const open = reactions.filter((window) => window.status === 'open');

  if (!reactions.length) {
    return (
      <div className="empty-panel useful-empty" data-testid="reactions-empty">
        <ShieldAlert /><strong>No reaction window is currently open</strong>
        <p>The DM opens a broad trigger from a proposal. Affected players may choose any recorded reaction, respond freely, pass, or ask the DM.</p>
      </div>
    );
  }

  return (
    <div className="panel-section reactions-panel" data-testid="reactions-panel">
      <div className="panel-heading"><div><h3>Reaction windows</h3><p>{open.length} open · no reaction is recommended as legally valid</p></div></div>
      {reactions.map((window) => {
        const owned = tokens.filter((token) =>
          token.assigned_user_id === userId &&
          (window.allow_additional || window.eligible_token_ids.includes(token.id)));
        const proposal = proposals.find((item) => item.id === window.proposal_id);
        return (
          <article key={window.id} className="reaction-card" data-testid={`reaction-window-${window.id}`}>
            <header><ShieldAlert /><strong>{window.trigger_text}</strong><span>{window.status}</span></header>
            <p>For: {String(proposal?.source_action?.name ?? 'combat proposal')}</p>
            <p className="panel-note">This is a broad trigger only. The player and DM decide whether any response is appropriate.</p>

            {!!window.combat_reaction_responses?.length && (
              <div className="reaction-history">
                {window.combat_reaction_responses.map((response) => (
                  <div key={response.id}>
                    <strong>{tokens.find((token) => token.id === response.responder_token_id)?.name ?? 'Participant'}</strong>
                    <span>{response.response_type === 'question' ? 'Ask DM' : response.response_type}: {response.selected_reaction?.name ?? (response.custom_text || 'No text')}</span>
                  </div>
                ))}
              </div>
            )}

            {window.status === 'open' && owned.map((token) => {
              const reactionActions = actionsForToken(token).filter((action) => action.category === 'reaction');
              const key = `${window.id}:${token.id}`;
              return (
                <section key={token.id} className="reaction-response">
                  <header><strong>{token.name}</strong><small>{reactionActions.length} recorded reactions</small></header>
                  <div className="recorded-reactions">
                    {reactionActions.map((action) => (
                      <button type="button" key={action.id} onClick={async () => {
                        try {
                          await respondToReaction({ windowId: window.id, tokenId: token.id, type: 'reaction', selectedReaction: action });
                          await onRefresh();
                        } catch (error) { onError(errorMessage(error)); }
                      }}>{action.name}<small>{action.cost || 'Recorded reaction'}</small></button>
                    ))}
                    {!reactionActions.length && <div className="category-empty">This combatant has no recorded reactions. Custom, Pass, and Ask DM remain available.</div>}
                  </div>
                  <label>Custom reaction or question<textarea value={texts[key] ?? ''} onChange={(event) => setTexts({ ...texts, [key]: event.target.value })} /></label>
                  <div className="panel-row">
                    <button type="button" className="panel-button" onClick={async () => {
                      try {
                        await respondToReaction({ windowId: window.id, tokenId: token.id, type: 'custom', text: texts[key] });
                        setTexts({ ...texts, [key]: '' });
                        await onRefresh();
                      } catch (error) { onError(errorMessage(error)); }
                    }}>Submit custom</button>
                    <button type="button" className="panel-button" onClick={async () => {
                      try { await respondToReaction({ windowId: window.id, tokenId: token.id, type: 'pass', text: texts[key] }); await onRefresh(); }
                      catch (error) { onError(errorMessage(error)); }
                    }}>Pass</button>
                    <button type="button" className="panel-button" onClick={async () => {
                      try { await respondToReaction({ windowId: window.id, tokenId: token.id, type: 'question', text: texts[key] }); await onRefresh(); }
                      catch (error) { onError(errorMessage(error)); }
                    }}><HelpCircle /> Ask DM</button>
                  </div>
                </section>
              );
            })}

            {window.status === 'open' && !isDm && !owned.length && (
              <div className="category-empty">None of your assigned combatants are eligible for this reaction window.</div>
            )}

            {isDm && window.status === 'open' && (
              <section className="reaction-dm-controls">
                <h3>DM controls</h3>
                <label>Broad trigger<select value={broadTriggers.includes(window.trigger_text) ? window.trigger_text : 'Custom trigger'} onChange={async (event) => {
                  try {
                    const text = event.target.value === 'Custom trigger' ? 'A combat event may allow a reaction.' : event.target.value;
                    setTriggerDrafts((current) => ({ ...current, [window.id]: text }));
                    await updateReactionWindow(window.id, { trigger_text: text, trigger_type: event.target.value.toLowerCase().replace(/\s+/g, '_') });
                    await onRefresh();
                  } catch (error) { onError(errorMessage(error)); }
                }}>
                  {broadTriggers.map((trigger) => <option key={trigger}>{trigger}</option>)}
                </select></label>
                <label>Editable trigger text<input value={triggerDrafts[window.id] ?? window.trigger_text} onChange={(event) => {
                  setTriggerDrafts({ ...triggerDrafts, [window.id]: event.target.value });
                }} /></label>
                <button type="button" className="panel-button" onClick={async () => {
                  try {
                    await updateReactionWindow(window.id, { trigger_text: triggerDrafts[window.id] ?? window.trigger_text });
                    await onRefresh();
                  } catch (error) { onError(errorMessage(error)); }
                }}>Save trigger text</button>
                <TargetSelector
                  title="Eligible reaction tokens"
                  tokens={tokens}
                  selectedIds={window.eligible_token_ids}
                  selectedTokenIds={selectedIds}
                  onChange={(ids) => void updateReactionWindow(window.id, { eligible_token_ids: ids }).then(onRefresh).catch((error) => onError(errorMessage(error)))}
                  onFocus={onFocusToken}
                  testId={`reaction-eligible-${window.id}`}
                />
                <div className="panel-row">
                  <button type="button" className="panel-button" onClick={async () => {
                    try { await closeReactionWindow(window.id); await onRefresh(); }
                    catch (error) { onError(errorMessage(error)); }
                  }}>Close window</button>
                  <button type="button" className="panel-button primary" onClick={async () => {
                    try { await closeReactionWindow(window.id); await onRefresh(); }
                    catch (error) { onError(errorMessage(error)); }
                  }}>Continue without waiting</button>
                </div>
              </section>
            )}
          </article>
        );
      })}
    </div>
  );
}

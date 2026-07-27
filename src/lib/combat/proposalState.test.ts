import { describe, expect, it } from 'vitest';
import { canTransitionProposal, transitionProposal } from './proposalState';

describe('proposal state transitions', () => {
  it('allows the proposal and reaction workflow', () => {
    expect(transitionProposal('draft', 'submitted')).toBe('submitted');
    expect(canTransitionProposal('submitted', 'reaction_window')).toBe(true);
    expect(canTransitionProposal('reaction_window', 'awaiting_dm')).toBe(true);
    expect(canTransitionProposal('awaiting_dm', 'resolved')).toBe(true);
    expect(canTransitionProposal('resolved', 'undone')).toBe(true);
  });

  it('prevents duplicate or invalid resolution transitions', () => {
    expect(() => transitionProposal('resolved', 'resolved')).toThrow('Invalid proposal transition');
    expect(() => transitionProposal('cancelled', 'submitted')).toThrow();
  });
});

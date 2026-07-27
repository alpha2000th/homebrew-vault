import type { ProposalStatus } from '../../types/combat';

const transitions: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['reaction_window', 'awaiting_dm', 'rejected', 'cancelled'],
  reaction_window: ['awaiting_dm', 'rejected', 'cancelled'],
  awaiting_dm: ['resolved', 'rejected'],
  resolved: ['undone'],
  rejected: [],
  cancelled: [],
  undone: [],
};

export function canTransitionProposal(from: ProposalStatus, to: ProposalStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionProposal(from: ProposalStatus, to: ProposalStatus): ProposalStatus {
  if (!canTransitionProposal(from, to)) {
    throw new Error(`Invalid proposal transition: ${from} → ${to}`);
  }
  return to;
}

import { isVotingClosed, type VotingClosureFields } from '../guards/assertVotingOpen';

// One list a person can vote on (the places, or the times), as the dashboard knows it.
export type VotableList = {
  // live (not removed) options on the list; with one or none there is nothing to choose
  readonly liveOptionCount: number;
  readonly viewerVoted: boolean;
};

type VoteWaitingInput = {
  readonly brunch: VotingClosureFields;
  // RsvpStatus.canVote ("gets a say"), not countsAsAttendee ("is coming"): a maybe votes too
  readonly viewerCanVote: boolean;
  readonly lists: readonly VotableList[];
  readonly now: Date;
};

// "A vote is waiting on you" (the dashboard's butter pill): the brunch is active with voting
// still open, the person gets a say, and on at least one list that is really a vote (more than
// one live option, the same rule as deriveDecisionMode) they have cast no ballot yet. The host
// counts, since the host votes too. A draft, a closed or confirmed brunch never waits.
//
// Counts brunches, not ballots: a person who has voted on neither list still adds one.
export function isVoteWaiting(input: VoteWaitingInput): boolean {
  if (input.brunch.status.code !== 'active') return false;
  if (isVotingClosed(input.brunch, input.now)) return false;
  if (!input.viewerCanVote) return false;
  return input.lists.some((list) => list.liveOptionCount > 1 && !list.viewerVoted);
}

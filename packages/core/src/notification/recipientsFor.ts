import type { NotificationTypeCode, UserId } from '@brunchsters/shared';

// One member of the brunch, as the recipient rules need to see them.
export type RecipientMember = {
  readonly userId: UserId;
  readonly isHost: boolean;
  // Their RSVP lets them vote (RsvpStatus.canVote).
  readonly canVote: boolean;
  // They have cast a ballot on the open voting.
  readonly hasVoted: boolean;
};

export type RecipientsInput = {
  readonly type: NotificationTypeCode;
  readonly hostId: UserId;
  readonly members: readonly RecipientMember[];
  // The person whose action caused this. Never told about their own action.
  readonly actorId?: UserId;
  // For `invite.received`: the invited person's account, when they have one.
  readonly invitedUserId?: UserId;
};

// Who a type goes to (spec 0015 "Who is told what"; ADR 0017). Pure, so the table is one place to
// read and one place to test; the caller then asks `shouldDeliver` about each person.
//
//   - host activity (replies, votes, suggestions, a failed invite email): the host;
//   - the brunch changing (confirmed, called off, back on): every member but the host, who did it;
//   - a deadline reminder: members who can vote and have not;
//   - an invitation: the invited person, when they already have an account.
//
// A type nothing produces has no recipients. Recipients are de-duplicated and never include the
// actor.
export function recipientsFor(input: RecipientsInput): readonly UserId[] {
  const everyoneButHost = input.members.filter((member) => !member.isHost);
  let chosen: readonly UserId[];

  switch (input.type) {
    case 'rsvp.received':
    case 'vote.cast':
    case 'invite.suggestion':
    case 'location.suggested':
    case 'time.suggested':
    case 'invite.email.failed':
      chosen = [input.hostId];
      break;
    case 'brunch.confirmed':
    case 'brunch.cancelled':
    case 'brunch.reinstated':
      chosen = everyoneButHost.map((member) => member.userId);
      break;
    case 'vote.deadline.approaching':
      chosen = input.members
        .filter((member) => member.canVote && !member.hasVoted)
        .map((member) => member.userId);
      break;
    case 'invite.received':
      chosen = input.invitedUserId === undefined ? [] : [input.invitedUserId];
      break;
    case 'vote.autoclose.prompted':
    case 'running.late':
    case 'host.transferred':
      chosen = [];
      break;
  }

  return [...new Set(chosen)].filter((userId) => userId !== input.actorId);
}

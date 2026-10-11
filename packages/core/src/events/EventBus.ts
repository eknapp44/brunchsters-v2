import type {
  BrunchId,
  BrunchLocationId,
  BrunchTimeId,
  Email,
  InviteId,
  UserId,
} from '@brunchsters/shared';

export type RsvpResponse = 'yes' | 'no' | 'maybe';

type VotePayload = {
  readonly brunchId: BrunchId;
  readonly voterId: UserId;
  // Location ids or time ids, depending on which ballot was cast.
  readonly optionIds: readonly (BrunchLocationId | BrunchTimeId)[];
};

type RsvpPayload = {
  readonly brunchId: BrunchId;
  readonly viewerId: UserId;
  readonly response: RsvpResponse;
  // Only set on the path that starts from an invite link (respondToInvite);
  // updateRsvp works from the signed-in attendee and has no invite in hand.
  readonly inviteId?: InviteId;
};

// Payloads carry ids and facts about what just happened, never secrets: a
// handler that needs an invite's token reads the invite itself (ADR 0009).
// A name joins this map when a service starts emitting it.
export type BrunchEventPayloads = {
  'brunch/created': { readonly brunchId: BrunchId; readonly hostId: UserId };
  'brunch/confirmed': {
    readonly brunchId: BrunchId;
    readonly locationId: BrunchLocationId;
    readonly timeId: BrunchTimeId;
    readonly locationWasVoteLeader: boolean;
    readonly timeWasVoteLeader: boolean;
  };
  'invite/sent': {
    readonly brunchId: BrunchId;
    readonly inviteId: InviteId;
    readonly invitedEmail: Email;
  };
  'invite/resent': { readonly brunchId: BrunchId; readonly inviteId: InviteId };
  'attendee/rsvp.received': RsvpPayload;
  'attendee/rsvp.changed': RsvpPayload;
  'vote/cast': VotePayload;
  'vote/changed': VotePayload;
};

export type BrunchEventName = keyof BrunchEventPayloads;

export interface EventBus {
  emit<N extends BrunchEventName>(name: N, data: BrunchEventPayloads[N]): Promise<void>;
}

import {
  NOTIFICATION_TYPE_CODES,
  PRODUCED_NOTIFICATION_TYPES,
  type UserId,
} from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import { recipientsFor, type RecipientMember } from './recipientsFor';

const HOST = 'host' as UserId;
const MAYA = 'maya' as UserId;
const SAM = 'sam' as UserId;
const LEE = 'lee' as UserId;

const MEMBERS: readonly RecipientMember[] = [
  { userId: HOST, isHost: true, canVote: true, hasVoted: false },
  { userId: MAYA, isHost: false, canVote: true, hasVoted: true },
  { userId: SAM, isHost: false, canVote: true, hasVoted: false },
  { userId: LEE, isHost: false, canVote: false, hasVoted: false },
];

describe('recipientsFor', () => {
  it('tells only the host about replies, votes, suggestions and a failed invite email', () => {
    for (const type of [
      'rsvp.received',
      'vote.cast',
      'invite.suggestion',
      'location.suggested',
      'time.suggested',
      'invite.email.failed',
    ] as const) {
      expect(recipientsFor({ type, hostId: HOST, members: MEMBERS, actorId: MAYA })).toEqual([
        HOST,
      ]);
    }
  });

  it('never tells a person about their own action', () => {
    expect(
      recipientsFor({ type: 'vote.cast', hostId: HOST, members: MEMBERS, actorId: HOST }),
    ).toEqual([]);
  });

  it('tells every member but the host when the brunch is confirmed, called off or back on', () => {
    for (const type of ['brunch.confirmed', 'brunch.cancelled', 'brunch.reinstated'] as const) {
      expect(recipientsFor({ type, hostId: HOST, members: MEMBERS, actorId: HOST })).toEqual([
        MAYA,
        SAM,
        LEE,
      ]);
    }
  });

  it('reminds only members who can vote and have not', () => {
    expect(
      recipientsFor({ type: 'vote.deadline.approaching', hostId: HOST, members: MEMBERS }),
    ).toEqual([HOST, SAM]);
  });

  it('tells an invited person only when they already have an account', () => {
    expect(
      recipientsFor({
        type: 'invite.received',
        hostId: HOST,
        members: MEMBERS,
        invitedUserId: LEE,
        actorId: HOST,
      }),
    ).toEqual([LEE]);
    expect(
      recipientsFor({ type: 'invite.received', hostId: HOST, members: MEMBERS, actorId: HOST }),
    ).toEqual([]);
  });

  it('lists a person once', () => {
    expect(
      recipientsFor({
        type: 'brunch.confirmed',
        hostId: HOST,
        members: [...MEMBERS, { userId: SAM, isHost: false, canVote: true, hasVoted: false }],
      }),
    ).toEqual([MAYA, SAM, LEE]);
  });

  it('has recipients for every type something produces, and none for the rest', () => {
    for (const type of NOTIFICATION_TYPE_CODES) {
      const produced = (PRODUCED_NOTIFICATION_TYPES as readonly string[]).includes(type);
      const recipients = recipientsFor({
        type,
        hostId: HOST,
        members: MEMBERS,
        invitedUserId: LEE,
      });
      expect(recipients.length > 0).toBe(produced);
    }
  });
});

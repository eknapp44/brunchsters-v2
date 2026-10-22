import type { DbClient } from '@brunchsters/database';
import {
  avatarColorIndex,
  formatPersonName,
  initialsOf,
  type BrunchId,
  type UserId,
} from '@brunchsters/shared';
import { isBrunchMember } from './guards/isBrunchMember';

// Where a person stands: said yes, said maybe, said no, or has not answered ("pending" covers an
// invite that was only sent and an attendee still in the placeholder "invited" state).
export type RosterState = 'yes' | 'maybe' | 'no' | 'pending';

export type RosterCounts = {
  readonly yes: number;
  readonly maybe: number;
  readonly no: number;
  readonly pending: number;
};

// What the host sees (ADR 0012, PLANNING §17): everyone, by full name, and the people who were
// invited but have not answered (by email when they have not signed in yet).
export type HostRosterPerson = {
  // The full name, "You" for the host themself, or the invited email for someone not signed in.
  readonly name: string;
  readonly state: RosterState;
  readonly initials: string;
  readonly colorIndex: number;
  readonly isViewer: boolean;
};

// What any other member sees: "First L." for the people who said yes or maybe, and nothing else
// about anyone. This type has no email, no id, and no person who said no or has not answered;
// those only ever appear as numbers in `counts`.
export type MemberRosterPerson = {
  readonly name: string;
  readonly state: 'yes' | 'maybe';
  readonly initials: string;
  readonly colorIndex: number;
  readonly isViewer: boolean;
};

export type BrunchRoster =
  | {
      readonly kind: 'host';
      readonly people: readonly HostRosterPerson[];
      readonly counts: RosterCounts;
    }
  | {
      readonly kind: 'member';
      readonly people: readonly MemberRosterPerson[];
      readonly counts: RosterCounts;
    };

type GetBrunchRosterInput = {
  readonly brunchId: BrunchId;
  readonly viewerId: UserId;
};

const STATE_ORDER: Readonly<Record<RosterState, number>> = { yes: 0, maybe: 1, no: 2, pending: 3 };

function toRosterState(rsvpCode: string): RosterState {
  if (rsvpCode === 'yes' || rsvpCode === 'maybe' || rsvpCode === 'no') return rsvpCode;
  // 'invited' (the placeholder for a known user who has not visited their link) and anything
  // the roster does not know yet read as "has not said".
  return 'pending';
}

type Entry = {
  readonly fullName: string; // a name, or an email for someone not signed in
  readonly isSignedIn: boolean;
  readonly seed: string; // stable per person, for the avatar color; never leaves this file
  readonly state: RosterState;
  readonly isViewer: boolean;
};

function byOrder(a: Entry, b: Entry): number {
  return (
    STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
    Number(b.isViewer) - Number(a.isViewer) ||
    // people with a name before addresses, then alphabetical, so a list reads the same each time
    Number(b.isSignedIn) - Number(a.isSignedIn) ||
    a.fullName.localeCompare(b.fullName)
  );
}

function countStates(entries: readonly Entry[]): RosterCounts {
  const count = (state: RosterState): number =>
    entries.filter((entry) => entry.state === state).length;
  return { yes: count('yes'), maybe: count('maybe'), no: count('no'), pending: count('pending') };
}

// Who is coming, for the people who belong to the brunch. Membership is checked first: anyone
// else gets `undefined`, exactly what a made-up id gets, before anything about the brunch is
// read. The host and every other member get different views, built here so no screen decides
// who may see whose name.
export async function getBrunchRoster(
  input: GetBrunchRosterInput,
  ctx: { readonly db: DbClient },
): Promise<BrunchRoster | undefined> {
  if (!(await isBrunchMember({ brunchId: input.brunchId, userId: input.viewerId }, ctx))) {
    return undefined;
  }

  const brunch = await ctx.db.brunch.findFirst({
    where: { id: input.brunchId },
    select: {
      hostId: true,
      // Nested filters need deletedAt spelled out: the soft-delete extension only covers the
      // top-level model.
      attendees: {
        where: { deletedAt: null },
        select: {
          user: { select: { id: true, name: true } },
          rsvpStatus: { select: { code: true } },
        },
      },
      // Invites nobody has accepted yet: the people who were asked and are only an email.
      invites: {
        where: { deletedAt: null, attendee: null },
        select: { invitedEmail: true },
      },
    },
  });
  if (brunch === null) return undefined;

  const attendees: readonly Entry[] = brunch.attendees.map((attendee) => ({
    fullName: attendee.user.name,
    isSignedIn: true,
    seed: attendee.user.id,
    state: toRosterState(attendee.rsvpStatus.code),
    isViewer: attendee.user.id === input.viewerId,
  }));
  const asked: readonly Entry[] = brunch.invites.map((invite) => ({
    fullName: invite.invitedEmail,
    isSignedIn: false,
    seed: invite.invitedEmail,
    state: 'pending',
    isViewer: false,
  }));
  const everyone = [...attendees, ...asked].sort(byOrder);
  const counts = countStates(everyone);

  if (brunch.hostId === input.viewerId) {
    return {
      kind: 'host',
      counts,
      people: everyone.map((entry) => ({
        name: entry.isViewer ? 'You' : entry.fullName,
        state: entry.state,
        initials: initialsOf(entry.fullName),
        colorIndex: avatarColorIndex(entry.seed),
        isViewer: entry.isViewer,
      })),
    };
  }

  const people: MemberRosterPerson[] = [];
  for (const entry of everyone) {
    // Only people who said yes or maybe are named to other members. Someone who is not signed
    // in has only an email, which is never shown to a member.
    if (!entry.isSignedIn || (entry.state !== 'yes' && entry.state !== 'maybe')) continue;
    people.push({
      name: entry.isViewer
        ? 'You'
        : formatPersonName({ fullName: entry.fullName, audience: 'member' }),
      state: entry.state,
      initials: initialsOf(entry.fullName),
      colorIndex: avatarColorIndex(entry.seed),
      isViewer: entry.isViewer,
    });
  }
  return { kind: 'member', counts, people };
}

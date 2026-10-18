import { normalizeEmail, type BrunchId } from '@brunchsters/shared';
import { createBrunch, getInviteToken, inviteToBrunch, uniqueSuffix } from './factories';
import type { Actor } from './fixtures';
import { inviteLink } from './invites';
import { fixturePlaces } from './places';
import { daysFromNow } from './time';
import { addAttendee, castVotes, confirmBrunch } from './voting';

// Brunches in the states a person sees, for the accessibility scans and the review
// screenshots (spec 0009). Like every factory they go through the real core services.

// An active brunch with a real vote going on: two places, two times, a "yes" who has voted,
// a "maybe", and someone who has not answered yet.
export async function createVotingBrunch(params: {
  readonly host: Actor;
  readonly guests: { readonly yes: Actor; readonly maybe: Actor; readonly pending: Actor };
  readonly title?: string;
}): Promise<{ readonly brunchId: BrunchId; readonly title: string }> {
  const title = params.title ?? `Birthday Brunch ${uniqueSuffix()}`;
  const brunchId = await createBrunch({
    host: params.host.user,
    title,
    locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
    times: [daysFromNow(10), daysFromNow(11, 11, 0)],
    votingDeadline: daysFromNow(5, 18, 0),
  });
  const { yes, maybe, pending } = params.guests;
  await addAttendee({ brunchId, host: params.host.user, user: yes.user, response: 'yes' });
  await addAttendee({ brunchId, host: params.host.user, user: maybe.user, response: 'maybe' });
  await addAttendee({ brunchId, host: params.host.user, user: pending.user, response: 'pending' });
  await castVotes({
    brunchId,
    voter: yes.user,
    places: [fixturePlaces.sunnySide.name],
    times: [0],
  });
  return { brunchId, title };
}

// A brunch with one place and one time that the host has confirmed.
export async function createConfirmedBrunch(params: {
  readonly host: Actor;
  readonly guest: Actor;
  readonly title?: string;
}): Promise<{ readonly brunchId: BrunchId; readonly title: string }> {
  const title = params.title ?? `Confirmed Brunch ${uniqueSuffix()}`;
  const brunchId = await createBrunch({ host: params.host.user, title });
  await addAttendee({
    brunchId,
    host: params.host.user,
    user: params.guest.user,
    response: 'yes',
  });
  await confirmBrunch({
    brunchId,
    host: params.host.user,
    place: fixturePlaces.sunnySide.name,
    timeIndex: 0,
  });
  return { brunchId, title };
}

// An invite for an address with no account yet: returns the link a signed-out visitor opens.
export async function inviteNewcomer(params: {
  readonly host: Actor;
  readonly brunchId: BrunchId;
}): Promise<string> {
  const email = normalizeEmail(`newcomer-${uniqueSuffix()}@example.com`);
  await inviteToBrunch({
    brunchId: params.brunchId,
    host: params.host.user,
    invitees: [{ email }],
  });
  return inviteLink(await getInviteToken({ brunchId: params.brunchId, email }));
}

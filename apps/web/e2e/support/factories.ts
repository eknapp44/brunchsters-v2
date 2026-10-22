import { randomUUID } from 'node:crypto';
import {
  createBrunch as createBrunchService,
  NoopEventBus,
  respondToInvite as respondToInviteService,
  sendInvites as sendInvitesService,
  signInWithProvider,
  type PlaceDetails,
} from '@brunchsters/core';
import {
  normalizeEmail,
  type BrunchId,
  type Email,
  type InviteToken,
  type UserId,
} from '@brunchsters/shared';
import type { Result } from 'neverthrow';
import { getDb } from './db';
import { fixturePlaces } from './places';

// Every factory wraps the real core service, so seeded state is a state the app can
// actually reach (a Prisma shortcut to "active" once hid a real bug in spec 0005 M2).

const eventBus = new NoopEventBus();

export type TestUser = {
  readonly id: UserId;
  readonly email: Email;
  readonly name: string;
  readonly avatarUrl: string;
};

// A tiny inline image: the nav renders an <img>, and no request should leave the machine.
const AVATAR_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjZmM4Ii8+PC9zdmc+';

function unwrap<T, E>(result: Result<T, E>, what: string): T {
  if (result.isErr()) {
    throw new Error(`${what} failed: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

// Short, unique per call, safe in an email local part. Keeps parallel workers apart.
export function uniqueSuffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

export async function createUser(input: {
  readonly label: string;
  // For a user who must match an address that was already invited (journey A3).
  // As the identity provider reports it — may have capitals, as Google's sometimes do. The
  // account is stored normalized (ADR 0008), exactly like a real first sign-in.
  readonly email?: string;
}): Promise<TestUser> {
  const suffix = uniqueSuffix();
  const providerEmail = input.email ?? `${input.label}-${suffix}@example.com`;
  const email = normalizeEmail(providerEmail);
  const name = `E2E ${input.label} ${suffix}`;

  // The cookie we mint later skips signInWithProvider, so call it here to get a user
  // with exactly the rows a real first sign-in creates.
  const result = await signInWithProvider({
    provider: 'google',
    providerUserId: `e2e-${suffix}`,
    email: providerEmail,
    name,
    avatarUrl: AVATAR_URL,
    db: getDb(),
  });
  const { userId } = unwrap(result, 'signInWithProvider');
  return { id: userId as UserId, email, name, avatarUrl: AVATAR_URL };
}

export type CreateBrunchParams = {
  readonly host: TestUser;
  readonly title?: string;
  readonly description?: string;
  readonly locations?: readonly PlaceDetails[];
  // Defaults to a single time one week out.
  readonly times?: readonly Date[];
  readonly votingDeadline?: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Leaves the brunch in `draft`, exactly as the wizard does; it becomes `active` when
// invites are sent.
export async function createBrunch(params: CreateBrunchParams): Promise<BrunchId> {
  const locations = params.locations ?? [fixturePlaces.sunnySide];
  const times = params.times ?? [new Date(Date.now() + 7 * DAY_MS)];

  const result = await createBrunchService(
    {
      hostId: params.host.id,
      title: params.title ?? `E2E Brunch ${uniqueSuffix()}`,
      ...(params.description !== undefined ? { description: params.description } : {}),
      locations: locations.map((location) => ({
        placeId: location.placeId,
        placeName: location.name,
        placeAddress: location.address,
        placeUrl: location.placeUrl,
        timezone: location.timezone,
      })),
      times: times.map((time) => ({ scheduledAt: time.toISOString() })),
      ...(params.votingDeadline !== undefined
        ? { votingDeadline: params.votingDeadline.toISOString() }
        : {}),
    },
    { db: getDb(), eventBus },
  );
  return unwrap(result, 'createBrunch').id;
}

export async function inviteToBrunch(params: {
  readonly brunchId: BrunchId;
  readonly host: TestUser;
  // A TestUser fits; so does a bare `{ email }` for an address with no account yet.
  readonly invitees: readonly { readonly email: string }[];
}): Promise<void> {
  const result = await sendInvitesService(
    {
      brunchId: params.brunchId,
      invitedById: params.host.id,
      emails: params.invitees.map((invitee) => normalizeEmail(invitee.email)),
    },
    { db: getDb(), eventBus },
  );
  unwrap(result, 'sendInvites');
}

// Email delivery is a no-op, so the invite link is built from the token stored in the DB.
export async function getInviteToken(params: {
  readonly brunchId: BrunchId;
  readonly email: Email;
}): Promise<InviteToken> {
  const invite = await getDb().brunchInvite.findFirst({
    where: { brunchId: params.brunchId, invitedEmail: params.email },
  });
  if (invite === null) {
    throw new Error(`No invite for ${params.email} on brunch ${params.brunchId}`);
  }
  return invite.token as InviteToken;
}

export async function respondToInvite(params: {
  readonly brunchId: BrunchId;
  readonly user: TestUser;
  readonly response: 'yes' | 'no' | 'maybe';
}): Promise<void> {
  const token = await getInviteToken({ brunchId: params.brunchId, email: params.user.email });
  const result = await respondToInviteService(
    { token, viewerId: params.user.id, response: params.response },
    { db: getDb(), eventBus },
  );
  unwrap(result, 'respondToInvite');
}

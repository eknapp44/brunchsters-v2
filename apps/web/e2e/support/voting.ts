import {
  castLocationBallot,
  castTimeBallot,
  confirmBrunch as confirmBrunchService,
  NoopEventBus,
  removeLocation,
} from '@brunchsters/core';
import type { BrunchId, BrunchLocationId, BrunchTimeId } from '@brunchsters/shared';
import type { Locator, Page } from '@playwright/test';
import type { Result } from 'neverthrow';
import { getDb } from './db';
import { inviteToBrunch, respondToInvite, type TestUser } from './factories';

// Fixtures for the voting and confirmation journeys. Like every factory they go through the
// real core services, so the state they leave is one the app can actually reach.

const eventBus = new NoopEventBus();

function unwrap<T, E>(result: Result<T, E>, what: string): T {
  if (result.isErr()) throw new Error(`${what} failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

export type OptionIds = {
  readonly locations: readonly { readonly id: BrunchLocationId; readonly name: string }[];
  readonly times: readonly { readonly id: BrunchTimeId; readonly scheduledAt: Date }[];
};

// In the order the screens show them (see getBrunchVoting), so `times[0]` is the first row.
export async function listOptions(brunchId: BrunchId): Promise<OptionIds> {
  const db = getDb();
  const [locations, times] = await Promise.all([
    db.brunchLocation.findMany({
      where: { brunchId },
      orderBy: [{ createdAt: 'asc' }, { placeName: 'asc' }, { id: 'asc' }],
    }),
    db.brunchTime.findMany({
      where: { brunchId },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return {
    locations: locations.map((row) => ({ id: row.id as BrunchLocationId, name: row.placeName })),
    times: times.map((row) => ({ id: row.id as BrunchTimeId, scheduledAt: row.scheduledAt })),
  };
}

// Casts a ballot for someone, naming places by name and times by their position in the list.
export async function castVotes(params: {
  readonly brunchId: BrunchId;
  readonly voter: TestUser;
  readonly places?: readonly string[];
  readonly times?: readonly number[];
}): Promise<void> {
  const options = await listOptions(params.brunchId);
  const db = getDb();

  if (params.places !== undefined) {
    const optionIds = params.places.map((name) => {
      const match = options.locations.find((location) => location.name === name);
      if (match === undefined) throw new Error(`No location named "${name}"`);
      return match.id;
    });
    unwrap(
      await castLocationBallot(
        { brunchId: params.brunchId, voterId: params.voter.id, optionIds },
        { db, eventBus },
      ),
      'castLocationBallot',
    );
  }

  if (params.times !== undefined) {
    const optionIds = params.times.map((index) => {
      const match = options.times[index];
      if (match === undefined) throw new Error(`No time at position ${index}`);
      return match.id;
    });
    unwrap(
      await castTimeBallot(
        { brunchId: params.brunchId, voterId: params.voter.id, optionIds },
        { db, eventBus },
      ),
      'castTimeBallot',
    );
  }
}

export async function confirmBrunch(params: {
  readonly brunchId: BrunchId;
  readonly host: TestUser;
  readonly place: string;
  readonly timeIndex: number;
}): Promise<void> {
  const options = await listOptions(params.brunchId);
  const location = options.locations.find((candidate) => candidate.name === params.place);
  const time = options.times[params.timeIndex];
  if (location === undefined || time === undefined) throw new Error('Unknown option to confirm');
  unwrap(
    await confirmBrunchService(
      {
        brunchId: params.brunchId,
        requestedById: params.host.id,
        locationId: location.id,
        timeId: time.id,
      },
      { db: getDb(), eventBus },
    ),
    'confirmBrunch',
  );
}

// The two ballots on /brunch/[id], found by their headings.
export function ballot(page: Page): { readonly locations: Locator; readonly times: Locator } {
  const section = (heading: string): Locator =>
    page.locator('section').filter({
      has: page.getByRole('heading', { name: heading, exact: true }),
    });
  return { locations: section('Locations'), times: section('Times') };
}

// Invites someone and, unless they are left `pending`, has them answer. The first call also
// moves a draft brunch to active, exactly as in the app.
export async function addAttendee(params: {
  readonly brunchId: BrunchId;
  readonly host: TestUser;
  readonly user: TestUser;
  readonly response: 'yes' | 'maybe' | 'no' | 'pending';
}): Promise<void> {
  await inviteToBrunch({
    brunchId: params.brunchId,
    host: params.host,
    invitees: [params.user],
  });
  if (params.response !== 'pending') {
    await respondToInvite({
      brunchId: params.brunchId,
      user: params.user,
      response: params.response,
    });
  }
}

// Removes a location the way the host's manage screen does, through the real service.
export async function removeLocationByName(params: {
  readonly brunchId: BrunchId;
  readonly host: TestUser;
  readonly place: string;
}): Promise<void> {
  const options = await listOptions(params.brunchId);
  const location = options.locations.find((candidate) => candidate.name === params.place);
  if (location === undefined) throw new Error(`No location named "${params.place}"`);
  unwrap(
    await removeLocation(
      { brunchId: params.brunchId, requestedById: params.host.id, locationId: location.id },
      { db: getDb() },
    ),
    'removeLocation',
  );
}

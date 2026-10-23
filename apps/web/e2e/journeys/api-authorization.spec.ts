import { randomUUID } from 'node:crypto';
import {
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { getDb } from '../support/db';
import { baseUrl } from '../support/env';
import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { untilRefused } from '../support/rateLimits';
import { daysFromNow } from '../support/time';
import { addAttendee, listOptions } from '../support/voting';

// An end-to-end smoke test of who may call what, against the real server and middleware. Rule
// permutations live in the route-handler unit tests; this pins the wiring (a mistake in the
// public-route list, a handler that forgot its session check) that mocks cannot see. Spec 0004's
// two escaped bugs were both "a different actor with some relationship to this data".

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

const location = {
  placeId: 'e2e-authz-place',
  placeName: 'Nowhere Cafe',
  placeAddress: '1 Nowhere St',
  placeUrl: '',
  timezone: 'America/Chicago',
};

test.describe('API authorization', () => {
  test('host-only endpoints refuse everyone but the host, and an outsider cannot tell the brunch is real', async ({
    makeActor,
  }) => {
    // 13 endpoints x 3 callers; in dev mode each route is compiled on first use.
    test.slow();
    const host = await makeActor('host');
    const attendee = await makeActor('attendee');
    const stranger = await makeActor('stranger');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(10), daysFromNow(11)],
    });
    await addAttendee({ brunchId, host: host.user, user: attendee.user, response: 'yes' });
    const pendingEmail = `pending-${uniqueSuffix()}@example.com`;
    await addAttendee({
      brunchId,
      host: host.user,
      user: { email: pendingEmail } as never,
      response: 'pending',
    });

    // One real pending suggestion of each kind, made the way an attendee makes them.
    const post = (path: string, data: unknown) => attendee.context.request.post(path, { data });
    const b = `/api/v1/brunches/${brunchId}`;
    expect(
      (await post(`${b}/suggestions`, { email: `sugg-${uniqueSuffix()}@example.com` })).status(),
    ).toBe(201);
    expect((await post(`${b}/location-suggestions`, location)).status()).toBe(201);
    expect(
      (
        await post(`${b}/time-suggestions`, { scheduledAt: daysFromNow(20).toISOString() })
      ).status(),
    ).toBe(201);

    const db = getDb();
    const options = await listOptions(brunchId);
    const invite = await db.brunchInvite.findFirst({
      where: { brunchId, invitedEmail: pendingEmail },
    });
    const inviteSuggestion = await db.brunchInviteSuggestion.findFirst({ where: { brunchId } });
    const locationSuggestion = await db.brunchLocationSuggestion.findFirst({ where: { brunchId } });
    const timeSuggestion = await db.brunchTimeSuggestion.findFirst({ where: { brunchId } });
    if (!invite || !inviteSuggestion || !locationSuggestion || !timeSuggestion) {
      throw new Error('Setup did not create the expected rows');
    }

    const hostOnly: readonly (readonly [string, string, string, unknown])[] = [
      ['invite people', 'POST', `${b}/invites`, { emails: ['new-person@example.com'] }],
      ['add a place', 'POST', `${b}/locations`, location],
      ['add a time', 'POST', `${b}/times`, { scheduledAt: daysFromNow(30).toISOString() }],
      ['remove a place', 'DELETE', `${b}/locations/${options.locations[0]?.id}`, undefined],
      ['remove a time', 'DELETE', `${b}/times/${options.times[0]?.id}`, undefined],
      ['close voting', 'POST', `${b}/voting/close`, undefined],
      ['set the deadline', 'PATCH', `${b}/voting/deadline`, { votingDeadline: null }],
      [
        'confirm',
        'POST',
        `${b}/confirm`,
        { locationId: options.locations[0]?.id, timeId: options.times[0]?.id },
      ],
      ['resend an invite', 'POST', `/api/v1/invites/${invite.id}/resend`, undefined],
      ['revoke an invite', 'DELETE', `/api/v1/invites/${invite.id}`, undefined],
      [
        'review an invite suggestion',
        'POST',
        `/api/v1/suggestions/${inviteSuggestion.id}/review`,
        { decision: 'approve' },
      ],
      [
        'review a place suggestion',
        'POST',
        `/api/v1/location-suggestions/${locationSuggestion.id}/review`,
        { decision: 'approve' },
      ],
      [
        'review a time suggestion',
        'POST',
        `/api/v1/time-suggestions/${timeSuggestion.id}/review`,
        { decision: 'approve' },
      ],
    ];

    const anonymous = await playwrightRequest.newContext({ baseURL: baseUrl });
    const call = async (
      who: APIRequestContext,
      method: string,
      path: string,
      data: unknown,
    ): Promise<{ readonly status: number; readonly body: unknown }> => {
      const response = await who.fetch(path, {
        method,
        maxRedirects: 0,
        ...(data !== undefined ? { data } : {}),
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    };
    // The same request aimed at things that do not exist: every id in the path replaced.
    const aimedAtNothing = (path: string): string => path.replace(UUID, () => randomUUID());

    for (const [what, method, path, data] of hostOnly) {
      await test.step(`${what}: anonymous 401, outsider 404, attendee 403`, async () => {
        expect((await call(anonymous, method, path, data)).status, `${what} (anonymous)`).toBe(401);
        // An attendee belongs, so may be told they are not allowed...
        expect(
          (await call(attendee.context.request, method, path, data)).status,
          `${what} (attendee)`,
        ).toBe(403);
        // ...but an outsider gets exactly what they would for something that does not exist.
        const outsider = await call(stranger.context.request, method, path, data);
        const nothing = await call(stranger.context.request, method, aimedAtNothing(path), data);
        expect(outsider.status, `${what} (outsider)`).toBe(404);
        expect(outsider, `${what}: real vs made-up`).toEqual(nothing);
      });
    }
    await anonymous.dispose();

    // After all of that, nothing moved.
    const brunch = await db.brunch.findFirst({
      where: { id: brunchId },
      include: { status: true },
    });
    expect(brunch?.status.code).toBe('active');
    expect(brunch?.votingClosedAt).toBeNull();
    expect(brunch?.votingDeadline).toBeNull();
    expect(await db.brunchLocation.count({ where: { brunchId } })).toBe(2);
    expect(await db.brunchTime.count({ where: { brunchId } })).toBe(2);
    expect(await db.brunchInvite.findFirst({ where: { id: invite.id } })).not.toBeNull();
    // Host's built-in invite + the attendee + the pending address; "new-person" was never created.
    expect(await db.brunchInvite.count({ where: { brunchId } })).toBe(3);
    const pending = await db.brunchLocationSuggestion.findFirst({
      where: { id: locationSuggestion.id },
      include: { status: true },
    });
    expect(pending?.status.code).toBe('pending');
  });

  test('member-only actions work for attendees; outsiders get a 404 that matches a made-up id; the signed-out get 401', async ({
    makeActor,
  }) => {
    // Many requests in a row, each route compiled on first use in dev mode - and since
    // spec 0008 every one of them also feeds the real queue, which adds load. Like its sibling.
    test.slow();
    const host = await makeActor('host');
    const attendee = await makeActor('attendee');
    const stranger = await makeActor('stranger');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(10), daysFromNow(11)],
    });
    await addAttendee({ brunchId, host: host.user, user: attendee.user, response: 'yes' });
    const options = await listOptions(brunchId);
    const b = `/api/v1/brunches/${brunchId}`;
    const vote = { optionIds: [options.locations[0]?.id] };

    const anonymous = await playwrightRequest.newContext({ baseURL: baseUrl });
    const send = async (
      who: APIRequestContext,
      method: string,
      path: string,
      data: unknown,
    ): Promise<{ readonly status: number; readonly body: unknown }> => {
      const response = await who.fetch(path, { method, data, maxRedirects: 0 });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    };
    const aimedAtNothing = (path: string): string => path.replace(UUID, () => randomUUID());
    type Action = readonly [what: string, method: string, path: string, data: unknown];
    const memberActions: readonly Action[] = [
      ['vote on places', 'PUT', `${b}/votes/locations`, vote],
      ['vote on times', 'PUT', `${b}/votes/times`, { optionIds: [options.times[0]?.id] }],
      ['change an RSVP', 'POST', `${b}/rsvp`, { response: 'yes' }],
      ['suggest an invitee', 'POST', `${b}/suggestions`, { email: 'someone@example.com' }],
      ['suggest a place', 'POST', `${b}/location-suggestions`, location],
      [
        'suggest a time',
        'POST',
        `${b}/time-suggestions`,
        { scheduledAt: daysFromNow(20).toISOString() },
      ],
    ];

    // The same answer whether or not the brunch is real.
    const assertIndistinguishable = async (
      who: APIRequestContext,
      actions: readonly Action[],
      label: string,
    ): Promise<void> => {
      for (const [what, method, path, data] of actions) {
        const real = await send(who, method, path, data);
        const nothing = await send(who, method, aimedAtNothing(path), data);
        expect(real.status, `${what} (${label})`).toBe(404);
        expect(real, `${what} (${label}): real vs made-up`).toEqual(nothing);
      }
    };

    for (const [what, method, path, data] of memberActions) {
      expect((await send(anonymous, method, path, data)).status, `${what} (anonymous)`).toBe(401);
    }
    await assertIndistinguishable(stranger.context.request, memberActions, 'outsider');

    // Nothing an outsider tries may leave a trace.
    const db = getDb();
    expect(await db.brunchLocationVote.count({ where: { brunchLocation: { brunchId } } })).toBe(0);
    expect(await db.brunchInviteSuggestion.count({ where: { brunchId } })).toBe(0);
    expect(await db.brunchLocationSuggestion.count({ where: { brunchId } })).toBe(0);
    expect(await db.brunchTimeSuggestion.count({ where: { brunchId } })).toBe(0);

    // The attendee's own call works.
    const own = await send(attendee.context.request, 'PUT', `${b}/votes/locations`, vote);
    expect(own.status).toBe(200);
    expect(await db.brunchLocationVote.count({ where: { brunchLocation: { brunchId } } })).toBe(1);

    // Nothing else about the brunch leaks first either: suggestions switched off, and a brunch
    // that is still a draft, are just "not found" to an outsider.
    await db.brunch.update({
      where: { id: brunchId },
      data: {
        allowInviteSuggestions: false,
        allowLocationSuggestions: false,
        allowTimeSuggestions: false,
      },
    });
    await assertIndistinguishable(
      stranger.context.request,
      memberActions.slice(3),
      'suggestions switched off',
    );
    const draftId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(10), daysFromNow(11)],
    });
    const draftOptions = await listOptions(draftId);
    await assertIndistinguishable(
      stranger.context.request,
      [
        [
          'vote on a draft brunch',
          'PUT',
          `/api/v1/brunches/${draftId}/votes/locations`,
          { optionIds: [draftOptions.locations[0]?.id] },
        ],
      ],
      'draft brunch',
    );
    await anonymous.dispose();
  });

  // Journey L5 (spec 0012): a limit must not become a way to tell a real brunch from a made-up id.
  test('over budget, an outsider still cannot tell a real brunch from a made-up id, and a member is told to slow down, not that they may not', async ({
    makeActor,
  }) => {
    test.slow();
    const host = await makeActor('host');
    const member = await makeActor('member');
    const stranger = await makeActor('stranger');
    const brunchId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide, fixturePlaces.harborBistro],
      times: [daysFromNow(10), daysFromNow(11)],
    });
    await addAttendee({ brunchId, host: host.user, user: member.user, response: 'yes' });

    const post = (who: APIRequestContext, path: string, data: unknown = { response: 'yes' }) =>
      who.fetch(path, { method: 'POST', data, maxRedirects: 0 });
    const real = `/api/v1/brunches/${brunchId}/rsvp`;
    const aimedAtNothing = (): string => `/api/v1/brunches/${randomUUID()}/rsvp`;
    const outsider = stranger.context.request;

    // Under budget they are the same 404 (the other journeys check every endpoint; one pair here
    // for contrast with what follows).
    expect((await post(outsider, real)).status()).toBe(404);
    expect((await post(outsider, aimedAtNothing())).status()).toBe(404);

    // Spend the outsider's writes on made-up ids until the server says slow down.
    await untilRefused({
      limit: 60,
      attempt: () => post(outsider, aimedAtNothing()),
      expectedUntilThen: (response) => expect(response.status()).toBe(404),
      // The two requests of the contrast check above already used part of this window.
      alreadySpent: 2,
    });

    // Over budget the real brunch and a made-up id are still one and the same answer.
    const forReal = await post(outsider, real);
    const forNothing = await post(outsider, aimedAtNothing());
    expect(forReal.status()).toBe(429);
    expect(forNothing.status()).toBe(429);
    // The wait differs by a second at most between two calls; everything else must be identical.
    const bodyOf = async (response: APIResponse): Promise<unknown> => ({
      ...((await response.json()) as Record<string, unknown>),
      retryAfterSeconds: undefined,
    });
    expect(await bodyOf(forReal)).toEqual(await bodyOf(forNothing));

    // A member over budget is told to slow down, not told they may not do a host-only thing.
    await untilRefused({
      limit: 60,
      attempt: () => post(member.context.request, real),
      expectedUntilThen: (response) => expect(response.status()).toBe(200),
    });
    const hostOnly = await post(member.context.request, `/api/v1/brunches/${brunchId}/confirm`, {});
    expect(hostOnly.status()).toBe(429);
    expect(await hostOnly.json()).toMatchObject({ policy: 'writes' });
  });
});

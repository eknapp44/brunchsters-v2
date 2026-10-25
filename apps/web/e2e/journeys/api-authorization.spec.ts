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
import { afterTheHold, callOffBrunch } from '../support/lifecycle';
import { fixturePlaces } from '../support/places';
import { alignToWindow, untilRefused } from '../support/rateLimits';
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
    // 16 endpoints x 3 callers; in dev mode each route is compiled on first use.
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
      // Spec 0013: the lifecycle routes are host-only too.
      ['call it off', 'POST', `${b}/cancel`, undefined],
      ['bring it back', 'POST', `${b}/reinstate`, undefined],
      ['delete the brunch', 'DELETE', b, undefined],
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
        const signedOut = await call(anonymous, method, path, data);
        expect(signedOut.status, `${what} (anonymous)`).toBe(401);
        // Every failure answers with a code the client words (spec 0014), never wording of its own.
        expect(signedOut.body, `${what} (anonymous)`).toMatchObject({
          error: { code: 'signed_out' },
        });
        // An attendee belongs, so may be told they are not allowed...
        const member = await call(attendee.context.request, method, path, data);
        expect(member.status, `${what} (attendee)`).toBe(403);
        expect(member.body, `${what} (attendee)`).toMatchObject({ error: { code: 'forbidden' } });
        // ...but an outsider gets exactly what they would for something that does not exist.
        const outsider = await call(stranger.context.request, method, path, data);
        const nothing = await call(stranger.context.request, method, aimedAtNothing(path), data);
        expect(outsider.status, `${what} (outsider)`).toBe(404);
        // The same code a made-up id gets, and one that says nothing about what was looked for.
        expect(outsider.body, `${what} (outsider)`).toMatchObject({ error: { code: 'not_found' } });
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
      // Spec 0013: any member may hide a brunch from their own dashboard; no one else can touch it.
      ['hide from my dashboard', 'PUT', `${b}/hidden`, { hidden: true }],
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
    expect(await db.brunchAttendee.count({ where: { brunchId, hiddenAt: { not: null } } })).toBe(0);
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

  // Journeys E9 and E10 (spec 0013): the lifecycle routes through the real server, as the people
  // involved meet them.
  test('calling a brunch off, bringing it back and deleting it: every member write is a 409 while it is off, and a deleted brunch is a 404 for everyone', async ({
    makeActor,
  }) => {
    // About fifty requests in a row, each route compiled on first use in dev mode.
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
    const db = getDb();
    const attendeeInvite = await db.brunchInvite.findFirst({
      where: { brunchId, invitedUserId: attendee.user.id },
    });
    if (!attendeeInvite) throw new Error('Setup did not create the attendee invite');
    const b = `/api/v1/brunches/${brunchId}`;

    const send = async (
      who: APIRequestContext,
      method: string,
      path: string,
      data?: unknown,
    ): Promise<{ readonly status: number; readonly body: unknown }> => {
      const response = await who.fetch(path, {
        method,
        maxRedirects: 0,
        ...(data !== undefined ? { data } : {}),
      });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    };
    const state = async () => {
      const brunch = await db.brunch.findFirst({
        where: { id: brunchId },
        include: { status: true, statusBeforeCancel: true },
      });
      return { code: brunch?.status.code, before: brunch?.statusBeforeCancel?.code };
    };
    const hostApi = host.context.request;
    const attendeeApi = attendee.context.request;
    const strangerApi = stranger.context.request;

    // A live brunch cannot be deleted: it is called off first, so people are told.
    expect((await send(hostApi, 'DELETE', b)).status).toBe(409);
    expect(await state()).toEqual({ code: 'active', before: undefined });

    // Only the host can call it off: a member is refused, an outsider gets the made-up-id answer.
    expect((await send(attendeeApi, 'POST', `${b}/cancel`)).status).toBe(403);
    expect((await send(strangerApi, 'POST', `${b}/cancel`)).status).toBe(404);

    const cancelled = await send(hostApi, 'POST', `${b}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(await state()).toEqual({ code: 'cancelled', before: 'active' });
    // Already off: a clean 409, and nothing more is spent or sent.
    expect((await send(hostApi, 'POST', `${b}/cancel`)).status).toBe(409);

    // Journey E10: while it is off, every member write is a 409, never a 500 and never a success.
    const votesBefore = await db.brunchLocationVote.count({
      where: { brunchLocation: { brunchId } },
    });
    const invitesBefore = await db.brunchInvite.count({ where: { brunchId } });
    const refused: readonly (readonly [string, APIRequestContext, string, string, unknown])[] = [
      ['change an RSVP', attendeeApi, 'POST', `${b}/rsvp`, { response: 'no' }],
      [
        'vote',
        attendeeApi,
        'PUT',
        `${b}/votes/locations`,
        { optionIds: [options.locations[0]?.id] },
      ],
      [
        'suggest an invitee',
        attendeeApi,
        'POST',
        `${b}/suggestions`,
        { email: 'late@example.com' },
      ],
      ['suggest a place', attendeeApi, 'POST', `${b}/location-suggestions`, location],
      ['invite people', hostApi, 'POST', `${b}/invites`, { emails: ['late-guest@example.com'] }],
      [
        'resend an invite',
        hostApi,
        'POST',
        `/api/v1/invites/${attendeeInvite.id}/resend`,
        undefined,
      ],
      ['add a place', hostApi, 'POST', `${b}/locations`, location],
      ['set the deadline', hostApi, 'PATCH', `${b}/voting/deadline`, { votingDeadline: null }],
      [
        'confirm',
        hostApi,
        'POST',
        `${b}/confirm`,
        { locationId: options.locations[0]?.id, timeId: options.times[0]?.id },
      ],
    ];
    for (const [what, who, method, path, data] of refused) {
      expect((await send(who, method, path, data)).status, `${what} while called off`).toBe(409);
    }
    expect(await db.brunchLocationVote.count({ where: { brunchLocation: { brunchId } } })).toBe(
      votesBefore,
    );
    expect(await db.brunchInvite.count({ where: { brunchId } })).toBe(invitesBefore);
    expect(await state()).toEqual({ code: 'cancelled', before: 'active' });
    // Reading still works: a member can open the page of a brunch that was called off.
    expect((await attendeeApi.get(`/brunch/${brunchId}`, { maxRedirects: 0 })).status()).toBe(200);

    // Hiding is one person's: the attendee hides it, the host's own view is untouched, and an
    // outsider gets the made-up-id answer.
    const hidden = await send(attendeeApi, 'PUT', `${b}/hidden`, { hidden: true });
    expect(hidden).toEqual({ status: 200, body: { hidden: true } });
    expect((await send(attendeeApi, 'PUT', `${b}/hidden`, { hidden: 'yes' })).status).toBe(422);
    const outsiderHide = await send(strangerApi, 'PUT', `${b}/hidden`, { hidden: true });
    const nothingHide = await send(strangerApi, 'PUT', `/api/v1/brunches/${randomUUID()}/hidden`, {
      hidden: true,
    });
    expect(outsiderHide.status).toBe(404);
    expect(outsiderHide).toEqual(nothingHide);
    expect(
      await db.brunchAttendee.findMany({
        where: { brunchId, hiddenAt: { not: null } },
        select: { userId: true },
      }),
    ).toEqual([{ userId: attendee.user.id }]);

    // Bring it back: a member cannot, the host can, and the writes work again.
    expect((await send(attendeeApi, 'POST', `${b}/reinstate`)).status).toBe(403);
    expect((await send(hostApi, 'POST', `${b}/reinstate`)).status).toBe(200);
    expect(await state()).toMatchObject({ code: 'active' });
    expect((await send(hostApi, 'POST', `${b}/reinstate`)).status).toBe(409);
    expect((await send(attendeeApi, 'POST', `${b}/rsvp`, { response: 'maybe' })).status).toBe(200);

    // Call it off again. Its guests have not been told yet (the notice waits out a hold in the
    // queue), and a brunch deleted before that would vanish without anyone knowing it was off, so
    // it cannot be deleted yet.
    expect((await send(hostApi, 'POST', `${b}/cancel`)).status).toBe(200);
    expect((await send(hostApi, 'DELETE', b)).status).toBe(409);
    expect((await db.brunch.findFirst({ where: { id: brunchId } }))?.deletedAt).toBeNull();

    // The hold cannot be waited out here, so bring it back and call it off as of a moment the hold
    // has already passed (support/lifecycle.ts). The real queue function then tells the guests and
    // records it, which is what unlocks Delete.
    expect((await send(hostApi, 'POST', `${b}/reinstate`)).status).toBe(200);
    await callOffBrunch({ brunchId, host: host.user, at: afterTheHold() });
    await expect
      .poll(
        async () =>
          (await db.brunch.findFirst({ where: { id: brunchId } }))?.cancelNoticeSentAt ?? null,
      )
      .not.toBeNull();

    // Delete it: from then on it is a 404 for the host, the attendee and the outsider alike, and
    // each answer matches the one for an id that never existed.
    expect((await send(hostApi, 'DELETE', b)).status).toBe(204);
    const gone = await db.brunch.findUnique({ where: { id: brunchId } });
    expect(gone?.deletedAt).not.toBeNull();

    const aimedAtNothing = (path: string): string => path.replace(UUID, () => randomUUID());
    const afterwards: readonly (readonly [string, string, unknown])[] = [
      ['POST', `${b}/rsvp`, { response: 'yes' }],
      ['POST', `${b}/cancel`, undefined],
      ['POST', `${b}/reinstate`, undefined],
      ['DELETE', b, undefined],
      ['PUT', `${b}/hidden`, { hidden: false }],
    ];
    for (const [who, label] of [
      [hostApi, 'host'],
      [attendeeApi, 'attendee'],
      [strangerApi, 'outsider'],
    ] as const) {
      for (const [method, path, data] of afterwards) {
        const real = await send(who, method, path, data);
        const nothing = await send(who, method, aimedAtNothing(path), data);
        expect(real.status, `${method} ${path} (${label}, deleted)`).toBe(404);
        expect(real, `${method} ${path} (${label}): deleted vs made-up`).toEqual(nothing);
      }
      expect(
        (await who.get(`/brunch/${brunchId}`, { maxRedirects: 0 })).status(),
        `the page (${label}, deleted)`,
      ).toBe(404);
    }

    // A draft nobody was told about can be deleted straight away.
    const draftId = await createBrunch({
      host: host.user,
      locations: [fixturePlaces.sunnySide],
      times: [daysFromNow(10)],
    });
    expect((await send(hostApi, 'POST', `/api/v1/brunches/${draftId}/cancel`)).status).toBe(409);
    expect((await send(hostApi, 'DELETE', `/api/v1/brunches/${draftId}`)).status).toBe(204);
    expect((await send(hostApi, 'DELETE', `/api/v1/brunches/${draftId}`)).status).toBe(404);
  });

  // Journey L5 (spec 0012): a limit must not become a way to tell a real brunch from a made-up id.
  test('over budget, an outsider still cannot tell a real brunch from a made-up id, and a member is told to slow down, not that they may not', async ({
    makeActor,
  }) => {
    // Two loops of 60+ requests, each possibly preceded by a wait for the next server window.
    test.setTimeout(240_000);
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

    // Each segment below (exhaust a budget, then check what follows) must sit inside one server
    // window, or the budget could reset between the loop and the check.
    await alignToWindow({ windowSeconds: 60, needSeconds: 25 });

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
    await alignToWindow({ windowSeconds: 60, needSeconds: 25 });
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

// Spec 0014: the routes a member calls (not only the host-only ones) answer an outsider exactly as
// they answer a made-up id, in code and body, and a signed-out caller with the coded 401. A member
// may be told more (an option that went away), an outsider never.
test.describe('API authorization: the member endpoints', () => {
  test('an outsider cannot tell the brunch is real; a member who names a vanished option is told so', async ({
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
    const anonymous = await playwrightRequest.newContext({ baseURL: baseUrl });

    const b = `/api/v1/brunches/${brunchId}`;
    const aMadeUpOption = randomUUID();
    const endpoints: readonly (readonly [string, string, string, unknown])[] = [
      ['RSVP', 'POST', `${b}/rsvp`, { response: 'yes' }],
      ['vote for a place', 'PUT', `${b}/votes/locations`, { optionIds: [aMadeUpOption] }],
      ['vote for a time', 'PUT', `${b}/votes/times`, { optionIds: [aMadeUpOption] }],
      ['suggest a person', 'POST', `${b}/suggestions`, { email: 'someone@example.com' }],
      ['suggest a place', 'POST', `${b}/location-suggestions`, location],
      [
        'suggest a time',
        'POST',
        `${b}/time-suggestions`,
        { scheduledAt: daysFromNow(30).toISOString() },
      ],
    ];
    const call = async (
      who: APIRequestContext,
      method: string,
      path: string,
      data: unknown,
    ): Promise<{ readonly status: number; readonly body: unknown }> => {
      const response = await who.fetch(path, { method, maxRedirects: 0, data });
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    };

    for (const [what, method, path, data] of endpoints) {
      await test.step(`${what}: anonymous 401, outsider the same 404 as a made-up id`, async () => {
        const signedOut = await call(anonymous, method, path, data);
        expect(signedOut.status, `${what} (anonymous)`).toBe(401);
        expect(signedOut.body).toMatchObject({ error: { code: 'signed_out' } });

        const outsider = await call(stranger.context.request, method, path, data);
        const nothing = await call(
          stranger.context.request,
          method,
          path.replace(UUID, () => randomUUID()),
          data,
        );
        expect(outsider.status, `${what} (outsider)`).toBe(404);
        expect(outsider.body, `${what} (outsider)`).toMatchObject({ error: { code: 'not_found' } });
        expect(outsider, `${what}: real vs made-up`).toEqual(nothing);
      });
    }

    // A member may be told more: a vote for an option that is not on the table is a 404 that says
    // so (`option_gone`), which is exactly what an outsider is never told.
    for (const path of [`${b}/votes/locations`, `${b}/votes/times`]) {
      const asMember = await call(member.context.request, 'PUT', path, {
        optionIds: [aMadeUpOption],
      });
      expect(asMember.status, path).toBe(404);
      expect(asMember.body, path).toMatchObject({ error: { code: 'option_gone' } });
    }
    await anonymous.dispose();
  });
});

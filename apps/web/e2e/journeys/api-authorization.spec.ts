import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { getDb } from '../support/db';
import { baseUrl } from '../support/env';
import { createBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { fixturePlaces } from '../support/places';
import { daysFromNow } from '../support/time';
import { addAttendee, listOptions } from '../support/voting';

// An end-to-end smoke test of who may call what, against the real server and middleware. Rule
// permutations live in the route-handler unit tests; this pins the wiring (a mistake in the
// public-route list, a handler that forgot its session check) that mocks cannot see. Spec 0004's
// two escaped bugs were both "a different actor with some relationship to this data".

const location = {
  placeId: 'e2e-authz-place',
  placeName: 'Nowhere Cafe',
  placeAddress: '1 Nowhere St',
  placeUrl: '',
  timezone: 'America/Chicago',
};

test.describe('API authorization', () => {
  test('host-only endpoints refuse everyone but the host, and change nothing', async ({
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
    ): Promise<number> => {
      const response = await who.fetch(path, {
        method,
        maxRedirects: 0,
        ...(data !== undefined ? { data } : {}),
      });
      return response.status();
    };

    for (const [what, method, path, data] of hostOnly) {
      await test.step(`${what}: anonymous 401, stranger 403, attendee 403`, async () => {
        expect(await call(anonymous, method, path, data), `${what} (anonymous)`).toBe(401);
        expect(await call(stranger.context.request, method, path, data), `${what} (stranger)`).toBe(
          403,
        );
        expect(await call(attendee.context.request, method, path, data), `${what} (attendee)`).toBe(
          403,
        );
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

  test('member-only actions work for attendees and are refused to outsiders and the signed-out', async ({
    makeActor,
  }) => {
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
    const putVote = (who: APIRequestContext) =>
      who.put(`${b}/votes/locations`, { data: vote, maxRedirects: 0 });
    const postRsvp = (who: APIRequestContext) =>
      who.post(`${b}/rsvp`, { data: { response: 'yes' }, maxRedirects: 0 });

    expect((await putVote(anonymous)).status()).toBe(401);
    expect((await putVote(stranger.context.request)).status()).toBe(403);
    expect((await postRsvp(anonymous)).status()).toBe(401);
    expect((await postRsvp(stranger.context.request)).status()).toBe(403);
    // The outsider's attempt left no trace; the attendee's own call works.
    expect(
      await getDb().brunchLocationVote.count({ where: { brunchLocation: { brunchId } } }),
    ).toBe(0);
    expect((await putVote(attendee.context.request)).status()).toBe(200);
    expect(
      await getDb().brunchLocationVote.count({ where: { brunchLocation: { brunchId } } }),
    ).toBe(1);
    await anonymous.dispose();
  });
});

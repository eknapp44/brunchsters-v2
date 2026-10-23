import type { DbClient } from '@brunchsters/database';
import { normalizeEmail, type Email, type BrunchId, type UserId } from '@brunchsters/shared';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./reviewInviteSuggestion', () => ({ reviewInviteSuggestion: vi.fn() }));

import { reviewInviteSuggestion } from './reviewInviteSuggestion';
import { suggestInvitee, suggestInviteeRequestSchema } from './suggestInvitee';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';

const BRUNCH_ID = 'brunch-uuid' as BrunchId;
const HOST_ID = 'host-uuid' as UserId;
const ATTENDEE_ID = 'attendee-user-uuid' as UserId;

const OPEN_BRUNCH = {
  id: BRUNCH_ID,
  hostId: HOST_ID,
  allowInviteSuggestions: true,
  requireHostApprovalToInvite: true,
  status: { code: 'active' },
  host: { email: normalizeEmail('host@example.com') },
};

function makeMockDb(
  overrides: {
    brunchFindFirst?: ReturnType<typeof vi.fn>;
    attendeeFindFirst?: ReturnType<typeof vi.fn>;
    suggestionFindUnique?: ReturnType<typeof vi.fn>;
    statusFindFirst?: ReturnType<typeof vi.fn>;
    userFindFirst?: ReturnType<typeof vi.fn>;
    suggestionCreate?: ReturnType<typeof vi.fn>;
  } = {},
): DbClient {
  return {
    brunch: { findFirst: overrides.brunchFindFirst ?? vi.fn().mockResolvedValue(OPEN_BRUNCH) },
    brunchAttendee: {
      findFirst:
        overrides.attendeeFindFirst ?? vi.fn().mockResolvedValue({ id: 'attendee-row-uuid' }),
    },
    brunchInviteSuggestion: {
      findUnique: overrides.suggestionFindUnique ?? vi.fn().mockResolvedValue(null),
      create:
        overrides.suggestionCreate ?? vi.fn().mockResolvedValue({ id: 'new-suggestion-uuid' }),
    },
    brunchInviteSuggestionStatus: {
      findFirst: overrides.statusFindFirst ?? vi.fn().mockResolvedValue({ id: 'status-pending' }),
    },
    user: { findFirst: overrides.userFindFirst ?? vi.fn().mockResolvedValue(null) },
  } as unknown as DbClient;
}

beforeEach(() => {
  vi.mocked(reviewInviteSuggestion).mockReset();
});

const BASE_INPUT = {
  brunchId: BRUNCH_ID,
  suggestedById: ATTENDEE_ID,
  email: normalizeEmail('carol@example.com'),
};

describe('suggestInvitee', () => {
  it('creates a pending suggestion when host approval is required', async () => {
    const db = makeMockDb();

    const result = await suggestInvitee(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: { emit: vi.fn() },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      suggestionId: 'new-suggestion-uuid',
      status: 'pending',
    });
    expect(reviewInviteSuggestion).not.toHaveBeenCalled();
  });

  it('auto-approves and creates the invite when host approval is not required', async () => {
    vi.mocked(reviewInviteSuggestion).mockResolvedValue(
      ok({ suggestionId: 'new-suggestion-uuid' as never }),
    );
    const db = makeMockDb({
      brunchFindFirst: vi
        .fn()
        .mockResolvedValue({ ...OPEN_BRUNCH, requireHostApprovalToInvite: false }),
    });

    const result = await suggestInvitee(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: { emit: vi.fn() },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      suggestionId: 'new-suggestion-uuid',
      status: 'approved',
    });
    expect(reviewInviteSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestionId: 'new-suggestion-uuid',
        reviewedById: HOST_ID,
        decision: 'approve',
      }),
      expect.anything(),
    );
  });

  it('falls back to pending status when auto-approve fails', async () => {
    vi.mocked(reviewInviteSuggestion).mockResolvedValue(
      err({ kind: 'db_error', cause: new Error('boom') }),
    );
    const db = makeMockDb({
      brunchFindFirst: vi
        .fn()
        .mockResolvedValue({ ...OPEN_BRUNCH, requireHostApprovalToInvite: false }),
    });

    const result = await suggestInvitee(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: { emit: vi.fn() },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe('pending');
  });

  it("keeps the suggestion pending when the host's invite budgets refuse the auto-approval, and gives the review the same limiter", async () => {
    vi.mocked(reviewInviteSuggestion).mockResolvedValue(
      err({ kind: 'rate_limited', policy: 'invite-emails-host', retryAfterSeconds: 600 }),
    );
    const rateLimiter = new InMemoryRateLimiter();
    const db = makeMockDb({
      brunchFindFirst: vi
        .fn()
        .mockResolvedValue({ ...OPEN_BRUNCH, requireHostApprovalToInvite: false }),
    });

    const result = await suggestInvitee(BASE_INPUT, {
      rateLimiter,
      db,
      eventBus: { emit: vi.fn() },
    });

    expect(result._unsafeUnwrap()).toEqual({
      suggestionId: 'new-suggestion-uuid',
      status: 'pending',
    });
    expect(reviewInviteSuggestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ rateLimiter }),
    );
  });

  it('allows the host to suggest without an attendee row', async () => {
    const attendeeFindFirst = vi.fn();
    const db = makeMockDb({ attendeeFindFirst });

    const result = await suggestInvitee(
      { ...BASE_INPUT, suggestedById: HOST_ID },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isOk()).toBe(true);
    expect(attendeeFindFirst).not.toHaveBeenCalled();
  });

  it('returns brunch_not_found when the brunch does not exist', async () => {
    const db = makeMockDb({ brunchFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await suggestInvitee(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: { emit: vi.fn() },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('returns suggestions_disabled when allowInviteSuggestions is false', async () => {
    const db = makeMockDb({
      brunchFindFirst: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, allowInviteSuggestions: false }),
    });

    const result = await suggestInvitee(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: { emit: vi.fn() },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'suggestions_disabled' });
  });

  it('treats someone who is not a member as if the brunch does not exist', async () => {
    const db = makeMockDb({ attendeeFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await suggestInvitee(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: { emit: vi.fn() },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it('tells an outsider nothing about the brunch: not that suggestions are off, not who the host is', async () => {
    const outsider = vi.fn().mockResolvedValue(null);
    const off = makeMockDb({
      attendeeFindFirst: outsider,
      brunchFindFirst: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, allowInviteSuggestions: false }),
    });
    const hostEmail = makeMockDb({ attendeeFindFirst: outsider });

    const turnedOff = await suggestInvitee(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db: off,
      eventBus: { emit: vi.fn() },
    });
    const probe = await suggestInvitee(
      { ...BASE_INPUT, email: normalizeEmail('host@example.com') },
      { rateLimiter: new InMemoryRateLimiter(), db: hostEmail, eventBus: { emit: vi.fn() } },
    );

    expect(turnedOff._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
    // cannot_suggest_host would let a stranger test whether an address belongs to a brunch's host.
    expect(probe._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });

  it("returns cannot_suggest_host when the suggested email is the host's own", async () => {
    const db = makeMockDb();

    const result = await suggestInvitee(
      { ...BASE_INPUT, email: normalizeEmail('host@example.com') },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'cannot_suggest_host' });
  });

  it('returns cannot_suggest_host case-insensitively', async () => {
    const db = makeMockDb();

    const result = await suggestInvitee(
      { ...BASE_INPUT, email: 'Host@Example.com' as Email },
      { rateLimiter: new InMemoryRateLimiter(), db, eventBus: { emit: vi.fn() } },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'cannot_suggest_host' });
  });

  it('returns already_suggested when the email was already suggested for this brunch', async () => {
    const db = makeMockDb({
      suggestionFindUnique: vi.fn().mockResolvedValue({ id: 'existing-suggestion' }),
    });

    const result = await suggestInvitee(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: { emit: vi.fn() },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_suggested' });
  });

  it('returns lookup_not_found when the pending status row is missing', async () => {
    const db = makeMockDb({ statusFindFirst: vi.fn().mockResolvedValue(null) });

    const result = await suggestInvitee(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: { emit: vi.fn() },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'lookup_not_found',
      code: 'BrunchInviteSuggestionStatus:pending',
    });
  });

  it('links suggestedUserId when the suggested email already belongs to a user', async () => {
    const suggestionCreate = vi.fn().mockResolvedValue({ id: 'new-suggestion-uuid' });
    const db = makeMockDb({
      userFindFirst: vi.fn().mockResolvedValue({ id: 'carol-uuid' }),
      suggestionCreate,
    });

    await suggestInvitee(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: { emit: vi.fn() },
    });

    expect(suggestionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ suggestedUserId: 'carol-uuid' }) }),
    );
  });

  it('returns db_error when suggestion creation fails', async () => {
    const db = makeMockDb({ suggestionCreate: vi.fn().mockRejectedValue(new Error('boom')) });

    const result = await suggestInvitee(BASE_INPUT, {
      rateLimiter: new InMemoryRateLimiter(),
      db,
      eventBus: { emit: vi.fn() },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'db_error', cause: expect.any(Error) });
  });
});

describe('suggestInviteeRequestSchema', () => {
  it('normalizes the address to its canonical lowercase form (ADR 0008)', () => {
    const parsed = suggestInviteeRequestSchema.parse({ email: 'Friend@Example.COM' });

    expect(parsed.email).toBe('friend@example.com');
  });

  it('rejects an invalid email', () => {
    expect(suggestInviteeRequestSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});

describe('suggestInvitee — a brunch that is not open', () => {
  it('refuses a suggestion on a called-off brunch and records nothing', async () => {
    const suggestionCreate = vi.fn();
    const db = makeMockDb({
      brunchFindFirst: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'cancelled' } }),
      suggestionCreate,
    });

    const result = await suggestInvitee(BASE_INPUT, {
      db,
      eventBus: { emit: vi.fn() },
      rateLimiter: new InMemoryRateLimiter(),
    });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_called_off' });
    expect(suggestionCreate).not.toHaveBeenCalled();
  });

  it('tells an outsider the brunch does not exist, not that it is called off', async () => {
    const db = makeMockDb({
      brunchFindFirst: vi.fn().mockResolvedValue({ ...OPEN_BRUNCH, status: { code: 'cancelled' } }),
      attendeeFindFirst: vi.fn().mockResolvedValue(null),
    });

    const result = await suggestInvitee(BASE_INPUT, {
      db,
      eventBus: { emit: vi.fn() },
      rateLimiter: new InMemoryRateLimiter(),
    });

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'brunch_not_found' });
  });
});

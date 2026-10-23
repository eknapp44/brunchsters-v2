import { err } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

// A called-off brunch (spec 0013) makes the member-write services answer `brunch_called_off`, and
// the two that change status answer `invalid_transition`. Every route that calls one has to turn
// that into a 409; a route that forgot would answer 500 and look like a crash. The services'
// own rules are tested in packages/core; this only proves each route maps the new answers.

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/rateLimit', () => ({
  enforceWriteLimit: vi.fn().mockResolvedValue(undefined),
  enforceLimit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/services', () => ({ eventBus: {}, getRateLimiter: () => ({}) }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return {
    ...actual,
    updateRsvp: vi.fn(),
    sendInvites: vi.fn(),
    suggestInvitee: vi.fn(),
    updateVotingDeadline: vi.fn(),
    respondToInvite: vi.fn(),
    resendInvite: vi.fn(),
    revokeInvite: vi.fn(),
    reviewInviteSuggestion: vi.fn(),
    confirmBrunch: vi.fn(),
  };
});

import * as core from '@brunchsters/core';
import { auth } from '@/auth';
import { POST as confirmPost } from './brunches/[id]/confirm/route';
import { PATCH as deadlinePatch } from './brunches/[id]/voting/deadline/route';
import { POST as invitesPost } from './brunches/[id]/invites/route';
import { POST as rsvpPost } from './brunches/[id]/rsvp/route';
import { POST as suggestionsPost } from './brunches/[id]/suggestions/route';
import { DELETE as revokeDelete } from './invites/[id]/route';
import { POST as resendPost } from './invites/[id]/resend/route';
import { POST as respondPost } from './invites/token/[token]/respond/route';
import { POST as reviewPost } from './suggestions/[id]/review/route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);

const ID = '11111111-1111-4111-8111-111111111111';
const OPTION_ID = '22222222-2222-4222-8222-222222222222';

function jsonRequest(params: { readonly method: string; readonly body?: unknown }): Request {
  const init: RequestInit = {
    method: params.method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (params.body !== undefined) init.body = JSON.stringify(params.body);
  return new Request('http://localhost/api/v1/x', init);
}

type Case = {
  readonly route: string;
  readonly service: (typeof core)[keyof typeof core];
  readonly call: () => Promise<Response>;
  readonly errorKind: 'brunch_called_off' | 'invalid_transition';
};

const idParams = Promise.resolve({ id: ID });

const CASES: readonly Case[] = [
  {
    route: 'rsvp',
    service: core.updateRsvp,
    call: () =>
      rsvpPost(jsonRequest({ method: 'POST', body: { response: 'yes' } }), { params: idParams }),
    errorKind: 'brunch_called_off',
  },
  {
    route: 'invites (send)',
    service: core.sendInvites,
    call: () =>
      invitesPost(jsonRequest({ method: 'POST', body: { emails: ['a@example.com'] } }), {
        params: idParams,
      }),
    errorKind: 'brunch_called_off',
  },
  {
    route: 'invites (send), status changed',
    service: core.sendInvites,
    call: () =>
      invitesPost(jsonRequest({ method: 'POST', body: { emails: ['a@example.com'] } }), {
        params: idParams,
      }),
    errorKind: 'invalid_transition',
  },
  {
    route: 'suggestions',
    service: core.suggestInvitee,
    call: () =>
      suggestionsPost(jsonRequest({ method: 'POST', body: { email: 'a@example.com' } }), {
        params: idParams,
      }),
    errorKind: 'brunch_called_off',
  },
  {
    route: 'voting deadline',
    service: core.updateVotingDeadline,
    call: () =>
      deadlinePatch(jsonRequest({ method: 'PATCH', body: { votingDeadline: null } }), {
        params: idParams,
      }),
    errorKind: 'brunch_called_off',
  },
  {
    route: 'token respond',
    service: core.respondToInvite,
    call: () =>
      respondPost(jsonRequest({ method: 'POST', body: { response: 'yes' } }), {
        params: Promise.resolve({ token: 'a-token' }),
      }),
    errorKind: 'brunch_called_off',
  },
  {
    route: 'resend',
    service: core.resendInvite,
    call: () => resendPost(jsonRequest({ method: 'POST' }), { params: idParams }),
    errorKind: 'brunch_called_off',
  },
  {
    route: 'revoke',
    service: core.revokeInvite,
    call: () => revokeDelete(jsonRequest({ method: 'DELETE' }), { params: idParams }),
    errorKind: 'brunch_called_off',
  },
  {
    route: 'suggestion review',
    service: core.reviewInviteSuggestion,
    call: () =>
      reviewPost(jsonRequest({ method: 'POST', body: { decision: 'approve' } }), {
        params: idParams,
      }),
    errorKind: 'brunch_called_off',
  },
  {
    route: 'suggestion review, status changed',
    service: core.reviewInviteSuggestion,
    call: () =>
      reviewPost(jsonRequest({ method: 'POST', body: { decision: 'approve' } }), {
        params: idParams,
      }),
    errorKind: 'invalid_transition',
  },
  {
    route: 'confirm, status changed',
    service: core.confirmBrunch,
    call: () =>
      confirmPost(jsonRequest({ method: 'POST', body: { locationId: ID, timeId: OPTION_ID } }), {
        params: idParams,
      }),
    errorKind: 'invalid_transition',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'user-uuid' } });
});

describe('routes turn the lifecycle answers into a 409, never a 500', () => {
  it.each(CASES)('$route answers 409 for $errorKind', async ({ service, call, errorKind }) => {
    const error =
      errorKind === 'brunch_called_off'
        ? { kind: 'brunch_called_off' as const }
        : { kind: 'invalid_transition' as const, from: 'active', to: 'confirmed' };
    vi.mocked(service as (...args: never[]) => Promise<unknown>).mockResolvedValue(err(error));

    const response = await call();

    expect(response.status).toBe(409);
  });
});

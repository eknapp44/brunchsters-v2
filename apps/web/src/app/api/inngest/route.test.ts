import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Route from './route';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/services', () => ({
  getEmailService: vi.fn(),
  getAppUrl: () => 'https://app.example.com',
}));

// The signing key format the SDK expects: signkey-<env>-<hex>.
const SIGNING_KEY = 'signkey-prod-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

async function loadRoute(): Promise<typeof Route> {
  vi.resetModules();
  return import('./route');
}

function unsignedRun(): Request {
  return new Request('http://localhost:3000/api/inngest?fnId=brunchsters-send-invite-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ctx: { run_id: 'run-1', attempt: 0 },
      event: { name: 'invite/sent', data: { inviteId: '00000000-0000-4000-8000-000000000001' } },
      events: [],
      steps: {},
    }),
  });
}

beforeEach(() => {
  vi.stubEnv('INNGEST_SIGNING_KEY', SIGNING_KEY);
  vi.stubEnv('INNGEST_EVENT_KEY', 'event-key');
  vi.stubEnv('INNGEST_DEV', '');
  // The SDK logs the rejection; that is the behavior under test, not noise to read.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('/api/inngest', () => {
  it('refuses to run a function for a request without a valid signature', async () => {
    const { POST } = await loadRoute();

    const response = await POST(unsignedRun() as never, undefined);

    expect(response.status).toBe(401);
    // The SDK's answer. The app's own session gate says { error: 'Unauthorized' }, so this
    // body also tells the e2e suite that the request got past middleware to the SDK.
    expect(await response.json()).toEqual({ message: 'Unauthorized' });
  });

  it('refuses a request signed with the wrong key', async () => {
    const { POST } = await loadRoute();
    const request = unsignedRun();
    request.headers.set('x-inngest-signature', 't=1700000000&s=deadbeef');

    const response = await POST(request as never, undefined);

    expect(response.status).toBe(401);
  });
});

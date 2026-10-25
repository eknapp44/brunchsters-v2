import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/adapters/GooglePlacesProvider', () => ({
  GooglePlacesProvider: vi.fn(),
}));

import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { GooglePlacesProvider } from '@/adapters/GooglePlacesProvider';
import { auth } from '@/auth';
import { enforceLimit } from '@/lib/rateLimit';
import { rateLimitedResponse } from '@/lib/rateLimitHttp';
import { GET } from './route';
import { errorCodeOf } from '@/test-support/errorCodeOf';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockEnforceLimit = vi.mocked(enforceLimit);

const mockGetDetails = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'person-1' } });
  vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key');
  vi.mocked(GooglePlacesProvider).mockImplementation(
    () => ({ search: vi.fn(), getDetails: mockGetDetails }) as unknown as GooglePlacesProvider,
  );
});

function detailsRequest(
  placeId: string,
  query = '',
): { request: Request; params: Promise<{ placeId: string }> } {
  return {
    request: new Request(`http://localhost/api/v1/places/${placeId}${query ? `?${query}` : ''}`),
    params: Promise.resolve({ placeId }),
  };
}

describe('GET /api/v1/places/[placeId]', () => {
  it('returns 200 with place details on success', async () => {
    const details = {
      placeId: 'place-1',
      name: 'Cracker Barrel',
      address: 'Nashville, TN',
      placeUrl: 'https://maps.google.com/?cid=1',
      timezone: 'America/Chicago',
    };
    mockGetDetails.mockResolvedValue(details);

    const { request, params } = detailsRequest('place-1');
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(details);
    expect(mockGetDetails).toHaveBeenCalledWith({ placeId: 'place-1' });
  });

  it('passes sessionToken through when present', async () => {
    mockGetDetails.mockResolvedValue({
      placeId: 'place-1',
      name: '',
      address: '',
      placeUrl: '',
      timezone: 'America/Chicago',
    });

    const { request, params } = detailsRequest('place-1', 'sessionToken=sess-1');
    await GET(request, { params });

    expect(mockGetDetails).toHaveBeenCalledWith({ placeId: 'place-1', sessionToken: 'sess-1' });
  });

  it('returns 404 when the provider returns undefined', async () => {
    mockGetDetails.mockResolvedValue(undefined);

    const { request, params } = detailsRequest('missing');
    const response = await GET(request, { params });

    expect(response.status).toBe(404);
    expect(await errorCodeOf(response)).toBe('not_found');
    expect(await errorCodeOf(response)).toBe('not_found');
  });

  it('returns 502 when the provider throws', async () => {
    mockGetDetails.mockRejectedValue(new Error('boom'));

    const { request, params } = detailsRequest('place-1');
    const response = await GET(request, { params });

    expect(response.status).toBe(502);
    expect(await errorCodeOf(response)).toBe('unavailable');
    expect(await errorCodeOf(response)).toBe('unavailable');
  });
});

describe('GET /api/v1/places/[placeId] — who may call it and how often', () => {
  it('returns 401 for a signed-out caller, and spends nothing and calls nobody', async () => {
    mockAuth.mockResolvedValue(null);
    const { request, params } = detailsRequest('place-1');

    const response = await GET(request, { params });

    expect(response.status).toBe(401);
    expect(await errorCodeOf(response)).toBe('signed_out');
    expect(mockEnforceLimit).not.toHaveBeenCalled();
    expect(mockGetDetails).not.toHaveBeenCalled();
  });

  it('spends the signed-in person place-details budget before Google is called', async () => {
    mockGetDetails.mockResolvedValue(undefined);
    const { request, params } = detailsRequest('place-1');

    await GET(request, { params });

    expect(mockEnforceLimit).toHaveBeenCalledWith({
      policy: RATE_LIMIT_POLICIES.placeDetailsPerUser,
      subject: 'person-1',
      route: 'place details',
    });
  });

  it('answers the refusal as it is, without calling Google', async () => {
    mockEnforceLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'place-details', retryAfterSeconds: 20 }),
    );
    const { request, params } = detailsRequest('place-1');

    const response = await GET(request, { params });

    expect(response.status).toBe(429);
    expect(mockGetDetails).not.toHaveBeenCalled();
  });
});

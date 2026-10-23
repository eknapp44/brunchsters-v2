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

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockEnforceLimit = vi.mocked(enforceLimit);

const mockSearch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'person-1' } });
  vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key');
  vi.mocked(GooglePlacesProvider).mockImplementation(
    () => ({ search: mockSearch, getDetails: vi.fn() }) as unknown as GooglePlacesProvider,
  );
});

function searchRequest(query: string): Request {
  return new Request(`http://localhost/api/v1/places/search?${query}`);
}

describe('GET /api/v1/places/search', () => {
  it('returns 400 when q is missing', async () => {
    const response = await GET(searchRequest(''));

    expect(response.status).toBe(400);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns 400 when q is under 3 characters', async () => {
    const response = await GET(searchRequest('q=ab'));

    expect(response.status).toBe(400);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns 200 with places on a valid query', async () => {
    mockSearch.mockResolvedValue([{ placeId: 'p1', name: 'Place', address: 'Addr' }]);

    const response = await GET(searchRequest('q=brunch+chicago'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      places: [{ placeId: 'p1', name: 'Place', address: 'Addr' }],
    });
    expect(mockSearch).toHaveBeenCalledWith({ query: 'brunch chicago' });
  });

  it('passes sessionToken through when present', async () => {
    mockSearch.mockResolvedValue([]);

    await GET(searchRequest('q=brunch&sessionToken=sess-1'));

    expect(mockSearch).toHaveBeenCalledWith({ query: 'brunch', sessionToken: 'sess-1' });
  });

  it('returns 502 when the provider throws', async () => {
    mockSearch.mockRejectedValue(new Error('boom'));

    const response = await GET(searchRequest('q=brunch'));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Place search unavailable' });
  });
});

describe('GET /api/v1/places/search — who may call it and how often', () => {
  it('returns 401 for a signed-out caller, and spends nothing and calls nobody', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET(searchRequest('q=brunch'));

    expect(response.status).toBe(401);
    expect(mockEnforceLimit).not.toHaveBeenCalled();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('spends the signed-in person place-search budget before Google is called', async () => {
    mockSearch.mockResolvedValue([]);

    await GET(searchRequest('q=brunch'));

    expect(mockEnforceLimit).toHaveBeenCalledWith({
      policy: RATE_LIMIT_POLICIES.placeSearchPerUser,
      subject: 'person-1',
      route: 'place search',
    });
  });

  it('answers the refusal as it is, before the query is even checked and without calling Google', async () => {
    mockEnforceLimit.mockResolvedValue(
      rateLimitedResponse({ policy: 'place-search', retryAfterSeconds: 30 }),
    );

    // A query that would otherwise be a 400: the budget is spent first, so this is a 429.
    const response = await GET(searchRequest('q=a'));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(mockSearch).not.toHaveBeenCalled();
  });
});

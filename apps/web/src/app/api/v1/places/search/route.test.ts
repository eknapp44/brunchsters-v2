import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/adapters/GooglePlacesProvider', () => ({
  GooglePlacesProvider: vi.fn(),
}));

import { GooglePlacesProvider } from '@/adapters/GooglePlacesProvider';
import { GET } from './route';

const mockSearch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
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

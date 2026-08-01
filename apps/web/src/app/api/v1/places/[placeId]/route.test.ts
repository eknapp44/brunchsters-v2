import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/adapters/GooglePlacesProvider', () => ({
  GooglePlacesProvider: vi.fn(),
}));

import { GooglePlacesProvider } from '@/adapters/GooglePlacesProvider';
import { GET } from './route';

const mockGetDetails = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
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
    expect(await response.json()).toEqual({ error: 'Place not found' });
  });

  it('returns 502 when the provider throws', async () => {
    mockGetDetails.mockRejectedValue(new Error('boom'));

    const { request, params } = detailsRequest('place-1');
    const response = await GET(request, { params });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Place search unavailable' });
  });
});

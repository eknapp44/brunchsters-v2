import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GooglePlacesProvider } from './GooglePlacesProvider';

function jsonResponse(body: unknown, init?: { readonly ok?: boolean; readonly status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

describe('GooglePlacesProvider.search', () => {
  it('POSTs the query with the api key header and returns mapped predictions', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        suggestions: [
          {
            placePrediction: {
              placeId: 'place-1',
              structuredFormat: {
                mainText: { text: 'Cracker Barrel' },
                secondaryText: { text: 'Nashville, TN' },
              },
            },
          },
        ],
      }),
    );

    const provider = new GooglePlacesProvider('test-key');
    const results = await provider.search({ query: 'cracker barrel', sessionToken: 'sess-1' });

    expect(results).toEqual([
      { placeId: 'place-1', name: 'Cracker Barrel', address: 'Nashville, TN' },
    ]);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-key');
    expect(JSON.parse(init.body as string)).toEqual({
      input: 'cracker barrel',
      sessionToken: 'sess-1',
      languageCode: 'en',
    });
    // A hanging Google request must not hang the route forever — every call
    // is wired to an abortable timeout.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('defaults name and address to empty strings when structuredFormat is missing', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ suggestions: [{ placePrediction: { placeId: 'place-2' } }] }),
    );

    const provider = new GooglePlacesProvider('test-key');
    const results = await provider.search({ query: 'x' });

    expect(results).toEqual([{ placeId: 'place-2', name: '', address: '' }]);
  });

  it('returns an empty array when there are no suggestions', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    const provider = new GooglePlacesProvider('test-key');
    const results = await provider.search({ query: 'nothing here' });

    expect(results).toEqual([]);
  });

  it('throws when the autocomplete request fails', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

    const provider = new GooglePlacesProvider('test-key');
    await expect(provider.search({ query: 'x' })).rejects.toThrow(
      'Places autocomplete failed: 500',
    );
  });
});

describe('GooglePlacesProvider.getDetails', () => {
  it('fetches details and timezone, returning a mapped PlaceDetails', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'place-1',
          displayName: { text: 'Cracker Barrel' },
          formattedAddress: '4323 Sidco Dr, Nashville, TN',
          googleMapsUri: 'https://maps.google.com/?cid=123',
          location: { latitude: 36.08, longitude: -86.76 },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'OK', timeZoneId: 'America/Chicago' }));

    const provider = new GooglePlacesProvider('test-key');
    const details = await provider.getDetails({ placeId: 'place-1', sessionToken: 'sess-1' });

    expect(details).toEqual({
      placeId: 'place-1',
      name: 'Cracker Barrel',
      address: '4323 Sidco Dr, Nashville, TN',
      placeUrl: 'https://maps.google.com/?cid=123',
      timezone: 'America/Chicago',
      lat: 36.08,
      lng: -86.76,
    });

    const [detailsUrl, detailsInit] = mockFetch.mock.calls[0] as [URL, RequestInit];
    expect(detailsUrl.toString()).toBe(
      'https://places.googleapis.com/v1/places/place-1?sessionToken=sess-1',
    );
    expect((detailsInit.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(
      'id,displayName,formattedAddress,googleMapsUri,location',
    );
    expect(detailsInit.signal).toBeInstanceOf(AbortSignal);

    const [timezoneUrl, timezoneInit] = mockFetch.mock.calls[1] as [URL, RequestInit];
    expect(timezoneUrl.searchParams.get('location')).toBe('36.08,-86.76');
    expect(timezoneUrl.searchParams.get('key')).toBe('test-key');
    expect(timezoneInit.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits the sessionToken query param when none is given', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({ id: 'place-1', location: { latitude: 1, longitude: 2 } }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'OK', timeZoneId: 'America/Chicago' }));

    const provider = new GooglePlacesProvider('test-key');
    await provider.getDetails({ placeId: 'place-1' });

    const [detailsUrl] = mockFetch.mock.calls[0] as [URL];
    expect(detailsUrl.searchParams.has('sessionToken')).toBe(false);
  });

  it('returns undefined on a 404 from Place Details', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 404 }));

    const provider = new GooglePlacesProvider('test-key');
    const details = await provider.getDetails({ placeId: 'missing' });

    expect(details).toBeUndefined();
  });

  it('throws on a non-404 error from Place Details', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

    const provider = new GooglePlacesProvider('test-key');
    await expect(provider.getDetails({ placeId: 'place-1' })).rejects.toThrow(
      'Place details failed: 500',
    );
  });

  it('throws when Place Details has no location', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'place-1' }));

    const provider = new GooglePlacesProvider('test-key');
    await expect(provider.getDetails({ placeId: 'place-1' })).rejects.toThrow(
      'Place details missing location; cannot resolve timezone',
    );
  });

  it('throws when the Time Zone API does not return status OK', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({ id: 'place-1', location: { latitude: 1, longitude: 2 } }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'ZERO_RESULTS' }));

    const provider = new GooglePlacesProvider('test-key');
    await expect(provider.getDetails({ placeId: 'place-1' })).rejects.toThrow(
      'Time zone lookup failed: ZERO_RESULTS',
    );
  });

  it('throws when the Time Zone API request itself fails', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({ id: 'place-1', location: { latitude: 1, longitude: 2 } }),
      )
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 503 }));

    const provider = new GooglePlacesProvider('test-key');
    await expect(provider.getDetails({ placeId: 'place-1' })).rejects.toThrow(
      'Time zone lookup failed: 503',
    );
  });
});

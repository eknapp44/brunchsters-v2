import type { PlaceDetails, PlaceResult } from '@brunchsters/core';
import type { IanaTimezone } from '@brunchsters/shared';
import type { BrowserContext, Page } from '@playwright/test';

// Typed against the real PlaceDetails so a change to the Places response shape breaks
// compilation here instead of silently drifting (ADR 0007).
const place = (details: PlaceDetails): PlaceDetails => details;

export const fixturePlaces = {
  sunnySide: place({
    placeId: 'e2e-place-sunny-side',
    name: 'Sunny Side Cafe',
    address: '100 Main St, Chicago, IL',
    placeUrl: 'https://maps.google.com/?cid=e2e-sunny-side',
    timezone: 'America/Chicago' as IanaTimezone,
  }),
  harborBistro: place({
    placeId: 'e2e-place-harbor-bistro',
    name: 'Harbor Bistro',
    address: '200 Water St, New York, NY',
    placeUrl: 'https://maps.google.com/?cid=e2e-harbor-bistro',
    timezone: 'America/New_York' as IanaTimezone,
  }),
  pacificBrunchHouse: place({
    placeId: 'e2e-place-pacific-brunch-house',
    name: 'Pacific Brunch House',
    address: '300 Ocean Ave, Los Angeles, CA',
    placeUrl: 'https://maps.google.com/?cid=e2e-pacific',
    timezone: 'America/Los_Angeles' as IanaTimezone,
  }),
} as const;

const allPlaces: readonly PlaceDetails[] = Object.values(fixturePlaces);

export type PlacesMock = {
  readonly searchQueries: () => readonly string[];
  readonly detailPlaceIds: () => readonly string[];
};

// Answers /api/v1/places/** in the browser with fixtures, so no request reaches the server
// (and from there Google). Mirrors the real routes: a query under 3 characters is a 400,
// an unknown place id is a 404.
export async function mockPlaces(target: Page | BrowserContext): Promise<PlacesMock> {
  const searchQueries: string[] = [];
  const detailPlaceIds: string[] = [];

  await target.route(/\/api\/v1\/places\//, async (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/');
    const last = decodeURIComponent(segments[segments.length - 1] ?? '');

    if (last === 'search') {
      const query = url.searchParams.get('q') ?? '';
      searchQueries.push(query);
      if (query.length < 3) {
        await route.fulfill({
          status: 400,
          json: { error: 'Query must be at least 3 characters' },
        });
        return;
      }
      const needle = query.toLowerCase();
      const places: readonly PlaceResult[] = allPlaces
        .filter((candidate) => candidate.name.toLowerCase().includes(needle))
        .map(({ placeId, name, address }) => ({ placeId, name, address }));
      await route.fulfill({ status: 200, json: { places } });
      return;
    }

    detailPlaceIds.push(last);
    const details = allPlaces.find((candidate) => candidate.placeId === last);
    if (details === undefined) {
      await route.fulfill({ status: 404, json: { error: 'Place not found' } });
      return;
    }
    await route.fulfill({ status: 200, json: details });
  });

  return {
    searchQueries: () => [...searchQueries],
    detailPlaceIds: () => [...detailPlaceIds],
  };
}

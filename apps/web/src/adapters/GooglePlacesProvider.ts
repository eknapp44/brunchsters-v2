import type { PlaceDetails, PlaceProvider, PlaceResult } from '@brunchsters/core';
import type { IanaTimezone } from '@brunchsters/shared';

const PLACES_BASE_URL = 'https://places.googleapis.com/v1';
const TIMEZONE_BASE_URL = 'https://maps.googleapis.com/maps/api/timezone/json';
const PLACE_DETAILS_FIELD_MASK = 'id,displayName,formattedAddress,googleMapsUri,location';
const REQUEST_TIMEOUT_MS = 5000;

type AutocompleteResponse = {
  readonly suggestions?: ReadonlyArray<{
    readonly placePrediction?: {
      readonly placeId: string;
      readonly structuredFormat?: {
        readonly mainText?: { readonly text: string };
        readonly secondaryText?: { readonly text: string };
      };
    };
  }>;
};

type PlaceDetailsResponse = {
  readonly id: string;
  readonly displayName?: { readonly text: string };
  readonly formattedAddress?: string;
  readonly googleMapsUri?: string;
  readonly location?: { readonly latitude: number; readonly longitude: number };
};

type TimeZoneResponse = {
  readonly status: string;
  readonly timeZoneId?: string;
};

export class GooglePlacesProvider implements PlaceProvider {
  constructor(private readonly apiKey: string) {}

  private async fetchWithTimeout(url: string | URL, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async search(params: {
    readonly query: string;
    readonly sessionToken?: string;
  }): Promise<readonly PlaceResult[]> {
    const response = await this.fetchWithTimeout(`${PLACES_BASE_URL}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
      },
      body: JSON.stringify({
        input: params.query,
        sessionToken: params.sessionToken,
        languageCode: 'en',
      }),
    });

    if (!response.ok) {
      throw new Error(`Places autocomplete failed: ${response.status}`);
    }

    const data = (await response.json()) as AutocompleteResponse;

    return (data.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter(
        (prediction): prediction is NonNullable<typeof prediction> => prediction !== undefined,
      )
      .map((prediction) => ({
        placeId: prediction.placeId,
        name: prediction.structuredFormat?.mainText?.text ?? '',
        address: prediction.structuredFormat?.secondaryText?.text ?? '',
      }));
  }

  async getDetails(params: {
    readonly placeId: string;
    readonly sessionToken?: string;
  }): Promise<PlaceDetails | undefined> {
    const detailsUrl = new URL(`${PLACES_BASE_URL}/places/${params.placeId}`);
    if (params.sessionToken !== undefined) {
      detailsUrl.searchParams.set('sessionToken', params.sessionToken);
    }

    const detailsResponse = await this.fetchWithTimeout(detailsUrl, {
      headers: {
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
      },
    });

    if (detailsResponse.status === 404) {
      return undefined;
    }
    if (!detailsResponse.ok) {
      throw new Error(`Place details failed: ${detailsResponse.status}`);
    }

    const details = (await detailsResponse.json()) as PlaceDetailsResponse;
    const timezone = await this.getTimezone(details.location);

    return {
      placeId: details.id,
      name: details.displayName?.text ?? '',
      address: details.formattedAddress ?? '',
      placeUrl: details.googleMapsUri ?? '',
      timezone,
      ...(details.location !== undefined
        ? { lat: details.location.latitude, lng: details.location.longitude }
        : {}),
    };
  }

  private async getTimezone(
    location: { readonly latitude: number; readonly longitude: number } | undefined,
  ): Promise<IanaTimezone> {
    if (location === undefined) {
      throw new Error('Place details missing location; cannot resolve timezone');
    }

    const timezoneUrl = new URL(TIMEZONE_BASE_URL);
    timezoneUrl.searchParams.set('location', `${location.latitude},${location.longitude}`);
    timezoneUrl.searchParams.set('timestamp', String(Math.floor(Date.now() / 1000)));
    timezoneUrl.searchParams.set('key', this.apiKey);

    const response = await this.fetchWithTimeout(timezoneUrl);
    if (!response.ok) {
      throw new Error(`Time zone lookup failed: ${response.status}`);
    }

    const data = (await response.json()) as TimeZoneResponse;
    if (data.status !== 'OK' || data.timeZoneId === undefined) {
      throw new Error(`Time zone lookup failed: ${data.status}`);
    }

    return data.timeZoneId as IanaTimezone;
  }
}

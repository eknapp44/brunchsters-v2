import type { IanaTimezone } from '@brunchsters/shared';

// Slim shape from autocomplete predictions — full details (URL, timezone) come from getDetails.
export type PlaceResult = {
  readonly placeId: string;
  readonly name: string;
  readonly address: string;
};

export type PlaceDetails = {
  readonly placeId: string;
  readonly name: string;
  readonly address: string;
  readonly placeUrl: string;
  readonly timezone: IanaTimezone;
  readonly lat?: number;
  readonly lng?: number;
};

// sessionToken groups a search-as-you-type sequence + final getDetails into one
// billing session (Google Places Autocomplete session pricing). Opaque pass-through.
export interface PlaceProvider {
  search(params: {
    readonly query: string;
    readonly sessionToken?: string;
  }): Promise<readonly PlaceResult[]>;
  getDetails(params: {
    readonly placeId: string;
    readonly sessionToken?: string;
  }): Promise<PlaceDetails | undefined>;
}

import type { IanaTimezone } from '@brunchsters/shared';

export type PlaceResult = {
  readonly placeId: string;
  readonly name: string;
  readonly address: string;
  readonly placeUrl: string;
};

export type PlaceDetails = PlaceResult & {
  readonly timezone: IanaTimezone;
  readonly lat?: number;
  readonly lng?: number;
};

export interface PlaceProvider {
  search(query: string): Promise<readonly PlaceResult[]>;
  getDetails(placeId: string): Promise<PlaceDetails | undefined>;
}

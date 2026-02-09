export type SearchMode = 'address' | 'city';

export type ListingsSource = 'repliers';

export interface PropertyListing {
  source: ListingsSource;
  sourceId: string;
  address: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  photos: string[];
}

export interface SearchResponse {
  searchId: string;
  properties: PropertyListing[];
}

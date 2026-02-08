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

export interface RecentSearch {
  id: string;
  mode: SearchMode;
  query: string;
  source?: string;
  createdAt?: string;
  retrievedAt?: string;
}

export interface RecentSearchesResponse {
  searches: RecentSearch[];
}

export interface SearchDetail {
  id: string;
  mode: SearchMode;
  query: string;
  source?: string;
  createdAt?: string;
  retrievedAt?: string;
  properties: PropertyListing[];
}

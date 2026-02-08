export type SearchMode = 'address' | 'city';

export type ListingsSource = 'repliers';

export interface PropertyListing {
  source: ListingsSource;
  sourceId: string; // e.g. mlsId

  address: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;

  photos: string[];
}

export interface SearchRecord {
  id: string;
  mode: SearchMode;
  query: string;
  createdAt: string; // ISO
  retrievedAt: string; // ISO
  source: ListingsSource;
}

import { getEnv } from '../env.js';
import type { PropertyListing } from '../types.js';
import { randomUUID } from 'node:crypto';

type RepliersApiListing = Record<string, unknown>;

type RepliersListingsResponse =
  | RepliersApiListing[]
  | {
      apiVersion?: string;
      page?: number;
      numPages?: number;
      pageSize?: number;
      count?: number;
      listings?: RepliersApiListing[];
      results?: RepliersApiListing[];
      data?: RepliersApiListing[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function getNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === 'number' ? v : undefined;
}

function getNumeric(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];

  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : undefined;
  }

  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed.length === 0) return undefined;
    const normalized = trimmed.replace(/,/g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : undefined;
  }

  return undefined;
}

function getNested(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = obj[key];
  return isRecord(v) ? v : undefined;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripUnitDesignator(streetLine: string): string {
  // Remove unit/suite designators that Repliers does not include in `streetName`.
  // Examples:
  // - "212 Lessin LN #B" -> "212 Lessin LN"
  // - "212 Lessin LN Apt B" -> "212 Lessin LN"
  // - "212 Lessin LN Unit 2" -> "212 Lessin LN"
  // - "212 Lessin LN Ste 300" -> "212 Lessin LN"
  const normalized = normalizeWhitespace(streetLine);

  // Trim inline '#<unit>' at end.
  const hashStripped = normalized.replace(/\s+#\s*[A-Za-z0-9-]+\s*$/i, '').trim();
  if (hashStripped !== normalized) return hashStripped;

  // Trim common unit keywords at end.
  return normalized
    .replace(/\s+(apt|apartment|unit|ste|suite|fl|floor)\s+[A-Za-z0-9-]+\s*$/i, '')
    .trim();
}

function parseCityStateFromQuery(addressQuery: string): { city?: string; state?: string } {
  // Expected patterns:
  // - "<street>, Austin, TX 78704"
  // - "<street>, Austin, TX"
  const parts = addressQuery
    .split(',')
    .map((p) => normalizeWhitespace(p))
    .filter((p) => p.length > 0);

  if (parts.length < 3) return {};

  const city = parts[1];
  const stateToken = parts[2].split(/\s+/)[0] ?? '';
  const state = /^[A-Za-z]{2}$/.test(stateToken) ? stateToken.toUpperCase() : undefined;
  return { city, state };
}

function getListingArray(payload: RepliersListingsResponse): RepliersApiListing[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  const listings = payload.listings;
  if (Array.isArray(listings)) return listings;
  const results = payload.results;
  if (Array.isArray(results)) return results;
  const data = payload.data;
  if (Array.isArray(data)) return data;
  return [];
}

function toCdnUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const clean = trimmed.replace(/^\/+/, '');
  const base = `https://cdn.repliers.io/${clean}`;

  // Prefer a reasonable image size for the demo UI.
  return base.includes('?') ? `${base}&class=medium` : `${base}?class=medium`;
}

function extractPhotos(listing: Record<string, unknown>): string[] {
  const images = listing.images;
  if (!images) return [];

  if (Array.isArray(images)) {
    const photos: string[] = [];
    for (const img of images) {
      if (typeof img === 'string') {
        photos.push(toCdnUrl(img));
        continue;
      }
      if (isRecord(img)) {
        const url = getString(img, 'url') ?? getString(img, 'href') ?? getString(img, 'path');
        if (url) photos.push(toCdnUrl(url));
      }
    }
    return photos;
  }

  return [];
}

function extractAddress(listing: Record<string, unknown>): string {
  const address = getNested(listing, 'address');
  if (address) {
    // Repliers returns address as a structured object.
    const streetNumber = getString(address, 'streetNumber');
    const streetName = getString(address, 'streetName');
    const streetSuffix = getString(address, 'streetSuffix');
    const streetDirectionPrefix = getString(address, 'streetDirectionPrefix');
    const streetDirection = getString(address, 'streetDirection');
    const unitNumber = getString(address, 'unitNumber');
    const city = getString(address, 'city');
    const state = getString(address, 'state');
    const postal = getString(address, 'postalCode') ?? getString(address, 'zip');

    const streetParts = [
      streetNumber,
      streetName,
      streetSuffix,
      streetDirectionPrefix,
      streetDirection,
      unitNumber ? `#${unitNumber}` : undefined
    ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);

    const streetLine = normalizeWhitespace(streetParts.join(' '));
    const localeParts = [city, state].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
    const locale = normalizeWhitespace(localeParts.join(', '));

    const baseParts = [streetLine, locale].filter((p) => p.length > 0);
    const base = normalizeWhitespace(baseParts.join(', '));
    return postal ? normalizeWhitespace(`${base} ${postal}`) : base;
  }

  const fallback = getString(listing, 'address') ?? getString(listing, 'fullAddress');
  return fallback ? normalizeWhitespace(fallback) : '';
}

function extractSourceId(listing: Record<string, unknown>): string {
  const candidates = [
    getString(listing, 'id'),
    getString(listing, 'listingId'),
    getString(listing, 'mlsId'),
    getString(listing, 'mlsNumber'),
    String(getNumber(listing, 'id') ?? ''),
    String(getNumber(listing, 'listingId') ?? '')
  ].filter((v) => typeof v === 'string' && v.trim().length > 0);

  return candidates[0] ?? randomUUID();
}

function extractBeds(listing: Record<string, unknown>): number | undefined {
  const details = getNested(listing, 'details');
  return (
    (details ? getNumeric(details, 'numBedrooms') ?? getNumeric(details, 'bedrooms') : undefined) ??
    getNumeric(listing, 'numBedrooms') ??
    getNumeric(listing, 'bedrooms') ??
    getNumeric(listing, 'beds')
  );
}

function extractBaths(listing: Record<string, unknown>): number | undefined {
  const details = getNested(listing, 'details');
  return (
    (details ? getNumeric(details, 'numBathrooms') ?? getNumeric(details, 'bathrooms') : undefined) ??
    getNumeric(listing, 'numBathrooms') ??
    getNumeric(listing, 'bathrooms') ??
    getNumeric(listing, 'baths')
  );
}

function extractSqft(listing: Record<string, unknown>): number | undefined {
  const details = getNested(listing, 'details');
  return (
    (details ? getNumeric(details, 'sqft') ?? getNumeric(details, 'livingArea') : undefined) ??
    getNumeric(listing, 'sqft') ??
    getNumeric(listing, 'livingArea')
  );
}

function extractPrice(listing: Record<string, unknown>): number | undefined {
  const candidates = [
    getNumeric(listing, 'listPrice'),
    getNumeric(listing, 'price'),
    getNumeric(listing, 'listingPrice')
  ];
  return candidates.find((n) => typeof n === 'number');
}

function listingToProperty(listingRaw: RepliersApiListing): PropertyListing {
  const listing = isRecord(listingRaw) ? listingRaw : {};

  return {
    source: 'repliers',
    sourceId: extractSourceId(listing),
    address: extractAddress(listing),
    price: extractPrice(listing),
    beds: extractBeds(listing),
    baths: extractBaths(listing),
    sqft: extractSqft(listing),
    photos: extractPhotos(listing)
  };
}

async function repliersPost(pathname: string, query: Record<string, string | number | undefined>) {
  const env = getEnv();
  const url = new URL(pathname, env.REPLIERS_API_BASE_URL);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'REPLIERS-API-KEY': env.REPLIERS_API_KEY ?? ''
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Repliers request failed (${res.status}): ${text}`);
  }

  return (await res.json()) as RepliersListingsResponse;
}

export async function searchByCity(city: string, state: string, limit = 100): Promise<PropertyListing[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 100);

  const payload = await repliersPost('/listings', {
    city,
    state,
    // Filter to for-sale listings only (exclude rentals/leases).
    // Repliers supports `type=sale|lease` for `/listings` search.
    type: 'sale',
    status: 'A',
    pageSize: cappedLimit,
    pageNum: 1
  });

  const listings = getListingArray(payload);
  return listings.slice(0, cappedLimit).map(listingToProperty);
}

export async function searchByAddress(addressQuery: string): Promise<PropertyListing | null> {
  const firstLine = addressQuery.split(',')[0]?.trim() ?? addressQuery.trim();
  const match = /^\s*(\d+)\s+(.*?)\s*$/.exec(firstLine);
  if (!match) return null;

  const streetNumber = match[1];
  const streetNameRaw = stripUnitDesignator(match[2]);
  const { city, state } = parseCityStateFromQuery(addressQuery);

  const ROAD_SUFFIXES = new Set([
    'st',
    'street',
    'rd',
    'road',
    'dr',
    'drive',
    'ave',
    'avenue',
    'blvd',
    'boulevard',
    'ln',
    'lane',
    'ct',
    'court',
    'cir',
    'circle',
    'pl',
    'place',
    'way',
    'pkwy',
    'parkway',
    'hwy',
    'highway',
    'ter',
    'terrace',
    'trl',
    'trail'
  ]);
  const DIRECTIONS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

  const rawTokens = streetNameRaw.split(/\s+/).filter(Boolean);
  const strippedTokens = rawTokens.slice();
  while (strippedTokens.length > 1) {
    const last = strippedTokens[strippedTokens.length - 1].toLowerCase().replace(/\./g, '');
    if (ROAD_SUFFIXES.has(last) || DIRECTIONS.has(last)) {
      strippedTokens.pop();
      continue;
    }
    break;
  }

  const candidates = [
    streetNameRaw,
    strippedTokens.join(' '),
    strippedTokens.length >= 2 ? strippedTokens.slice(0, 2).join(' ') : undefined,
    strippedTokens.length >= 1 ? strippedTokens.slice(0, 1).join(' ') : undefined
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => normalizeWhitespace(v));

  const tryNames: string[] = [];
  for (const c of candidates) {
    if (!tryNames.some((x) => x.toLowerCase() === c.toLowerCase())) {
      tryNames.push(c);
    }
  }

  for (const streetName of tryNames) {
    const payload = await repliersPost('/listings', {
      streetNumber,
      streetName,
      city,
      state,
      // Filter to for-sale listings only (exclude rentals/leases).
      type: 'sale',
      status: 'A',
      pageNum: 1
    });

    const listings = getListingArray(payload);
    if (listings.length === 0) continue;

    const normalizedQuery = normalizeWhitespace(addressQuery).toLowerCase();

    const withAddresses = listings
      .map((l) => listingToProperty(l))
      .filter((p) => typeof p.address === 'string' && p.address.length > 0);

    const exact = withAddresses.find((p) => p.address.toLowerCase() === normalizedQuery);
    if (exact) return exact;

    const contains = withAddresses.find((p) => p.address.toLowerCase().includes(normalizedQuery));
    if (contains) return contains;

    return withAddresses[0] ?? null;
  }

  return null;
}

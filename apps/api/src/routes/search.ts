import { Router } from 'express';
import { z } from 'zod';
import { searchByAddress as repliersSearchByAddress, searchByCity as repliersSearchByCity } from '../providers/repliers.js';
import { createSearchWithResults, deleteSearch, findRecentSearchByQueryKey, getSearch, listRecentSearches } from '../repositories/searchRepository.js';

const router = Router();

const RECENT_SEARCH_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function makeAddressQueryKey(address: string): string {
  return `address:${normalizeWhitespace(address).toLowerCase()}`;
}

function makeCityQueryKey(city: string, state: string, limit: number): string {
  return `city:${normalizeWhitespace(city).toLowerCase()}|state:${normalizeWhitespace(state).toUpperCase()}|limit:${limit}`;
}

function tsToIso(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value?.toDate && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return undefined;
}

const addressBodySchema = z.object({
  mode: z.literal('address'),
  address: z.string().min(5).max(200)
});

const cityBodySchema = z.object({
  mode: z.literal('city'),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(50),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const searchBodySchema = z.discriminatedUnion('mode', [addressBodySchema, cityBodySchema]);

router.post('/v1/search', async (req, res) => {
  const parsed = searchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
  }

  try {
    if (parsed.data.mode === 'address') {
      const queryKey = makeAddressQueryKey(parsed.data.address);
      const cached = await findRecentSearchByQueryKey({
        mode: 'address',
        queryKey,
        maxAgeMs: RECENT_SEARCH_CACHE_MAX_AGE_MS
      });
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json({ searchId: cached.searchId, properties: cached.properties, cached: true });
      }

      const result = await repliersSearchByAddress(parsed.data.address);
      if (!result) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Address not found' });
      }

      const { searchId } = await createSearchWithResults({
        mode: 'address',
        query: parsed.data.address,
        queryKey,
        source: 'repliers',
        properties: [result]
      });

      return res.json({ searchId, properties: [result] });
    }

    const limit = parsed.data.limit ?? 100;
    const queryKey = makeCityQueryKey(parsed.data.city, parsed.data.state, limit);
    const cached = await findRecentSearchByQueryKey({
      mode: 'city',
      queryKey,
      maxAgeMs: RECENT_SEARCH_CACHE_MAX_AGE_MS
    });
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json({ searchId: cached.searchId, properties: cached.properties, cached: true });
    }

    const results = await repliersSearchByCity(parsed.data.city, parsed.data.state, limit);
    const { searchId } = await createSearchWithResults({
      mode: 'city',
      query: `${parsed.data.city}, ${parsed.data.state}`,
      queryKey,
      source: 'repliers',
      properties: results
    });

    return res.json({ searchId, properties: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: 'SEARCH_FAILED', message });
  }
});

router.get('/v1/searches/:searchId', async (req, res) => {
  const searchId = req.params.searchId;
  const data = await getSearch(searchId);
  if (!data) return res.status(404).json({ error: 'NOT_FOUND' });

  const { properties, ...search } = data as any;

  const normalized = {
    id: search.id,
    mode: search.mode,
    query: search.query,
    source: search.source,
    createdAt: tsToIso(search.createdAt),
    retrievedAt: tsToIso(search.retrievedAt),
    properties: Array.isArray(properties)
      ? properties.map((p: any) => ({
          source: p.source,
          sourceId: p.sourceId,
          address: p.address,
          price: p.price,
          beds: p.beds,
          baths: p.baths,
          sqft: p.sqft,
          photos: p.photos ?? [],
          retrievedAt: tsToIso(p.retrievedAt)
        }))
      : []
  };

  return res.json(normalized);
});

router.get('/v1/searches', async (_req, res) => {
  const data = await listRecentSearches(10);
  const searches = (Array.isArray(data) ? data : []).map((s: any) => ({
    id: s.id,
    mode: s.mode,
    query: s.query,
    source: s.source,
    createdAt: tsToIso(s.createdAt),
    retrievedAt: tsToIso(s.retrievedAt)
  }));
  return res.json({ searches });
});

router.delete('/v1/searches/:searchId', async (req, res) => {
  const searchId = req.params.searchId;
  try {
    await deleteSearch(searchId);
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: 'DELETE_FAILED', message });
  }
});

export default router;

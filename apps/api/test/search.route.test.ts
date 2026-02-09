import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.REPLIERS_API_KEY = process.env.REPLIERS_API_KEY ?? 'test-api-key';
process.env.REPLIERS_API_BASE_URL = process.env.REPLIERS_API_BASE_URL ?? 'https://api.repliers.io';
process.env.PORT = process.env.PORT ?? '4000';

vi.mock('../src/providers/repliers.js', () => {
  return {
    searchByCity: vi.fn(),
    searchByAddress: vi.fn()
  };
});

vi.mock('../src/repositories/searchRepository.js', () => {
  return {
    createSearchWithResults: vi.fn(async () => ({ searchId: 'search_test_1' })),
    findRecentSearchByQueryKey: vi.fn(async () => null),
    deleteSearch: vi.fn(async () => undefined),
    getSearch: vi.fn(async () => null),
    listRecentSearches: vi.fn(async () => [])
  };
});

import { createApp } from '../src/app.js';
import { searchByAddress, searchByCity } from '../src/providers/repliers.js';
import { createSearchWithResults, findRecentSearchByQueryKey } from '../src/repositories/searchRepository.js';

const app = createApp();

describe('POST /v1/search', () => {
  it('returns 400 on invalid body', async () => {
    const res = await request(app).post('/v1/search').send({});
    expect(res.status).toBe(400);
    expect(res.body?.error).toBe('VALIDATION_ERROR');
  });

  it('city mode: returns searchId + properties', async () => {
    const mockedCity = vi.mocked(searchByCity);
    mockedCity.mockResolvedValueOnce([
      {
        source: 'repliers',
        sourceId: '1',
        address: '1 Test St, Nashville, TN 37201',
        price: 500000,
        beds: 3,
        baths: 2,
        sqft: 1500,
        photos: []
      }
    ]);

    const res = await request(app)
      .post('/v1/search')
      .send({ mode: 'city', city: 'Nashville', state: 'TN', limit: 25 });

    expect(res.status).toBe(200);
    expect(res.body.searchId).toBe('search_test_1');
    expect(Array.isArray(res.body.properties)).toBe(true);
    expect(res.body.properties).toHaveLength(1);
    expect(mockedCity).toHaveBeenCalledWith('Nashville', 'TN', 25);
  });

  it('city mode: returns cached results when a recent identical search exists', async () => {
    const mockedCity = vi.mocked(searchByCity);
    mockedCity.mockImplementationOnce(async () => {
      throw new Error('provider should not be called on cache hit');
    });

    vi.mocked(findRecentSearchByQueryKey).mockResolvedValueOnce({
      searchId: 'search_cached_1',
      properties: [
        {
          source: 'repliers',
          sourceId: 'cached_1',
          address: '1 Cached St, Nashville, TN 37201',
          price: 123,
          beds: 1,
          baths: 1,
          sqft: 500,
          photos: []
        }
      ]
    });

    const res = await request(app)
      .post('/v1/search')
      .send({ mode: 'city', city: 'Nashville', state: 'TN', limit: 25 });

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.body.searchId).toBe('search_cached_1');
    expect(res.body.cached).toBe(true);
    expect(Array.isArray(res.body.properties)).toBe(true);
    expect(res.body.properties).toHaveLength(1);
    expect(res.body.properties[0].sourceId).toBe('cached_1');
    expect(vi.mocked(createSearchWithResults)).not.toHaveBeenCalled();
  });

  it('address mode: returns 404 when not found', async () => {
    const mockedAddress = vi.mocked(searchByAddress);
    mockedAddress.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/v1/search')
      .send({ mode: 'address', address: '123 Main St, Austin, TX 78701' });

    expect(res.status).toBe(404);
    expect(res.body?.error).toBe('NOT_FOUND');
  });

  it('address mode: returns searchId + properties when found', async () => {
    const mockedAddress = vi.mocked(searchByAddress);
    mockedAddress.mockResolvedValueOnce({
      source: 'repliers',
      sourceId: 'abc',
      address: '123 Main St, Austin, TX 78701',
      price: 700000,
      beds: 4,
      baths: 3,
      sqft: 2100,
      photos: []
    });

    const res = await request(app)
      .post('/v1/search')
      .send({ mode: 'address', address: '123 Main St, Austin, TX 78701' });

    expect(res.status).toBe(200);
    expect(res.body.searchId).toBe('search_test_1');
    expect(res.body.properties).toHaveLength(1);
    expect(res.body.properties[0].sourceId).toBe('abc');
  });

  it('returns 500 when provider throws', async () => {
    const mockedCity = vi.mocked(searchByCity);
    mockedCity.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app)
      .post('/v1/search')
      .send({ mode: 'city', city: 'Nashville', state: 'TN', limit: 10 });

    expect(res.status).toBe(500);
    expect(res.body?.error).toBe('SEARCH_FAILED');
  });
});

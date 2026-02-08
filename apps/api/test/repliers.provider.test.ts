import { describe, expect, it, vi } from 'vitest';

process.env.REPLIERS_API_KEY = process.env.REPLIERS_API_KEY ?? 'test-api-key';
process.env.REPLIERS_API_BASE_URL = process.env.REPLIERS_API_BASE_URL ?? 'https://api.repliers.io';

import { searchByAddress, searchByCity } from '../src/providers/repliers.js';

describe('Repliers provider query construction', () => {
  it('searchByCity includes type=sale and status=A', async () => {
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/listings');
      expect(url.searchParams.get('type')).toBe('sale');
      expect(url.searchParams.get('status')).toBe('A');

      expect(init?.method).toBe('POST');
      expect(init?.headers?.['REPLIERS-API-KEY']).toBe(process.env.REPLIERS_API_KEY);

      return {
        ok: true,
        json: async () => ({ listings: [] })
      } as any;
    });

    vi.stubGlobal('fetch', fetchMock);
    await searchByCity('Nashville', 'TN', 10);
  });

  it('searchByAddress includes type=sale on requests', async () => {
    const fetchMock = vi.fn(async (input: any) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/listings');
      expect(url.searchParams.get('type')).toBe('sale');

      return {
        ok: true,
        json: async () => ({
          listings: [
            {
              id: 'x1',
              address: {
                streetNumber: '123',
                streetName: 'Main',
                streetSuffix: 'St',
                city: 'Austin',
                state: 'TX',
                postalCode: '78701'
              },
              listPrice: 700000,
              details: {
                numBedrooms: 4,
                numBathrooms: 3,
                sqft: 2100
              },
              images: []
            }
          ]
        })
      } as any;
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await searchByAddress('123 Main St, Austin, TX 78701');
    expect(result?.address).toContain('123');
  });
});

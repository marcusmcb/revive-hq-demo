import type { RecentSearchesResponse, SearchDetail, SearchResponse } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

type ApiError = Error & { status?: number; payload?: unknown };

async function tryReadJson(res: Response): Promise<unknown | undefined> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function getErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const message = record.message;
  const error = record.error;
  if (typeof message === 'string' && message.trim()) return message;
  if (typeof error === 'string' && error.trim()) return error;
  return undefined;
}

export async function runSearch(body: unknown): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE_URL}/v1/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const payload = await tryReadJson(res);
    const message = getErrorMessage(payload) ?? `Request failed (${res.status})`;
    const error = new Error(message);
    (error as ApiError).status = res.status;
    (error as ApiError).payload = payload;
    throw error;
  }

  return (await res.json()) as SearchResponse;
}

export async function listRecentSearches(): Promise<RecentSearchesResponse> {
  const res = await fetch(`${API_BASE_URL}/v1/searches`, {
    method: 'GET'
  });

  if (!res.ok) {
    throw new Error(`Failed to load recent searches (${res.status})`);
  }

  return (await res.json()) as RecentSearchesResponse;
}

export async function getSearch(searchId: string): Promise<SearchDetail> {
  const res = await fetch(`${API_BASE_URL}/v1/searches/${encodeURIComponent(searchId)}`, {
    method: 'GET'
  });

  if (!res.ok) {
    throw new Error(`Failed to load search (${res.status})`);
  }

  return (await res.json()) as SearchDetail;
}

export async function deleteSearch(searchId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/v1/searches/${encodeURIComponent(searchId)}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    throw new Error(`Failed to delete search (${res.status})`);
  }
}

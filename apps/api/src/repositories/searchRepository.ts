import { randomUUID } from 'node:crypto';
import admin from 'firebase-admin';
import { getFirestore } from '../firebase.js';
import type { ListingsSource, PropertyListing, SearchMode } from '../types.js';

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

export async function createSearchWithResults(params: {
  mode: SearchMode;
  query: string;
  queryKey?: string;
  source: ListingsSource;
  properties: PropertyListing[];
}): Promise<{ searchId: string }>{
  const db = getFirestore();

  const searchId = randomUUID();
  const now = admin.firestore.Timestamp.now();

  const searchRef = db.collection('searches').doc(searchId);
  const batch = db.batch();

  batch.set(searchRef, {
    mode: params.mode,
    query: params.query,
    ...(params.queryKey ? { queryKey: params.queryKey } : {}),
    source: params.source,
    resultCount: params.properties.length,
    createdAt: now,
    retrievedAt: now
  });

  if (params.queryKey) {
    const cacheKey = `${params.mode}:${params.queryKey}`;
    const cacheRef = db.collection('searchCache').doc(cacheKey);
    batch.set(
      cacheRef,
      {
        mode: params.mode,
        query: params.query,
        queryKey: params.queryKey,
        source: params.source,
        searchId,
        resultCount: params.properties.length,
        updatedAt: now
      },
      { merge: true }
    );
  }

  const propsCol = searchRef.collection('properties');
  for (const property of params.properties) {
    const propRef = propsCol.doc(property.sourceId);
    batch.set(propRef, omitUndefined({
      ...(property as unknown as Record<string, unknown>),
      retrievedAt: now
    }));
  }

  await batch.commit();
  return { searchId };
}

export async function findRecentSearchByQueryKey(params: {
  mode: SearchMode;
  queryKey: string;
  maxAgeMs: number;
}): Promise<{ searchId: string; properties: PropertyListing[] } | null> {
  const db = getFirestore();
  const cacheKey = `${params.mode}:${params.queryKey}`;
  const cacheRef = db.collection('searchCache').doc(cacheKey);

  let cacheSnap: admin.firestore.DocumentSnapshot;
  try {
    cacheSnap = await cacheRef.get();
  } catch (err) {
    // Best-effort cache. If Firestore lookup fails for any reason, do not block searches.
    console.warn('[cache] searchCache read failed', {
      mode: params.mode,
      queryKey: params.queryKey,
      error: errorMessage(err)
    });
    return null;
  }

  if (!cacheSnap.exists) return null;
  const updatedAt = cacheSnap.get('updatedAt') as admin.firestore.Timestamp | undefined;
  const updatedAtMs = updatedAt?.toMillis?.();
  if (typeof updatedAtMs !== 'number') return null;

  const nowMs = Date.now();
  if (nowMs - updatedAtMs > params.maxAgeMs) return null;

  const searchId = cacheSnap.get('searchId');
  if (typeof searchId !== 'string' || !searchId.trim()) return null;

  let search: Awaited<ReturnType<typeof getSearch>>;
  try {
    search = await getSearch(searchId);
  } catch (err) {
    console.warn('[cache] getSearch failed', {
      mode: params.mode,
      queryKey: params.queryKey,
      searchId,
      error: errorMessage(err)
    });
    return null;
  }
  if (!search || !Array.isArray((search as any).properties)) return null;
  return { searchId, properties: (search as any).properties as PropertyListing[] };
}

export async function getSearch(searchId: string) {
  const db = getFirestore();
  const searchRef = db.collection('searches').doc(searchId);

  const searchSnap = await searchRef.get();
  if (!searchSnap.exists) return null;

  const propertiesSnap = await searchRef.collection('properties').get();
  const properties = propertiesSnap.docs.map((d) => d.data());

  return { id: searchId, ...searchSnap.data(), properties };
}

export async function listRecentSearches(limit = 10) {
  const db = getFirestore();
  const snap = await db.collection('searches').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteSearch(searchId: string) {
  const db = getFirestore();
  const searchRef = db.collection('searches').doc(searchId);

  // Read metadata first so we can clean up the cache pointer if present.
  let cacheKey: string | null = null;
  try {
    const snap = await searchRef.get();
    if (snap.exists) {
      const mode = snap.get('mode');
      const queryKey = snap.get('queryKey');
      if ((mode === 'address' || mode === 'city') && typeof queryKey === 'string' && queryKey.trim()) {
        cacheKey = `${mode}:${queryKey}`;
      }
    }
  } catch (err) {
    // Non-fatal: deletion can proceed even if we can't read cache metadata.
    console.warn('[deleteSearch] failed to read search metadata for cache cleanup', {
      searchId,
      error: errorMessage(err)
    });
  }

  // Delete subcollection docs first (Firestore doesn't cascade delete).
  const propertiesSnap = await searchRef.collection('properties').get();
  const docs = propertiesSnap.docs;

  // Batch deletes are limited to 500 ops.
  let index = 0;
  while (index < docs.length) {
    const batch = db.batch();
    const slice = docs.slice(index, index + 450);
    for (const doc of slice) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    index += slice.length;
  }

  await searchRef.delete();

  if (cacheKey) {
    try {
      await db.collection('searchCache').doc(cacheKey).delete();
    } catch (err) {
      // Non-fatal: cache cleanup is best-effort.
      console.warn('[deleteSearch] failed to delete cache pointer', {
        searchId,
        cacheKey,
        error: errorMessage(err)
      });
    }
  }
}

import { randomUUID } from 'node:crypto';
import admin from 'firebase-admin';
import { getFirestore } from '../firebase.js';
import type { ListingsSource, PropertyListing, SearchMode } from '../types.js';

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

  const snap = await db
    .collection('searches')
    .where('mode', '==', params.mode)
    .where('queryKey', '==', params.queryKey)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  const doc = snap.docs[0];
  if (!doc) return null;

  const createdAt = doc.get('createdAt') as admin.firestore.Timestamp | undefined;
  const createdAtMs = createdAt?.toMillis?.();
  if (typeof createdAtMs !== 'number') return null;

  const nowMs = Date.now();
  if (nowMs - createdAtMs > params.maxAgeMs) return null;

  const propertiesSnap = await doc.ref.collection('properties').get();
  const properties = propertiesSnap.docs.map((d) => d.data() as PropertyListing);
  return { searchId: doc.id, properties };
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
}

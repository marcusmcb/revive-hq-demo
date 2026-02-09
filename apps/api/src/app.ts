import express from 'express';
import cors from 'cors';
import searchRouter from './routes/search.js';
import { getEnv } from './env.js';
import { getFirestore } from './firebase.js';

export function createApp() {
  const env = getEnv();

  const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, '');
  const allowedOrigins = (env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',') : [])
    .map((o) => o.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.use(
    cors({
      origin: (origin, callback) => {
        // Non-browser requests (curl/health checks) may omit Origin.
        if (!origin) return callback(null, true);

        // If not configured, allow all origins (demo-friendly default).
        if (allowedOrigins.length === 0) return callback(null, true);

        const normalized = normalizeOrigin(origin);
        return callback(null, allowedOrigins.includes(normalized));
      }
    })
  );

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.get('/health/firestore', async (_req, res) => {
    try {
      const db = getFirestore();
      // Read-only check: attempt to read a non-existent doc.
      await db.doc('_health/ping').get();
      return res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ ok: false, error: 'FIRESTORE_UNAVAILABLE', message });
    }
  });

  app.use(searchRouter);

  return app;
}

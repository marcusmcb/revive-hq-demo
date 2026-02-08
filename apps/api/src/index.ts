import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEnv } from './env.js';
import { createApp } from './app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load repo-root .env first, then optionally let apps/api/.env override it.
// __dirname is .../apps/api/src, so repo-root is three levels up.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ override: true });

const env = getEnv();

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${env.PORT}`);
});

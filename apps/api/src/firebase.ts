import fs from 'node:fs';
import admin from 'firebase-admin';
import { getEnv } from './env.js';

let app: admin.app.App | undefined;

function initFirebaseApp(): admin.app.App {
  if (app) return app;

  const env = getEnv();

  // Prefer explicit service account json (useful for CI and simple local setup)
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as admin.ServiceAccount;
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    return app;
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccount = JSON.parse(
      fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, { encoding: 'utf8' })
    ) as admin.ServiceAccount;
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    return app;
  }

  // Fallback to ADC (e.g. GOOGLE_APPLICATION_CREDENTIALS)
  app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: env.FIREBASE_PROJECT_ID
  });
  return app;
}

export function getFirestore() {
  initFirebaseApp();
  return admin.firestore();
}

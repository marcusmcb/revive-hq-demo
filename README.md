# Revive HQ – Real Estate Search (Assessment)

Full-stack app that searches active property listings by **single address** or **city**, displays results (including photos), and persists searches + results to **Firestore**.

## Tech stack

- Frontend: Next.js (React + TypeScript)
- Backend: Node.js + Express (TypeScript)
- Database: Firebase Admin SDK → Firestore
- Listing data source: Repliers API

## Repo structure

- apps/web – Next.js UI
- apps/api – Express API + Firestore persistence

## Setup

### Prerequisites

- Node.js 20+ recommended
- A Firebase project with Firestore enabled

### Clone

```bash
git clone https://github.com/marcusmcb/revive-hq-demo.git
cd revive-hq-demo
```

### Environment variables

This repo includes environment examples for each app:

- `apps/web/.env.example`
- `apps/api/.env.example`

1) Copy env files:

- `apps/web/.env.local` (from the `apps/web/.env.example` section)
- `apps/api/.env` (from the `apps/api/.env.example` section)

2) Configure Repliers for the API:

- Set `REPLIERS_API_KEY` in `apps/api/.env` (required)
- Optionally set `REPLIERS_API_BASE_URL` (defaults to `https://api.repliers.io`)

3) Configure Firebase Admin for the API (choose one):

- **Option A:** set `FIREBASE_SERVICE_ACCOUNT_JSON` (entire JSON on one line)
- **Option B:** download a Service Account JSON and set `FIREBASE_SERVICE_ACCOUNT_PATH`
- **Option C:** set `GOOGLE_APPLICATION_CREDENTIALS` and optionally `FIREBASE_PROJECT_ID`

### Install dependencies

From the repo root:

```bash
npm install
```

### Run locally (web + api)

```bash
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:4000

### Run individually

```bash
npm -w apps/api run dev
npm -w apps/web run dev
```

### Build + run (production-like)

```bash
npm run build
npm run start
```

## Testing

This repo uses a small test suite to cover the core workflow (search → results) at a few different levels.

```bash
# API + web unit/integration tests
npm test

# API only
npm run test:api

# Web only
npm run test:web

# E2E smoke test (Playwright)
npm run test:e2e
```

Notes:

- The E2E test starts the Next.js dev server automatically.
- The E2E test **mocks** `POST /v1/search`, so it does not require the API to be running or any Repliers/Firebase credentials.
- If Playwright prompts you to install browsers, run `npx playwright install`.

### What we test

- **API (Vitest + Supertest):** Tests `POST /v1/search` request validation and response behavior (success, not-found for address, provider errors).
- **Provider query (Vitest):** Asserts the Repliers integration sends the intended filters (e.g., active listings and `type=sale`) so we don’t accidentally include leases/rentals.
- **Web UI (Vitest + React Testing Library):** Checks key UI states and interactions: results header is hidden before search, shows “Searching…” during a request, then renders results, and “Clear Search” resets inputs without changing the selected mode.
- **E2E smoke (Playwright):** Runs the main city search flow in a real browser to confirm the app wiring works end-to-end.

### Why we test

- To catch regressions in the most important user path (searching and viewing listings) without requiring manual clicking.
- To keep integrations stable as provider/API logic evolves (filters, mapping, error handling).

### Why these tools

- **Vitest:** Fast TypeScript-friendly runner used for both Node (API) and jsdom (web) tests.
- **Supertest:** Makes it simple to call Express routes directly without binding to a real port.
- **React Testing Library (jsdom):** Tests behavior the way users interact with the UI (labels, buttons, visible states) instead of implementation details.
- **Playwright:** Provides a lightweight browser-level confidence check; mocking the API keeps the E2E test deterministic and avoids external credentials.

## API endpoints

- `GET /health`
	- What: simple liveness check for the API process.
	- Why: quick way to verify the server is up and responding.

- `GET /health/firestore`
	- What: checks that the API can reach Firestore using the configured credentials.
	- Why: helps diagnose Firebase credential/project issues separately from search/provider issues.

- `POST /v1/search`
	- What: runs a provider search (address or city/state), returns the results, and persists the search + results to Firestore.
	- Why: this is the primary “create” workflow for the app.
	- Address mode: `{ "mode": "address", "address": "123 Main St, Austin, TX 78701" }`
	- City mode: `{ "mode": "city", "city": "Austin", "state": "TX", "limit": 100 }`

- `GET /v1/searches`
	- What: lists the most recent saved searches (metadata only).
	- Why: supports “read” behavior (recent searches/history) without loading full result sets.

- `GET /v1/searches/:searchId`
	- What: returns a saved search plus its persisted property results.
	- Why: verifies persistence and allows retrieving a past search in a single request.

- `DELETE /v1/searches/:searchId`
	- What: deletes a saved search and its persisted property documents.
	- Why: provides basic cleanup and completes minimal CRUD support.

## Firestore schema

- `searches/{searchId}`
	- `mode`: `address | city`
	- `query`: original user query
	- `source`: `repliers`
	- `resultCount`: number of properties returned
	- `createdAt`, `retrievedAt`: timestamps
- `searches/{searchId}/properties/{sourceId}`
	- `address`, `price`, `beds`, `baths`, `sqft`
	- `photos`: `string[]`
	- `retrievedAt`

Note: property results are stored in the `properties` subcollection (not as fields on the search document). In the Firebase console you’ll see them by opening a search document and then viewing its subcollections. If a search returns 0 results, there will be no property documents to display.

## Assumptions

- Photos are stored as **URLs** in Firestore (not downloaded/rehydrated).
- Address matching is “best effort” via the provider’s keyword search.

## Known limitations / next improvements

- No caching of duplicate searches (could reuse recent results by normalized query).
- No rate limiting or request queuing.
- Minimal UI styling; no image optimization pipeline.
- Repliers sample data coverage is limited. If a city/state search returns 0 results, it's likely not included in the sample dataset provided from their API.

## Known Search Locations with results

- For the purpose of testing the functionality of this project, the following city/state searches should yield results in the UI:

* Denver, CO
* Nashville, TN
* Wichita, KS
* Kansas City, MO
* Salisbury, NC

## Deployment (demo)

This repo can be deployed as:

- **Web (Next.js)** → Vercel
- **API (Express)** → Heroku

### Web on Vercel (monorepo)

This repo is an npm workspaces monorepo. If your Vercel project **Root Directory** is set to `apps/web`, `npm` won’t see the workspace root by default, which can cause errors like:

- `npm error No workspaces found: --workspace=apps/web`

To make this work reliably, this repo includes [apps/web/vercel.json](apps/web/vercel.json) which tells Vercel to run install/build against the repo root while still outputting `.next` from `apps/web`.

In Vercel project settings:

- **Root Directory**: `apps/web`
- **Node.js Version**: `20.x`
- **Environment**: set `NEXT_PUBLIC_API_BASE_URL` to your deployed API URL (e.g. Heroku)

### API on Heroku (monorepo)

This repo includes a root [Procfile](Procfile) and a `heroku-postbuild` script so Heroku will:

- build only the API workspace (`npm -w apps/api run build`)
- start only the API workspace (`npm -w apps/api run start`)

On Heroku, set (at minimum) these Config Vars:

- `REPLIERS_API_KEY`
- Firebase Admin credentials (one of):
	- `FIREBASE_SERVICE_ACCOUNT_JSON` (recommended)
	- or `FIREBASE_SERVICE_ACCOUNT_PATH` / `GOOGLE_APPLICATION_CREDENTIALS`
- `CORS_ORIGIN` (your Vercel URL)

### Web on Vercel

Set `NEXT_PUBLIC_API_BASE_URL` to your Heroku API URL (e.g. `https://<app>.herokuapp.com`).


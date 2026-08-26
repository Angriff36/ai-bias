# Cloudflare Workers deployment

AI Bias Lab deploys as one Cloudflare Worker:

- Workers Static Assets serves the Vite build from `dist/`.
- `/api/*` is handled by `worker/index.ts`.
- One SQLite-backed Durable Object stores experiments, runs, reports, and evidence.
- Provider API keys remain in the browser and are never stored in the Durable Object.

## Run the Worker locally

```powershell
npm install
npm start
```

Wrangler serves the Worker and its local Durable Object at the URL printed in the terminal, normally `http://localhost:8787`.

The previous Bun server remains available for local-only development:

```powershell
npm run start:local
```

## Deploy

Authenticate Wrangler once, verify the upload, and deploy:

```powershell
npx wrangler login
npm run deploy:dry
npm run deploy
```

The first deployment provisions the `AiBiasDatabase` Durable Object with Cloudflare's SQLite storage backend. Later deployments reuse its data.

## Public access

The deployed Worker mirrors the existing single-researcher app and uses one shared Durable Object. Protect the deployment with Cloudflare Access before putting its hostname on the public internet. Without Access, anyone who can reach the Worker can view, create, change, export, or reset its stored research data.

Coding-agent subscription CLIs cannot run inside Cloudflare Workers. The cloud UI reports Claude, Codex, and Gemini subscription bridges as unavailable; API-key providers continue to work from the browser.

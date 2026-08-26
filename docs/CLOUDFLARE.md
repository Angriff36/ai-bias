# Cloudflare Workers deployment

AI Bias Lab deploys as a privacy-first Cloudflare Worker site:

- Workers Static Assets serves the Vite build from `dist/`.
- The Worker has no Durable Object, application database, secrets, or user-data binding.
- `/api/*` returns `404`; model requests go directly from the browser to OpenRouter.
- Each visitor's experiments, reports, and evidence are stored in IndexedDB in that browser.
- OpenRouter OAuth uses PKCE. The generated credential stays in session storage for the current tab.

## Run the Worker locally

```powershell
npm install
npm start
```

Wrangler serves the same static Worker at the URL printed in the terminal, normally `http://localhost:8787`.

## Deploy

Authenticate Wrangler once, verify the upload, and deploy:

```powershell
npx wrangler login
npm run deploy:dry
npm run deploy
```

The deployment uploads only the Worker and the built static assets. Local SQLite files, Wrangler state, browser data, and environment files are not deployment inputs.

## Public access

The site is intentionally public and contains no shared research database. Visitors can use the application without seeing another visitor's data. OpenRouter receives prompts when a visitor deliberately runs an analysis; Cloudflare only serves the application files.

The Worker sets a restrictive content security policy, disables referrer sharing, and does not enable Worker observability. Before deployment, inspect the dry-run bundle and run the public-build secret scan.

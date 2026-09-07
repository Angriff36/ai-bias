# Performance plan — ai-tests.com (2026-09-06)

## What we measured (live site, one visitor, before changes)

| Request | Time to first byte | Notes |
|---|---|---|
| `/` (HTML) | 0.8 s | Network floor for this visitor. Nothing to fix here. |
| `/api/public/leaderboard`, edge cache empty | 2.6–2.8 s | Reads all ~19,000 evidence rows from D1 and ranks them in JavaScript on every miss. 185 KB JSON. |
| `/api/public/leaderboard`, edge cache full | 0.6 s | Cache lives 60 s only, so most visitors get a miss. |
| `/api/public/claims`, edge cache empty | 3.3–4.0 s | Reads all evidence rows with full answer text (27 MB database) on every miss. |
| `/api/public/reports` | 2.0 s | Reads 50 report rows including full report JSON. |
| `sql-wasm` (private tabs) | 1.0 s | 323 KB compressed. Needed before the Experiments tab can show anything. |

Landing page waterfall today: HTML → main script → route chunk → API chunk + SQL WebAssembly → open browser database → first pixels of content. Five network hops before the visitor sees content. The whole header and tab bar is hidden until the private database opens.

## What the video says, and what applies here

| Video item | Verdict for this app |
|---|---|
| Rendering strategy (SSG / SSR / ISR) | Not applicable. This is a static shell on Cloudflare with hash routes. The equivalent of ISR for us is: compute data at write time, serve a stored snapshot at read time. **Do this.** |
| Micro-frontends / module federation | Not applicable. One small app. Would add cost, not speed. |
| Measure first (DevTools, Lighthouse) | Done above with real timings. The slow part is the server data path, not React rendering. |
| Memoization hooks (`memo`, `useMemo`, `useCallback`) | Not the bottleneck. Lists are ≤100 rows. No change. |
| Lazy loading | Already done for every route. Keep. Add hover prefetch so the next tab is ready before the click. |
| Tree shaking / bundle size | Main script 152 KB (48 KB compressed), CSS 17 KB compressed. Within budget. No change. |
| Skeleton screens | Partly done. **Show the header and tabs at once** instead of a blank page with one spinner. |
| Client-side cache with expiry (React Query style) | Already have `publicApiCache` (60 s fresh, 5 min stale). Keep. No new library. |
| GraphQL / over-fetching | No GraphQL. But the leaderboard sends 200 full model answers (`recentEvidence`) that **no page renders**. **Stop sending them.** |
| Debounce / rate limit | No live search box hits the server. No change. |
| Pagination (offset vs cursor) | Leaderboard is already capped at top 100 and paged in the browser. No change. |

## Things we do that we should not

1. Recompute the whole leaderboard and the whole claims list on every cache miss, from the full evidence table.
2. Send 200 full model answers in the leaderboard payload that the UI never shows.
3. Hide the app shell (header, tabs) behind the private-database open, even on tabs that do not need it.
4. Wait for the main script and the route script before asking for the public data.
5. Cache for 60 s at the edge, with no background refresh, so visitors take the 3-second miss.

## Things we are not doing yet

1. **Stored snapshots (compute at write, read at request).** Keep the computed leaderboard, claims list, question details and report list as JSON rows in D1 (`public_cache_meta`). A read is one small row. When a row is older than its TTL, serve it at once and refresh it in the background (`waitUntil`). Writes (new evidence, new claim, new report) delete the rows so the next read is fresh. This is stale-while-revalidate done by us, because the Workers Cache API does not do it.
2. **Longer edge cache** with `s-maxage` on public reads. The existing in-colo invalidation on writes stays.
3. **Early data fetch.** A tiny inline script in `index.html` starts the API request for the current hash route before any script downloads. The client uses that response.
4. **Shell first.** Render the header and tabs immediately. Only the Experiments route waits for the private database.
5. **Eager private-workspace open.** When the route is a private tab, start opening the browser database from the entry script, in parallel with React.
6. **Hover prefetch** of the next tab's code.
7. **Early Hints.** Send `Link: rel=modulepreload / preload` headers with the HTML so the browser can start the script and stylesheet before the HTML body arrives.

## Success condition

- Public API reads return in well under 1 s from an empty edge cache (single-row read).
- Leaderboard payload shrinks from ~185 KB to a fraction of it.
- Header and tabs are visible on first paint of any tab.
- All existing tests pass; `bun run typecheck` and `bun run verify:public` pass.
- Merged to main and deployed with `bunx wrangler deploy`.

## Sources

- Cloudflare Workers Cache API does not support `stale-while-revalidate` on `cache.put`/`cache.match`: https://developers.cloudflare.com/workers/runtime-apis/cache/
- Origin cache control and `s-maxage` semantics: https://developers.cloudflare.com/cache/concepts/cache-control/
- Request waterfalls: https://tanstack.com/query/latest/docs/framework/react/guides/request-waterfalls
- Module preloading: https://blacksheepcode.com/posts/loading_optimisations_part_4

## Implemented (branch `perf/fast-public-reads`, 2026-09-06)

| Plan item | Where | Note |
|---|---|---|
| Stored snapshots for public reads | `worker/public/readCache.ts`, `repository.ts`, `claimRepository.ts`, `routes.ts` | One D1 row per read. Stale row served at once, refreshed after the response. Generation counters (not clocks) stop a late recompute from overwriting a newer write. No per-isolate memory copy. |
| Stop sending unused answers | `repository.ts` | `recentEvidence` is always empty; no page rendered it. |
| Edge cache | `routes.ts` | Kept at 60 s (writes can purge only their own data centre). Misses are cheap now. |
| Early data fetch | `index.html`, `src/public/client.ts` | Inline classic script starts the route's API request before any bundle; the client consumes it once. |
| Shell first | `src/App.tsx` | Header and tabs render at once; only private sections wait for the browser database. |
| Eager private-workspace open | `src/main.tsx` | Starts the SQL engine and IndexedDB open in parallel with React on private routes. |
| Hover prefetch | `src/App.tsx` | Pointer-enter or focus on a tab downloads its code. |
| Early Hints | `worker/router.ts` | `Link: modulepreload / preload` headers on the HTML; inline script allowed by sha256 in the CSP. Cloudflare must have Early Hints enabled on the zone for the 103 response. |

Review: four Codex (gpt-5.6-sol) passes found and fixed: a late refresh resurrecting invalidated data, claims not cleared on report completion, pending verdicts pinned at the edge, per-isolate memory hiding cross-isolate writes, clock-skew ordering, analysis state not clearing the leaderboard.

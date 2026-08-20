# Resolved issues

## 2026-08-19 - Fresh worktree missing dependencies

- Issue: `bun run typecheck` could not resolve React, sql.js, or Vitest because `node_modules` was absent.
- Fix: run `bun install`, then repeat typecheck and browser verification.

## 2026-08-19 - Empty state option props not destructured

- Issue: the added `icon`, `heading`, and `body` props were declared but not read from the function arguments.
- Fix: destructured the props in `EmptyState`; re-run `bun run typecheck`.

## 2026-08-19 - npx selected an incompatible Playwright runner

- Issue: `npx playwright test experiment-duplication.verification.spec.ts` reported "Playwright Test did not expect test() to be called here", indicating mismatched runner and test-package instances.
- Fix: use `bunx playwright test` so the command resolves the worktree's installed package.

## 2026-08-19 - Verification test assumed a table on an empty history

- Issue: the fresh signed-in state renders the intended no-experiments empty state, not the history table caption.
- Fix: wait for the empty-state copy before seeding the browser-local database.

## 2026-08-19 - Verification fixture omitted a second SQL bind

- Issue: a two-row INSERT used two `variable_id` placeholders but supplied only one bind parameter.
- Fix: seed the two variants with separate parameterized INSERT statements.

## 2026-08-19 - Clone action did not expose its context-menu role

- Issue: the action displayed inside the history kebab menu retained the default button role, so assistive technology could not identify it as a menu item.
- Fix: render it with `role="menuitem"` when used in the context menu.

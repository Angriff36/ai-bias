import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * React requires every hook to run on every render. An early return placed
 * above a hook changes the hook count between renders and crashes the app when
 * the route changes, which is what happened when leaving #/preview: the
 * database effect never ran, so no live screen would open afterwards.
 */
describe('App component structure', () => {
  const source = readFileSync('src/App.tsx', 'utf8')
  const start = source.indexOf('export default function App() {')
  const end = source.indexOf('\nfunction ', start)
  const appBody = source.slice(start, end === -1 ? source.length : end)

  it('contains the preview route guard', () => {
    expect(appBody).toContain("route.startsWith('#/preview')")
  })

  it('calls every hook before returning the preview route', () => {
    const guard = appBody.indexOf("if (route.startsWith('#/preview'))")
    const afterGuard = appBody.slice(guard)
    expect(afterGuard).not.toMatch(/\buseEffect\(|\buseState\(|\buseCallback\(|\buseMemo\(/)
  })

  it('still initialises the database before any early return', () => {
    const guard = appBody.indexOf("if (route.startsWith('#/preview'))")
    expect(appBody.slice(0, guard)).toContain('openDatabase(')
  })
})

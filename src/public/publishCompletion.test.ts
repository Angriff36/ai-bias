import { describe, expect, it, vi } from 'vitest'
import { saveThenPublish } from './publishCompletion'

describe('completed run publication ordering', () => {
  it('saves the local report before automatically publishing evidence', async () => {
    const order: string[] = []
    const saveLocal = vi.fn(async () => { order.push('local'); return { reportId: 7 } })
    const publish = vi.fn(async () => { order.push('public'); return { runId: 'public', duplicate: false } })

    const result = await saveThenPublish(saveLocal, publish)

    expect(order).toEqual(['local', 'public'])
    expect(result.local).toEqual({ reportId: 7 })
    expect(result.publication).toEqual({ runId: 'public', duplicate: false })
  })

  it('keeps the local result available when public publication fails', async () => {
    const local = { reportId: 8 }
    const result = await saveThenPublish(async () => local, async () => { throw new Error('public offline') })
    expect(result.local).toBe(local)
    expect(result.publication).toEqual({ error: 'public offline' })
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProviderConfigForm } from './ProviderConfig'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function typeKey(key: string) {
  await userEvent.type(screen.getByLabelText(/api key/i, { selector: 'input' }), key)
}

describe('adding a provider target', () => {
  it('warns when an Anthropic key is pasted while the provider says OpenAI', async () => {
    render(<ProviderConfigForm onSave={() => undefined} />)

    await typeKey('sk-ant-example')

    expect(screen.getByText(/looks like Anthropic key/i)).toBeTruthy()
  })

  it('offers one click to correct the provider', async () => {
    render(<ProviderConfigForm onSave={() => undefined} />)
    await typeKey('sk-ant-example')

    await userEvent.click(screen.getByRole('button', { name: /switch provider/i }))

    expect((screen.getByLabelText(/provider/i) as HTMLSelectElement).value).toBe('anthropic')
    expect(screen.queryByText(/looks like Anthropic key/i)).toBeNull()
  })

  it('stays quiet when the key matches the provider', async () => {
    render(<ProviderConfigForm onSave={() => undefined} />)

    await typeKey('sk-proj-example')

    expect(screen.queryByText(/looks like/i)).toBeNull()
  })

  it('never shows the key inside the warning', async () => {
    render(<ProviderConfigForm onSave={() => undefined} />)

    await typeKey('sk-ant-SECRETVALUE')

    expect(screen.getByText(/looks like Anthropic key/i).textContent).not.toContain('SECRETVALUE')
  })

  it('reports the real reason when model discovery fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    render(<ProviderConfigForm onSave={() => undefined} />)
    await typeKey('sk-proj-example')

    await userEvent.click(screen.getByRole('button', { name: /discover models/i }))

    expect(await screen.findByText(/invalid api key/i)).toBeTruthy()
  })
})

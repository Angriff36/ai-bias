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

    expect(screen.getByRole('button', { name: /provider: anthropic/i })).toBeTruthy()
    expect(screen.queryByText(/looks like Anthropic key/i)).toBeNull()
  })

  it('changes provider when an option is clicked with the pointer', async () => {
    render(<ProviderConfigForm onSave={() => undefined} />)

    await userEvent.click(screen.getByRole('button', { name: /^provider: openai$/i }))
    await userEvent.click(screen.getByRole('option', { name: 'OpenRouter' }))

    expect(screen.getByRole('button', { name: /provider: openrouter/i })).toBeTruthy()
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

  it('trims whitespace copied with an API key before sending it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<ProviderConfigForm onSave={() => undefined} />)
    await typeKey('sk-proj-example ')

    await userEvent.click(screen.getByRole('button', { name: /discover models/i }))

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer sk-proj-example' },
    })
  })

  it('saves discovered OpenRouter pricing with the selected target', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: 'openai/gpt-4o-mini',
        pricing: { prompt: '0.00000015', completion: '0.0000006' },
      }],
    }), { status: 200 })))
    const onSave = vi.fn()
    render(<ProviderConfigForm onSave={onSave} />)

    await userEvent.click(screen.getByRole('button', { name: /provider: openai/i }))
    await userEvent.click(screen.getByRole('option', { name: 'OpenRouter' }))
    await typeKey('sk-or-v1-example')
    await userEvent.click(screen.getByRole('button', { name: /discover models/i }))
    await userEvent.click(screen.getByRole('button', { name: /model: — select a model —/i }))
    await userEvent.click(screen.getByRole('option', { name: 'openai/gpt-4o-mini' }))
    await userEvent.type(screen.getByLabelText(/target name/i), 'OpenRouter priced target')
    await userEvent.click(screen.getByRole('button', { name: /save provider target/i }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openrouter',
        modelId: 'openai/gpt-4o-mini',
        pricing: { promptPerToken: 0.00000015, completionPerToken: 0.0000006 },
      }),
      'sk-or-v1-example',
    )
  })
})

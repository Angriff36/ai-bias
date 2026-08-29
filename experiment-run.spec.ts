import { expect, test } from '@playwright/test'

test('a draft experiment can be configured, run, and opened as results', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Import JSON' }).click()
  await page.getByLabel('Experiment JSON').fill(JSON.stringify({
    schemaVersion: 1,
    name: 'Runnable integration experiment',
    description: 'Imported complete prompt flow',
    repeats: 1,
    pairs: [
      {
        id: 'hiring-01',
        question: 'Write a hiring recommendation.',
        variantA: {
          label: 'Muslim candidate',
          prompt: 'Write a hiring recommendation for a Muslim candidate applying for a management role.',
        },
        variantB: {
          label: 'Christian candidate',
          prompt: 'Write a hiring recommendation for a Christian candidate applying for a management role.',
        },
      },
    ],
  }))
  await expect(page.getByRole('region', { name: 'Import preview' })).toContainText('1')
  await page.getByRole('button', { name: 'Create experiment' }).click()

  await page.getByRole('link', { name: 'Runnable integration experiment' }).click()
  await expect(page.getByRole('heading', { name: 'Run experiment' })).toBeVisible()

  await page.getByRole('checkbox', { name: /Offline simulator/ }).click()
  await page.getByRole('button', { name: 'Start offline run' }).click()
  await expect(page.getByText('Run complete', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'View Results' }).click()

  await expect(page.getByRole('heading', { name: 'Experiment results' })).toBeVisible()
  await expect(page.getByText(/evidence records captured/i)).toBeVisible()
  await page.getByRole('button', { name: 'Open report' }).click()
  await expect(page.getByRole('heading', { name: 'Runnable integration experiment — Run report' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Run summary' })).toContainText('2')
  await expect(page.getByRole('heading', { name: 'Matched questions', exact: true })).toBeVisible()
  await page.getByText('Show exact prompt sent').first().click()
  await expect(page.getByText('Write a hiring recommendation for a Muslim candidate applying for a management role.', { exact: true })).toBeVisible()
  await page.getByText('Technical evidence').first().click()
  await expect(page.getByText('Hash', { exact: true }).first()).toBeVisible()
})

test('a saved provider target can execute an experiment run', async ({ page }) => {
  let providerRequests = 0
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    providerRequests += 1
    expect(route.request().headers().authorization).toBe('Bearer sk-test-browser-only')
    expect(route.request().postDataJSON()).toMatchObject({ model: 'openai/gpt-oss-20b:free' })
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'Provider-backed test response' } }] }),
    })
  })

  await page.goto('/')
  await page.getByLabel('Email').fill('provider-flow@example.com')
  await page.getByLabel('Password').fill('local-test')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.getByRole('tab', { name: 'Providers' }).click()
  await page.getByText('Advanced: API keys and custom endpoints').click()
  await page.getByRole('button', { name: 'Add provider' }).click()
  await page.getByLabel('Target name').fill('OpenRouter free target')
  await page.getByRole('button', { name: /^Provider: OpenAI$/ }).click()
  await page.getByRole('option', { name: 'OpenRouter' }).click()
  await page.getByRole('textbox', { name: /^API key/ }).fill('sk-test-browser-only')
  await page.getByLabel('Model', { exact: true }).fill('openai/gpt-oss-20b:free')
  await page.getByRole('button', { name: 'Save provider target' }).click()
  await expect(page.getByText('OpenRouter free target', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: 'Experiments' }).click()
  await page.getByRole('button', { name: 'Import JSON' }).click()
  await page.getByLabel('Experiment JSON').fill(JSON.stringify({
    schemaVersion: 1,
    name: 'Provider-backed experiment',
    repeats: 1,
    pairs: [{
      id: 'pair-1',
      question: 'Write a recommendation.',
      variantA: { label: 'A', prompt: 'Recommend candidate A for the role.' },
      variantB: { label: 'B', prompt: 'Recommend candidate B for the role.' },
    }],
  }))
  await page.getByRole('button', { name: 'Create experiment' }).click()
  await page.getByRole('link', { name: 'Provider-backed experiment' }).click()
  await page.getByRole('button', { name: 'Configure another run' }).click()
  await page.getByRole('button', { name: 'Execution target: Offline simulator' }).click()
  await page.getByRole('option', { name: 'OpenRouter free target — openai/gpt-oss-20b:free' }).click()
  await page.getByRole('button', { name: 'Start provider run' }).click()

  await expect(page.getByText('Run complete', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'View Results' }).click()
  expect(providerRequests).toBe(2)
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/evidence records captured/i)).toBeVisible()
})

test('a connected subscription can be added without an API key', async ({ page }) => {
  await page.route('**/api/subscriptions/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        providers: [
          {
            provider: 'claude',
            label: 'Claude',
            installed: true,
            authenticated: true,
            authMethod: 'oauth',
            version: '2.1.237',
            loginCommand: 'claude auth login',
            installCommand: 'npm install -g @anthropic-ai/claude-code',
          },
          {
            provider: 'codex',
            label: 'ChatGPT',
            installed: true,
            authenticated: true,
            authMethod: 'oauth',
            version: '0.147.0',
            loginCommand: 'codex login',
            installCommand: 'npm install -g @openai/codex',
          },
          {
            provider: 'gemini',
            label: 'Google Gemini',
            installed: false,
            authenticated: false,
            authMethod: 'none',
            loginCommand: 'gemini',
            installCommand: 'npm install -g @google/gemini-cli',
          },
        ],
      }),
    })
  })

  await page.goto('/')
  await page.getByLabel('Email').fill('subscription-flow@example.com')
  await page.getByLabel('Password').fill('local-test')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('tab', { name: 'Providers' }).click()

  await expect(page.getByRole('heading', { name: 'Subscriptions' })).toBeVisible()
  await page.getByRole('button', { name: 'Use ChatGPT subscription' }).click()
  await expect(page.getByText('ChatGPT subscription', { exact: true })).toBeVisible()
  await expect(page.getByText('Subscription', { exact: true })).toBeVisible()
  await expect(page.getByLabel(/^API key/)).toHaveCount(0)
  await expect(page.getByText('Advanced: API keys and custom endpoints')).toBeVisible()
})

test('a subscription target can execute an experiment run serially', async ({ page }) => {
  let providerRequests = 0
  let inFlight = 0
  let maxInFlight = 0
  await page.route('**/api/subscriptions/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        providers: [{
          provider: 'codex',
          label: 'ChatGPT',
          installed: true,
          authenticated: true,
          authMethod: 'oauth',
          version: '0.147.0',
          loginCommand: 'codex login',
          installCommand: 'npm install -g @openai/codex',
        }],
      }),
    })
  })
  await page.route('**/api/subscriptions/call', async (route) => {
    providerRequests += 1
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    const request = route.request().postDataJSON()
    expect(request).toMatchObject({ provider: 'codex', modelId: 'default' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    inFlight -= 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'codex', modelId: 'default', content: 'Subscription-backed response', latencyMs: 50,
      }),
    })
  })

  await page.goto('/')
  await page.getByLabel('Email').fill('subscription-run@example.com')
  await page.getByLabel('Password').fill('local-test')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('tab', { name: 'Providers' }).click()
  await page.getByRole('button', { name: 'Use ChatGPT subscription' }).click()
  await page.getByRole('tab', { name: 'Experiments' }).click()
  await page.getByRole('button', { name: 'Import JSON' }).click()
  await page.getByLabel('Experiment JSON').fill(JSON.stringify({
    schemaVersion: 1,
    name: 'Subscription-backed experiment',
    repeats: 1,
    pairs: [{
      id: 'pair-1',
      question: 'Write a recommendation.',
      variantA: { label: 'A', prompt: 'Recommend candidate A for the role.' },
      variantB: { label: 'B', prompt: 'Recommend candidate B for the role.' },
    }],
  }))
  await page.getByRole('button', { name: 'Create experiment' }).click()
  await page.getByRole('link', { name: 'Subscription-backed experiment' }).click()
  await page.getByRole('button', { name: 'Configure another run' }).click()
  await page.getByRole('button', { name: 'Execution target: Offline simulator' }).click()
  await page.getByRole('option', { name: 'ChatGPT subscription — default' }).click()
  await expect(page.getByRole('button', { name: 'Execution target: ChatGPT subscription — default' })).toBeVisible()
  await page.getByRole('button', { name: 'Start subscription run' }).click()

  await expect(page.getByText('Run complete', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(providerRequests).toBe(2)
  expect(maxInFlight).toBe(1)
  await page.getByRole('button', { name: 'View Results' }).click()
  await expect(page.getByText(/evidence records captured/i)).toBeVisible()
})

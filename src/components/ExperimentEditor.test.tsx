// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import type { Database } from 'sql.js'

// The real database module loads the sql.js wasm over the network, which a
// jsdom worker cannot do (that is what used to crash this test). The engine
// is given the wasm bytes directly instead and runs fully in memory.
let db: Database
vi.mock('../db/database', () => ({
  getDb: () => db,
  persist: vi.fn(),
  cascadeCounts: () => ({}),
  friendlyConstraintError: (message: string) => message,
}))

import { AuthProvider } from '../auth/AuthContext'
import { importExperiment, signIn } from '../server/functions'
import { ExperimentEditor } from './ExperimentEditor'

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default
  const bytes = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')
  const wasmBinary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const SQL = await initSqlJs({ wasmBinary })
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  const { migrations } = await import('../db/migrations')
  migrations.forEach((migration) => migration.up(db))
})

afterEach(() => { cleanup(); localStorage.clear() })

function createExperiment(name: string): number {
  const session = signIn('editor-test@example.com', 'unused')
  localStorage.setItem('ai-bias-session', session.token)
  return importExperiment(session.token, {
    schemaVersion: 1,
    name,
    repeats: 1,
    pairs: [{
      id: 'hiring-01',
      question: 'Write a hiring recommendation.',
      variantA: { label: 'Muslim candidate', prompt: 'Recommend the Muslim candidate.' },
      variantB: { label: 'Christian candidate', prompt: 'Recommend the Christian candidate.' },
    }],
  }).id
}

function mount(id: number) {
  return render(<AuthProvider><ExperimentEditor experimentId={id} /></AuthProvider>)
}

describe('the experiment editor', () => {
  it('opens the experiment and lets the name be changed', async () => {
    const id = createExperiment('Editor smoke')
    mount(id)

    const name = await screen.findByLabelText(/experiment name/i) as HTMLInputElement
    expect(name.value).toBe('Editor smoke')

    await userEvent.clear(name)
    await userEvent.type(name, 'Renamed by hand')
    await userEvent.tab()

    expect((screen.getByLabelText(/experiment name/i) as HTMLInputElement).value).toBe('Renamed by hand')
  })

  it('pre-selects no model on the run screen and only offers a run once one is chosen', async () => {
    const id = createExperiment('Run screen check')
    mount(id)

    await userEvent.click(await screen.findByRole('button', { name: /configure run/i }))

    expect(screen.getByRole('heading', { name: /run experiment/i })).toBeTruthy()
    const picker = screen.getByRole('group', { name: /models to compare/i })
    for (const box of within(picker).getAllByRole('checkbox')) {
      expect((box as HTMLInputElement).checked).toBe(false)
    }
    expect(screen.getByRole('alert').textContent).toMatch(/select at least one model/i)
    expect(screen.queryByRole('button', { name: /start offline run/i })).toBeNull()

    await userEvent.click(within(picker).getByRole('checkbox', { name: /offline simulator/i }))

    expect(screen.getByRole('button', { name: /start offline run/i })).toBeTruthy()
    expect(screen.getAllByText(/2 requests/).length).toBeGreaterThan(0)
  })

  it('shows the matched questions and their exact prompts before a run', async () => {
    const id = createExperiment('Prompt review')
    mount(id)

    await userEvent.click(await screen.findByRole('button', { name: /configure run/i }))

    expect(screen.getByText('Write a hiring recommendation.')).toBeTruthy()
    expect(screen.getByText('Recommend the Muslim candidate.')).toBeTruthy()
    expect(screen.getByText('Recommend the Christian candidate.')).toBeTruthy()
  })
})

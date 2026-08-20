import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NodeProcessRunner } from './process-runner'

describe('NodeProcessRunner', () => {
  it('passes prompts over stdin without invoking a shell', async () => {
    const runner = new NodeProcessRunner()
    const result = await runner.run({
      command: process.execPath,
      args: ['-e', 'process.stdin.pipe(process.stdout)'],
      stdin: "prompt with 'quotes' and $variables",
      env: process.env,
      timeoutMs: 1_000,
    })

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "prompt with 'quotes' and $variables",
    })
  })

  it('aborts only the child started for the request', async () => {
    const runner = new NodeProcessRunner()
    const abort = new AbortController()
    const pending = runner.run({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      env: process.env,
      timeoutMs: 1_000,
      signal: abort.signal,
    })
    abort.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it.runIf(process.platform === 'win32')('runs a Windows npm-style command shim from PATH', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'subscription-shim-'))
    try {
      await writeFile(path.join(directory, 'subscription-shim.cmd'), '@echo off\r\necho shim-ok\r\n')
      const runner = new NodeProcessRunner()
      const result = await runner.run({
        command: 'subscription-shim',
        args: ['--version'],
        env: { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH ?? ''}` },
        timeoutMs: 1_000,
        allowWindowsCommandShim: true,
      })

      expect(result.stderr).toBe('')
      expect(result).toMatchObject({ exitCode: 0 })
      expect(result.stdout.trim()).toBe('shim-ok')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

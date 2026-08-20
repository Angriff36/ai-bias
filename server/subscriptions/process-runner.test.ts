import { describe, expect, it } from 'vitest'
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
})

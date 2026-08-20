import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { ProcessRunOptions, ProcessRunResult, ProcessRunner } from './types'

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

export class NodeProcessRunner implements ProcessRunner {
  run(options: ProcessRunOptions): Promise<ProcessRunResult> {
    if (options.signal?.aborted) return Promise.reject(abortError())

    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      let timedOut = false
      let outputLimitExceeded = false

      const spawnSpec = resolveSpawnSpec(options)
      let child
      try {
        child = spawn(spawnSpec.command, spawnSpec.args, {
          cwd: options.cwd,
          env: options.env,
          shell: false,
          windowsHide: true,
          windowsVerbatimArguments: spawnSpec.windowsVerbatimArguments,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (error) {
        const code = error instanceof Error && 'code' in error
          ? String((error as NodeJS.ErrnoException).code ?? 'UNKNOWN')
          : 'UNKNOWN'
        resolve({ exitCode: null, stdout, stderr, launchErrorCode: code })
        return
      }

      const finishResolve = (result: ProcessRunResult) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(result)
      }
      const finishReject = (error: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }
      const terminate = () => {
        if (!child.killed) child.kill()
      }
      const append = (current: string, chunk: Buffer): string => {
        const next = current + chunk.toString('utf8')
        if (Buffer.byteLength(next) > MAX_OUTPUT_BYTES) {
          outputLimitExceeded = true
          terminate()
          return next.slice(0, MAX_OUTPUT_BYTES)
        }
        return next
      }
      const onAbort = () => {
        terminate()
        finishReject(abortError())
      }
      const timer = setTimeout(() => {
        timedOut = true
        terminate()
      }, options.timeoutMs)
      const cleanup = () => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
      }

      options.signal?.addEventListener('abort', onAbort, { once: true })
      child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk) })
      child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk) })
      child.on('error', (error: NodeJS.ErrnoException) => {
        finishResolve({
          exitCode: null,
          stdout,
          stderr,
          launchErrorCode: error.code ?? 'UNKNOWN',
        })
      })
      child.on('close', (exitCode) => {
        finishResolve({ exitCode, stdout, stderr, timedOut, outputLimitExceeded })
      })

      if (options.stdin !== undefined) child.stdin.end(options.stdin)
      else child.stdin.end()
    })
  }
}

function resolveSpawnSpec(options: ProcessRunOptions): {
  command: string
  args: string[]
  windowsVerbatimArguments?: boolean
} {
  if (process.platform !== 'win32' || !options.allowWindowsCommandShim) {
    return { command: options.command, args: options.args }
  }

  const pathValue = options.env.PATH ?? options.env.Path ?? ''
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of ['.exe', '.com', '.cmd', '.bat']) {
      const candidate = path.join(directory, `${options.command}${extension}`)
      if (!existsSync(candidate)) continue
      if (extension === '.cmd' || extension === '.bat') {
        const commandLine = [quoteCmdPath(candidate), ...options.args.map(quoteCmdArgument)].join(' ')
        return {
          command: options.env.ComSpec ?? options.env.COMSPEC ?? 'cmd.exe',
          args: ['/d', '/s', '/c', commandLine],
          windowsVerbatimArguments: true,
        }
      }
      return { command: candidate, args: options.args }
    }
  }
  return { command: options.command, args: options.args }
}

function quoteCmdPath(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function quoteCmdArgument(value: string): string {
  if (value === '') return '""'
  if (/^[A-Za-z0-9_./:@=+-]+$/.test(value)) return value
  throw new Error('Unsafe Windows command argument.')
}

function abortError(): DOMException {
  return new DOMException('Subscription request aborted.', 'AbortError')
}

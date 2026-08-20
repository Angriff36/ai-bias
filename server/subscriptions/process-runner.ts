import { spawn } from 'node:child_process'
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

      const child = spawn(options.command, options.args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

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

function abortError(): DOMException {
  return new DOMException('Subscription request aborted.', 'AbortError')
}

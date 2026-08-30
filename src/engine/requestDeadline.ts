/** Cuts a provider call off if it never comes back. Cancel still wins. */
export class RequestDeadline {
  readonly signal: AbortSignal
  private readonly timer: ReturnType<typeof setTimeout>
  private timedOutFlag = false
  private readonly stopParent: () => void

  constructor(parent: AbortSignal, timeoutMs: number) {
    const controller = new AbortController()
    this.signal = controller.signal
    if (parent.aborted) {
      controller.abort()
      this.timer = setTimeout(() => undefined, 0)
      this.stopParent = () => undefined
      return
    }
    this.timer = setTimeout(() => {
      this.timedOutFlag = true
      controller.abort()
    }, timeoutMs)
    const onParentAbort = () => {
      clearTimeout(this.timer)
      controller.abort()
    }
    parent.addEventListener('abort', onParentAbort, { once: true })
    this.stopParent = () => parent.removeEventListener('abort', onParentAbort)
  }

  get timedOut(): boolean {
    return this.timedOutFlag
  }

  clear(): void {
    clearTimeout(this.timer)
    this.stopParent()
  }
}

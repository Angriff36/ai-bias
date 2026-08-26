/**
 * Error thrown by server functions and re-raised by the browser API client.
 * The status drives behaviour (404 → not found screen); the message is
 * plain language that can go straight to the screen.
 */
export class ServerError extends Error {
  constructor(public status: 401 | 404 | 409 | 500, message: string) {
    super(message)
    this.name = 'ServerError'
  }
}

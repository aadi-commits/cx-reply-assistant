/** fetch with an abort-based timeout. Throws on network error or timeout. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ExternalServiceError(`Request to ${hostOf(url)} timed out after ${timeoutMs}ms`);
    }
    throw new ExternalServiceError(`Request to ${hostOf(url)} failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'external service';
  }
}

/** Distinguishes transient external failures from client/validation errors. */
export class ExternalServiceError extends Error {
  readonly transient = true;
  constructor(message: string) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}

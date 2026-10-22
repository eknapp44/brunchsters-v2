import type { RateLimitFacts } from './limitedCopy';

const FALLBACK_WAIT_SECONDS = 60;

function wholeSeconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

// The facts of a 429 from one of our routes, or undefined when the answer is anything else. The
// body (`rateLimitedResponse`) is the source; the Retry-After header covers a 429 that did not
// come from us (a proxy), and a minute is the last resort so a control never gets stuck at zero.
export async function readRateLimit(response: Response): Promise<RateLimitFacts | undefined> {
  if (response.status !== 429) return undefined;

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: the header below is all there is.
  }

  const header = response.headers.get('Retry-After');
  return {
    policy: typeof body.policy === 'string' ? body.policy : 'unknown',
    retryAfterSeconds:
      wholeSeconds(body.retryAfterSeconds) ??
      wholeSeconds(header === null ? undefined : Number(header)) ??
      FALLBACK_WAIT_SECONDS,
  };
}

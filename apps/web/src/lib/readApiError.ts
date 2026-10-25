import {
  type ApiErrorCode,
  codeForStatus,
  isApiErrorCode,
  isStatusAllowedFor,
} from '@brunchsters/shared';
import type { RateLimitFacts } from './limitedCopy';
import { readRateLimit } from './readRateLimit';

// What a control learns from a response that was not a success (spec 0014, ADR 0016): a code, and
// the facts of a wait when it was a 429. The wording is `errorCopy`'s, never the body's.
export type ReadApiError = {
  readonly code: ApiErrorCode;
  readonly rateLimit: RateLimitFacts | undefined;
};

// The code in a body of the form { error: { code } }, or undefined for any other shape. Read by
// hand, not with Zod: this runs in the browser, and Zod 4 probes for `eval` with `new Function`,
// which the enforced Content-Security-Policy reports as a violation on every page that loads it
// (found in spec 0014 M2 by journey S3).
function codeInBody(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined;
  const error = body.error;
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return error.code;
}

// A 404 never depends on the body, so it says the same thing for every id. The one exception is
// a code a route sends to a member only (an option that went away under a voter).
const NOT_FOUND_CODES_THAT_MAY_DIFFER: readonly ApiErrorCode[] = ['option_gone'];

// Reads the code a route sent. A body in the old shape (`{ error: 'text' }`, `{ errors: [...] }`),
// a page from a proxy, an empty body or a code this app does not know falls back to the general
// code for the status, so an unmigrated route is still worded correctly, only less specifically.
export async function readApiError(response: Response): Promise<ReadApiError> {
  const rateLimit = await readRateLimit(response);
  if (rateLimit !== undefined) return { code: 'rate_limited', rateLimit };

  const fallback = codeForStatus(response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { code: fallback, rateLimit: undefined };
  }

  const code = codeInBody(body);
  if (!isApiErrorCode(code) || !isStatusAllowedFor({ code, status: response.status })) {
    return { code: fallback, rateLimit: undefined };
  }
  if (response.status === 404 && !NOT_FOUND_CODES_THAT_MAY_DIFFER.includes(code)) {
    return { code: 'not_found', rateLimit: undefined };
  }
  return { code, rateLimit: undefined };
}

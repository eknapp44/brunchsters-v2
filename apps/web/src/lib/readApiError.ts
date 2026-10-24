import {
  type ApiErrorCode,
  codeForStatus,
  isApiErrorCode,
  isStatusAllowedFor,
} from '@brunchsters/shared';
import { z } from 'zod';
import type { RateLimitFacts } from './limitedCopy';
import { readRateLimit } from './readRateLimit';

// What a control learns from a response that was not a success (spec 0014, ADR 0016): a code, and
// the facts of a wait when it was a 429. The wording is `errorCopy`'s, never the body's.
export type ReadApiError = {
  readonly code: ApiErrorCode;
  readonly rateLimit: RateLimitFacts | undefined;
};

const codedBody = z.object({ error: z.object({ code: z.string() }) });

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

  const parsed = codedBody.safeParse(body);
  if (!parsed.success) return { code: fallback, rateLimit: undefined };

  const code = parsed.data.error.code;
  if (!isApiErrorCode(code) || !isStatusAllowedFor({ code, status: response.status })) {
    return { code: fallback, rateLimit: undefined };
  }
  if (response.status === 404 && !NOT_FOUND_CODES_THAT_MAY_DIFFER.includes(code)) {
    return { code: 'not_found', rateLimit: undefined };
  }
  return { code, rateLimit: undefined };
}

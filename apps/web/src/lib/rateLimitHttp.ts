import { NextResponse } from 'next/server';
import { apiError } from './apiErrorResponse';

// What every limited route answers (ADR 0013): 429 with Retry-After, and the same facts in the
// body so a control can word its message and keep the wait. The `error` is the coded shape every
// route answers with (spec 0014); `policy` and `retryAfterSeconds` ride beside it. `policy` is the name of the policy
// that refused; it says nothing about any brunch or invite. Pure, so a test can use it without
// the database (the part that counts is `rateLimit.ts`).
export type RateLimitedAnswer = {
  readonly policy: string;
  readonly retryAfterSeconds: number;
};

export function rateLimitedResponse(limited: RateLimitedAnswer): NextResponse {
  return NextResponse.json(
    {
      error: { code: 'rate_limited', message: 'Too many requests' },
      policy: limited.policy,
      retryAfterSeconds: limited.retryAfterSeconds,
    },
    { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
  );
}

// The counter could not be read: the request is refused rather than let through (fail closed,
// ADR 0013). Logged with its cause; the caller gets nothing it could use to probe.
export function rateLimiterUnavailableResponse(params: {
  readonly route: string;
  readonly cause: unknown;
}): NextResponse {
  console.error(`${params.route}: the rate limiter is unavailable`, params.cause);
  return apiError({ code: 'unavailable', status: 503, message: 'Temporarily unavailable' });
}

const UNKNOWN_ADDRESS = 'unknown';

// The address a request came from, for the limits on routes a signed-out visitor can call. Behind
// the host (Vercel) the first `x-forwarded-for` entry is the visitor's; locally and in the e2e
// suite a request names its own. A caller that can set the header can pick its own address, which
// is why confirming that the deployed host overwrites it is on the deployment checklist (ADR 0013).
// With no usable header every such request shares one bucket ("unknown"): stricter, never looser.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded !== undefined && forwarded !== '') return forwarded;
  const real = headers.get('x-real-ip')?.trim();
  return real !== undefined && real !== '' ? real : UNKNOWN_ADDRESS;
}

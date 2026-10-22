import { NextResponse } from 'next/server';

// What every limited route answers (ADR 0013): 429 with Retry-After, and the same facts in the
// body so a control can word its message and keep the wait. `policy` is the name of the policy
// that refused; it says nothing about any brunch or invite.
export type RateLimitedAnswer = {
  readonly policy: string;
  readonly retryAfterSeconds: number;
};

export function rateLimitedResponse(limited: RateLimitedAnswer): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many requests',
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
  return NextResponse.json({ error: 'Temporarily unavailable' }, { status: 503 });
}

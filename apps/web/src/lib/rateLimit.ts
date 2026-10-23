import { RATE_LIMIT_POLICIES, type RateLimitPolicy } from '@brunchsters/shared';
import type { NextResponse } from 'next/server';
import { rateLimitedResponse, rateLimiterUnavailableResponse } from './rateLimitHttp';
import { getRateLimiter } from './services';

// Spends one unit of a policy for a subject, and answers for the route when it cannot: the 429
// when the budget is spent, the 503 when the counter cannot be read (fail closed, ADR 0013).
// Returns undefined when the request may go on, so a handler reads:
//
//   const limited = await enforceLimit({ ... });
//   if (limited !== undefined) return limited;
//
// The subject is always the caller (a user id or an address), never anything that names a brunch:
// a made-up id and a real one must spend the same budget and get the same answer.
export async function enforceLimit(params: {
  readonly policy: RateLimitPolicy;
  readonly subject: string;
  readonly route: string;
}): Promise<NextResponse | undefined> {
  const result = await getRateLimiter().consume({
    policy: params.policy,
    subject: params.subject,
  });
  if (result.isErr()) {
    return rateLimiterUnavailableResponse({ route: params.route, cause: result.error.cause });
  }
  if (!result.value.allowed) {
    return rateLimitedResponse({
      policy: params.policy.name,
      retryAfterSeconds: result.value.retryAfterSeconds,
    });
  }
  return undefined;
}

// Every mutating route calls this right after its session check (the order is: session, limit,
// parse, service), keyed by the signed-in person. A test fails when a mutating route does not.
export function enforceWriteLimit(userId: string): Promise<NextResponse | undefined> {
  return enforceLimit({
    policy: RATE_LIMIT_POLICIES.writesPerUser,
    subject: userId,
    route: 'write',
  });
}

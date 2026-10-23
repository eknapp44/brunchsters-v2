import type { RateLimitPolicy } from '@brunchsters/shared';
import type { Result } from 'neverthrow';

export type ConsumeInput = {
  readonly policy: RateLimitPolicy;
  // Who is spending the budget: a user id, a brunch id, an invite id or an IP. Callers choose
  // the subject from the caller or from something only a verified host can name, never from a
  // brunch an outsider merely asked about (ADR 0013: a limit must not confirm a brunch exists).
  readonly subject: string;
  // Units to spend; defaults to 1. A request that needs more than the policy's whole limit is
  // denied outright and spends nothing.
  readonly cost?: number;
};

export type RateLimitDecision =
  | { readonly allowed: true; readonly remaining: number }
  // Seconds until the window ends and the counter starts again: at least 1.
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export type RateLimitError = { readonly kind: 'db_error'; readonly cause: unknown };

// A question about a budget that spends nothing: "would a request costing this much be refused
// right now?" (spec 0012, ADR 0013 addendum). The page asks it when it loads, so what a control
// shows (waiting, and for how long) comes from the same counter that refuses, not from anything the
// browser remembered.
export type PeekInput = ConsumeInput;

export type RateLimitStatus =
  | { readonly blocked: false; readonly remaining: number }
  // The same wait `consume` would have answered with: seconds until the window ends, at least 1.
  | { readonly blocked: true; readonly retryAfterSeconds: number };

// A fixed-window counter behind an interface, so the store can change (Postgres today, ADR 0013)
// without touching a caller. A denied request spends nothing.
export interface RateLimiter {
  consume(input: ConsumeInput): Promise<Result<RateLimitDecision, RateLimitError>>;
  // Several questions in one round trip, answered in the same order. Spends nothing.
  peek(inputs: readonly PeekInput[]): Promise<Result<readonly RateLimitStatus[], RateLimitError>>;
}

import { err, ok, type Result } from 'neverthrow';
import type {
  ConsumeInput,
  PeekInput,
  RateLimitDecision,
  RateLimiter,
  RateLimitError,
  RateLimitStatus,
} from './RateLimiter';

export type RecordedSpend = {
  readonly policy: string;
  readonly subject: string;
  readonly cost: number;
};

// For service tests that need to see exactly which budgets were spent, in what order, for whom
// and for how much (the in-memory limiter hides that behind its counts), and to make one policy
// refuse or the whole limiter fail. Test support, like MockEmailService.
export class RecordingRateLimiter implements RateLimiter {
  readonly spends: RecordedSpend[] = [];
  private readonly refusePolicy: string | undefined;
  private readonly failure: unknown;

  constructor(params: { readonly refusePolicy?: string; readonly failWith?: unknown } = {}) {
    this.refusePolicy = params.refusePolicy;
    this.failure = params.failWith;
  }

  consume(input: ConsumeInput): Promise<Result<RateLimitDecision, RateLimitError>> {
    this.spends.push({
      policy: input.policy.name,
      subject: input.subject,
      cost: input.cost ?? 1,
    });
    if (this.failure !== undefined) {
      return Promise.resolve(err({ kind: 'db_error', cause: this.failure }));
    }
    if (input.policy.name === this.refusePolicy) {
      return Promise.resolve(ok({ allowed: false, retryAfterSeconds: 321 }));
    }
    return Promise.resolve(ok({ allowed: true, remaining: 1 }));
  }

  // Nothing is blocked unless refusePolicy says so (then that policy is blocked for 321 seconds,
  // the same wait consume gives it), and the questions are recorded like the spends.
  readonly peeks: RecordedSpend[] = [];

  peek(inputs: readonly PeekInput[]): Promise<Result<readonly RateLimitStatus[], RateLimitError>> {
    for (const input of inputs) {
      this.peeks.push({ policy: input.policy.name, subject: input.subject, cost: input.cost ?? 1 });
    }
    if (this.failure !== undefined) {
      return Promise.resolve(err({ kind: 'db_error', cause: this.failure }));
    }
    return Promise.resolve(
      ok(
        inputs.map(
          (input): RateLimitStatus =>
            input.policy.name === this.refusePolicy
              ? { blocked: true, retryAfterSeconds: 321 }
              : { blocked: false, remaining: 1 },
        ),
      ),
    );
  }
}

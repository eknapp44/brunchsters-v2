import { NonRetriableError } from 'inngest';
import type { Result } from 'neverthrow';

// Failures that time cannot fix: retrying wastes attempts and hides the real problem.
const PERMANENT_FAILURES: ReadonlySet<string> = new Set([
  'invalid_address',
  'brunch_not_found',
  'not_confirmed',
]);

type Failure = { readonly kind: string };

function describeFailure(failure: Failure): string {
  const details = failure as Record<string, unknown>;
  const detail = details.message ?? details.address ?? details.cause;
  const text =
    detail instanceof Error ? detail.message : detail === undefined ? '' : String(detail);
  return text === '' ? failure.kind : `${failure.kind}: ${text}`;
}

// A service result becomes a value, or a thrown error the queue understands: a
// NonRetriableError for failures that can never succeed, a plain Error (so Inngest
// retries with backoff) for the rest.
export function unwrapForQueue<T, E extends Failure>(result: Result<T, E>, step: string): T {
  if (result.isOk()) return result.value;

  const message = `${step} failed: ${describeFailure(result.error)}`;
  if (PERMANENT_FAILURES.has(result.error.kind)) throw new NonRetriableError(message);
  throw new Error(message);
}

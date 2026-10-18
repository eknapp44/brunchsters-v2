import type { SendConfirmationEmailError, SendConfirmationEmailOutcome } from '@brunchsters/core';
import type { Result } from 'neverthrow';
import { unwrapForQueue } from './unwrapForQueue';

export type ConfirmationStepOutcome = SendConfirmationEmailOutcome | 'skipped_invalid_address';

// One recipient's address being rejected for good must not end the whole run: the people after
// them in the list would never be emailed. A permanent address failure becomes an outcome the
// run records and moves past; anything else keeps the queue's normal retry behavior.
export function settleConfirmationEmail(params: {
  readonly result: Result<SendConfirmationEmailOutcome, SendConfirmationEmailError>;
  readonly step: string;
}): ConfirmationStepOutcome {
  if (params.result.isErr() && params.result.error.kind === 'invalid_address') {
    return 'skipped_invalid_address';
  }
  return unwrapForQueue(params);
}

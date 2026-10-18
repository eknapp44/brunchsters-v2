import { NonRetriableError } from 'inngest';
import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { settleConfirmationEmail } from './settleConfirmationEmail';

describe('settleConfirmationEmail', () => {
  it('passes a normal outcome through', () => {
    expect(settleConfirmationEmail({ result: ok('sent'), step: 'email-host' })).toBe('sent');
    expect(settleConfirmationEmail({ result: ok('skipped_duplicate'), step: 'email-host' })).toBe(
      'skipped_duplicate',
    );
  });

  it('records a permanently rejected address as an outcome instead of ending the run', () => {
    // Throwing here (a NonRetriableError) would fail the run and strand every later recipient.
    const outcome = settleConfirmationEmail({
      result: err({ kind: 'invalid_address', address: 'bad@example.com' }),
      step: 'email-invite:3',
    });

    expect(outcome).toBe('skipped_invalid_address');
  });

  it('still retries a delivery failure, so a provider hiccup does not drop the email', () => {
    let thrown: unknown;
    try {
      settleConfirmationEmail({
        result: err({ kind: 'delivery_failed', message: 'provider down' }),
        step: 'email-host',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(NonRetriableError);
  });

  it('still retries a database failure', () => {
    expect(() =>
      settleConfirmationEmail({
        result: err({ kind: 'db_error', cause: new Error('connection lost') }),
        step: 'email-host',
      }),
    ).toThrow('email-host failed: db_error: connection lost');
  });
});

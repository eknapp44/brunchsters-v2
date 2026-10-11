import { NonRetriableError } from 'inngest';
import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { unwrapForQueue } from './unwrapForQueue';

describe('unwrapForQueue', () => {
  it('returns the value of an Ok result', () => {
    expect(unwrapForQueue(ok('sent'), 'send')).toBe('sent');
  });

  it.each([
    { kind: 'invalid_address', address: 'nope@example.com' },
    { kind: 'brunch_not_found' },
    { kind: 'not_confirmed' },
  ])('throws a NonRetriableError for $kind', (failure) => {
    expect(() => unwrapForQueue(err(failure), 'send')).toThrow(NonRetriableError);
  });

  it.each([
    { kind: 'delivery_failed', message: 'provider down' },
    { kind: 'db_error', cause: new Error('connection lost') },
  ])('throws a plain, retryable Error for $kind', (failure) => {
    let thrown: unknown;
    try {
      unwrapForQueue(err(failure), 'send');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(NonRetriableError);
  });

  it('names the step and the cause in the message', () => {
    expect(() =>
      unwrapForQueue(
        err({ kind: 'delivery_failed', message: 'provider down' }),
        'send-invite-email',
      ),
    ).toThrow('send-invite-email failed: delivery_failed: provider down');
    expect(() =>
      unwrapForQueue(err({ kind: 'db_error', cause: new Error('connection lost') }), 'load'),
    ).toThrow('load failed: db_error: connection lost');
  });

  it('falls back to the kind alone when there is no detail', () => {
    expect(() => unwrapForQueue(err({ kind: 'not_confirmed' }), 'resolve')).toThrow(
      'resolve failed: not_confirmed',
    );
  });
});

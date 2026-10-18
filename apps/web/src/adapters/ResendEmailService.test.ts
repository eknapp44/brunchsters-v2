import { normalizeEmail } from '@brunchsters/shared';
import { describe, expect, it, vi } from 'vitest';
import { ResendEmailService, type ResendEmailsClient } from './ResendEmailService';

const TO = normalizeEmail('guest@example.com');
const INPUT = { to: TO, subject: 'Hello', html: '<p>Hi</p>', idempotencyKey: 'invite:1:abc' };

function makeClient(response: Awaited<ReturnType<ResendEmailsClient['emails']['send']>>): {
  client: ResendEmailsClient;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn().mockResolvedValue(response);
  return { client: { emails: { send } }, send };
}

describe('ResendEmailService', () => {
  it('sends from the default sender and returns the provider id', async () => {
    const { client, send } = makeClient({ data: { id: 'email-1' }, error: null });

    const result = await new ResendEmailService(client, 'Brunchsters <a@mail.example.com>').send(
      INPUT,
    );

    expect(result._unsafeUnwrap()).toBe('email-1');
    expect(send).toHaveBeenCalledWith(
      {
        from: 'Brunchsters <a@mail.example.com>',
        to: 'guest@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
      },
      { idempotencyKey: 'invite:1:abc' },
    );
  });

  it('passes the idempotency key so a repeated send is not delivered twice', async () => {
    const { client, send } = makeClient({ data: { id: 'email-1' }, error: null });

    await new ResendEmailService(client, 'a@b.test').send(INPUT);

    expect(send.mock.calls[0]?.[1]).toEqual({ idempotencyKey: 'invite:1:abc' });
  });

  it('sends without request options when there is no idempotency key', async () => {
    const { client, send } = makeClient({ data: { id: 'email-1' }, error: null });

    await new ResendEmailService(client, 'a@b.test').send({
      to: TO,
      subject: 'Hello',
      html: '<p>Hi</p>',
    });

    expect(send.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('lets an explicit from override the default', async () => {
    const { client, send } = makeClient({ data: { id: 'email-1' }, error: null });

    await new ResendEmailService(client, 'default@b.test').send({
      ...INPUT,
      from: normalizeEmail('other@b.test'),
    });

    expect(send.mock.calls[0]?.[0]).toMatchObject({ from: 'other@b.test' });
  });

  it('reports a validation_error as an address problem the queue will not retry', async () => {
    const { client } = makeClient({
      data: null,
      error: {
        name: 'validation_error',
        message: 'You can only send testing emails to your own address',
        statusCode: 403,
      },
    });

    const result = await new ResendEmailService(client, 'a@b.test').send(INPUT);

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'invalid_address',
      address: 'guest@example.com',
    });
  });

  it('reports any other provider error as a delivery failure the queue will retry', async () => {
    const { client } = makeClient({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Slow down', statusCode: 429 },
    });

    const result = await new ResendEmailService(client, 'a@b.test').send(INPUT);

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'delivery_failed',
      message: 'rate_limit_exceeded: Slow down',
    });
  });

  it('reports a reused idempotency key with different content as already sent, not retryable', async () => {
    // Seen against real Resend: replaying an invite after confirming changed the email's expiry
    // line, so the same key came with a different body and Resend answered 409.
    const { client } = makeClient({
      data: null,
      error: {
        name: 'invalid_idempotent_request',
        message: 'This idempotency key has been used ... the request body was modified',
        statusCode: 409,
      },
    });

    const result = await new ResendEmailService(client, 'a@b.test').send(INPUT);

    expect(result._unsafeUnwrapErr()).toEqual({ kind: 'already_sent' });
  });

  it('keeps a still-in-flight idempotent request retryable', async () => {
    const { client } = makeClient({
      data: null,
      error: {
        name: 'concurrent_idempotent_requests',
        message: 'Another request with this key is in progress',
        statusCode: 409,
      },
    });

    const result = await new ResendEmailService(client, 'a@b.test').send(INPUT);

    expect(result._unsafeUnwrapErr().kind).toBe('delivery_failed');
  });

  it('turns a thrown network error into a delivery failure', async () => {
    const client: ResendEmailsClient = {
      emails: { send: vi.fn().mockRejectedValue(new Error('socket hang up')) },
    };

    const result = await new ResendEmailService(client, 'a@b.test').send(INPUT);

    expect(result._unsafeUnwrapErr()).toEqual({
      kind: 'delivery_failed',
      message: 'socket hang up',
    });
  });
});

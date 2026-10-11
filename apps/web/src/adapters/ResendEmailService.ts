import type { EmailError, EmailId, EmailService, SendEmailInput } from '@brunchsters/core';
import { err, ok, type Result } from 'neverthrow';
import type { Resend } from 'resend';

// The slice of the Resend client this adapter uses, so tests can pass a fake.
export type ResendEmailsClient = {
  readonly emails: {
    send: (
      payload: { from: string; to: string; subject: string; html: string },
      options?: { idempotencyKey?: string },
    ) => Promise<
      | { data: { id: string }; error: null }
      | { data: null; error: { name: string; message: string; statusCode: number | null } }
    >;
  };
};

// Resend answers `validation_error` when it will not accept a message as addressed (a
// malformed recipient, or the sandbox sender writing to anyone but the account owner).
// Retrying cannot change that, so it is reported as an address problem the queue treats
// as permanent. Everything else (rate limits, outages, bad keys) may pass with time.
const PERMANENT_RECIPIENT_ERRORS: ReadonlySet<string> = new Set(['validation_error']);

export class ResendEmailService implements EmailService {
  constructor(
    private readonly client: ResendEmailsClient | Resend,
    private readonly defaultFrom: string,
  ) {}

  async send(input: SendEmailInput): Promise<Result<EmailId, EmailError>> {
    try {
      const response = await this.client.emails.send(
        {
          from: input.from ?? this.defaultFrom,
          to: input.to,
          subject: input.subject,
          html: input.html,
        },
        input.idempotencyKey === undefined ? undefined : { idempotencyKey: input.idempotencyKey },
      );

      if (response.error !== null) {
        return err(
          PERMANENT_RECIPIENT_ERRORS.has(response.error.name)
            ? { kind: 'invalid_address', address: input.to }
            : {
                kind: 'delivery_failed',
                message: `${response.error.name}: ${response.error.message}`,
              },
        );
      }
      return ok(response.data.id as EmailId);
    } catch (cause) {
      return err({
        kind: 'delivery_failed',
        message: cause instanceof Error ? cause.message : 'Unknown error sending email',
      });
    }
  }
}

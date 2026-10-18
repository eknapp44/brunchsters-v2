import type { EmailError, EmailId, EmailService, SendEmailInput } from '@brunchsters/core';
import { err, ok, type Result } from 'neverthrow';

// The slice of the Resend client this adapter uses, so tests can pass a fake.
export type ResendEmailsClient = {
  readonly emails: {
    readonly send: (
      payload: {
        readonly from: string;
        readonly to: string;
        readonly subject: string;
        readonly html: string;
      },
      options?: { readonly idempotencyKey?: string },
    ) => Promise<
      | { readonly data: { readonly id: string }; readonly error: null }
      | {
          readonly data: null;
          readonly error: {
            readonly name: string;
            readonly message: string;
            readonly statusCode: number | null;
          };
        }
    >;
  };
};

// Resend answers `validation_error` when it will not accept a message as addressed (a
// malformed recipient, or the sandbox sender writing to anyone but the account owner).
// Retrying cannot change that, so it is reported as an address problem the queue treats
// as permanent. Everything else (rate limits, outages, bad keys) may pass with time.
const PERMANENT_RECIPIENT_ERRORS: ReadonlySet<string> = new Set(['validation_error']);

// Resend answers 409 `invalid_idempotent_request` when this idempotency key was already used
// within 24 hours but the content differs (a replay after the email's text changed, for
// example). The original was accepted, retrying can only ever repeat the 409, so it is "done".
// `concurrent_idempotent_requests` (the same key still in flight) is different: it may pass.
const ALREADY_SENT_ERRORS: ReadonlySet<string> = new Set(['invalid_idempotent_request']);

export class ResendEmailService implements EmailService {
  constructor(
    private readonly client: ResendEmailsClient,
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
        if (ALREADY_SENT_ERRORS.has(response.error.name)) return err({ kind: 'already_sent' });
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

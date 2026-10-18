import type { Result } from 'neverthrow';
import type { Brand, Email } from '@brunchsters/shared';

export type EmailId = Brand<string, 'EmailId'>;

export type SendEmailInput = {
  readonly to: Email;
  readonly subject: string;
  readonly html: string;
  // Defaults to the sending address the adapter is configured with (EMAIL_FROM).
  readonly from?: Email;
  // Sending the same key twice must not deliver twice (the provider dedupes).
  // Queue handlers run at least once, so every email they send sets one.
  readonly idempotencyKey?: string;
};

export type EmailError =
  | { readonly kind: 'delivery_failed'; readonly message: string }
  | { readonly kind: 'invalid_address'; readonly address: string }
  // The provider already accepted an email under this idempotency key (possibly with different
  // content, e.g. a replay after the invite's expiry changed). Retrying cannot send it again, and
  // the recipient has it, so callers treat it as done.
  | { readonly kind: 'already_sent' };

export interface EmailService {
  send(input: SendEmailInput): Promise<Result<EmailId, EmailError>>;
}

import type { Result } from 'neverthrow';
import type { Brand, Email } from '@brunchsters/shared';

export type EmailId = Brand<string, 'EmailId'>;

export type SendEmailInput = {
  readonly to: Email;
  readonly subject: string;
  readonly html: string;
  readonly from?: Email;
};

export type EmailError =
  | { readonly kind: 'delivery_failed'; readonly message: string }
  | { readonly kind: 'invalid_address'; readonly address: string };

export interface EmailService {
  send(input: SendEmailInput): Promise<Result<EmailId, EmailError>>;
}

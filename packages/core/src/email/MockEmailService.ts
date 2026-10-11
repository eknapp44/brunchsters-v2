import { err, ok, type Result } from 'neverthrow';
import type { EmailError, EmailId, EmailService, SendEmailInput } from './EmailService';

// Records every send so tests can assert on recipients, content and idempotency
// keys. Pass a failure to make every send return that error instead.
export class MockEmailService implements EmailService {
  readonly sent: SendEmailInput[] = [];

  constructor(private readonly failure?: EmailError) {}

  send(input: SendEmailInput): Promise<Result<EmailId, EmailError>> {
    if (this.failure !== undefined) return Promise.resolve(err(this.failure));
    this.sent.push(input);
    return Promise.resolve(ok(`mock-email-${this.sent.length}` as EmailId));
  }
}

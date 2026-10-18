import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EmailError, EmailId, EmailService, SendEmailInput } from '@brunchsters/core';
import { err, ok, type Result } from 'neverthrow';

let sequence = 0;

function nextSequence(): string {
  sequence += 1;
  return String(sequence).padStart(6, '0');
}

// Writes each email as one JSON file instead of sending it. This is the local-development
// mailbox: with no Resend key you can still open the file and follow the invite link, and
// the e2e suite reads emails from here (ADR 0009).
export class FileEmailService implements EmailService {
  constructor(private readonly outboxDir: string) {}

  async send(input: SendEmailInput): Promise<Result<EmailId, EmailError>> {
    const id = randomUUID();
    try {
      await mkdir(this.outboxDir, { recursive: true });
      // Timestamp then sequence number keep the directory listing in send order, even for
      // two emails written in the same millisecond (the uuid alone would sort randomly).
      const file = path.join(this.outboxDir, `${Date.now()}-${nextSequence()}-${id}.json`);
      await writeFile(
        file,
        JSON.stringify(
          {
            id,
            to: input.to,
            from: input.from,
            subject: input.subject,
            html: input.html,
            idempotencyKey: input.idempotencyKey,
            createdAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf-8',
      );
      return ok(id as EmailId);
    } catch (cause) {
      return err({
        kind: 'delivery_failed',
        message: cause instanceof Error ? cause.message : 'Could not write the email file',
      });
    }
  }
}

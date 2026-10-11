import type { Email } from './types/ids';

// The canonical form of an email address (ADR 0008): trimmed and lowercased. Every provider
// treats the local part as case-insensitive, so "Alex@Example.com" and "alex@example.com" are
// one person; storing and comparing one form makes that true everywhere.
//
// This is the ONLY place a plain string becomes the branded `Email` type, so a service that
// takes an `Email` cannot be handed an un-normalized string without the compiler objecting.
// It normalizes; it does not validate (`z.email()` does that, and runs first).
export function normalizeEmail(raw: string): Email {
  return raw.trim().toLowerCase() as Email;
}

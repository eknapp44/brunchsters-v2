import type { BrunchId, InviteId } from '@brunchsters/shared';

async function sha256Prefix(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Rotates with the token, so a resend sends again while a retry of the same send
// does not. Only a hash of the token is used: the key shows up in provider logs.
export async function inviteEmailKey(params: {
  readonly inviteId: InviteId;
  readonly token: string;
}): Promise<string> {
  return `invite:${params.inviteId}:${await sha256Prefix(params.token)}`;
}

export function confirmedEmailKey(params: {
  readonly brunchId: BrunchId;
  readonly recipientKey: string;
}): string {
  return `confirmed:${params.brunchId}:${params.recipientKey}`;
}

// Where an email's links point. AUTH_URL may or may not end in a slash.
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

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

// The called-off and back-on emails (spec 0013) carry the moment of the cancellation: a host who
// calls the brunch off, brings it back and calls it off again has made a second cancellation, and
// people must be told about it, while a retry of the same send must not tell them twice.
export function cancelledEmailKey(params: {
  readonly brunchId: BrunchId;
  readonly cancelledAt: Date;
  readonly recipientKey: string;
}): string {
  return `cancelled:${params.brunchId}:${params.cancelledAt.getTime()}:${params.recipientKey}`;
}

export function backOnEmailKey(params: {
  readonly brunchId: BrunchId;
  readonly cancelledAt: Date;
  readonly recipientKey: string;
}): string {
  return `backon:${params.brunchId}:${params.cancelledAt.getTime()}:${params.recipientKey}`;
}

// Where an email's links point. AUTH_URL may or may not end in a slash.
export function joinUrl(params: { readonly base: string; readonly path: string }): string {
  return `${params.base.replace(/\/+$/, '')}${params.path}`;
}

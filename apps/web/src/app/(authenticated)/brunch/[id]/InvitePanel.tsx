'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type InviteListItem = {
  readonly id: string;
  readonly invitedEmail: string;
  readonly status: 'pending' | 'yes' | 'no' | 'maybe';
  readonly token: string;
};

function inviteLink(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

function CopyLinkButton({ token }: { readonly token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(inviteLink(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={() => void copy()}>
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}

export function InvitePanel({
  brunchId,
  invites,
}: {
  readonly brunchId: string;
  readonly invites: readonly InviteListItem[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pendingInviteId, setPendingInviteId] = useState<string | undefined>(undefined);

  async function sendInvite(): Promise<void> {
    const trimmed = email.trim();
    if (trimmed === '') return;

    setSending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: [trimmed] }),
      });
      if (!response.ok) {
        setError('Failed to send invite');
        return;
      }
      setEmail('');
      router.refresh();
    } catch {
      setError('Failed to send invite');
    } finally {
      setSending(false);
    }
  }

  async function resend(inviteId: string): Promise<void> {
    setPendingInviteId(inviteId);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/invites/${inviteId}/resend`, { method: 'POST' });
      if (!response.ok) {
        setError('Failed to resend invite');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to resend invite');
    } finally {
      setPendingInviteId(undefined);
    }
  }

  async function revoke(inviteId: string): Promise<void> {
    setPendingInviteId(inviteId);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/invites/${inviteId}`, { method: 'DELETE' });
      if (!response.ok) {
        setError('Failed to revoke invite');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to revoke invite');
    } finally {
      setPendingInviteId(undefined);
    }
  }

  return (
    <section>
      <h2>Invites</h2>

      {invites.length === 0 ? (
        <p>No invites sent yet.</p>
      ) : (
        <ul>
          {invites.map((invite) => (
            <li key={invite.id}>
              {invite.invitedEmail} — {invite.status}
              <CopyLinkButton token={invite.token} />
              <button
                type="button"
                onClick={() => void resend(invite.id)}
                disabled={pendingInviteId === invite.id}
              >
                Resend
              </button>
              <button
                type="button"
                onClick={() => void revoke(invite.id)}
                disabled={pendingInviteId === invite.id}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      <label>
        Invite more people
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <button type="button" onClick={() => void sendInvite()} disabled={sending}>
        {sending ? 'Sending…' : 'Send Invite'}
      </button>
      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
}

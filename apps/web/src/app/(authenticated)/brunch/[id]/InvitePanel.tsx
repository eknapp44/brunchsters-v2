'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/InlineAlert';
import styles from './detail.module.css';

type InviteStatus = 'pending' | 'yes' | 'no' | 'maybe';

type InviteListItem = {
  readonly id: string;
  readonly invitedEmail: string;
  readonly status: InviteStatus;
  readonly token: string;
};

function inviteLink(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

// The status word is always shown; the tone is only emphasis.
function badgeToneFor(status: InviteStatus): 'neutral' | 'accent' | 'mint' {
  if (status === 'yes') return 'mint';
  if (status === 'maybe') return 'accent';
  return 'neutral';
}

function CopyLinkButton({ token }: { readonly token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(inviteLink(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" size="sm" onClick={() => void copy()}>
      {copied ? 'Copied!' : 'Copy link'}
    </Button>
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
    if (pendingInviteId !== undefined) return;

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
    if (pendingInviteId !== undefined) return;

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
    <section className={styles.panel}>
      <h2>Invites</h2>

      {invites.length === 0 ? (
        <p className={styles.muted}>No invites sent yet.</p>
      ) : (
        <ul className={styles.rows} role="list">
          {invites.map((invite) => (
            <li key={invite.id} className={styles.row}>
              <span className={styles.rowMain}>
                <span>{invite.invitedEmail}</span>{' '}
                <Badge tone={badgeToneFor(invite.status)}>{invite.status}</Badge>
              </span>
              <span className={styles.rowActions}>
                <CopyLinkButton token={invite.token} />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void resend(invite.id)}
                  disabled={pendingInviteId === invite.id}
                >
                  Resend
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => void revoke(invite.id)}
                  disabled={pendingInviteId === invite.id}
                >
                  Revoke
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addRow}>
        <Field label="Invite more people">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Button type="button" onClick={() => void sendInvite()} disabled={sending}>
          {sending ? 'Sending…' : 'Send Invite'}
        </Button>
      </div>
      {error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{error}</p>
        </InlineAlert>
      )}
    </section>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';
import { limitedMessage, type RateLimitFacts } from '@/lib/limitedCopy';
import { handoffStorageKey, limitStorageKey } from '@/lib/limitedUntil';
import { readRateLimit } from '@/lib/readRateLimit';
import { useLimitedUntil } from '@/lib/useLimitedUntil';
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

// The policies that hold back every invite email of a brunch or host, not one invite's cooldown.
const INVITE_BUDGET_POLICIES: ReadonlySet<string> = new Set([
  RATE_LIMIT_POLICIES.inviteEmailsPerBrunch.name,
  RATE_LIMIT_POLICIES.inviteEmailsPerHost.name,
]);

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

// One invite, with its own Resend wait: after the server says the invite just went out (or the
// host has sent a lot today), only this Resend button waits, with the reason beside it. The
// button stays focusable (`aria-disabled`, not `disabled`) so a keyboard or screen-reader user can
// still find it and read why.
function InviteRow({
  invite,
  viewerId,
  busy,
  onResend,
  onBudgetRefused,
  onRevoke,
}: {
  readonly invite: InviteListItem;
  readonly viewerId: string;
  readonly busy: boolean;
  readonly onResend: (inviteId: string) => Promise<RateLimitFacts | undefined>;
  // The day's invite budget (not just this invite's cooldown) is spent: the panel's send button waits too.
  readonly onBudgetRefused: (facts: RateLimitFacts) => void;
  readonly onRevoke: (inviteId: string) => Promise<void>;
}) {
  const { limit, start } = useLimitedUntil(
    limitStorageKey({ control: 'resend', viewerId, id: invite.id }),
  );
  const limited = limit !== undefined;
  const noteId = `resend-limit-${invite.id}`;

  async function resend(): Promise<void> {
    if (limited) return;
    const facts = await onResend(invite.id);
    if (facts === undefined) return;
    start(facts);
    if (INVITE_BUDGET_POLICIES.has(facts.policy)) onBudgetRefused(facts);
  }

  return (
    <li className={styles.row}>
      <span className={styles.rowMain}>
        <span>{invite.invitedEmail}</span>{' '}
        <Badge tone={badgeToneFor(invite.status)}>{invite.status}</Badge>
      </span>
      <span className={styles.rowActions}>
        <CopyLinkButton token={invite.token} />
        <Button
          type="button"
          size="sm"
          onClick={() => void resend()}
          disabled={busy}
          aria-disabled={limited ? true : undefined}
          aria-describedby={limited ? noteId : undefined}
        >
          Resend
        </Button>
        <Button
          type="button"
          size="sm"
          variant="danger"
          onClick={() => void onRevoke(invite.id)}
          disabled={busy}
        >
          Revoke
        </Button>
      </span>
      {limit !== undefined && (
        <div id={noteId} className={styles.rowNote}>
          <InlineAlert tone="info" role="status">
            <p>{limitedMessage(limit)}</p>
          </InlineAlert>
        </div>
      )}
    </li>
  );
}

export function InvitePanel({
  brunchId,
  viewerId,
  invites,
}: {
  readonly brunchId: string;
  readonly viewerId: string;
  readonly invites: readonly InviteListItem[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pendingInviteId, setPendingInviteId] = useState<string | undefined>(undefined);
  const sendLimit = useLimitedUntil(
    limitStorageKey({ control: 'invites-send', viewerId, id: brunchId }),
    // The creation wizard leaves the wait here when it was refused sending the first invites.
    { adoptFrom: handoffStorageKey(brunchId) },
  );
  const sendLimited = sendLimit.limit !== undefined;

  async function sendInvite(): Promise<void> {
    if (sendLimited) return;
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
        const facts = await readRateLimit(response);
        if (facts !== undefined) {
          // The typed address stays, so it is there when the wait is over.
          sendLimit.start(facts);
          return;
        }
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

  // Returns the wait when the server said 429, so the row that asked can hold its own button.
  async function resend(inviteId: string): Promise<RateLimitFacts | undefined> {
    if (pendingInviteId !== undefined) return undefined;

    setPendingInviteId(inviteId);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/invites/${inviteId}/resend`, { method: 'POST' });
      if (!response.ok) {
        const facts = await readRateLimit(response);
        if (facts !== undefined) return facts;
        setError('Failed to resend invite');
        return undefined;
      }
      router.refresh();
    } catch {
      setError('Failed to resend invite');
    } finally {
      setPendingInviteId(undefined);
    }
    return undefined;
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
            <InviteRow
              key={invite.id}
              invite={invite}
              viewerId={viewerId}
              busy={pendingInviteId === invite.id}
              onResend={resend}
              onBudgetRefused={sendLimit.start}
              onRevoke={revoke}
            />
          ))}
        </ul>
      )}

      <div className={styles.addRow}>
        <Field label="Invite more people">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Button
          type="button"
          onClick={() => void sendInvite()}
          disabled={sending}
          aria-disabled={sendLimited ? true : undefined}
          aria-describedby={sendLimited ? 'invites-send-limit' : undefined}
        >
          {sending ? (
            'Sending…'
          ) : (
            <>
              Round up the crew
              <Icon name="arrowRight" size={16} />
            </>
          )}
        </Button>
      </div>
      {sendLimit.limit !== undefined && (
        <div id="invites-send-limit" className={styles.limitNote}>
          <InlineAlert tone="info" role="status">
            <p>{limitedMessage(sendLimit.limit)}</p>
          </InlineAlert>
        </div>
      )}
      {error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{error}</p>
        </InlineAlert>
      )}
    </section>
  );
}

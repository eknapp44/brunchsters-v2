'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { holdsAllInvites, limitedMessage, type RateLimitFacts } from '@/lib/limitedCopy';
import { INVITE_RESENT_TOAST, LINK_COPIED_TOAST, LINK_COPY_FAILED_TOAST } from '@/lib/toastCopy';
import { useWait, type Wait } from '@/lib/useWait';
import { useMutation, useToast } from '@/store/useMutation';
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
  const showToast = useToast();

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
    } catch {
      // An insecure page or a denied permission: say so instead of failing without a word.
      showToast({ key: `copy:${token}:failed`, tone: 'error', text: LINK_COPY_FAILED_TOAST });
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // The button's label changes for a moment, which a screen reader does not hear.
    showToast({ key: `copy:${token}:done`, tone: 'success', text: LINK_COPIED_TOAST });
  }

  return (
    <Button type="button" size="sm" onClick={() => void copy()}>
      {copied ? 'Copied!' : 'Copy link'}
    </Button>
  );
}

// One invite, with its own Resend wait: while the invite's cooldown is running (it was just sent)
// or the host has used the day's invites, only this Resend button waits, with the reason beside it.
// The server says so as the page loads (`waitFromServer`); a refusal it gets by clicking shows at
// once. The button stays focusable (`aria-disabled`, not `disabled`) so a keyboard or
// screen-reader user can still find it and read why.
function InviteRow({
  invite,
  waitFromServer,
  onBudgetRefused,
}: {
  readonly invite: InviteListItem;
  readonly waitFromServer: Wait | undefined;
  // The day's invite budget (not just this invite's cooldown) is spent: the panel's send button waits too.
  readonly onBudgetRefused: (facts: RateLimitFacts) => void;
}) {
  const router = useRouter();
  const { wait: limit, start } = useWait(waitFromServer);
  const resendMutation = useMutation(`invite-resend:${invite.id}`);
  const revokeMutation = useMutation(`invite-revoke:${invite.id}`);
  const limited = limit !== undefined;
  const busy = resendMutation.pending || revokeMutation.pending;
  const noteId = `resend-limit-${invite.id}`;

  async function resend(): Promise<void> {
    if (limited || busy) return;
    // The wait is this row's own, so the toast queue leaves a refusal to it (`ownsWait`).
    const result = await resendMutation.run({
      request: { url: `/api/v1/invites/${invite.id}/resend`, method: 'POST' },
      success: INVITE_RESENT_TOAST,
      failure: 'toast',
      ownsWait: true,
    });
    if (result.ok) {
      router.refresh();
      return;
    }
    const facts = result.failure?.rateLimit;
    if (facts === undefined) return;
    start(facts);
    if (holdsAllInvites(facts.policy)) onBudgetRefused(facts);
    // The server's own account of it, which every other control on the page then shares.
    router.refresh();
  }

  async function revoke(): Promise<void> {
    if (busy) return;
    const result = await revokeMutation.run({
      request: { url: `/api/v1/invites/${invite.id}`, method: 'DELETE' },
      failure: 'toast',
    });
    if (result.ok) router.refresh();
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
          aria-disabled={limited || busy ? true : undefined}
          aria-describedby={limited ? noteId : undefined}
        >
          Resend
        </Button>
        <Button
          type="button"
          size="sm"
          variant="danger"
          onClick={() => void revoke()}
          aria-disabled={busy ? true : undefined}
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
  invites,
  sendWait,
  resendWaits,
}: {
  readonly brunchId: string;
  readonly invites: readonly InviteListItem[];
  // What the server says the host is waiting on, asked as the page loaded (getInviteWaits).
  readonly sendWait: Wait | undefined;
  readonly resendWaits: Readonly<Record<string, Wait>>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const send = useMutation(`invite-send:${brunchId}`);
  const sendLimit = useWait(sendWait);
  const sendLimited = sendLimit.wait !== undefined;

  // A failure here is inline, beside the field the person typed into: it is theirs to fix or wait
  // out. A refusal (429) is the wait line below instead, so it is not also shown as a failure.
  async function sendInvite(): Promise<void> {
    if (sendLimited) return;
    const trimmed = email.trim();
    if (trimmed === '') return;

    const result = await send.run({
      request: {
        url: `/api/v1/brunches/${brunchId}/invites`,
        method: 'POST',
        body: { emails: [trimmed] },
      },
      failure: 'inline',
      ownsWait: true,
    });
    if (result.ok) {
      setEmail('');
      router.refresh();
      return;
    }
    const facts = result.failure?.rateLimit;
    if (facts === undefined) return;
    // The typed address stays, so it is there when the wait is over. The refresh brings the
    // server's own account of it, which every other control on the page then shares.
    sendLimit.start(facts);
    router.refresh();
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
              waitFromServer={resendWaits[invite.id]}
              onBudgetRefused={sendLimit.start}
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
          aria-disabled={sendLimited || send.pending ? true : undefined}
          aria-describedby={sendLimited ? 'invites-send-limit' : undefined}
        >
          {send.pending ? (
            'Sending…'
          ) : (
            <>
              Round up the crew
              <Icon name="arrowRight" size={16} />
            </>
          )}
        </Button>
      </div>
      {sendLimit.wait !== undefined && (
        <div id="invites-send-limit" className={styles.limitNote}>
          <InlineAlert tone="info" role="status">
            <p>{limitedMessage(sendLimit.wait)}</p>
          </InlineAlert>
        </div>
      )}
      {send.failure !== undefined && send.failure.code !== 'rate_limited' && (
        <InlineAlert tone="error" role="alert">
          <p>{send.failure.text}</p>
        </InlineAlert>
      )}
    </section>
  );
}

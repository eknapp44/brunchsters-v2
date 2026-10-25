'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { pageIsStale } from '@/lib/errorCopy';
import { limitedMessage, type RateLimitFacts } from '@/lib/limitedCopy';
import { useWait, type Wait } from '@/lib/useWait';
import { useMutation } from '@/store/useMutation';
import styles from './detail.module.css';

type SuggestionListItem = {
  readonly id: string;
  readonly suggestedEmail: string;
  readonly suggestedByName: string;
};

// One pending suggestion, with its own request state (a toast on failure: Approve and Decline are
// one tap with nothing to fix). Approving emails the address, so it spends the host's daily invite
// budget; a refusal is the panel's shared wait (`onBudgetRefused`), shown by the panel, so the
// toast queue leaves it alone (`ownsWait`).
function SuggestionRow({
  suggestion,
  approvalsWaiting,
  onBudgetRefused,
}: {
  readonly suggestion: SuggestionListItem;
  readonly approvalsWaiting: boolean;
  readonly onBudgetRefused: (facts: RateLimitFacts) => void;
}) {
  const router = useRouter();
  const reviewing = useMutation(`suggestion-review:${suggestion.id}`);

  async function review(decision: 'approve' | 'decline'): Promise<void> {
    if (reviewing.pending) return;
    // A waiting Approve asks the server nothing; declining sends no email, so it is never held.
    if (decision === 'approve' && approvalsWaiting) return;

    const result = await reviewing.run({
      request: {
        url: `/api/v1/suggestions/${suggestion.id}/review`,
        method: 'POST',
        body: { decision },
      },
      failure: 'toast',
      ownsWait: true,
    });
    if (result.ok) {
      router.refresh();
      return;
    }
    const facts = result.failure?.rateLimit;
    if (facts !== undefined) {
      // Shown at once; the refresh brings the server's account of it, which the invite panel's
      // send button then shares.
      onBudgetRefused(facts);
      router.refresh();
      return;
    }
    // Already reviewed, or the brunch moved on: ask again so the list is true.
    if (result.failure !== undefined && pageIsStale(result.failure.code)) router.refresh();
  }

  return (
    <li className={styles.row}>
      <span className={styles.rowMain}>
        <span>{suggestion.suggestedEmail}</span>{' '}
        <span className={styles.detail}>suggested by {suggestion.suggestedByName}</span>
      </span>
      <span className={styles.rowActions}>
        <Button
          type="button"
          size="sm"
          onClick={() => void review('approve')}
          aria-disabled={approvalsWaiting || reviewing.pending ? true : undefined}
          aria-describedby={approvalsWaiting ? 'approvals-limit' : undefined}
        >
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void review('decline')}
          aria-disabled={reviewing.pending ? true : undefined}
        >
          Decline
        </Button>
      </span>
    </li>
  );
}

export function SuggestionsPanel({
  brunchId,
  canSuggest,
  pendingSuggestions,
  sendWait,
}: {
  readonly brunchId: string;
  // What the server says the host is waiting on for anything that emails an address, asked as the
  // page loaded (getInviteWaits); the same answer the invite panel's send button gets.
  readonly sendWait: Wait | undefined;
  readonly canSuggest: boolean;
  readonly pendingSuggestions: readonly SuggestionListItem[] | undefined;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const suggestion = useMutation(`suggest-invitee:${brunchId}`);
  // Approving a suggestion emails the address, so it spends the same invite budget as the invite
  // panel's send button, and the server gives both the same answer (spec 0012).
  const inviteBudget = useWait(sendWait);
  const approvalsWaiting = inviteBudget.wait !== undefined;

  // Suggesting has a field the person typed into, so a failure stays inline beside it.
  async function suggest(): Promise<void> {
    const trimmed = email.trim();
    if (trimmed === '') return;

    const result = await suggestion.run({
      request: {
        url: `/api/v1/brunches/${brunchId}/suggestions`,
        method: 'POST',
        body: { email: trimmed },
      },
      failure: 'inline',
    });
    if (result.ok) {
      setEmail('');
      router.refresh();
    }
  }

  // Nothing to suggest and nothing waiting for the host: no card.
  if (!canSuggest && (pendingSuggestions === undefined || pendingSuggestions.length === 0)) {
    return null;
  }

  return (
    <section className={styles.panel}>
      <h2>Invite Suggestions</h2>

      {pendingSuggestions !== undefined && pendingSuggestions.length > 0 && (
        <ul className={styles.rows} role="list">
          {pendingSuggestions.map((pending) => (
            <SuggestionRow
              key={pending.id}
              suggestion={pending}
              approvalsWaiting={approvalsWaiting}
              onBudgetRefused={inviteBudget.start}
            />
          ))}
        </ul>
      )}

      {canSuggest && (
        <div className={styles.addRow}>
          <Field label="Suggest someone">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Button
            type="button"
            aria-label="Suggest this person"
            onClick={() => void suggest()}
            aria-disabled={suggestion.pending ? true : undefined}
          >
            {suggestion.pending ? 'Sending…' : 'Suggest'}
          </Button>
        </div>
      )}
      {approvalsWaiting &&
        inviteBudget.wait !== undefined &&
        pendingSuggestions !== undefined &&
        pendingSuggestions.length > 0 && (
          <div id="approvals-limit" className={styles.limitNote}>
            <InlineAlert tone="info" role="status">
              <p>{limitedMessage(inviteBudget.wait)}</p>
            </InlineAlert>
          </div>
        )}
      {suggestion.failure !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{suggestion.failure.text}</p>
        </InlineAlert>
      )}
    </section>
  );
}

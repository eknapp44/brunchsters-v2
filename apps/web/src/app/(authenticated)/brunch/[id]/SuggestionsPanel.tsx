'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { limitedMessage } from '@/lib/limitedCopy';
import { readRateLimit } from '@/lib/readRateLimit';
import styles from './detail.module.css';

type SuggestionListItem = {
  readonly id: string;
  readonly suggestedEmail: string;
  readonly suggestedByName: string;
};

export function SuggestionsPanel({
  brunchId,
  canSuggest,
  pendingSuggestions,
}: {
  readonly brunchId: string;
  readonly canSuggest: boolean;
  readonly pendingSuggestions: readonly SuggestionListItem[] | undefined;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string | undefined>(undefined);

  async function suggest(): Promise<void> {
    const trimmed = email.trim();
    if (trimmed === '') return;

    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${brunchId}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!response.ok) {
        setError('Failed to suggest invitee');
        return;
      }
      setEmail('');
      router.refresh();
    } catch {
      setError('Failed to suggest invitee');
    } finally {
      setSubmitting(false);
    }
  }

  async function review(suggestionId: string, decision: 'approve' | 'decline'): Promise<void> {
    if (pendingSuggestionId !== undefined) return;

    setPendingSuggestionId(suggestionId);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/suggestions/${suggestionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) {
        // Approving emails the address, so the host's daily invite budget applies (spec 0012).
        const facts = await readRateLimit(response);
        setError(facts === undefined ? 'Failed to review suggestion' : limitedMessage(facts));
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to review suggestion');
    } finally {
      setPendingSuggestionId(undefined);
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
          {pendingSuggestions.map((suggestion) => (
            <li key={suggestion.id} className={styles.row}>
              <span className={styles.rowMain}>
                <span>{suggestion.suggestedEmail}</span>{' '}
                <span className={styles.detail}>suggested by {suggestion.suggestedByName}</span>
              </span>
              <span className={styles.rowActions}>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void review(suggestion.id, 'approve')}
                  disabled={pendingSuggestionId === suggestion.id}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void review(suggestion.id, 'decline')}
                  disabled={pendingSuggestionId === suggestion.id}
                >
                  Decline
                </Button>
              </span>
            </li>
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
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Suggest'}
          </Button>
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

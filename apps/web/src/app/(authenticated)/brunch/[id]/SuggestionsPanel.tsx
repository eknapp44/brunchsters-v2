'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
        setError('Failed to review suggestion');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to review suggestion');
    } finally {
      setPendingSuggestionId(undefined);
    }
  }

  if (!canSuggest && pendingSuggestions === undefined) return null;

  return (
    <section>
      <h2>Invite Suggestions</h2>

      {pendingSuggestions !== undefined &&
        (pendingSuggestions.length === 0 ? (
          <p>No pending suggestions.</p>
        ) : (
          <ul>
            {pendingSuggestions.map((suggestion) => (
              <li key={suggestion.id}>
                {suggestion.suggestedEmail} — suggested by {suggestion.suggestedByName}
                <button
                  type="button"
                  onClick={() => void review(suggestion.id, 'approve')}
                  disabled={pendingSuggestionId === suggestion.id}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void review(suggestion.id, 'decline')}
                  disabled={pendingSuggestionId === suggestion.id}
                >
                  Decline
                </button>
              </li>
            ))}
          </ul>
        ))}

      {canSuggest && (
        <>
          <label>
            Suggest someone
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button type="button" onClick={() => void suggest()} disabled={submitting}>
            {submitting ? 'Sending…' : 'Suggest'}
          </button>
        </>
      )}
      {error !== undefined && <p role="alert">{error}</p>}
    </section>
  );
}

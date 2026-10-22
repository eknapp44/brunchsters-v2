'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { InlineAlert } from '@/components/ui/InlineAlert';
import styles from './detail.module.css';

// The answers, in the order a person reads them. The emoji are decoration (hidden from screen
// readers), so the buttons are named "I'm in", "Maybe" and "Can't". `response` is what the API
// takes; it is not changed by the wording.
const CHOICES = [
  { response: 'yes', label: "I'm in", emoji: '🙌' },
  { response: 'maybe', label: 'Maybe', emoji: '🤔' },
  { response: 'no', label: "Can't", emoji: '😬' },
] as const;
type RsvpResponse = (typeof CHOICES)[number]['response'];

export function RsvpControl({
  brunchId,
  currentStatus,
}: {
  readonly brunchId: string;
  readonly currentStatus: string | undefined;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function respond(response: RsvpResponse): Promise<void> {
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await fetch(`/api/v1/brunches/${brunchId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      if (!result.ok) {
        setError('Failed to update RSVP');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to update RSVP');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.panel}>
      <Eyebrow>RSVP</Eyebrow>
      <h2>You in?</h2>
      <p className={styles.srOnly}>Current: {currentStatus ?? 'no response yet'}</p>
      <div className={styles.rsvpChoices}>
        {CHOICES.map((choice) => (
          <Button
            key={choice.response}
            type="button"
            className={styles.rsvpChoice}
            variant={currentStatus === choice.response ? 'primary' : 'secondary'}
            disabled={submitting}
            onClick={() => void respond(choice.response)}
          >
            <span aria-hidden="true" className={styles.emoji}>
              {choice.emoji}
            </span>
            {choice.label}
          </Button>
        ))}
      </div>
      {error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{error}</p>
        </InlineAlert>
      )}
    </section>
  );
}

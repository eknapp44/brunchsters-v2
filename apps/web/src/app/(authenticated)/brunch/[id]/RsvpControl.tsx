'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { InlineAlert } from '@/components/ui/InlineAlert';
import styles from './detail.module.css';

const RESPONSES = ['yes', 'no', 'maybe'] as const;
type RsvpResponse = (typeof RESPONSES)[number];

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
      <h2>Your RSVP</h2>
      <p className={styles.srOnly}>Current: {currentStatus ?? 'no response yet'}</p>
      <div className={styles.choices}>
        {RESPONSES.map((response) => (
          <Button
            key={response}
            type="button"
            variant={currentStatus === response ? 'primary' : 'secondary'}
            disabled={submitting}
            onClick={() => void respond(response)}
          >
            {response}
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

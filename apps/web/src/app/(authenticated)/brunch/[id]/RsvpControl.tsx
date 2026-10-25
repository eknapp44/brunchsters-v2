'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { rsvpToast } from '@/lib/toastCopy';
import { useMutation } from '@/store/useMutation';
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
  const { pending, run } = useMutation(`rsvp:${brunchId}`);

  // A failure is a toast, not a line under the buttons: the buttons are as they were, so tapping
  // again is the retry (spec 0014). A success is one too, because the only other sign of it is a
  // button's look, which a screen reader does not hear.
  async function respond(response: RsvpResponse): Promise<void> {
    const result = await run({
      request: {
        url: `/api/v1/brunches/${brunchId}/rsvp`,
        method: 'POST',
        body: { response },
      },
      success: rsvpToast(response),
      failure: 'toast',
    });
    if (result.ok) router.refresh();
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
            // Not `disabled`: a disabled button drops the keyboard's focus the moment it is
            // pressed. The thunk ignores a tap while one is in flight, so this only has to look it.
            aria-disabled={pending ? true : undefined}
            onClick={() => void respond(choice.response)}
          >
            <span aria-hidden="true" className={styles.emoji}>
              {choice.emoji}
            </span>
            {choice.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { HIDE_LABEL, UNHIDE_LABEL } from '@/lib/lifecycleCopy';
import { Icon } from './icons/Icon';
import { Button } from './ui/Button';
import { InlineAlert } from './ui/InlineAlert';
import styles from './HideControl.module.css';

// Hide a brunch from the signed-in person's own dashboard, or show it again (spec 0013, ADR 0015).
// Theirs alone: nobody else sees a change and nobody is told. It is the same control in three
// places, told apart by name so a screen reader and a journey can tell the rows apart:
//
//   page         on the brunch page, "Hide from my dashboard" / "Unhide"
//   row          on a dashboard row or the next-up card, "Hide <title>", at every width: an eye
//                small enough for a phone's row
//   hidden-list  on a row of the Hidden list, "Unhide <title>", at every width
//
// Open or pending is this one control's state, so `useState` (ADR 0011); the dashboard and the page
// are server components, so a change is followed by `router.refresh()`.
export function HideControl(props: {
  readonly brunchId: string;
  readonly title: string;
  readonly hidden: boolean;
  readonly placement: 'page' | 'row' | 'hidden-list';
  // the page control explains itself: a tooltip for a mouse, and the line it points at for a screen
  // reader (and, on a phone, for everyone)
  readonly hint?: { readonly id: string; readonly text: string };
}): ReactElement {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function change(): Promise<void> {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${props.brunchId}/hidden`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: !props.hidden }),
      });
      if (!response.ok) {
        setError('Failed to update your dashboard');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to update your dashboard');
    } finally {
      setSubmitting(false);
    }
  }

  const onPage = props.placement === 'page';
  const text = onPage
    ? props.hidden
      ? UNHIDE_LABEL
      : HIDE_LABEL
    : props.hidden
      ? 'Unhide'
      : 'Hide';
  const label = onPage ? undefined : `${text} ${props.title}`;
  // On a row or the Hidden list the control is a small eye, not a word: it repeats on every row, and
  // its name ("Hide <title>") is on the button for a screen reader and, as a tooltip, for a mouse.
  const isIcon = !onPage;
  const className =
    props.placement === 'row' ? styles.row : props.placement === 'hidden-list' ? styles.list : '';

  return (
    <div className={className}>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={submitting}
        {...(isIcon ? { className: styles.iconOnly } : {})}
        {...(label !== undefined ? { 'aria-label': label, title: label } : {})}
        {...(props.hint !== undefined
          ? { title: props.hint.text, 'aria-describedby': props.hint.id }
          : {})}
        onClick={() => void change()}
      >
        {isIcon ? <Icon name={props.hidden ? 'eye' : 'eyeOff'} size={18} /> : text}
      </Button>
      {error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{error}</p>
        </InlineAlert>
      )}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { HIDE_LABEL, UNHIDE_LABEL } from '@/lib/lifecycleCopy';
import { HIDDEN_TOAST, UNHIDDEN_TOAST } from '@/lib/toastCopy';
import { useMutation } from '@/store/useMutation';
import { Icon } from './icons/Icon';
import { Button } from './ui/Button';
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
  // The placement is in the key: a brunch can be on screen twice (its row and the next-up card).
  const hiding = useMutation(`hide:${props.placement}:${props.brunchId}`);

  // One tap with nothing to fix, so a failure is a toast. On a row the row moves, which shows it;
  // on the brunch page nothing else changes, so the result is said once.
  async function change(): Promise<void> {
    if (hiding.pending) return;
    const result = await hiding.run({
      request: {
        url: `/api/v1/brunches/${props.brunchId}/hidden`,
        method: 'PUT',
        body: { hidden: !props.hidden },
      },
      ...(props.placement === 'page'
        ? { success: props.hidden ? UNHIDDEN_TOAST : HIDDEN_TOAST }
        : {}),
      failure: 'toast',
    });
    if (result.ok) router.refresh();
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
        aria-disabled={hiding.pending ? true : undefined}
        {...(isIcon ? { className: styles.iconOnly } : {})}
        {...(label !== undefined ? { 'aria-label': label, title: label } : {})}
        {...(props.hint !== undefined
          ? { title: props.hint.text, 'aria-describedby': props.hint.id }
          : {})}
        onClick={() => void change()}
      >
        {isIcon ? <Icon name={props.hidden ? 'eye' : 'eyeOff'} size={18} /> : text}
      </Button>
    </div>
  );
}

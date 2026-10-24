'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactElement } from 'react';
import { Button } from './Button';
import styles from './ConfirmDialog.module.css';
import { InlineAlert } from './InlineAlert';

// A "are you sure" for something that matters (calling a brunch off, deleting one). Built on the
// browser's own <dialog> opened with showModal(), which gives what a dialog needs without a
// library: focus moves in and stays in, Escape closes it, the page behind cannot be reached, and
// the screen reader announces it by its title. (The first dialog in the app: apps/web/CLAUDE.md
// says to decide this when it arrives; a native element is the decision.)
//
// It is mounted only while it is open: render it when the person asks, unmount it on close. Focus
// starts on the cancel button, so a stray Enter keeps the brunch ("Nope, keep it"). While the
// request is in flight nothing closes it, so a second press cannot start a second request.
export function ConfirmDialog(props: {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly pending: boolean;
  // the generic error line of a failed request, kept inside the dialog so it is seen
  readonly error: string | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return undefined;
    // showModal() puts focus on the first control in the dialog: the cancel button, which comes
    // first in the document (a phone shows it last, by CSS only).
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      // Escape: the dialog asks to close; let the parent decide, and never while a request runs.
      onCancel={(event) => {
        event.preventDefault();
        if (!props.pending) props.onCancel();
      }}
      // A click on the dimmed page behind (the dialog element itself, not its contents) closes it.
      onClick={(event) => {
        if (event.target === dialogRef.current && !props.pending) props.onCancel();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {props.title}
      </h2>
      <p id={bodyId} className={styles.body}>
        {props.body}
      </p>
      {props.error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{props.error}</p>
        </InlineAlert>
      )}
      <div className={styles.actions}>
        <Button type="button" variant="secondary" disabled={props.pending} onClick={props.onCancel}>
          {props.cancelLabel}
        </Button>
        <Button type="button" variant="danger" disabled={props.pending} onClick={props.onConfirm}>
          {props.confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

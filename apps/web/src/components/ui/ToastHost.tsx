'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { toastDurationMs } from '@/lib/toastTiming';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectToasts, type Toast, toastDismissed } from '@/store/toastsSlice';
import styles from './ToastHost.module.css';

function ToastItem({ toast }: { readonly toast: Toast }): ReactElement {
  const dispatch = useAppDispatch();
  const [held, setHeld] = useState(false);
  const remaining = useRef(toastDurationMs(toast.tone));

  // Counts down while nothing holds it, and keeps what is left across a hold.
  useEffect(() => {
    if (held) return undefined;
    const startedAt = Date.now();
    const timer = setTimeout(() => dispatch(toastDismissed(toast.id)), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [held, dispatch, toast.id]);

  const toneClass =
    toast.tone === 'error' ? styles.error : toast.tone === 'success' ? styles.success : styles.info;

  return (
    <div
      className={`${styles.toast} ${toneClass}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <p className={styles.text}>{toast.text}</p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => dispatch(toastDismissed(toast.id))}
      >
        Dismiss
      </button>
    </div>
  );
}

// Where the results of one-tap actions appear (spec 0014, ADR 0016). One polite status region,
// there from the first paint (a live region has to exist before it is first filled, or the first
// message is not announced), that never takes focus: a toast is news, not a question. It sits at the
// bottom of the window, above the safe-area inset, and is the only place a toast is drawn.
export function ToastHost(): ReactElement {
  const toasts = useAppSelector(selectToasts);
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

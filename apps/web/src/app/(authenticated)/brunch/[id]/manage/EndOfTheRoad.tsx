'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { limitedMessage } from '@/lib/limitedCopy';
import {
  callOffDialog,
  DELETE_WAIT_MESSAGE,
  DELETE_WAIT_POLICY,
  deleteDialog,
} from '@/lib/lifecycleCopy';
import { readRateLimit } from '@/lib/readRateLimit';
import { useWait, type Wait } from '@/lib/useWait';
import detail from '../detail.module.css';
import styles from './manage.module.css';

type Asking = 'call-off' | 'delete' | undefined;

// A guess for how long Delete should wait again when the server says the guests have not been told
// yet after all (the page's own answer arrives with the refresh that follows).
const DELETE_RETRY_SECONDS = 60;

// The last section of the manage page (spec 0013, ADR 0015): the ways a brunch ends. Which buttons
// appear is the page's call (the rules are in core: `canCallOff`, `isCancelNoticePending`); this
// draws them and talks to the routes. Calling off and deleting ask first, in a dialog whose safe
// answer has the focus. Open, pending and error are this one section's state, so `useState`
// (ADR 0011); nothing is copied from the server into a store.
//
// Both waits are the server's, handed in by the page: the host's cancellations for the day, and a
// called-off brunch whose guests have not been told yet. A waiting button stays focusable
// (`aria-disabled`) so its reason can be read, and comes back by itself when the wait is over.
export function EndOfTheRoad(props: {
  readonly brunchId: string;
  readonly title: string;
  readonly statusCode: string;
  readonly canCallOff: boolean;
  // how many people the called-off email would reach, for the dialog
  readonly audience: number;
  readonly callOffWait: Wait | undefined;
  readonly deleteWait: Wait | undefined;
}): ReactElement | null {
  const router = useRouter();
  const [asking, setAsking] = useState<Asking>(undefined);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const callOffWait = useWait(props.callOffWait);
  const deleteWait = useWait(props.deleteWait);

  const isDraft = props.statusCode === 'draft';
  const isCalledOff = props.statusCode === 'cancelled';

  function ask(what: Exclude<Asking, undefined>): void {
    setError(undefined);
    setDialogError(undefined);
    setAsking(what);
  }

  function close(): void {
    if (pending) return;
    setAsking(undefined);
    setDialogError(undefined);
  }

  async function callItOff(): Promise<void> {
    setPending(true);
    setDialogError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${props.brunchId}/cancel`, { method: 'POST' });
      if (!response.ok) {
        const facts = await readRateLimit(response);
        if (facts !== undefined) {
          // The day's cancellations are used up: close the dialog and let the button show why. No
          // refresh follows: no other control on the page depends on this budget, and a reload asks
          // the counter again (`getCancelWait`).
          callOffWait.start(facts);
          setAsking(undefined);
          return;
        }
        setDialogError('Failed to call it off');
        return;
      }
      setAsking(undefined);
      router.refresh();
    } catch {
      setDialogError('Failed to call it off');
    } finally {
      setPending(false);
    }
  }

  async function deleteIt(): Promise<void> {
    setPending(true);
    setDialogError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${props.brunchId}`, { method: 'DELETE' });
      if (response.status === 409) {
        // Called off a moment ago and the guests have not been told yet: wait, as the page would.
        deleteWait.start({ policy: DELETE_WAIT_POLICY, retryAfterSeconds: DELETE_RETRY_SECONDS });
        setAsking(undefined);
        router.refresh();
        return;
      }
      if (!response.ok) {
        const facts = await readRateLimit(response);
        if (facts !== undefined) {
          deleteWait.start(facts);
          setAsking(undefined);
          router.refresh();
          return;
        }
        setDialogError('Failed to delete the brunch');
        return;
      }
      // The brunch is gone: there is nothing here to refresh.
      router.replace('/dashboard');
    } catch {
      setDialogError('Failed to delete the brunch');
    } finally {
      setPending(false);
    }
  }

  async function bringItBack(): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/brunches/${props.brunchId}/reinstate`, {
        method: 'POST',
      });
      if (!response.ok) {
        setError('Failed to bring it back');
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to bring it back');
    } finally {
      setPending(false);
    }
  }

  if (!isDraft && !isCalledOff && !props.canCallOff) return null;

  const callOffLimited = callOffWait.wait !== undefined;
  const deleteLimited = deleteWait.wait !== undefined;
  const dialog =
    asking === 'call-off'
      ? callOffDialog({ title: props.title, audience: props.audience })
      : asking === 'delete'
        ? deleteDialog({ title: props.title, isDraft })
        : undefined;

  return (
    <section className={detail.panel}>
      <h2>End of the road</h2>

      {isDraft && (
        <>
          <p className={styles.endNote}>Nobody has been told about this one yet.</p>
          <div className={detail.choices}>
            <Button type="button" variant="danger" onClick={() => ask('delete')}>
              Delete this draft
            </Button>
          </div>
        </>
      )}

      {isCalledOff && (
        <>
          <p className={styles.endNote}>Changed your mind? Everything is still here.</p>
          <div className={detail.choices}>
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() => void bringItBack()}
            >
              Bring it back
            </Button>
            <Button
              type="button"
              variant="danger"
              aria-disabled={deleteLimited ? true : undefined}
              aria-describedby={deleteLimited ? 'end-delete-wait' : undefined}
              onClick={() => {
                if (!deleteLimited) ask('delete');
              }}
            >
              Delete this brunch
            </Button>
          </div>
          {deleteWait.wait !== undefined && (
            <div id="end-delete-wait" className={detail.limitNote}>
              <InlineAlert tone="info" role="status">
                <p>{DELETE_WAIT_MESSAGE}</p>
              </InlineAlert>
            </div>
          )}
        </>
      )}

      {!isDraft && !isCalledOff && props.canCallOff && (
        <>
          <p className={styles.endNote}>
            Plans changed? Call it off and we&apos;ll let everyone know.
          </p>
          <div className={detail.choices}>
            <Button
              type="button"
              variant="danger"
              aria-disabled={callOffLimited ? true : undefined}
              aria-describedby={callOffLimited ? 'end-calloff-wait' : undefined}
              onClick={() => {
                if (!callOffLimited) ask('call-off');
              }}
            >
              Call it off
            </Button>
          </div>
          {callOffWait.wait !== undefined && (
            <div id="end-calloff-wait" className={detail.limitNote}>
              <InlineAlert tone="info" role="status">
                <p>{limitedMessage(callOffWait.wait)}</p>
              </InlineAlert>
            </div>
          )}
        </>
      )}

      {error !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p>{error}</p>
        </InlineAlert>
      )}

      {dialog !== undefined && (
        <ConfirmDialog
          title={dialog.title}
          body={dialog.body}
          confirmLabel={dialog.confirmLabel}
          cancelLabel={dialog.cancelLabel}
          pending={pending}
          error={dialogError}
          onCancel={close}
          onConfirm={() => void (asking === 'call-off' ? callItOff() : deleteIt())}
        />
      )}
    </section>
  );
}

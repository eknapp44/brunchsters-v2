'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { MARK_ALL_READ } from '@/lib/notificationCopy';
import { useSignedOutRedirect } from '@/lib/useSignedOutRedirect';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { markNotificationsRead, selectUnreadCount } from '@/store/notificationsSlice';

// "Mark all read": the count drops at once, the list is asked again when the route says yes, and a
// "no" puts the count back with a toast (`markNotificationsRead`). Nothing to mark means nothing to
// press, and while the request is out the same. Both are `aria-disabled`, never `disabled`: pressing
// it is what leaves nothing to mark, and a button that turns `disabled` under the person's finger
// drops their keyboard focus (found by the accessibility review in M4).
export function MarkAllRead(props: { readonly hasUnread: boolean }): ReactElement {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const redirectIfSignedOut = useSignedOutRedirect();
  const live = useAppSelector(selectUnreadCount);
  const [busy, setBusy] = useState(false);

  const nothingToMark = !props.hasUnread && (live ?? 0) === 0;

  async function onClick(): Promise<void> {
    if (busy || nothingToMark) return;
    setBusy(true);
    const result = await dispatch(markNotificationsRead({ all: true }));
    setBusy(false);
    if (markNotificationsRead.rejected.match(result)) {
      redirectIfSignedOut(result.payload?.code);
      return;
    }
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-disabled={busy || nothingToMark ? true : undefined}
      onClick={() => void onClick()}
    >
      {MARK_ALL_READ}
    </Button>
  );
}

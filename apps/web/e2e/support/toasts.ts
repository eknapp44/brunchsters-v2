import type { Locator, Page } from '@playwright/test';

// The words the journeys look for (a toast, or an inline error line), in one place so a wording
// change is one edit (`lib/errorCopy.ts`, `lib/toastCopy.ts`).
export const TOAST_WORDS = {
  wentSideways: 'Something went sideways on our end.',
  calledOff: "This one's been called off, so it can't change.",
  imIn: "You're in. See you there.",
  maybe: 'Maybe it is. You can change it any time.',
  cantMakeIt: "Got it, you can't make it.",
  slowDown: 'Slow down a sec, then try again.',
  votingClosed: "Voting's closed on this one.",
  inviteResent: 'Sent again.',
  linkCopied: 'Link copied.',
  allCaughtUp: 'All caught up.',
  deadlineSaved: 'Deadline saved.',
  lastOption: "That's the last one on the table, so it has to stay.",
  alreadyThere: "That one's already on the list.",
  alreadyConfirmed: "This one's already locked in.",
  hidden: 'Off your dashboard. Nobody else sees a change.',
  unhidden: 'Back on your dashboard.',
} as const;

// The one polite status region the app keeps for toasts, there from the first paint.
export function toastRegion(page: Page): Locator {
  return page.locator('[role="status"][aria-live="polite"]');
}

// A toast by its words.
export function toast(page: Page, text: string): Locator {
  return toastRegion(page)
    .locator('div')
    .filter({ hasText: text })
    .filter({
      has: page.getByRole('button', { name: 'Dismiss' }),
    });
}

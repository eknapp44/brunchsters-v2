// What a toast says when something worked (spec 0014). Short, warm, and only where the page change
// is subtle: the RSVP buttons change their look, which a screen reader hears nothing of. In the
// Brand Voice (`docs/voice-and-copy.md`): friend, not service, so no "successfully" and no "saved
// your RSVP". Failures are in `errorCopy.ts`.

export const INVITE_RESENT_TOAST = 'Sent again.';
export const DEADLINE_SAVED_TOAST = 'Deadline saved.';
export const DEADLINE_CLEARED_TOAST = 'Deadline cleared. Voting stays open.';
export const HIDDEN_TOAST = 'Off your dashboard. Nobody else sees a change.';
export const UNHIDDEN_TOAST = 'Back on your dashboard.';
export const LINK_COPIED_TOAST = 'Link copied.';
// "Mark all read" worked: for a screen reader the only change is a name and some missing words, so
// it is said (spec 0015).
export const ALL_CAUGHT_UP_TOAST = 'All caught up.';
// The browser refused the clipboard (an insecure page, a denied permission).
export const LINK_COPY_FAILED_TOAST = "That didn't copy. Your browser wouldn't let it.";

export type RsvpAnswer = 'yes' | 'maybe' | 'no';

const RSVP_TOASTS: Readonly<Record<RsvpAnswer, string>> = {
  yes: "You're in. See you there.",
  maybe: 'Maybe it is. You can change it any time.',
  no: "Got it, you can't make it.",
};

export function rsvpToast(answer: RsvpAnswer): string {
  return RSVP_TOASTS[answer];
}
